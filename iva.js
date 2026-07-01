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

  // Segunda pasada: acumular el total (con IVA, con factor) por tipo SIN
  // redondear todavía. `tipo` con Number.isFinite (#55): un IVA 0 % (exento)
  // se preserva como 0; solo el IVA AUSENTE cae al 10 % por defecto. El
  // viejo `l.iva || 10` fosilizaba los exentos como 10 %.
  const totalFloatPorTipo = {};
  const ordenTipos = [];
  lineas.forEach((l) => {
    const tipo = Number.isFinite(l.iva) ? l.iva : 10;
    if (!(tipo in totalFloatPorTipo)) {
      totalFloatPorTipo[tipo] = 0;
      ordenTipos.push(tipo);
    }
    totalFloatPorTipo[tipo] += precioLineaPuro(l) * factor;
  });

  // Total global autoritativo (lo que se cobra) redondeado a céntimos.
  const totalGlobal = redondear2(totalBruto * factor);

  // #72: reparto largest-remainder del total en céntimos por tipo, de modo
  // que Σ total[tipo] == totalGlobal EXACTO. Redondear cada tramo por
  // separado dejaba un descuadre de ±0,01 € entre Σ(base+cuota) y el total
  // que TBAI/VeriFactu rechaza. Repartimos primero el suelo en céntimos y
  // luego el céntimo sobrante a los tramos con mayor resto fraccionario.
  const centGlobal = Math.round(totalGlobal * 100);
  const tramos = ordenTipos.map((tipo) => {
    const centExacto = totalFloatPorTipo[tipo] * 100;
    const piso = Math.floor(centExacto);
    return { tipo, cent: piso, resto: centExacto - piso };
  });
  let sobrante = centGlobal - tramos.reduce((acc, t) => acc + t.cent, 0);
  // Índices ordenados por resto descendente (estable: empates conservan el
  // orden de aparición). Repartimos/quitamos céntimos sin reordenar `tramos`
  // para no alterar el orden de las claves del desglose.
  const porResto = tramos.map((_, i) => i).sort((a, b) => tramos[b].resto - tramos[a].resto);
  for (let k = 0; sobrante > 0 && k < porResto.length; k++, sobrante--) {
    tramos[porResto[k]].cent += 1;
  }
  for (let k = porResto.length - 1; sobrante < 0 && k >= 0; k--, sobrante++) {
    tramos[porResto[k]].cent -= 1;
  }

  // De total por tipo (ya cuadrado) derivamos cuota y base = total − cuota,
  // así base + cuota == total por tipo de forma exacta.
  tramos.forEach(({ tipo, cent }) => {
    const totalTipo = cent / 100;
    const cuota = redondear2(totalTipo - totalTipo / (1 + Number(tipo) / 100));
    desglose[tipo] = {
      base: redondear2(totalTipo - cuota),
      cuota,
      total: totalTipo,
    };
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
    total: totalGlobal,
  };
}
