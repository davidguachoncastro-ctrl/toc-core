// ═══════════════════════════════════════════════════════════════════
// tests/audit-log.test.js — Audit log compartido (Factory DI)
// ═══════════════════════════════════════════════════════════════════
//
// Cobertura del contrato público de toc-core/audit-log.js:
//   - createAuditLog construye una instancia con TIPOS + escribir + consultar
//   - escribir() compone shape correcto y persiste en Firestore
//   - getUsuario() se invoca por llamada, no se cachea (deps mutables)
//   - Default usuario.id = 'sistema' cuando no hay sesión
//   - Defensas: tipo desconocido, db null, sentry ausente
//   - consultar() respeta tenant y aplica filtros
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditLog, AUDIT_TIPOS, AUDIT_UMBRAL_DESCUENTO_PCT } from './_helpers.js';

// ── Mock Firestore ────────────────────────────────────────────────────
//
// El audit-log usa la cadena: db.collection(t).doc('data').collection('audit_log')
//   - .add(data)              → write path
//   - .where()/.orderBy()/.limit().get() → read path
//
// Este mock captura las llamadas a add() y permite seedear docs para get().

function makeMockDb() {
  const adds = [];
  let seededDocs = [];

  function makeRef(path) {
    const ref = {
      _path: path,
      doc(id) {
        return {
          collection(sub) {
            return makeRef(path + '/' + id + '/' + sub);
          },
        };
      },
      add(data) {
        adds.push({ path, data });
        return Promise.resolve({ id: 'mock-' + adds.length });
      },
      where() { return ref; },
      orderBy() { return ref; },
      limit() { return ref; },
      get() {
        return Promise.resolve({
          docs: seededDocs.map((d, i) => ({
            id: d._id || 'doc-' + i,
            data: () => {
              const { _id, ...rest } = d;
              return rest;
            },
          })),
        });
      },
    };
    return ref;
  }

  return {
    db: { collection: (n) => makeRef(n) },
    adds,
    setDocs(docs) { seededDocs = docs; },
  };
}

// ── Builder de deps ─────────────────────────────────────────────────-

function makeDeps(overrides) {
  const mock = makeMockDb();
  const logs = [];
  const sentryCalls = { breadcrumb: [], reportar: [] };

  const deps = {
    db: () => mock.db,
    tenant: () => 'toc-tpv-sandbox',
    getUsuario: () => ({ id: 'u-1', nombre: 'Ana', rol: 'admin' }),
    appName: () => 'tpv',
    log: (...args) => logs.push(args),
    sentry: {
      breadcrumb: (msg, cat, data) => sentryCalls.breadcrumb.push({ msg, cat, data }),
      reportar: (err, ctx) => sentryCalls.reportar.push({ err, ctx }),
    },
    serverTimestamp: () => '__SERVER_TS__',
    ...overrides,
  };

  return { deps, mock, logs, sentryCalls };
}

// ─── Constantes públicas ─────────────────────────────────────────────

describe('Constantes públicas', () => {
  it('AUDIT_UMBRAL_DESCUENTO_PCT vale 10', () => {
    expect(AUDIT_UMBRAL_DESCUENTO_PCT).toBe(10);
  });

  it('AUDIT_TIPOS contiene los 12 tipos acordados', () => {
    expect(AUDIT_TIPOS.VENTA).toBe('venta');
    expect(AUDIT_TIPOS.ANULACION).toBe('anulacion');
    expect(AUDIT_TIPOS.ANULACION_VENTA).toBe('anulacion_venta');
    expect(AUDIT_TIPOS.CANCELACION_CUENTA).toBe('cancelacion_cuenta');
    expect(AUDIT_TIPOS.DESCUENTO_ALTO).toBe('descuento_alto');
    expect(AUDIT_TIPOS.CIERRE_Z).toBe('cierre_z');
    expect(AUDIT_TIPOS.CIERRE_X).toBe('cierre_x');
    expect(AUDIT_TIPOS.APERTURA_CAJA).toBe('apertura_caja');
    expect(AUDIT_TIPOS.LOGIN_FALLIDO).toBe('login_fallido');
    expect(AUDIT_TIPOS.EDIT_CARTA).toBe('edit_carta');
    expect(AUDIT_TIPOS.VENTA_SIN_ESCANDALLO).toBe('venta_sin_escandallo');
    expect(AUDIT_TIPOS.CAJON_MANUAL).toBe('cajon_manual');
  });

  it('venta_sin_escandallo se acepta como tipo válido en escribir()', async () => {
    const { deps, mock } = makeDeps();
    const audit = createAuditLog(deps);
    await audit.escribir('venta_sin_escandallo', {
      payload: { producto: 'Café X', qty: 2, ventaId: 'v-1' },
    });
    expect(mock.adds).toHaveLength(1);
    expect(mock.adds[0].data.tipo).toBe('venta_sin_escandallo');
    expect(mock.adds[0].data.payload.producto).toBe('Café X');
  });

  it('cajon_manual se acepta como tipo válido en escribir()', async () => {
    const { deps, mock } = makeDeps();
    const audit = createAuditLog(deps);
    await audit.escribir('cajon_manual', {
      motivo: 'Cambio para mesa 4',
      payload: { mesa: 4 },
    });
    expect(mock.adds).toHaveLength(1);
    expect(mock.adds[0].data.tipo).toBe('cajon_manual');
    expect(mock.adds[0].data.motivo).toBe('Cambio para mesa 4');
    expect(mock.adds[0].data.payload.mesa).toBe(4);
  });
});

// ─── Factory ─────────────────────────────────────────────────────────

describe('createAuditLog', () => {
  it('lanza si faltan deps', () => {
    expect(() => createAuditLog()).toThrow(/deps incompletas/);
    expect(() => createAuditLog({})).toThrow(/deps incompletas/);
    expect(() => createAuditLog({ db: () => null })).toThrow(/deps incompletas/);
  });

  it('devuelve API pública con TIPOS, UMBRAL, escribir, consultar', () => {
    const { deps } = makeDeps();
    const audit = createAuditLog(deps);
    expect(audit.TIPOS).toBe(AUDIT_TIPOS);
    expect(audit.UMBRAL_DESCUENTO_PCT).toBe(AUDIT_UMBRAL_DESCUENTO_PCT);
    expect(typeof audit.escribir).toBe('function');
    expect(typeof audit.consultar).toBe('function');
  });

  it('cada llamada a createAuditLog produce instancia independiente', () => {
    const a = createAuditLog(makeDeps().deps);
    const b = createAuditLog(makeDeps().deps);
    expect(a).not.toBe(b);
    expect(a.escribir).not.toBe(b.escribir);
  });
});

// ─── escribir() ───────────────────────────────────────────────────────

describe('escribir()', () => {
  it('compone shape correcto y persiste en Firestore', async () => {
    const { deps, mock } = makeDeps();
    const audit = createAuditLog(deps);

    await audit.escribir('anulacion', { mesa: 'M3', importe: 12.5 });

    expect(mock.adds).toHaveLength(1);
    const written = mock.adds[0];
    expect(written.path).toBe('toc-tpv-sandbox/data/audit_log');
    expect(written.data.tipo).toBe('anulacion');
    expect(written.data.app).toBe('tpv');
    expect(written.data.mesa).toBe('M3');
    expect(written.data.importe).toBe(12.5);
    expect(written.data.usuario).toEqual({ id: 'u-1', nombre: 'Ana', rol: 'admin' });
    expect(written.data._serverTs).toBe('__SERVER_TS__');
    expect(typeof written.data.timestamp).toBe('number');
    expect(typeof written.data.fecha).toBe('string');
  });

  it('default usuario.id = "sistema" cuando getUsuario() devuelve null', async () => {
    const { deps, mock } = makeDeps({ getUsuario: () => null });
    const audit = createAuditLog(deps);

    await audit.escribir('cierre_z', { importe: 100 });

    expect(mock.adds[0].data.usuario).toEqual({
      id: 'sistema',
      nombre: '-',
      rol: '-',
    });
  });

  it('default usuario.id = "sistema" cuando getUsuario() devuelve {}', async () => {
    const { deps, mock } = makeDeps({ getUsuario: () => ({}) });
    const audit = createAuditLog(deps);

    await audit.escribir('apertura_caja', { importe: 200 });

    expect(mock.adds[0].data.usuario.id).toBe('sistema');
  });

  it('getUsuario() se invoca por llamada (no se cachea)', async () => {
    let usuario = { id: 'u-1', nombre: 'Ana', rol: 'admin' };
    const { deps, mock } = makeDeps({ getUsuario: () => usuario });
    const audit = createAuditLog(deps);

    await audit.escribir('anulacion', {});
    expect(mock.adds[0].data.usuario.id).toBe('u-1');

    // Cambia el usuario entre llamadas (típico tras login distinto)
    usuario = { id: 'u-2', nombre: 'Bea', rol: 'camarero' };

    await audit.escribir('anulacion', {});
    expect(mock.adds[1].data.usuario.id).toBe('u-2');
    expect(mock.adds[1].data.usuario.nombre).toBe('Bea');
  });

  it('tenant() y appName() se resuelven por llamada', async () => {
    let tenantValue = 'toc-tpv-sandbox';
    let appValue = 'tpv';
    const { deps, mock } = makeDeps({
      tenant: () => tenantValue,
      appName: () => appValue,
    });
    const audit = createAuditLog(deps);

    await audit.escribir('anulacion', {});
    expect(mock.adds[0].path).toBe('toc-tpv-sandbox/data/audit_log');
    expect(mock.adds[0].data.app).toBe('tpv');

    tenantValue = 'toc-tpv-iturrama';
    appValue = 'backoffice';

    await audit.escribir('anulacion', {});
    expect(mock.adds[1].path).toBe('toc-tpv-iturrama/data/audit_log');
    expect(mock.adds[1].data.app).toBe('backoffice');
  });

  it('tipo desconocido: log de aviso, no escribe nada', async () => {
    const { deps, mock, logs } = makeDeps();
    const audit = createAuditLog(deps);

    await audit.escribir('tipo_inventado', { foo: 'bar' });

    expect(mock.adds).toHaveLength(0);
    expect(logs.some((args) => args.join(' ').includes('Tipo desconocido'))).toBe(true);
  });

  it('si db() devuelve null: log de aviso, sin excepción, sin escritura', async () => {
    const { deps, mock, logs } = makeDeps({ db: () => null });
    const audit = createAuditLog(deps);

    await expect(audit.escribir('anulacion', {})).resolves.toBeUndefined();
    expect(mock.adds).toHaveLength(0);
    expect(logs.some((args) => args.join(' ').includes('Firebase no disponible'))).toBe(true);
  });

  it('emite breadcrumb a sentry cuando está disponible', async () => {
    const { deps, sentryCalls } = makeDeps();
    const audit = createAuditLog(deps);

    await audit.escribir('anulacion', { mesa: 'M3' });

    expect(sentryCalls.breadcrumb).toHaveLength(1);
    expect(sentryCalls.breadcrumb[0].msg).toBe('audit: anulacion');
    expect(sentryCalls.breadcrumb[0].cat).toBe('audit');
  });

  it('no rompe si sentry está ausente', async () => {
    const { deps } = makeDeps({ sentry: undefined });
    const audit = createAuditLog(deps);
    await expect(audit.escribir('anulacion', {})).resolves.toBeUndefined();
  });

  it('no rompe si sentry es {} (sin breadcrumb ni reportar)', async () => {
    const { deps } = makeDeps({ sentry: {} });
    const audit = createAuditLog(deps);
    await expect(audit.escribir('anulacion', {})).resolves.toBeUndefined();
  });

  it('si la escritura en Firestore lanza: notifica sentry y no propaga', async () => {
    const failingDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            add: () => Promise.reject(new Error('firestore down')),
          }),
        }),
      }),
    };
    const { deps, sentryCalls } = makeDeps({ db: () => failingDb });
    const audit = createAuditLog(deps);

    await expect(audit.escribir('anulacion', { mesa: 'M1' })).resolves.toBeUndefined();
    expect(sentryCalls.reportar).toHaveLength(1);
    expect(sentryCalls.reportar[0].ctx.audit_tipo).toBe('anulacion');
  });
});

// ─── consultar() ─────────────────────────────────────────────────────

describe('consultar()', () => {
  it('devuelve docs leídos del path correcto', async () => {
    const { deps, mock } = makeDeps();
    mock.setDocs([
      { _id: 'a', tipo: 'anulacion', usuario: { nombre: 'Ana' }, timestamp: 1 },
      { _id: 'b', tipo: 'cierre_z', usuario: { nombre: 'Bea' }, timestamp: 2 },
    ]);
    const audit = createAuditLog(deps);

    const out = await audit.consultar();
    expect(out).toHaveLength(2);
    expect(out[0]._id).toBe('a');
    expect(out[1]._id).toBe('b');
  });

  it('filtra por usuario (substring case-insensitive del nombre)', async () => {
    const { deps, mock } = makeDeps();
    mock.setDocs([
      { _id: 'a', tipo: 'anulacion', usuario: { nombre: 'Ana García' }, timestamp: 1 },
      { _id: 'b', tipo: 'cierre_z', usuario: { nombre: 'Bea López' }, timestamp: 2 },
    ]);
    const audit = createAuditLog(deps);

    const out = await audit.consultar({ usuario: 'GAR' });
    expect(out).toHaveLength(1);
    expect(out[0]._id).toBe('a');
  });

  it('respeta tenant en cada llamada', async () => {
    let tenantValue = 'toc-tpv-sandbox';
    let pathSeen = null;
    const captureDb = {
      collection(name) {
        pathSeen = name;
        return {
          doc: () => ({
            collection: () => ({
              where() { return this; },
              orderBy() { return this; },
              limit() { return this; },
              get() { return Promise.resolve({ docs: [] }); },
            }),
          }),
        };
      },
    };
    const { deps } = makeDeps({ db: () => captureDb, tenant: () => tenantValue });
    const audit = createAuditLog(deps);

    await audit.consultar();
    expect(pathSeen).toBe('toc-tpv-sandbox');

    tenantValue = 'toc-tpv-iturrama';
    await audit.consultar();
    expect(pathSeen).toBe('toc-tpv-iturrama');
  });

  it('si db() devuelve null: devuelve [] sin excepción', async () => {
    const { deps } = makeDeps({ db: () => null });
    const audit = createAuditLog(deps);

    await expect(audit.consultar()).resolves.toEqual([]);
  });

  it('si la consulta lanza: notifica sentry y devuelve []', async () => {
    const failingDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where() { return this; },
            orderBy() { return this; },
            limit() { return this; },
            get: () => Promise.reject(new Error('firestore down')),
          }),
        }),
      }),
    };
    const { deps, sentryCalls } = makeDeps({ db: () => failingDb });
    const audit = createAuditLog(deps);

    await expect(audit.consultar()).resolves.toEqual([]);
    expect(sentryCalls.reportar).toHaveLength(1);
    expect(sentryCalls.reportar[0].ctx.contexto).toBe('auditLogConsultar');
  });
});
