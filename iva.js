// ═══════════════════════════════════════════════════════════════════
// toc-core/iva.js — Cálculos de IVA puros (sin DOM, sin localStorage)
// ═══════════════════════════════════════════════════════════════════
//
// Funciones DETERMINISTAS:
// - Misma entrada → misma salida
// - No leen del DOM ni del localStorage
// - No tienen efectos secundarios
//
// Cargado en el navegador vía <script src="toc-core/iva.js"></script>
// Las funciones quedan globales (compatible con vanilla JS del proyecto).
// Los tests las importan vía tests/_helpers.js
// ═══════════════════════════════════════════════════════════════════

/**
 * Redondea a 2 decimales (céntimos).
 * Crítico para evitar errores de coma flotante en cálculos monetarios.
 */
function redondear2(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Calcula el precio total de una línea de pedido (con extras × cantidad).
 */
function precioLineaPuro(linea) {
  const pExtra = linea.pExtra || 0;
  return (linea.p + pExtra) * linea.qty;
}

/**
 * Desglosa el IVA de una línea individual (PVP → base + cuota).
 */
function desglosarIvaLinea(precioConIva, tipoIva) {
  const base = precioConIva / (1 + tipoIva / 100);
  const cuota = precioConIva - base;
  return {
    base: redondear2(base),
    cuota: redondear2(cuota),
    total: redondear2(precioConIva),
  };
}

/**
 * Calcula el desglose de IVA para un conjunto de líneas con tipos mixtos.
 * Esta es la función crítica para compliance fiscal.
 *
 * Si `descuento` > 0, se prorratea proporcionalmente al importe de cada
 * línea ANTES de desglosar la base/cuota. Esto mantiene la generalidad
 * con IVA mixto (cada tramo se reduce en el mismo factor) y deja el
 * desglose cuadrando con el total efectivamente cobrado.
 */
function calcularDesgloseIva(lineas, descuento = 0) {
  const desglose = {};

  // Primera pasada: total bruto sin descuento.
  let totalBruto = 0;
  lineas.forEach((l) => {
    totalBruto += precioLineaPuro(l);
  });

  // Saturación: descuento >= total → factura a cero, sin desglose.
  if (descuento > 0 && descuento >= totalBruto) {
    return { desglose: {}, baseImponible: 0, cuotaIva: 0, total: 0 };
  }

  // Factor de prorrateo. Si no hay descuento (o totalBruto es 0), no
  // se altera el cálculo y se preserva el comportamiento previo bit-a-bit.
  const factor = (descuento > 0 && totalBruto > 0)
    ? (totalBruto - descuento) / totalBruto
    : 1;

  // Segunda pasada: acumular base/cuota/total por tipo, con el factor.
  lineas.forEach((l) => {
    const tipo = l.iva || 10;
    const lineaTotal = precioLineaPuro(l) * factor;

    if (!desglose[tipo]) {
      desglose[tipo] = { base: 0, cuota: 0, total: 0 };
    }

    const lineaBase = lineaTotal / (1 + tipo / 100);
    desglose[tipo].total += lineaTotal;
    desglose[tipo].base += lineaBase;
    desglose[tipo].cuota += lineaTotal - lineaBase;
  });

  Object.keys(desglose).forEach((tipo) => {
    desglose[tipo].base = redondear2(desglose[tipo].base);
    desglose[tipo].cuota = redondear2(desglose[tipo].cuota);
    desglose[tipo].total = redondear2(desglose[tipo].total);
  });

  const baseImponible = redondear2(
    Object.values(desglose).reduce((acc, v) => acc + v.base, 0)
  );
  const cuotaIva = redondear2(
    Object.values(desglose).reduce((acc, v) => acc + v.cuota, 0)
  );

  return {
    desglose,
    baseImponible,
    cuotaIva,
    total: redondear2(totalBruto * factor),
  };
}
