// ═══════════════════════════════════════════════════════════════════
// tests/slug.test.js — #10: slug canónico de catálogo
// ═══════════════════════════════════════════════════════════════════
//
// slugCatalogo es la ÚNICA slug válida para ids de catálogo cross-app
// (escandallos, carta-activa). Debe reproducir bit-a-bit la versión
// endurecida que vivía en toc-backoffice/js/firebase-sync.js — los 207
// escandallos de producción están keyed con ese formato.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { slugCatalogo } from './_helpers.js';

describe('#10 — slugCatalogo', () => {
  it('normaliza acentos y espacios a guiones', () => {
    expect(slugCatalogo('Café Test')).toBe('cafe-test');
    expect(slugCatalogo('Té Matcha Latte')).toBe('te-matcha-latte');
    expect(slugCatalogo('Croissant à la crème')).toBe('croissant-a-la-creme');
  });

  it('mapea fracciones unicode ANTES del NFD (½ media, ¼ cuarto, ¾ tres-cuartos)', () => {
    expect(slugCatalogo('½ Con AOVE')).toBe('media-con-aove');
    expect(slugCatalogo('¼ de tortilla')).toBe('cuarto-de-tortilla');
    expect(slugCatalogo('¾ ración')).toBe('tres-cuartos-racion');
  });

  it('la media y la entera NO colisionan (bug mismatches 12/5/2026)', () => {
    expect(slugCatalogo('½ Con AOVE')).not.toBe(slugCatalogo('Con AOVE'));
    expect(slugCatalogo('½ Tostada')).not.toBe(slugCatalogo('Tostada'));
  });

  it('colapsa símbolos y recorta guiones de borde', () => {
    expect(slugCatalogo('  Café — "Especial" (doble)  ')).toBe('cafe-especial-doble');
    expect(slugCatalogo('100% Arábica')).toBe('100-arabica');
  });

  it('ñ y ü se normalizan como el resto de diacríticos', () => {
    expect(slugCatalogo('Piña colada')).toBe('pina-colada');
    expect(slugCatalogo('Güisqui')).toBe('guisqui');
  });

  it('entradas vacías/null degradan a string vacío sin lanzar', () => {
    expect(slugCatalogo('')).toBe('');
    expect(slugCatalogo(null)).toBe('');
    expect(slugCatalogo(undefined)).toBe('');
  });

  it('difiere a propósito de la slug local del TPV (café_test) — no intercambiables', () => {
    // La slug local del TPV produce `café_test` (conserva acentos, usa _).
    // Este test documenta que el formato canónico de catálogo es OTRO:
    // si alguien "unifica" hacia el formato TPV, los 207 escandallos
    // dejan de matchear.
    expect(slugCatalogo('Café Test')).toBe('cafe-test');
    expect(slugCatalogo('Café Test')).not.toBe('café_test');
  });
});
