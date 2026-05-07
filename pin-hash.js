// ═══════════════════════════════════════════════════════════════════
// js/core/pin-hash.js — Hash de PINs (salt global, SHA-256)
// ═══════════════════════════════════════════════════════════════════
//
// Salt global (no por usuario). Algoritmo: SHA-256(salt + pin + salt)
// devuelto en hex de 64 caracteres. Si PIN_SALT cambia, todos los
// usuarios deben regenerar su hash — y los hashes literales del
// USUARIOS_DEFAULT en js/config.js deben recalcularse en consecuencia.
//
// Cargado en el navegador vía <script src="js/core/pin-hash.js"></script>
// (debe ir antes que js/config.js, que define USUARIOS_DEFAULT con los
// hashes precomputados, y antes que js/tpv-auth.js, que llama hashPin
// en pinOk).
//
// Los tests acceden a estas funciones vía tests/_helpers.js.
// ═══════════════════════════════════════════════════════════════════

const PIN_SALT = 'toc-tpv-pin-v1';

/**
 * Devuelve el hash hex (64 chars) de un PIN.
 * @param {string} pin
 * @returns {Promise<string>}
 */
async function hashPin(pin) {
  if (typeof pin !== 'string') {
    throw new Error('hashPin: pin debe ser string, recibido ' + typeof pin);
  }
  const data = new TextEncoder().encode(PIN_SALT + pin + PIN_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * ¿El valor parece un hash hex de 64 caracteres? Útil para detectar
 * usuarios ya migrados sin necesidad de comparar contra otra cosa.
 * @param {*} valor
 * @returns {boolean}
 */
function esPinHash(valor) {
  return typeof valor === 'string' && /^[0-9a-f]{64}$/.test(valor);
}
