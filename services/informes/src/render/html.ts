import type { ContenidoInforme } from "../tipos.ts";
import type { Referencias } from "./referencias.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const parrafos = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join("");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TIPO_INCIDENTE: Record<string, string> = {
  accidente: "Accidente",
  demora: "Demora",
  faltante: "Faltante",
  visita: "Visita",
  otro: "Otro",
};

/**
 * HTML imprimible A4 del informe, con el formato que definió Jerónimo (Word
 * editado del 21/10). Lo usa el exportador PDF y sirve de vista previa en el
 * panel. Las alertas no se imprimen: son para el editor.
 */
export function informeHtml(c: ContenidoInforme, ref: Referencias): string {
  const m = ref.marca;
  const autores = c.autores.map((id) => ref.usuario(id)).filter(Boolean) as string[];

  const datos = [
    c.clima ? ["Clima", c.clima.descripcion + (c.clima.hubo_lluvia ? " · hubo lluvia" : "")] : null,
    c.personal.length
      ? ["Personal en obra", c.personal.map((p) => `${p.cantidad} ${p.oficio.toLowerCase()}${p.empresa ? ` (${p.empresa})` : ""}`).join(" · ")]
      : null,
    ["Informaron", autores.join(" · ") || "Sin registros"],
  ].filter(Boolean) as [string, string][];

  const avances = c.avances
    .map((a) => {
      const item = ref.item(a.item_id);
      const sectores = a.sector_ids.map((s) => ref.sector(s)).filter(Boolean) as string[];
      const fotos = a.fotos
        .map((f) => {
          const leyenda = f.anotaciones
            .map((n) => {
              const an = ref.anotacion(f.foto_id, n);
              return an?.comentario ? `<li><span class="num">${n}</span>${esc(an.comentario)}</li>` : "";
            })
            .join("");
          const meta = ref.foto(f.foto_id);
          return `<figure>
            <img src="${ref.imagen(f.foto_id)}" alt="">
            <figcaption>
              <div class="epi">${esc(f.epigrafe)}</div>
              ${leyenda ? `<ol class="leyenda">${leyenda}</ol>` : ""}
              ${meta ? `<div class="meta">${esc(meta.autor)} · ${esc(meta.hora)}</div>` : ""}
            </figcaption>
          </figure>`;
        })
        .join("");
      const sub = [item?.rubro, ...sectores].filter(Boolean).join(" · ");
      return `<section class="bloque">
        <div class="cabeza">
          <h2>${item?.numero ? `<span class="codigo">${esc(item.numero)}</span>` : ""}${esc(a.titulo)}</h2>
          <div class="sub">${esc(sub)}${item ? `<span class="pep">${esc(item.codigo)}</span>` : ""}</div>
          <div class="texto">${parrafos(a.texto)}</div>
        </div>
        ${fotos ? `<div class="fotos">${fotos}</div>` : ""}
      </section>`;
    })
    .join("");

  const incidentes = c.incidentes.length
    ? `<section class="lista"><h3>Incidentes y novedades</h3><ul class="vinetas">${c.incidentes
        .map((i) => `<li><b>${TIPO_INCIDENTE[i.tipo]}:</b> ${esc(i.texto)}</li>`)
        .join("")}</ul></section>`
    : "";
  const pendientes = c.pendientes.length
    ? `<section class="lista"><h3>Pendientes para mañana</h3><ul class="check">${c.pendientes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>`
    : "";
  const sinRegistro = c.items_sin_registro.length
    ? `<section class="lista"><h3>Ítems previstos sin registro hoy</h3><p class="tenue">${c.items_sin_registro
        .map((id) => {
          const i = ref.item(id);
          return esc(i ? `${i.numero ? `${i.numero} ` : ""}${i.descripcion}` : id);
        })
        .join(" · ")}</p></section>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(c.titulo)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  :root { --tinta:${m.tinta}; --tenue:${m.tenue}; --linea:${m.linea}; --fondo:${m.fondo}; --acento:${m.acento}; --acento-suave:${m.acentoSuave}; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: var(--tinta); font-size: 10pt; line-height: 1.4; margin: 0; }
  .encabezado { display:flex; justify-content:space-between; align-items:flex-end; gap: 16px; border-bottom: 1.5pt solid var(--tinta); padding-bottom: 8px; margin-bottom: 10px; }
  .encabezado .empresa { font-size: 7.5pt; font-weight: 700; letter-spacing: .03em; }
  .encabezado .empresa span { color: var(--tenue); font-weight: 400; }
  .encabezado h1 { font-size: 18pt; margin: 4px 0 0; font-weight: 700; }
  .caja { display:flex; align-items:center; gap: 10px; border: 1.5pt solid var(--tinta); padding: 6px 10px 6px 6px; flex: none; }
  .caja img { width: 44px; height: 44px; display:block; }
  .caja .t { font-size: 8pt; text-align:center; }
  .caja .n { font-size: 12pt; font-weight: 700; text-align:center; }
  .caja .f { font-size: 8.5pt; text-align:center; }
  .datos { display:grid; grid-template-columns: repeat(${datos.length}, auto); gap: 0; background: var(--fondo); margin-bottom: 10px; }
  .dato { padding: 6px 10px; }
  .dato .k { font-size: 6.5pt; text-transform: uppercase; letter-spacing:.05em; color: var(--tenue); }
  .dato .v { font-weight: 700; font-size: 8.5pt; margin-top: 1px; }
  .resumen { background: var(--acento-suave); padding: 8px 10px; margin-bottom: 16px; font-size: 10pt; }
  .resumen b { font-weight: 700; }
  .bloque { margin-bottom: 16px; }
  .cabeza { break-inside: avoid; }
  h2 { font-size: 12.5pt; margin: 0; font-weight: 700; display:flex; align-items: baseline; gap: 6px; border-bottom: 1px solid var(--linea); padding-bottom: 3px; }
  .codigo { background: var(--acento); color: var(--tinta); font-size: 10pt; padding: 0 5px; flex: none; }
  .sub { font-size: 7.5pt; color: var(--tenue); margin: 3px 0 6px; display:flex; justify-content: space-between; gap: 12px; }
  .pep { font-variant-numeric: tabular-nums; flex: none; }
  .texto p { margin: 0 0 5px; }
  .fotos { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  figure { margin: 0; break-inside: avoid; }
  figure img { max-width: 100%; max-height: 80mm; display:block; }
  figcaption { padding-top: 4px; font-size: 7.5pt; }
  .epi { font-weight: 700; }
  .leyenda { list-style: none; padding: 0; margin: 2px 0 0; }
  .leyenda li { display:flex; gap: 4px; align-items: baseline; }
  .num { flex: none; background: var(--acento); font-weight: 700; padding: 0 3px; font-size: 7pt; }
  .meta { color: var(--tenue); font-size: 6.5pt; margin-top: 2px; }
  .lista { margin-bottom: 12px; break-inside: avoid; }
  .lista h3 { font-size: 11pt; margin: 0 0 5px; border-bottom: 1px solid var(--linea); padding-bottom: 3px; }
  .lista ul { margin: 0; padding: 0; list-style: none; }
  .lista li { padding: 1px 0; }
  .vinetas li::before { content: "•"; margin: 0 8px 0 4px; }
  .check li::before { content: "☐"; margin-right: 6px; color: var(--tenue); }
  .tenue { color: var(--tenue); margin: 0; }
</style></head>
<body>
  <div class="encabezado">
    <div>
      <div class="empresa">${esc(m.empresa)} <span>· INFORME DIARIO DE OBRA</span></div>
      <h1>Obra: ${esc(ref.obra.codigo)} – ${esc(ref.obra.nombre)}</h1>
    </div>
    <div class="caja">
      <img src="${m.logo}" alt="Avance de Obra">
      <div><div class="t">INFORME DIARIO</div><div class="n">${esc(ref.numero)}</div><div class="f">${esc(ref.fechaCorta)}</div></div>
    </div>
  </div>

  <div class="datos">${datos.map(([k, v]) => `<div class="dato"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>

  <div class="resumen"><b>Resumen del día.</b> ${esc(c.resumen)}</div>

  ${avances}
  ${incidentes}
  ${pendientes}
  ${sinRegistro}
  ${c.observaciones ? `<section class="lista"><h3>Observaciones</h3>${parrafos(c.observaciones)}</section>` : ""}
</body></html>`;
}

export const pieDePagina = (ref: Referencias) =>
  `<div style="width:100%;font:6.5pt Arial,sans-serif;color:#4A4E55;padding:0 14mm;display:flex;justify-content:space-between">
    <span>${esc(ref.pie)}</span><span>${esc(capital(ref.fechaLarga))} · Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
