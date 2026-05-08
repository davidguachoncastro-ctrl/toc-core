// ═══════════════════════════════════════════════════════════════════
// tests/_helpers.js — Carga el core para tests sin tocar el código de prod
// ═══════════════════════════════════════════════════════════════════
//
// Estrategia idéntica a la del TPV: los archivos del core no usan
// import/export, declaran funciones globales para cargarse vía
// <script>. Para los tests, los leemos como texto, los concatenamos
// y los evaluamos en un scope donde podemos extraer las funciones.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreDir = join(__dirname, '..');

function loadCore(filename) {
  return readFileSync(join(coreDir, filename), 'utf-8');
}

const sourceCode = [
  loadCore('pin-hash.js'),
  loadCore('tenant-resolver.js'),
  loadCore('iva.js'),
].join('\n');

// eslint-disable-next-line no-new-func
const exposeAll = new Function(`
  ${sourceCode}
  return {
    // pin-hash
    PIN_SALT,
    hashPin,
    esPinHash,
    // tenant-resolver
    TENANT_DEFAULT,
    TENANTS_VALIDOS,
    detectarTenantDesdeUrl,
    nombreLocalDesdeTenant,
    esTenantValido,
    // iva
    redondear2,
    precioLineaPuro,
    desglosarIvaLinea,
    calcularDesgloseIva,
  };
`);

const core = exposeAll();

export const {
  PIN_SALT,
  hashPin,
  esPinHash,
  TENANT_DEFAULT,
  TENANTS_VALIDOS,
  detectarTenantDesdeUrl,
  nombreLocalDesdeTenant,
  esTenantValido,
  redondear2,
  precioLineaPuro,
  desglosarIvaLinea,
  calcularDesgloseIva,
} = core;
