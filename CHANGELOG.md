# Changelog — toc-core

Núcleo compartido del ecosistema TOC. Cada extracción al núcleo deja
una entrada aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased] — tenant-resolver: fix subdominio Firebase + defaultTenant configurable

**Fecha:** 11-12 mayo 2026.

Dos cambios consecutivos en `tenant-resolver.js` motivados por un
debug del TPV en móvil (la URL corta del sandbox caía silenciosamente
al tenant default y la app sandbox apuntaba al Firebase de producción)
y por la posterior migración del Backoffice a este módulo.

### Fixed

- **`tenant-resolver.js`** (commit `b2071b9`) — la rama de detección
  por subdominio asumía hosts cortos (`pamplona.theoldcoffee.es`) y
  prefijaba `toc-tpv-` siempre. Con hosts Firebase tipo
  `toc-tpv-sandbox.web.app` el sub ya venía prefijado y la
  concatenación generaba el candidato inválido
  `toc-tpv-toc-tpv-sandbox`, descartado por
  `TENANTS_VALIDOS.includes(...)` → fallback al default. Fix:
  ```js
  const candidato = sub.startsWith('toc-tpv-') ? sub : `toc-tpv-${sub}`;
  ```
  Misma defensa que ya existía en la rama de query.

### Added

- **`tenant-resolver.js`** (commit `4e5102a`) — tercer parámetro
  opcional `defaultTenant` en `detectarTenantDesdeUrl(hostname, search,
  defaultTenant = TENANT_DEFAULT)`. Permite que cada consumidor declare
  su propio fallback sin que el módulo se entere de quién lo llama:
  - TPV no pasa el parámetro → sigue usando `'toc-tpv-pamplona'` (compat
    total).
  - BO pasa `'toc-tpv-sandbox'` → no cae accidentalmente a producción
    cuando el resolver no resuelve.
- **`tests/tenant-resolver.test.js`** — 6 tests nuevos: subdominio
  Firebase con sub prefijado (`toc-tpv-sandbox.web.app`,
  `toc-tpv-pamplona.web.app`), subdominio Firebase desconocido, y
  4 tests del nuevo parámetro `defaultTenant` (uso, no-override de
  query/subdominio cuando sí resuelven, compat sin pasar el
  argumento). 27/27 verdes en este archivo, 87/87 totales.

### Consumidores
- **TPV** (`toc-tpv@5f05dbf`): bump al commit `4e5102a`. Sin cambios
  en su adapter `js/tenant.js` — no usa el nuevo parámetro.
- **BO** (`toc-backoffice@0619d3c`): bump al commit `4e5102a` +
  migración completa. Antes el BO tenía su propio `js/tenant.js` con
  la lógica duplicada (y el mismo bug del subdominio). Ahora consume
  `toc-core/tenant-resolver.js` vía adapter que pasa
  `'toc-tpv-sandbox'` como `defaultTenant`. Drift de lógica duplicada
  eliminado.

## [Unreleased]

### Used

- TIPO `venta_sin_escandallo` (commit `4b680ea`) en uso productivo
  por TPV en sandbox (`toc-tpv-sandbox`). Validado el 10/5/2026 al
  cobrar producto sin escandallo embebido en el contrato vigente:
  el cobro completa caja, NO escribe `stock-movimientos`, y emite
  `venta_sin_escandallo` en `audit_log` con `{producto, qty, ventaId}`.

## [Unreleased] — Arq 2 · audit-log.js (Factory DI)

**Fecha:** 9 mayo 2026.

Cuarta primitiva del ecosistema, tras `tenant-resolver.js`,
`pin-hash.js` (Sesión 1.A) e `iva.js` (Arq 1). Patrón replicado:
extracción consciente desde el TPV antes de generar consumidores
adicionales con drift.

### Added

- **`audit-log.js`** — Factory DI. API pública:
  ```
  createAuditLog({ db, tenant, getUsuario, appName, log, sentry, serverTimestamp })
    → { TIPOS, UMBRAL_DESCUENTO_PCT, escribir, consultar }
  ```
  Cada app construye su instancia con sus dependencias inyectadas.
  Sin estado mutable en el módulo (coherente con `iva.js` y
  `pin-hash.js`).
- **`tests/audit-log.test.js`** — 21 tests Vitest cubriendo: shape
  del documento escrito, default `usuario.id = 'sistema'`, no-cacheo
  de `getUsuario()` (se invoca por llamada), filtros de `consultar`,
  defensas (tipo desconocido, `db()` null, sentry ausente, escritura
  fallida). Mock de Firestore (cadena `collection().doc().collection()`
  con `add`/`where`/`orderBy`/`limit`/`get`) sin I/O real.
- **`tests/_helpers.js`** — ampliado con `createAuditLog`,
  `AUDIT_TIPOS`, `AUDIT_UMBRAL_DESCUENTO_PCT`.

### Why — patrón Factory DI

El briefing previo evaluó tres patrones (Factory, Init singleton,
Contexto por llamada) contra el shape real del módulo: deps con
mutación tras boot (`db`, `tenant`, `getUsuario`, `appName`,
`serverTimestamp`) que obligan a getters en lugar de valores. Factory
sale como ganador por:

- Sin estado mutable en el módulo compartido (coherencia con `iva.js`
  / `pin-hash.js`).
- Dos instancias coexistirían sin chocar (relevante si en el futuro
  TPV+Backoffice se cargan en la misma página, ej. una vista admin
  embebida).
- API consumidor idéntica a la pre-Arq 2 una vez hecho el bootstrap
  (`TOC.audit.escribir(...)`).
- Tests sin `beforeEach reset`, cada caso construye su instancia con
  mocks limpios.

### Defaults canónicos

- `usuario.id = 'sistema'` cuando `getUsuario()` devuelve `null` o
  `{}`. Describe correctamente "evento automático sin sesión activa";
  más honesto que `'sin-id'` (TPV antiguo, ambiguo) o `'anonimo'`
  (Backoffice antiguo, sugiere humano no identificado).

### Tests

- toc-core pre-Arq 2: 59 tests (21 tenant-resolver + 17 pin-hash + 21 iva).
- toc-core post-Arq 2: **80 tests** (+21 audit-log).
- CI verde en GitHub Actions Node 20 + `npm ci`.

### Commit

- `338d963` Arq 2 paso 1: extraer audit-log.js con factory DI.

### Consumidores

- TPV (`davidguachoncastro-ctrl/toc-tpv`): adopta vía
  `<script src="toc-core/audit-log.js">` + bootstrap inline en
  `js/audit-log.js` (commit `cf055a8`).
- Backoffice (`davidguachoncastro-ctrl/toc-backoffice`): primera
  adopción de submódulo `toc-core`. Bootstrap inline en `index.html`
  (commit `df3fe0e`).
- RRHH: NO se toca (modelo regulatorio distinto, RD-Ley 8/2019).
