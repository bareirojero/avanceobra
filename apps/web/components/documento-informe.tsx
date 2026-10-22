"use client";
// El informe tal como sale en el PDF (formato del Word modelo). En modo edición,
// el resumen, los textos, los epígrafes y las listas se corrigen en el lugar.
import type { Anotacion, ContenidoInforme, Foto, Item, Obra, Sector } from "@registro-obra/contrato";
import { fechaNumerica, hora } from "@/lib/formato";
import { FotoAnotada } from "./foto-anotada";

export type Seleccion = { tipo: "resumen" } | { tipo: "avance"; id: string } | null;

export interface DatosDocumento {
  obra: Obra;
  numero: string;
  fecha: string;
  contenido: ContenidoInforme;
  fotos: Foto[];
  anotaciones: Anotacion[];
  items: Item[];
  sectores: Sector[];
  nombre: (usuarioId: string) => string;
  /** URLs firmadas por archivo_path. */
  urls: Record<string, string>;
}

const TIPO_INCIDENTE = { accidente: "Accidente", demora: "Demora", faltante: "Faltante", visita: "Visita", otro: "Otro" } as const;

function Texto({
  valor,
  editable,
  activo,
  alCambiar,
  alEnfocar,
  vacio,
  className = "",
}: {
  valor: string;
  editable?: boolean;
  activo?: boolean;
  alCambiar?: (v: string) => void;
  alEnfocar?: () => void;
  vacio?: string;
  className?: string;
}) {
  if (!editable) return valor.trim() ? <p className={`m-0 whitespace-pre-line ${className}`}>{valor}</p> : null;
  return (
    <textarea
      value={valor}
      placeholder={vacio}
      onChange={(e) => alCambiar?.(e.target.value)}
      onFocus={alEnfocar}
      rows={2}
      className={`-mx-2 block w-[calc(100%+16px)] resize-none rounded-md px-2 py-1.5 outline-none [field-sizing:content] placeholder:italic placeholder:text-tenue hover:bg-black/[.03] ${
        activo ? "bg-white outline-2 outline-acento hover:bg-white" : ""
      } ${className}`}
    />
  );
}

export function DocumentoInforme({
  datos,
  editable,
  seleccion,
  seleccionar,
  cambiar,
}: {
  datos: DatosDocumento;
  editable?: boolean;
  seleccion?: Seleccion;
  seleccionar?: (s: Seleccion) => void;
  cambiar?: (c: ContenidoInforme) => void;
}) {
  const { obra, numero, fecha, contenido: c, fotos, anotaciones, items, sectores, nombre, urls } = datos;
  const item = (id: string) => items.find((i) => i.id === id);
  const rubro = (i?: Item) => (i?.padre_id ? item(i.padre_id)?.descripcion : undefined);
  const editarAvance = (id: string, cambio: Partial<ContenidoInforme["avances"][number]>) =>
    cambiar?.({ ...c, avances: c.avances.map((a) => (a.id === id ? { ...a, ...cambio } : a)) });

  const datosDia = [
    c.clima ? ["Clima", c.clima.descripcion + (c.clima.hubo_lluvia ? " · hubo lluvia" : "")] : null,
    c.personal.length
      ? ["Personal en obra", c.personal.map((p) => `${p.cantidad} ${p.oficio.toLowerCase()}${p.empresa ? ` (${p.empresa})` : ""}`).join(" · ")]
      : null,
    ["Informaron", c.autores.map(nombre).join(" · ") || "Sin registros"],
  ].filter(Boolean) as [string, string][];

  return (
    <article className="flex flex-col gap-4 bg-white px-6 py-10 font-[Arial,Helvetica,sans-serif] text-[14px] leading-[1.45] text-tinta sm:px-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-3">
        <div>
          <div className="text-[11px] font-bold tracking-wide">
            TECNOEDIL <span className="font-normal text-tenue">· INFORME DIARIO DE OBRA</span>
          </div>
          <h1 className="mt-1 text-[24px] font-bold leading-tight">
            Obra: {obra.codigo ? `${obra.codigo} – ` : ""}
            {obra.nombre.toUpperCase()}
          </h1>
        </div>
        <div className="flex items-center gap-3 border-2 border-tinta py-1.5 pl-1.5 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/isotipo-color.png" alt="" className="size-12" />
          <div className="text-center">
            <div className="text-[11px]">INFORME DIARIO</div>
            <div className="text-[17px] font-bold">{numero}</div>
            <div className="text-[12px]">{fechaNumerica(fecha)}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap bg-fondo">
        {datosDia.map(([k, v]) => (
          <div key={k} className="px-3.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-tenue">{k}</div>
            <div className="text-[12.5px] font-bold">{v}</div>
          </div>
        ))}
      </div>

      {editable ? (
        <div className={`bg-acento-suave px-3.5 py-2.5 ${seleccion?.tipo === "resumen" ? "ring-2 ring-acento" : ""}`}>
          <b>Resumen del día.</b>
          <Texto
            valor={c.resumen}
            editable
            vacio="Escribí acá el resumen del día (dos o tres frases)."
            alEnfocar={() => seleccionar?.({ tipo: "resumen" })}
            alCambiar={(v) => cambiar?.({ ...c, resumen: v })}
          />
        </div>
      ) : (
        c.resumen.trim() && (
          <div className="bg-acento-suave px-3.5 py-2.5">
            <b>Resumen del día.</b> {c.resumen}
          </div>
        )
      )}

      {c.avances.map((a) => {
        const it = item(a.item_id);
        const activo = seleccion?.tipo === "avance" && seleccion.id === a.id;
        const sub = [rubro(it), ...a.sector_ids.map((s) => sectores.find((x) => x.id === s)?.nombre)].filter(Boolean).join(" · ");
        return (
          <section key={a.id} id={a.id} className="mt-2 flex scroll-mt-28 flex-col gap-1.5" onClick={() => seleccionar?.({ tipo: "avance", id: a.id })}>
            <h2 className="flex items-baseline gap-2 border-b border-borde pb-1 text-[18px] font-bold">
              {it?.numero && <span className="shrink-0 bg-acento px-1.5 text-[14px]">{it.numero}</span>}
              {a.titulo}
            </h2>
            <div className="flex justify-between gap-3 text-[11px] text-tenue">
              <span>{sub}</span>
              {it && <span className="shrink-0 tabular-nums">{it.codigo}</span>}
            </div>
            <Texto
              valor={a.texto}
              editable={editable}
              activo={activo}
              vacio="Contá en palabras qué se hizo en este ítem (opcional)."
              alEnfocar={() => seleccionar?.({ tipo: "avance", id: a.id })}
              alCambiar={(v) => editarAvance(a.id, { texto: v })}
            />
            <div className="mt-1 grid gap-3.5 sm:grid-cols-2">
              {a.fotos.map((fi, n) => {
                const foto = fotos.find((f) => f.id === fi.foto_id);
                if (!foto) return null;
                const marcas = anotaciones.filter((x) => x.foto_id === foto.id && fi.anotaciones.includes(x.numero));
                return (
                  <figure key={fi.foto_id} className="m-0 flex flex-col gap-1">
                    <FotoAnotada foto={foto} src={urls[foto.archivo_path]} anotaciones={marcas} className="aspect-[4/3]" />
                    {editable ? (
                      <textarea
                        rows={1}
                        placeholder="Epígrafe de la foto"
                        className="-mx-1.5 resize-none rounded px-1.5 py-0.5 text-[12px] font-bold outline-none [field-sizing:content] placeholder:font-normal placeholder:italic hover:bg-black/[.03] focus:bg-acento-suave"
                        value={fi.epigrafe}
                        aria-label="Epígrafe"
                        onFocus={() => seleccionar?.({ tipo: "avance", id: a.id })}
                        onChange={(e) => editarAvance(a.id, { fotos: a.fotos.map((x, k) => (k === n ? { ...x, epigrafe: e.target.value } : x)) })}
                      />
                    ) : (
                      fi.epigrafe.trim() && <figcaption className="text-[12px] font-bold">{fi.epigrafe}</figcaption>
                    )}
                    {marcas.some((m) => m.comentario) && (
                      <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12px] leading-snug">
                        {marcas
                          .filter((m) => m.comentario)
                          .map((m) => (
                            <li key={m.id} className="flex items-baseline gap-1.5">
                              <span className="shrink-0 bg-acento px-1 text-[11px] font-bold">{m.numero}</span>
                              {m.comentario}
                            </li>
                          ))}
                      </ol>
                    )}
                    <span className="text-[11px] text-tenue">
                      {nombre(foto.autor_id)} · {hora(foto.tomada_en)}
                    </span>
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}

      {c.incidentes.length > 0 && (
        <section className="mt-2">
          <h3 className="mb-1.5 border-b border-borde pb-1 text-[16px] font-bold">Incidentes y novedades</h3>
          <ul className="m-0 list-none p-0">
            {c.incidentes.map((i, n) => (
              <li key={n}>
                • <b>{TIPO_INCIDENTE[i.tipo]}:</b> {i.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(c.pendientes.length > 0 || editable) && (
        <section className="mt-2">
          <h3 className="mb-1.5 border-b border-borde pb-1 text-[16px] font-bold">Pendientes para mañana</h3>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {c.pendientes.map((p, n) => (
              <li key={n} className="flex items-baseline gap-2">
                <span className="text-tenue">☐</span>
                {editable ? (
                  <input
                    className="w-full rounded px-1 outline-none hover:bg-black/[.03] focus:bg-acento-suave"
                    value={p}
                    aria-label={`Pendiente ${n + 1}`}
                    onChange={(e) => cambiar?.({ ...c, pendientes: c.pendientes.map((x, k) => (k === n ? e.target.value : x)) })}
                    onBlur={() => !p.trim() && cambiar?.({ ...c, pendientes: c.pendientes.filter((_, k) => k !== n) })}
                  />
                ) : (
                  p
                )}
              </li>
            ))}
            {editable && (
              <li>
                <button type="button" className="text-[13px] font-semibold text-plano" onClick={() => cambiar?.({ ...c, pendientes: [...c.pendientes, ""] })}>
                  + Agregar pendiente
                </button>
              </li>
            )}
          </ul>
        </section>
      )}

      {c.items_sin_registro.length > 0 && (
        <section className="mt-2">
          <h3 className="mb-1.5 border-b border-borde pb-1 text-[16px] font-bold">Ítems previstos sin registro hoy</h3>
          <p className="m-0 text-tenue">
            {c.items_sin_registro
              .map((id) => {
                const i = item(id);
                return i ? `${i.numero ? `${i.numero} ` : ""}${i.descripcion}` : id;
              })
              .join(" · ")}
          </p>
        </section>
      )}

      {(c.observaciones || editable) && (
        <section className="mt-2">
          <h3 className="mb-1.5 border-b border-borde pb-1 text-[16px] font-bold">Observaciones</h3>
          <Texto
            valor={c.observaciones ?? ""}
            editable={editable}
            vacio="Observaciones generales (opcional)."
            alCambiar={(v) => cambiar?.({ ...c, observaciones: v || null })}
          />
        </section>
      )}
    </article>
  );
}
