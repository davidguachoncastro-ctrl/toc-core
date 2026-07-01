// ═══════════════════════════════════════════════════════════════════
// tests/iva.test.js
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  redondear2,
  precioLineaPuro,
  desglosarIvaLinea,
  calcularDesgloseIva,
} from './_helpers.js';

describe('redondear2', () => {
  it('redondea a 2 decimales', () => {
    expect(redondear2(1.235)).toBe(1.24);
    expect(redondear2(1.234)).toBe(1.23);
    expect(redondear2(0.1 + 0.2)).toBe(0.3);
  });

  it('maneja números enteros', () => {
    expect(redondear2(10)).toBe(10);
    expect(redondear2(0)).toBe(0);
  });
});

describe('precioLineaPuro', () => {
  it('calcula precio simple sin extras', () => {
    expect(precioLineaPuro({ p: 2.5, qty: 1 })).toBe(2.5);
    expect(precioLineaPuro({ p: 2.5, qty: 3 })).toBe(7.5);
  });

  it('suma precio extra (modificadores)', () => {
    expect(precioLineaPuro({ p: 2.5, pExtra: 0.3, qty: 1 })).toBe(2.8);
    expect(precioLineaPuro({ p: 5, pExtra: 1, qty: 2 })).toBe(12);
  });

  it('trata pExtra undefined como 0', () => {
    expect(precioLineaPuro({ p: 4, qty: 2 })).toBe(8);
  });
});

describe('desglosarIvaLinea', () => {
  it('desglosa IVA 10% sobre PVP de 1,10 €', () => {
    const r = desglosarIvaLinea(1.1, 10);
    expect(r.total).toBe(1.1);
    expect(r.base).toBe(1);
    expect(r.cuota).toBe(0.1);
  });

  it('desglosa IVA 21% sobre PVP de 12,10 €', () => {
    const r = desglosarIvaLinea(12.1, 21);
    expect(r.total).toBe(12.1);
    expect(r.base).toBe(10);
    expect(r.cuota).toBe(2.1);
  });

  it('desglosa importes pequeños correctamente', () => {
    const r = desglosarIvaLinea(0.1, 10);
    expect(r.base).toBeCloseTo(0.09, 2);
    expect(r.cuota).toBeCloseTo(0.01, 2);
  });
});

describe('calcularDesgloseIva — caso típico hostelería', () => {
  it('1 café a 1,50€ con IVA 10%', () => {
    const lineas = [{ p: 1.5, qty: 1, iva: 10 }];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(1.5);
    expect(r.desglose[10].total).toBe(1.5);
    expect(r.desglose[10].base).toBe(1.36);
    expect(r.desglose[10].cuota).toBe(0.14);
    expect(r.baseImponible).toBe(1.36);
    expect(r.cuotaIva).toBe(0.14);
  });

  it('múltiples cafés mismo IVA', () => {
    const lineas = [
      { p: 1.5, qty: 2, iva: 10 }, // 3.00
      { p: 2.0, qty: 1, iva: 10 }, // 2.00
    ];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(5);
    expect(r.desglose[10].total).toBe(5);
  });

  it('mezcla de IVA 10% (hostelería) e IVA 21% (productos)', () => {
    const lineas = [
      { p: 1.5, qty: 1, iva: 10 },  // café 1.50
      { p: 12.1, qty: 1, iva: 21 }, // producto 12.10
    ];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(13.6);
    expect(r.desglose[10].total).toBe(1.5);
    expect(r.desglose[21].total).toBe(12.1);
    expect(r.desglose[10].cuota).toBe(0.14);
    expect(r.desglose[21].cuota).toBe(2.1);
    expect(r.cuotaIva).toBe(0.14 + 2.1);
  });

  it('aplica IVA 10% por defecto si no se especifica', () => {
    const lineas = [{ p: 2, qty: 1 }]; // sin iva → 10
    const r = calcularDesgloseIva(lineas);
    expect(r.desglose[10]).toBeDefined();
    expect(r.desglose[10].total).toBe(2);
  });

  it('considera modificadores con precio extra (pExtra)', () => {
    const lineas = [
      { p: 2.5, pExtra: 0.3, qty: 1, iva: 10 }, // latte con leche soja
    ];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(2.8);
    expect(r.desglose[10].total).toBe(2.8);
  });

  it('pedido vacío devuelve totales en 0', () => {
    const r = calcularDesgloseIva([]);
    expect(r.total).toBe(0);
    expect(r.baseImponible).toBe(0);
    expect(r.cuotaIva).toBe(0);
    expect(Object.keys(r.desglose).length).toBe(0);
  });

  it('desglose multi-IVA: la suma de bases + cuotas = total', () => {
    const lineas = [
      { p: 5, qty: 2, iva: 10 },
      { p: 3, qty: 1, iva: 21 },
      { p: 4, qty: 1, iva: 4 },
    ];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(17);
    // La suma de base + cuota debe ser el total (con tolerancia de redondeo)
    expect(r.baseImponible + r.cuotaIva).toBeCloseTo(17, 1);
  });
});

describe('calcularDesgloseIva — con descuento (prorrateo proporcional)', () => {
  it('una línea IVA 10%, descuento € fijo (caso del bug)', () => {
    // Producto 3,00 € con descuento 1,00 €: total cobrado 2,00 € →
    // base imponible 1,82 €, cuota IVA 0,18 €.
    const lineas = [{ p: 3, qty: 1, iva: 10 }];
    const r = calcularDesgloseIva(lineas, 1);
    expect(r.total).toBe(2);
    expect(r.baseImponible).toBe(1.82);
    expect(r.cuotaIva).toBe(0.18);
    expect(r.desglose[10].total).toBe(2);
    expect(r.desglose[10].base).toBe(1.82);
    expect(r.desglose[10].cuota).toBe(0.18);
  });

  it('descuento iguala el total → todo a cero', () => {
    const lineas = [{ p: 3, qty: 1, iva: 10 }];
    const r = calcularDesgloseIva(lineas, 3);
    expect(r.total).toBe(0);
    expect(r.baseImponible).toBe(0);
    expect(r.cuotaIva).toBe(0);
    expect(Object.keys(r.desglose).length).toBe(0);
  });

  it('descuento mayor que el total satura a cero (no negativos)', () => {
    const lineas = [{ p: 3, qty: 1, iva: 10 }];
    const r = calcularDesgloseIva(lineas, 10);
    expect(r.total).toBe(0);
    expect(r.baseImponible).toBe(0);
    expect(r.cuotaIva).toBe(0);
    expect(Object.keys(r.desglose).length).toBe(0);
  });

  it('varias líneas mismo IVA, descuento € fijo', () => {
    const lineas = [
      { p: 2, qty: 1, iva: 10 },
      { p: 3, qty: 1, iva: 10 },
    ];
    const r = calcularDesgloseIva(lineas, 1);
    expect(r.total).toBe(4);
    expect(r.baseImponible).toBe(3.64);
    expect(r.cuotaIva).toBe(0.36);
    expect(r.desglose[10].total).toBe(4);
  });

  it('descuento = 0 idéntico a llamar sin segundo argumento (regresión)', () => {
    const lineas = [
      { p: 5, qty: 2, iva: 10 },
      { p: 3, qty: 1, iva: 21 },
    ];
    const sin = calcularDesgloseIva(lineas);
    const conCero = calcularDesgloseIva(lineas, 0);
    expect(conCero.total).toBe(sin.total);
    expect(conCero.baseImponible).toBe(sin.baseImponible);
    expect(conCero.cuotaIva).toBe(sin.cuotaIva);
    expect(conCero.desglose[10].total).toBe(sin.desglose[10].total);
    expect(conCero.desglose[10].base).toBe(sin.desglose[10].base);
    expect(conCero.desglose[10].cuota).toBe(sin.desglose[10].cuota);
    expect(conCero.desglose[21].total).toBe(sin.desglose[21].total);
  });

  it('Oreo Cream Latte 4 € − 2 € → 2 / 1,82 / 0,18 (caso real factura F-2026-0003)', () => {
    const lineas = [{ p: 4, qty: 1, iva: 10 }];
    const r = calcularDesgloseIva(lineas, 2);
    expect(r.total).toBe(2);
    expect(r.baseImponible).toBe(1.82);
    expect(r.cuotaIva).toBe(0.18);
  });
});

describe('calcularDesgloseIva — IVA 0% exento vs ausente (#55)', () => {
  it('una línea con iva:0 se trata como EXENTO (base = total, cuota 0), no como 10%', () => {
    const lineas = [{ p: 2, qty: 1, iva: 0 }];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(2);
    expect(r.desglose[0]).toBeDefined();
    expect(r.desglose[10]).toBeUndefined();
    expect(r.desglose[0].base).toBe(2);
    expect(r.desglose[0].cuota).toBe(0);
    expect(r.baseImponible).toBe(2);
    expect(r.cuotaIva).toBe(0);
  });

  it('el IVA AUSENTE sigue cayendo al 10% por defecto (no confundir con exento)', () => {
    const lineas = [{ p: 2, qty: 1 }]; // sin campo iva → 10
    const r = calcularDesgloseIva(lineas);
    expect(r.desglose[10]).toBeDefined();
    expect(r.desglose[0]).toBeUndefined();
    expect(r.cuotaIva).toBeGreaterThan(0);
  });

  it('mezcla exento (0%) + hostelería (10%): cada tramo con su cuota correcta', () => {
    const lineas = [
      { p: 2, qty: 1, iva: 0 },   // bono/exento
      { p: 1.5, qty: 1, iva: 10 }, // café
    ];
    const r = calcularDesgloseIva(lineas);
    expect(r.total).toBe(3.5);
    expect(r.desglose[0].cuota).toBe(0);
    expect(r.desglose[0].base).toBe(2);
    expect(r.desglose[10].total).toBe(1.5);
    expect(r.desglose[10].cuota).toBe(0.14);
    // El global cuadra pese al tramo exento.
    expect(r.baseImponible + r.cuotaIva).toBe(3.5);
  });
});

describe('calcularDesgloseIva — sin descuadre de céntimo (#72, largest-remainder)', () => {
  it('3 tipos con descuento: Σ base + Σ cuota == total EXACTO (no ±0,01)', () => {
    // Caso que descuadraba con redondeo por tramo independiente: factor
    // 2,5/3 reparte 0,8333 € a cada tramo; redondear cada uno a 0,83 daba
    // Σ = 2,49 ≠ 2,50. Largest-remainder asigna el céntimo sobrante.
    const lineas = [
      { p: 1, qty: 1, iva: 4 },
      { p: 1, qty: 1, iva: 10 },
      { p: 1, qty: 1, iva: 21 },
    ];
    const r = calcularDesgloseIva(lineas, 0.5);
    expect(r.total).toBe(2.5);
    const sumaTotales =
      r.desglose[4].total + r.desglose[10].total + r.desglose[21].total;
    expect(redondear2(sumaTotales)).toBe(2.5);
    // Invariante TBAI: base + cuota reconstruyen el total exactamente.
    expect(r.baseImponible + r.cuotaIva).toBe(2.5);
  });

  it('cada tramo cumple base + cuota == total del tramo (por construcción)', () => {
    const lineas = [
      { p: 3.33, qty: 1, iva: 10 },
      { p: 6.67, qty: 1, iva: 21 },
      { p: 2.5, qty: 1, iva: 4 },
    ];
    const r = calcularDesgloseIva(lineas, 1.23);
    Object.values(r.desglose).forEach((d) => {
      expect(redondear2(d.base + d.cuota)).toBe(d.total);
    });
    expect(r.baseImponible + r.cuotaIva).toBe(r.total);
  });
});
