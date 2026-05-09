# Changelog — toc-core

Núcleo compartido del ecosistema TOC. Cada extracción al núcleo deja
una entrada aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
