// ═══════════════════════════════════════════════════════════════════
// toc-core/slug.js — Slug canónico de catálogo (compartido TPV/BO)
// ═══════════════════════════════════════════════════════════════════
//
// #10 (AUDITORIA-FASE-FINAL): el TPV y el BO tenían slugs DIVERGENTES
// ("Café Test" → `café_test` en TPV vs `cafe-test` en BO). El matching
// de catálogo cross-app (escandallos, carta-activa, mod-impacto) usa
// los ids del BO, así que ESTA es la versión canónica — la endurecida
// del BO, con el mapeo de fracciones unicode.
//
// Regla de uso:
//   - Cualquier id de CATÁLOGO cross-app → slugCatalogo() (esta).
//   - La `slug()` local del TPV (config.js) genera ids de usuarios y
//     mods ya PERSISTIDOS con su formato histórico — queda para eso y
//     solo para eso; no usarla para catálogo.
//
// Fracciones unicode (½, ¼, ¾) se mapean a `media-`, `cuarto-`,
// `tres-cuartos-` ANTES del NFD para que "½ Con AOVE" y "Con AOVE"
// produzcan ids distintos ("media-con-aove" vs "con-aove"). Sin este
// mapeo, las categorías Medias tostadas y Tostadas colisionaban en el
// mismo escandallo (la media heredaba la receta de la entera al
// publicar — bug de la auditoría de mismatches, 12/5/2026).
//
// Sin dependencias ni estado. Cargado como <script> (declara la
// función global slugCatalogo), evaluado en tests vía tests/_helpers.
// ═══════════════════════════════════════════════════════════════════

function slugCatalogo(str) {
  return (str || '').toLowerCase()
    .replace(/½/g, 'media-').replace(/¼/g, 'cuarto-').replace(/¾/g, 'tres-cuartos-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
