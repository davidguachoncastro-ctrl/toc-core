// ═══════════════════════════════════════════════════════════════════
// toc-core/audit-log.js — Audit log compartido (Factory DI)
// ═══════════════════════════════════════════════════════════════════
//
// Registro de operaciones críticas en Firestore para detección de
// fraude, cumplimiento fiscal y trazabilidad operativa. Compartido
// por TPV y Backoffice; cada app construye su propia instancia
// inyectando sus dependencias.
//
// Eventos auditables (acordados):
//   - anulacion             (línea enviada cancelada)
//   - anulacion_venta       (venta cobrada anulada a posteriori,
//                            append-only — sustituye al update mutable
//                            previo a Bloque 2)
//   - cancelacion_cuenta    (cuenta entera cancelada)
//   - descuento_alto        (>10% sobre la base)
//   - cierre_z
//   - cierre_x
//   - apertura_caja
//   - login_fallido         (3+ intentos consecutivos del mismo PIN)
//   - edit_carta            (cambio en producto/precio desde Backoffice)
//   - venta_sin_escandallo  (cobro de producto sin escandallo en el contrato
//                            vigente; la venta se cobra normal pero NO se
//                            descuenta stock — David debe crear el escandallo)
//
// Estructura de cada entrada en Firestore:
// {
//   tipo: 'anulacion',
//   timestamp: 1714838400000,
//   fecha: '2026-05-04T18:00:00.000Z',
//   usuario: { id, nombre, rol },          // id='sistema' si no hay sesión
//   app: 'tpv' | 'backoffice',
//   mesa: 'M3' (opcional),
//   importe: 12.50 (opcional),
//   motivo: 'cliente arrepentido' (opcional),
//   payload: { ... } (datos específicos del evento),
//   _serverTs: serverTimestamp()
// }
//
// API: createAuditLog(deps) → { TIPOS, UMBRAL_DESCUENTO_PCT, escribir, consultar }
//
// Patrón Factory DI: sin estado mutable en el módulo, cada consumidor
// construye su instancia con getters para deps que cambian tras boot
// (db, tenant, getUsuario, appName, serverTimestamp). Coherente con
// iva.js y pin-hash.js (sin estado mutable en core).
// ═══════════════════════════════════════════════════════════════════

const AUDIT_TIPOS = {
  ANULACION: 'anulacion',
  ANULACION_VENTA: 'anulacion_venta',
  CANCELACION_CUENTA: 'cancelacion_cuenta',
  DESCUENTO_ALTO: 'descuento_alto',
  CIERRE_Z: 'cierre_z',
  CIERRE_X: 'cierre_x',
  APERTURA_CAJA: 'apertura_caja',
  LOGIN_FALLIDO: 'login_fallido',
  EDIT_CARTA: 'edit_carta',
  VENTA_SIN_ESCANDALLO: 'venta_sin_escandallo',
  CAJON_MANUAL: 'cajon_manual',
};

const AUDIT_UMBRAL_DESCUENTO_PCT = 10;

/**
 * Construye una instancia del audit-log con dependencias inyectadas.
 *
 * @param {Object} deps
 * @param {() => any} deps.db                 - Getter Firestore. Invocado por llamada (no se cachea).
 * @param {() => string} deps.tenant          - Getter tenant ID. Invocado por llamada.
 * @param {() => Object|null} deps.getUsuario - Getter usuario actual. {id, nombre, rol, ...} o null.
 * @param {() => string} deps.appName         - Getter nombre de app ('tpv', 'backoffice', ...).
 * @param {(...args) => void} deps.log        - Logger (tocLog, console.log, ...).
 * @param {Object} [deps.sentry]              - Hooks Sentry (opcional).
 * @param {(msg, cat, data) => void} [deps.sentry.breadcrumb]
 * @param {(err, ctx) => void} [deps.sentry.reportar]
 * @param {() => any} deps.serverTimestamp    - Getter FieldValue.serverTimestamp().
 * @returns {{ TIPOS, UMBRAL_DESCUENTO_PCT, escribir, consultar }}
 */
function createAuditLog(deps) {
  if (!deps
      || typeof deps.db !== 'function'
      || typeof deps.tenant !== 'function'
      || typeof deps.getUsuario !== 'function'
      || typeof deps.appName !== 'function'
      || typeof deps.log !== 'function'
      || typeof deps.serverTimestamp !== 'function') {
    throw new Error(
      'createAuditLog: deps incompletas. Se requieren getters '
      + 'db, tenant, getUsuario, appName, serverTimestamp y un logger log.'
    );
  }

  const sentry = deps.sentry || {};

  /**
   * Escribe una entrada en el audit log. NO bloqueante: si Firebase
   * falla, registra en consola y notifica a Sentry (si disponible)
   * pero no propaga la excepción a la operación de negocio.
   *
   * @param {string} tipo - Uno de TIPOS.
   * @param {Object} [datos] - { mesa, importe, motivo, payload }
   */
  async function escribir(tipo, datos) {
    if (datos == null) datos = {};

    if (!Object.values(AUDIT_TIPOS).includes(tipo)) {
      deps.log('[AUDIT] Tipo desconocido:', tipo);
      return;
    }

    const usuario = deps.getUsuario();
    const entrada = {
      tipo,
      timestamp: Date.now(),
      fecha: new Date().toISOString(),
      app: deps.appName(),
      usuario: {
        id: (usuario && usuario.id) || 'sistema',
        nombre: (usuario && usuario.nombre) || '-',
        rol: (usuario && usuario.rol) || '-',
      },
      ...datos,
    };

    if (typeof sentry.breadcrumb === 'function') {
      try { sentry.breadcrumb('audit: ' + tipo, 'audit', entrada); } catch (_) { /* swallow */ }
    }

    const db = deps.db();
    if (!db) {
      deps.log('[AUDIT] Firebase no disponible, evento perdido:', tipo);
      return;
    }

    try {
      await db
        .collection(deps.tenant())
        .doc('data')
        .collection('audit_log')
        .add({
          ...entrada,
          _serverTs: deps.serverTimestamp(),
        });
      deps.log('[AUDIT] ✓ ' + tipo, datos);
    } catch (e) {
      deps.log('[AUDIT] Error guardando:', e);
      if (typeof sentry.reportar === 'function') {
        try { sentry.reportar(e, { audit_tipo: tipo, audit_datos: datos }); } catch (_) { /* swallow */ }
      }
    }
  }

  /**
   * Consulta el audit log con filtros opcionales.
   *
   * @param {Object} [filtros]
   * @param {string} [filtros.tipo]    - Filtrar por tipo de evento.
   * @param {number} [filtros.desde]   - timestamp >= desde
   * @param {number} [filtros.hasta]   - timestamp <= hasta
   * @param {string} [filtros.usuario] - filtra por substring (case-insensitive) del nombre de usuario, en cliente.
   * @param {number} [filtros.limit=200]
   * @returns {Promise<Array<Object>>} Lista de entradas (con _id) o [] si error.
   */
  async function consultar(filtros) {
    if (filtros == null) filtros = {};
    const tipo = filtros.tipo;
    const desde = filtros.desde;
    const hasta = filtros.hasta;
    const usuario = filtros.usuario;
    const limit = filtros.limit != null ? filtros.limit : 200;

    const db = deps.db();
    if (!db) {
      deps.log('[AUDIT] Firebase no disponible para consultar');
      return [];
    }

    try {
      let query = db.collection(deps.tenant()).doc('data').collection('audit_log');
      if (tipo) query = query.where('tipo', '==', tipo);
      if (desde) query = query.where('timestamp', '>=', desde);
      if (hasta) query = query.where('timestamp', '<=', hasta);
      query = query.orderBy('timestamp', 'desc').limit(limit);

      const snap = await query.get();
      let resultados = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));

      if (usuario) {
        const u = usuario.toLowerCase();
        resultados = resultados.filter((r) =>
          r && r.usuario && typeof r.usuario.nombre === 'string'
            && r.usuario.nombre.toLowerCase().includes(u)
        );
      }

      return resultados;
    } catch (e) {
      deps.log('[AUDIT] Error consultando:', e);
      if (typeof sentry.reportar === 'function') {
        try { sentry.reportar(e, { contexto: 'auditLogConsultar' }); } catch (_) { /* swallow */ }
      }
      return [];
    }
  }

  return {
    TIPOS: AUDIT_TIPOS,
    UMBRAL_DESCUENTO_PCT: AUDIT_UMBRAL_DESCUENTO_PCT,
    escribir,
    consultar,
  };
}
