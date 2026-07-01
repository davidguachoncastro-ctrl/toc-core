// ═══════════════════════════════════════════════════════════════════
// toc-core/tenant-resolver.js — Lógica pura de detección de tenant
// ═══════════════════════════════════════════════════════════════════
//
// FUENTE CANÓNICA de `TENANTS_VALIDOS` para todo el ecosistema (#85).
// No hay copia paralela: `js/tenant.js` la re-exporta como
// `window.TOC_TENANTS_VALIDOS`; el BO consume este mismo módulo.
// Añadir un tenant nuevo se hace SOLO aquí.
//
// Función pura testeable. Recibe URL y devuelve tenant.
// El archivo js/tenant.js usa esto al cargarse en el navegador.
// ═══════════════════════════════════════════════════════════════════

const TENANT_DEFAULT = 'toc-tpv-pamplona';
const TENANTS_VALIDOS = ['toc-tpv-pamplona', 'toc-tpv-iturrama', 'toc-tpv-sandbox'];

/**
 * Detecta el tenant a partir de una URL.
 * Prioridad: query string > subdominio > defaultTenant.
 *
 * @param {string} hostname - Por ej. 'pamplona.theoldcoffee.es'
 * @param {string} search - Query string, por ej. '?tenant=iturrama'
 * @param {string} [defaultTenant=TENANT_DEFAULT] - Fallback cuando ni query ni
 *   subdominio resuelven. Por defecto `TENANT_DEFAULT` ('toc-tpv-pamplona') para
 *   compatibilidad con el TPV; el Backoffice y otros consumidores pasan el suyo
 *   (p.ej. 'toc-tpv-sandbox') para no caer accidentalmente a producción.
 * @returns {string} Tenant ID válido (siempre devuelve uno)
 */
function detectarTenantDesdeUrl(hostname, search, defaultTenant = TENANT_DEFAULT) {
  // 1. Query string (mayor prioridad)
  try {
    const params = new URLSearchParams(search || '');
    const qs = params.get('tenant');
    if (qs) {
      const candidato = qs.startsWith('toc-tpv-') ? qs : `toc-tpv-${qs}`;
      if (TENANTS_VALIDOS.includes(candidato)) {
        return candidato;
      }
    }
  } catch (e) {
    // Si URLSearchParams falla, seguimos con subdominio
  }

  // 2. Subdominio
  if (hostname) {
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const sub = parts[0];
      // Acepta tanto subdominios cortos (`pamplona.theoldcoffee.es`)
      // como hosts Firebase con sub prefijado (`toc-tpv-sandbox.web.app`).
      const candidato = sub.startsWith('toc-tpv-') ? sub : `toc-tpv-${sub}`;
      if (TENANTS_VALIDOS.includes(candidato)) {
        return candidato;
      }
    }
  }

  // 3. Default (parametrizable por consumidor)
  return defaultTenant;
}

/**
 * Devuelve el nombre legible del local desde un tenant.
 * @param {string} tenant
 * @returns {string} 'Pamplona', 'Iturrama', etc.
 */
function nombreLocalDesdeTenant(tenant) {
  if (!tenant || !tenant.startsWith('toc-tpv-')) return 'Desconocido';
  const sub = tenant.replace('toc-tpv-', '');
  return sub.charAt(0).toUpperCase() + sub.slice(1);
}

/**
 * Valida si un string es un tenant ID válido (formato + lista).
 */
function esTenantValido(tenant) {
  return TENANTS_VALIDOS.includes(tenant);
}
