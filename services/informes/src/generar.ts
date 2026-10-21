import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { fotoAnotada } from "./anotar.ts";
import { SISTEMA_GRUPO, SISTEMA_SINTESIS, notasDeObra } from "./prompt.ts";
import {
  BorradorGrupo,
  ContenidoInforme,
  Sintesis,
  type Avance,
  type DatosDelDia,
  type Foto,
  type Item,
} from "./tipos.ts";

export const MODELO = "claude-opus-5-5";
/** Fotos por pedido. Con más, se parte por ítem y después se sintetiza. */
const FOTOS_POR_GRUPO = 30;
/** Lado mayor de la foto que ve la IA: suficiente para leer obra, ~1.600 tokens por foto. */
const LADO_FOTO_IA = 1092;

export type LeerFoto = (archivo_path: string) => Promise<Buffer>;

type Bloque = Anthropic.Beta.Messages.BetaContentBlockParam;

let cliente: Anthropic | undefined;

/**
 * Genera el contenido del informe diario de una obra.
 * 1) Por cada grupo de ítems (hasta 30 fotos) la IA mira las fotos con sus
 *    marcas dibujadas y redacta un avance por ítem + alertas. Los grupos van en paralelo.
 * 2) Una pasada de solo texto cruza todo: resumen, alertas generales,
 *    incidentes y pendientes.
 * El orden sigue el itemizado; autores e ítems sin registro se calculan sin IA.
 */
export async function generarInforme(datos: DatosDelDia, leerFoto: LeerFoto): Promise<ContenidoInforme> {
  const grupos = agruparPorItem(datos, FOTOS_POR_GRUPO);
  const borradores = await Promise.all(grupos.map((g) => redactarGrupo(datos, g, leerFoto)));

  const orden = new Map(datos.items.map((i, n) => [i.id, n]));
  const avances = unirPorItem(borradores.flatMap((b) => b.avances)).sort((a, b) => (orden.get(a.item_id) ?? 1e9) - (orden.get(b.item_id) ?? 1e9));
  const itemsSinRegistro = calcularItemsSinRegistro(datos);
  const sintesis = await sintetizar(datos, avances, itemsSinRegistro);

  return ContenidoInforme.parse({
    version_esquema: 3,
    titulo: `Informe diario · ${datos.obra.codigo} – ${datos.obra.nombre} · ${fechaCorta(datos.fecha)}`,
    resumen: sintesis.resumen,
    clima: datos.clima ?? null,
    personal: datos.personal ?? [],
    avances,
    incidentes: sintesis.incidentes,
    pendientes: sintesis.pendientes,
    observaciones: sintesis.observaciones,
    autores: [...new Set(datos.fotos.map((f) => f.autor_id))],
    alertas: [...borradores.flatMap((b) => b.alertas), ...sintesis.alertas_generales],
    items_sin_registro: itemsSinRegistro,
  });
}

/** Vuelve a redactar un solo avance a partir de sus fotos de origen. */
export async function regenerarAvance(
  datos: DatosDelDia,
  avance: Avance,
  leerFoto: LeerFoto,
  indicacion?: string,
): Promise<Avance> {
  const ids = new Set(avance.fuentes.foto_ids);
  const fotos = datos.fotos.filter((f) => ids.has(f.id));
  const extra =
    `Redactá exactamente un avance con id "${avance.id}" para el ítem ${avance.item_id}.` +
    (indicacion ? `\nIndicación del editor: ${indicacion}` : "");
  const borrador = await redactarGrupo(datos, fotos, leerFoto, extra);
  return borrador.avances[0] ?? avance;
}

// ─── Pasada 1: fotos + comentarios de un grupo de ítems ─────────────────────

async function redactarGrupo(datos: DatosDelDia, fotos: Foto[], leerFoto: LeerFoto, extra?: string) {
  const contenido: Bloque[] = [{ type: "text", text: contextoObra(datos, fotos) }];

  for (const f of fotos) {
    const anotaciones = datos.anotaciones.filter((a) => a.foto_id === f.id).sort((a, b) => a.numero - b.numero);
    const imagen = await fotoAnotada(await leerFoto(f.archivo_path), anotaciones, LADO_FOTO_IA);
    contenido.push({ type: "text", text: describirFoto(datos, f) });
    contenido.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imagen.toString("base64") },
    });
  }
  contenido.push({
    type: "text",
    text: "Redactá un avance por ítem y las alertas de estas fotos." + (extra ? `\n${extra}` : ""),
  });

  return pedir(SISTEMA_GRUPO, notasDeObra(datos.obra.notas_para_informe), contenido, BorradorGrupo);
}

// ─── Pasada 2: síntesis de todo el día (solo texto) ─────────────────────────

async function sintetizar(datos: DatosDelDia, avances: Avance[], itemsSinRegistro: string[]) {
  const texto = JSON.stringify({
    obra: `${datos.obra.codigo} – ${datos.obra.nombre}`,
    fecha: datos.fecha,
    resumen_dia_anterior: datos.resumen_dia_anterior ?? null,
    usuarios: datos.usuarios,
    items_previstos_sin_registro: itemsSinRegistro.map((id) => rotuloItem(datos.items, id)),
    avances: avances.map(({ id, item_id, texto, fuentes }) => ({
      id,
      item: rotuloItem(datos.items, item_id),
      texto,
      foto_ids: fuentes.foto_ids,
    })),
  });
  return pedir(SISTEMA_SINTESIS, notasDeObra(datos.obra.notas_para_informe), [{ type: "text", text: texto }], Sintesis);
}

// ─── Llamada a Claude ───────────────────────────────────────────────────────

async function pedir<S extends z.ZodType>(
  sistema: string,
  sistemaObra: string,
  contenido: Bloque[],
  esquema: S,
): Promise<z.infer<S>> {
  cliente ??= new Anthropic(); // lee ANTHROPIC_API_KEY del entorno (secreto de la nube, nunca del repo)
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
  ];
  if (sistemaObra) system.push({ type: "text", text: sistemaObra });

  const stream = cliente.beta.messages.stream({
    model: MODELO,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(esquema) },
    system,
    messages: [{ role: "user", content: contenido }],
  });
  const mensaje = await stream.finalMessage();

  if (mensaje.stop_reason === "refusal") {
    throw new Error(`La IA no pudo redactar el informe (${mensaje.stop_details?.category ?? "sin categoría"}).`);
  }
  if (mensaje.stop_reason === "max_tokens") {
    throw new Error("El informe quedó cortado: demasiadas fotos para un solo pedido.");
  }
  if (!mensaje.parsed_output) throw new Error("La IA devolvió un formato inválido.");
  const u = mensaje.usage;
  console.log(`[informe] ${mensaje.model} entrada=${u.input_tokens} cache=${u.cache_read_input_tokens ?? 0} salida=${u.output_tokens}`);
  return mensaje.parsed_output as z.infer<S>;
}

// ─── Armado de texto para la IA ─────────────────────────────────────────────

/** "21 Excavación de zanja… (OC.0054D00200102) · Zapata corrida y muros ménsula › Zapata corrida" */
export function rotuloItem(items: Item[], id: string): string {
  const item = items.find((i) => i.id === id);
  if (!item) return id;
  return `${item.numero ? `${item.numero} ` : ""}${item.descripcion} (${item.codigo})${rubro(items, item) ? ` · ${rubro(items, item)}` : ""}`;
}

/** Ruta de títulos del ítem, sin la raíz (la obra). */
export function rubro(items: Item[], item: Item): string {
  const ruta: string[] = [];
  let padre = items.find((i) => i.id === item.padre_id);
  while (padre?.padre_id) {
    ruta.unshift(padre.descripcion);
    padre = items.find((i) => i.id === padre!.padre_id);
  }
  return ruta.join(" › ");
}

function contextoObra(datos: DatosDelDia, fotos: Foto[]): string {
  const itemIds = [...new Set(fotos.map((f) => f.item_id))];
  return [
    `Obra: ${datos.obra.codigo} – ${datos.obra.nombre}${datos.obra.ubicacion ? ` (${datos.obra.ubicacion})` : ""}`,
    `Fecha: ${datos.fecha}`,
    datos.resumen_dia_anterior ? `Resumen del día anterior: ${datos.resumen_dia_anterior}` : "",
    `Usuarios: ${datos.usuarios.map((u) => `${u.id} = ${u.nombre}${u.cargo ? ` (${u.cargo})` : ""}`).join("; ")}`,
    datos.sectores.length ? `Sectores: ${datos.sectores.map((s) => `${s.id} = ${s.nombre}`).join("; ")}` : "",
    `Ítems de estas fotos:\n${itemIds.map((id) => `- ${id} = ${rotuloItem(datos.items, id)}`).join("\n")}`,
    `A continuación, ${fotos.length} fotos, cada una precedida por sus datos y comentarios.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function describirFoto(datos: DatosDelDia, f: Foto): string {
  const u = datos.usuarios.find((x) => x.id === f.autor_id);
  const anotaciones = datos.anotaciones.filter((a) => a.foto_id === f.id).sort((a, b) => a.numero - b.numero);
  const marcas = anotaciones.map((a) => `  ${a.numero}) [${a.id}] ${a.comentario || "(sin comentario)"}`).join("\n");
  return [
    `— Foto ${f.id} · ${u?.nombre ?? f.autor_id} (${u?.cargo ?? "?"}, ${f.autor_id}) · ${horaLocal(f.tomada_en)}`,
    `Ítem: ${f.item_id}${f.sector_id ? ` · Sector: ${f.sector_id}` : ""}`,
    `Comentario: ${f.comentario?.trim() || "(sin comentario)"}`,
    marcas ? `Marcas sobre la foto:\n${marcas}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Lógica sin IA ──────────────────────────────────────────────────────────

export const horaLocal = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" });

export const fechaLarga = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const fechaCorta = (fecha: string) => fecha.split("-").reverse().join("/");

/** Fotos ordenadas por itemizado y hora, en grupos de ítems enteros de hasta `max` fotos. */
export function agruparPorItem(datos: DatosDelDia, max: number): Foto[][] {
  const orden = new Map(datos.items.map((i, n) => [i.id, n]));
  const porItem = new Map<string, Foto[]>();
  const ordenadas = [...datos.fotos].sort(
    (a, b) => (orden.get(a.item_id) ?? 1e9) - (orden.get(b.item_id) ?? 1e9) || a.tomada_en.localeCompare(b.tomada_en),
  );
  for (const f of ordenadas) porItem.set(f.item_id, [...(porItem.get(f.item_id) ?? []), f]);

  const grupos: Foto[][] = [];
  let actual: Foto[] = [];
  for (const delItem of porItem.values()) {
    for (let i = 0; i < delItem.length; i += max) {
      const trozo = delItem.slice(i, i + max);
      if (actual.length + trozo.length > max) {
        grupos.push(actual);
        actual = [];
      }
      actual.push(...trozo);
    }
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

/** Un ítem con más fotos que un grupo vuelve en dos avances: se juntan en uno. */
function unirPorItem(avances: Avance[]): Avance[] {
  const porItem = new Map<string, Avance>();
  for (const a of avances) {
    const previo = porItem.get(a.item_id);
    if (!previo) {
      porItem.set(a.item_id, { ...a, id: `av-${a.item_id}` });
      continue;
    }
    previo.texto += `\n\n${a.texto}`;
    previo.fotos.push(...a.fotos);
    previo.sector_ids = [...new Set([...previo.sector_ids, ...a.sector_ids])];
    previo.autores = [...new Set([...previo.autores, ...a.autores])];
    previo.fuentes.foto_ids.push(...a.fuentes.foto_ids);
    previo.fuentes.anotacion_ids.push(...a.fuentes.anotacion_ids);
  }
  return [...porItem.values()];
}

export function calcularItemsSinRegistro(datos: DatosDelDia): string[] {
  const conRegistro = new Set(datos.fotos.map((f) => f.item_id));
  return datos.items.filter((i) => !i.es_titulo && i.previsto_en_fecha && !conRegistro.has(i.id)).map((i) => i.id);
}
