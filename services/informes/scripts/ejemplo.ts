// Renderiza un informe a PDF y HTML sin llamar a la IA.
//   node scripts/ejemplo.ts [carpeta-con-datos] [salida]
// La carpeta trae datos.json, informe.json y fotos/ (por defecto, ejemplo/).
// Con --generar (y ANTHROPIC_API_KEY en el entorno) primero lo genera con Claude.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generarInforme } from "../src/generar.ts";
import { informeHtml } from "../src/render/html.ts";
import { informePdf } from "../src/render/pdf.ts";
import { armarReferencias } from "../src/render/referencias.ts";
import { ContenidoInforme, type DatosDelDia } from "../src/tipos.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const [entrada, salida] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const carpeta = path.resolve(entrada ?? path.join(raiz, "ejemplo"));
const destino = path.resolve(salida ?? path.join(raiz, "salida"));
const leerFoto = (ruta: string) => readFile(path.join(carpeta, "fotos", ruta));

const datos: DatosDelDia = JSON.parse(await readFile(path.join(carpeta, "datos.json"), "utf8"));
const contenido = process.argv.includes("--generar")
  ? await generarInforme(datos, leerFoto)
  : ContenidoInforme.parse(JSON.parse(await readFile(path.join(carpeta, "informe.json"), "utf8")));

const prefijo = datos.obra.nombre.split(/\s+/)[0];
const ref = await armarReferencias(contenido, datos, leerFoto, { numero: `${prefijo}-001-001` });
await mkdir(destino, { recursive: true });
const base = `informe-diario-${datos.fecha}`;
await writeFile(path.join(destino, `${base}.json`), JSON.stringify(contenido, null, 2));
await writeFile(path.join(destino, `${base}.html`), informeHtml(contenido, ref));
await writeFile(path.join(destino, `${base}.pdf`), await informePdf(contenido, ref));
console.log(`Listo: ${destino}/${base}.{pdf,html,json}`);
