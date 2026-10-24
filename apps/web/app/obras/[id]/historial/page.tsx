"use client";
// Historial de obra: las fotos de varios días juntas, filtradas por ítem, persona y fechas.
// Solo lectura: para corregir una foto se abre su día en "Día de obra".
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, Camera, History, MessageSquare, X } from "lucide-react";
import { LIMITE_HISTORIAL, type Anotacion, type Foto, type Item } from "@registro-obra/contrato";
import { nombreItem, useEquipo, useHistorial, useItems, useObra, useSectores, useUrls } from "@/lib/datos";
import { fechaLarga, fechaNumerica, hora, hoy, sumarDias } from "@/lib/formato";
import { Encabezado, Numero, Vacio } from "@/components/ui";
import { VisorFotos } from "@/components/visor-fotos";

type FotoDelHistorial = Foto & { fecha: string };

const RANGOS = [
  { dias: 1, texto: "Hoy" },
  { dias: 3, texto: "Últimos 3 días" },
  { dias: 7, texto: "Últimos 7 días" },
  { dias: 30, texto: "Últimos 30 días" },
  { dias: 90, texto: "Últimos 3 meses" },
];

export default function HistorialDeObra() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  // Los filtros viven en la URL: se pueden compartir o guardar como favorito.
  const hasta = params.get("hasta") ?? hoy();
  const desde = params.get("desde") ?? sumarDias(hasta, -6);
  const filtroItem = params.get("item") ?? "";
  const filtroPersona = params.get("persona") ?? "";
  const poner = (cambios: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`/obras/${id}/historial?${q}`, { scroll: false });
  };

  const { obra } = useObra(id);
  const { items } = useItems(id);
  const { sectores } = useSectores(id);
  const { equipo, nombre } = useEquipo(id);
  const { historial, cargando, error } = useHistorial(id, { desde, hasta, item: filtroItem, persona: filtroPersona });
  const fotos = useMemo(() => (historial?.fotos ?? []) as FotoDelHistorial[], [historial]);
  const miniaturas = useUrls(fotos.map((f) => f.miniatura_path));
  const [visor, setVisor] = useState<number | null>(null);
  // Las fotos grandes se piden recién al abrir el visor.
  const grandes = useUrls(visor === null ? [] : fotos.map((f) => f.archivo_path));

  const dias = useMemo(() => {
    const m = new Map<string, FotoDelHistorial[]>();
    fotos.forEach((f) => m.set(f.fecha, [...(m.get(f.fecha) ?? []), f]));
    return [...m.entries()].map(([fecha, deDia]) => ({ fecha, fotos: deDia }));
  }, [fotos]);
  const marcasDe = (fotoId: string) => (historial?.anotaciones ?? []).filter((a) => a.foto_id === fotoId);
  const itemDe = (itemId: string) => items.find((i) => i.id === itemId);
  const itemsDelResultado = useMemo(() => {
    const cuenta = new Map<string, number>();
    fotos.forEach((f) => cuenta.set(f.item_id, (cuenta.get(f.item_id) ?? 0) + 1));
    return items.filter((i) => cuenta.has(i.id)).map((i) => ({ item: i, n: cuenta.get(i.id)! }));
  }, [fotos, items]);
  const rangoActivo = hasta === hoy() ? RANGOS.find((r) => sumarDias(hasta, -(r.dias - 1)) === desde)?.dias : undefined;
  const elegido = items.find((i) => i.id === filtroItem);
  const hayFiltro = !!(filtroItem || filtroPersona);
  if (!obra) return null;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Historial de obra" />
      <p className="-mt-3 max-w-2xl text-tenue">
        Todas las fotos y comentarios de campo de varios días juntos. Elegí un ítem y un período para seguir cómo avanzó.
      </p>

      <section className="tarjeta flex flex-col gap-4 p-5" role="search" aria-label="Filtrar el historial">
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-[2_1_320px] flex-col">
            <span className="etiqueta">Ítem</span>
            <ElegirItem items={items} valor={filtroItem} alElegir={(v) => poner({ item: v })} />
          </div>
          <label className="flex min-w-0 flex-[1_1_200px] flex-col">
            <span className="etiqueta">Persona</span>
            <select className="campo" value={filtroPersona} onChange={(e) => poner({ persona: e.target.value })}>
              <option value="">Todas las personas</option>
              {[...equipo]
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col">
            <span className="etiqueta">Desde</span>
            <input type="date" className="campo w-auto" value={desde} max={hasta} onChange={(e) => e.target.value && poner({ desde: e.target.value })} />
          </label>
          <label className="flex flex-col">
            <span className="etiqueta">Hasta</span>
            <input type="date" className="campo w-auto" value={hasta} min={desde} max={hoy()} onChange={(e) => e.target.value && poner({ hasta: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Períodos">
            {RANGOS.map((r) => (
              <button
                key={r.dias}
                className="chip"
                aria-pressed={rangoActivo === r.dias}
                onClick={() => poner({ desde: sumarDias(hoy(), -(r.dias - 1)), hasta: hoy() })}
              >
                {r.texto}
              </button>
            ))}
          </div>
        </div>
        {hayFiltro && (
          <button className="chip w-fit gap-1" onClick={() => poner({ item: "", persona: "" })}>
            <X size={14} /> Quitar ítem y persona
          </button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero titulo="Fotos" valor={historial ? fotos.length : "—"} />
        <Numero titulo="Días con fotos" valor={historial ? dias.length : "—"} />
        <Numero titulo="Ítems" valor={historial ? itemsDelResultado.length : "—"} />
        <Numero titulo="Período" valor={<span className="text-lg">{fechaNumerica(desde)} – {fechaNumerica(hasta)}</span>} />
      </div>

      {historial?.truncado && (
        <p className="rounded-[10px] bg-acento-suave px-4 py-3 text-sm">
          Hay más de {LIMITE_HISTORIAL} fotos con estos filtros; se muestran las más nuevas. Acortá el período o elegí un ítem para ver el resto.
        </p>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          {error ? (
            <Vacio icono={<History />} titulo="No se pudo cargar el historial" texto={error instanceof Error ? error.message : "Probá de nuevo en un momento."} />
          ) : cargando && !historial ? (
            <p className="text-tenue">Cargando…</p>
          ) : dias.length === 0 ? (
            <Vacio
              icono={<Camera />}
              titulo="Ninguna foto en este período"
              texto={elegido ? `No hay fotos de ${nombreItem(elegido)} entre esas fechas. Probá con un período más largo.` : "Probá con un período más largo."}
            />
          ) : (
            dias.map((d) => {
              const registro = historial?.registros.find((r) => r.fecha === d.fecha);
              const personal = registro?.personal.reduce((t, p) => t + p.cantidad, 0) ?? 0;
              return (
                <div key={d.fecha} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="titulo text-xl font-bold first-letter:uppercase">{fechaLarga(d.fecha)}</h2>
                    <span className="text-sm text-tenue">
                      {fechaNumerica(d.fecha)} · {d.fotos.length} {d.fotos.length === 1 ? "foto" : "fotos"}
                      {registro?.clima && ` · ${registro.clima}`}
                      {registro && personal > 0 && ` · ${personal} personas en obra`}
                    </span>
                    <Link
                      href={`/obras/${id}?fecha=${d.fecha}${filtroItem && elegido && !elegido.es_titulo ? `&item=${filtroItem}` : ""}`}
                      className="ml-auto flex items-center gap-1 text-sm font-semibold text-plano"
                    >
                      <CalendarDays size={15} /> Abrir el día
                    </Link>
                  </div>
                  {registro?.observaciones && <p className="text-sm text-tinta-suave">{registro.observaciones}</p>}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {d.fotos.map((f) => (
                      <TarjetaFoto
                        key={f.id}
                        foto={f}
                        src={miniaturas[f.miniatura_path]}
                        autor={nombre(f.autor_id)}
                        item={elegido && !elegido.es_titulo ? undefined : itemDe(f.item_id)}
                        sector={sectores.find((s) => s.id === f.sector_id)?.nombre}
                        marcas={marcasDe(f.id)}
                        alAbrir={() => setVisor(fotos.findIndex((x) => x.id === f.id))}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {itemsDelResultado.length > 0 && (
          <aside className="tarjeta flex min-w-0 flex-[1_1_280px] flex-col gap-3 p-5">
            <h2 className="titulo text-lg font-bold">Ítems en el período</h2>
            {itemsDelResultado.map(({ item: i, n }) => (
              <button
                key={i.id}
                className={`-mx-2 flex justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-fondo ${filtroItem === i.id ? "bg-acento-suave" : ""}`}
                aria-pressed={filtroItem === i.id}
                title={filtroItem === i.id ? "Ver todos los ítems" : "Ver solo este ítem"}
                onClick={() => poner({ item: filtroItem === i.id ? "" : i.id })}
              >
                <span className="font-semibold">{nombreItem(i)}</span>
                <span className="whitespace-nowrap tabular-nums text-tenue">{n} fotos</span>
              </button>
            ))}
          </aside>
        )}
      </div>

      {visor !== null && (
        <VisorFotos
          inicial={visor}
          cerrar={() => setVisor(null)}
          fotos={fotos.map((f) => {
            const it = itemDe(f.item_id);
            const sector = sectores.find((s) => s.id === f.sector_id)?.nombre;
            return {
              foto: f,
              src: grandes[f.archivo_path] ?? miniaturas[f.miniatura_path],
              anotaciones: marcasDe(f.id),
              autor: nombre(f.autor_id),
              detalle: [fechaNumerica(f.fecha), it && nombreItem(it), sector].filter(Boolean).join(" · "),
            };
          })}
        />
      )}
    </div>
  );
}

/** Buscador de ítems por número o descripción. Un título trae también sus subítems. */
function ElegirItem({ items, valor, alElegir }: { items: Item[]; valor: string; alElegir: (id: string) => void }) {
  const etiqueta = (i: Item) => `${nombreItem(i)}${i.es_titulo ? " (con sus subítems)" : ""}`;
  const actual = items.find((i) => i.id === valor);
  const [texto, setTexto] = useState<string>();
  const mostrado = texto ?? (actual ? etiqueta(actual) : "");
  return (
    <div className="flex gap-2">
      <input
        className="campo min-w-0 flex-1"
        list="historial-items"
        placeholder="Todos los ítems · escribí el número o el nombre"
        value={mostrado}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          const elegido = items.find((i) => etiqueta(i) === v);
          if (elegido) {
            alElegir(elegido.id);
            setTexto(undefined);
          } else if (!v) alElegir("");
        }}
        onBlur={() => setTexto(undefined)}
        aria-label="Buscar ítem"
      />
      {valor && (
        <button className="boton-secundario h-10 w-10 shrink-0 px-0" aria-label="Todos los ítems" title="Todos los ítems" onClick={() => alElegir("")}>
          <X size={16} />
        </button>
      )}
      <datalist id="historial-items">
        {items.map((i) => (
          <option key={i.id} value={etiqueta(i)} />
        ))}
      </datalist>
    </div>
  );
}

function TarjetaFoto({
  foto,
  src,
  autor,
  item,
  sector,
  marcas,
  alAbrir,
}: {
  foto: Foto;
  src?: string;
  autor: string;
  item?: Item;
  sector?: string;
  marcas: Anotacion[];
  alAbrir: () => void;
}) {
  const notas = marcas.filter((a) => a.comentario);
  return (
    <article className="tarjeta flex flex-col overflow-hidden">
      <button className="relative aspect-[4/3] w-full bg-[#0b1220]" onClick={alAbrir} aria-label={`Ver foto de ${autor} a las ${hora(foto.tomada_en)}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" loading="lazy" className="size-full object-cover" />}
        {marcas.length > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-tinta/80 px-2 py-0.5 text-xs font-semibold text-white">
            {marcas.length} {marcas.length === 1 ? "marca" : "marcas"}
          </span>
        )}
      </button>
      <div className="flex flex-col gap-1.5 px-3.5 py-3 text-sm">
        <span>
          <span className="font-semibold">{autor}</span> · {hora(foto.tomada_en)}
        </span>
        {item && <span className="text-[13px] font-semibold text-plano">{nombreItem(item)}</span>}
        {sector && <span className="text-[13px] text-tenue">{sector}</span>}
        {foto.comentario && <p className="line-clamp-3 leading-snug text-tinta-suave">{foto.comentario}</p>}
        {notas.length > 0 && (
          <p className="flex gap-1.5 leading-snug text-tenue">
            <MessageSquare size={14} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{notas.map((a) => `${a.numero}. ${a.comentario}`).join(" · ")}</span>
          </p>
        )}
      </div>
    </article>
  );
}
