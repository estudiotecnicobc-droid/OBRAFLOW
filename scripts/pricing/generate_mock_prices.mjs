#!/usr/bin/env node
/**
 * ObraFlow Fase 7 — datos sintéticos de estrés (SIN proveedores reales).
 * Uso: node scripts/pricing/generate_mock_prices.mjs --rows 100000 --out ./mock_prices_100k.csv
 * Genera 100000 filas de datos + 1 cabecera; UTF-8, LF y decimales con punto.
 * No introduce saltos de línea dentro de celdas (contrato del Worker v1).
 * Memoria O(1): streaming con backpressure hacia disco.
 */
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  if (i + 1 >= process.argv.length) throw Error("Falta valor para " + name);
  return process.argv[i + 1];
}
const total = Number(arg("--rows", "100000"));
if (!Number.isSafeInteger(total) || total < 1 || total > 1_000_000)
  throw Error("--rows debe estar entre 1 y 1000000");

const filename = resolve(arg("--out", "./mock_prices_100k.csv"));
// Un generador de datos de prueba jamás debe escribir formulas de hoja de
// cálculo ni instrucciones interpretables como código en campos de texto.
function csvCell(value) {
  const raw = String(value);
  if (/[\r\n]/.test(raw)) throw Error("Campos multilinea prohibidos por v1");
  // Comillas, comas y separadores se codifican según RFC 4180.
  return /[",\r\n]/.test(raw) ? '"' + raw.replaceAll('"', '""') + '"' : raw;
}
function record(fields) {
  return fields.map(csvCell).join(",") + "\n";
}

const products = [
  ["Cemento LOMA NEGRA, bolsa 50kg", "bolsa"],
  ["Hierro del 8, acero ADN 420 Ø8 mm barra 12 m", "barra"],
  ["LCH 18x19x33, ladrillo cerámico hueco", "unidad"],
  ["Hormigón elaborado H-21, entrega en obra", "m³"],
  ['Masilla "lista para usar", balde 20 kg', "balde"],
  ["Cal hidratada, bolsa 25 kg", "bolsa"],
  ["Arena fina lavada, camión en Buenos Aires", "m³"],
  ["Aislación térmica, placa EPS 30 mm", "m²"],
  ["Revoque plástico, terminación símil piedra", "kg"],
  ["Caño PVC Ø110, longitud 4 metros", "unidad"],
  ["Piedra partida 6/20, árido para hormigón", "m³"],
  ["Adhesivo cerámico, bolsa 30 kg", "bolsa"]
];

function skuFor(i) {
  const s = String(i).padStart(6, "0");
  switch (i % 6) {
    case 0: return "CN-" + s;
    case 1: return "MTRL/" + (i % 1000) + "-" + s;
    case 2: return "SKU_" + s + "_AR";
    case 3: return "Ñ-OBRA-" + s;
    case 4: return "8.0X-" + s;
    default: return "DIS-26/" + s;
  }
}

const output = createWriteStream(filename, { encoding: "utf8", flags: "wx" });
try {
  if (!output.write(record(["sku","descripcion","precio","moneda","unidad"])))
    await once(output, "drain");
  for (let i = 1; i <= total; i++) {
    const [name, unit] = products[i % products.length];
    const amount = (100 + (i * 37) % 198000).toFixed(2);
    const currency = i % 79 === 0 ? "USD" : "ARS";
    // Variantes reproducibles, sin aleatoriedad ni datos personales.
    const line = record([skuFor(i), name, amount, currency, unit]);
    if (!output.write(line)) await once(output, "drain");
  }
  output.end();
  await finished(output);
  console.log(JSON.stringify({
    output: filename, dataRows: total, physicalLines: total + 1,
    encoding: "UTF-8", newline: "LF", delimiter: ","
  }, null, 2));
} catch (error) {
  output.destroy();
  throw error;
}
