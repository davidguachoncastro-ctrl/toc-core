# toc-core

![CI](https://github.com/davidguachoncastro-ctrl/toc-core/actions/workflows/ci.yml/badge.svg)

Núcleo compartido del ecosistema TOC. Reúne la lógica pura que necesitan más
de una de las apps del ecosistema (TPV, Backoffice, RRHH) para evitar
duplicación silenciosa entre repos hermanos.

## Estado

Etapa 1 (mayo 2026): contenido inicial extraído del TPV (`davidguachoncastro-ctrl/toc-tpv`)
después del cierre de la sesión `v2.0-final`. Solo dos módulos por ahora:

- `tenant-resolver.js` — detección de tenant desde URL (query/subdominio/default),
  validación y nombre legible. Globals expuestos: `TENANT_DEFAULT`,
  `TENANTS_VALIDOS`, `detectarTenantDesdeUrl(hostname, search)`,
  `nombreLocalDesdeTenant(tenant)`, `esTenantValido(tenant)`.
- `pin-hash.js` — hash de PINs con salt global SHA-256. Globals expuestos:
  `PIN_SALT`, `hashPin(pin)` (async), `esPinHash(valor)`.

## Cómo se consume

`toc-core` se enlaza como **submódulo Git** desde cada app del ecosistema:

```bash
# Desde la raíz de la app consumidora (TPV, Backoffice, RRHH)
git submodule add https://github.com/davidguachoncastro-ctrl/toc-core.git toc-core
```

En el HTML, los archivos se cargan con `<script>` directos (no hay build step,
no hay módulos ES, igual que el resto del ecosistema):

```html
<script src="toc-core/tenant-resolver.js"></script>
<script src="toc-core/pin-hash.js"></script>
```

Las funciones quedan disponibles como globals en el `window` desde ese
momento. La app consumidora las usa por nombre (`hashPin`, `esTenantValido`,
etc).

Cuando se actualiza `toc-core`:

```bash
# Desde la app consumidora
git submodule update --remote toc-core
git add toc-core
git commit -m "chore: bump toc-core"
```

## Tests

```bash
npm install   # primera vez
npm test
```

Vitest carga los archivos del core con un helper que los lee como texto y los
evalúa en memoria — el mismo patrón que usa el TPV (`tests/_helpers.js`).
Esto preserva el código vanilla sin alteraciones.

## Regla de oro durante Etapa 1

**El TPV es la fuente de verdad.** Si hay divergencia entre el código de aquí
y el del TPV, ganan los tests verdes en ambos sitios; cualquier cambio
funcional pasa primero por el TPV (`davidguachoncastro-ctrl/toc-tpv`),
después se replica aquí, después se actualizan los submódulos en Backoffice
y RRHH. No al revés.

Cuando el ecosistema esté estable (Etapa 2+), esta regla se relaja: los
cambios podrán nacer aquí y propagarse a las apps consumidoras.

## Convenciones

- Vanilla JS, sin build step, sin import/export.
- Cada archivo declara funciones globales para que `<script>` las exponga.
- Tests en Vitest + happy-dom (idéntico al TPV).
- Sin dependencias de runtime, solo `vitest` y `happy-dom` como
  `devDependencies`.
