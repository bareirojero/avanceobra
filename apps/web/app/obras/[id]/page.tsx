"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, FileText, ImagePlus, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { Anotacion, CambioFoto, Foto, Item } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "@/lib/api";
import { nombreItem, useDia, useEquipo, useItems, useObra, useSectores, useUrls } from "@/lib/datos";
import { CARGOS, fechaLarga, hora, hoy, sumarDias } from "@/lib/formato";
import { Avatar, Encabezado, Numero, Vacio } from "@/components/ui";
import { SubirFotos } from "@/components/subir-fotos";
import { FotoAnotada, NumeroMarca } from "@/components/foto-anotada";
import { VisorFotos } from "@/components/visor-fotos";
import { BorrarFoto, CorregirFoto, cuando, HistorialFoto, type ContextoHistorial } from "@/components/corregir-foto";

type Agrupar = "item" | "persona" | "sector";

export default function DiaDeObra() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const fecha = params.get("fecha") ?? hoy();
  // Los filtros viven en la URL: se pueden compartir y se mantienen al cambiar de día.
  const filtroItem = params.get("item") ?? "";
  const filtroPersona = params.get("persona") ?? "";
  const poner = (cambios: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`/obras/${id}?${q}`, { scroll: false });
  };
  const irA = (f: string) => poner({ fecha: f });
  const filtrar = (item: string, persona: string) => poner({ item, persona });

  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const { equipo, nombre } = useEquipo(id);
  const { sectores } = useSectores(id);
  const { items } = useItems(id);
  const dia = useDia(id, fecha);
  const urls = useUrls([...dia.fotos.map((f) => f.archivo_path), ...dia.borradas.map((f) => f.miniatura_path)]);
  const [agrupar, setAgrupar] = useState<Agrupar>("item");
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<number | null>(null);
  const [editando, setEditando] = useState<Foto>();
  const [borrando, setBorrando] = useState<Foto>();
  const [verBorradas, setVerBorradas] = useState(false);

  const campo = equipo.filter((m) => m.rol === "campo");
  const autores = new Set(dia.fotos.map((f) => f.autor_id));
  const personal = dia.registro?.personal.reduce((t, p) => t + p.cantidad, 0) ?? 0;

  const visibles = useMemo(
    () => dia.fotos.filter((f) => (!filtroItem || f.item_id === filtroItem) && (!filtroPersona || f.autor_id === filtroPersona)),
    [dia.fotos, filtroItem, filtroPersona],
  );
  const hayFiltro = !!(filtroItem || filtroPersona);

  const grupos = useMemo(() => {
    const clave = (f: Foto) => (agrupar === "sector" ? f.sector_id : agrupar === "persona" ? f.autor_id : f.item_id) ?? "-";
    const titulo = (k: string) => {
      if (k === "-") return "Sin sector";
      if (agrupar === "sector") return sectores.find((s) => s.id === k)?.nombre ?? "Sector";
      if (agrupar === "persona") return nombre(k);
      const it = items.find((i) => i.id === k);
      return it ? nombreItem(it) : "Ítem";
    };
    const m = new Map<string, Foto[]>();
    visibles.forEach((f) => m.set(clave(f), [...(m.get(clave(f)) ?? []), f]));
    const orden = (k: string) => (agrupar === "item" ? (items.find((i) => i.id === k)?.orden ?? 1e9) : 0);
    return [...m.entries()].map(([k, fotos]) => ({ k, titulo: titulo(k), fotos })).sort((a, b) => orden(a.k) - orden(b.k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, agrupar, sectores, items, equipo]);

  // Las fotos en el mismo orden en que se ven, para pasar de una a otra en el visor.
  const enOrden = grupos.flatMap((g) => g.fotos);
  const itemsDelDia = items.filter((i) => autoresDe(dia.fotos, i.id).length > 0);
  const personasDelDia = [...autores].map((a) => ({ id: a, nombre: nombre(a) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ctx: ContextoHistorial = { nombre, items, sectores, marcas: dia.todasLasMarcas };
  const historialDe = (fotoId: string) => dia.historial.filter((h) => h.foto_id === fotoId);
  if (!obra) return null;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      {/* Cabecera de presentación: video en loop sin sonido (2,6 MB), con la primera imagen mientras carga. */}
      <video
        className="aspect-[1168/350] w-full rounded-xl bg-white object-cover print:hidden"
        src="/cabecera/dia-de-obra.mp4"
        poster="/cabecera/dia-de-obra.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <Encabezado miga={obra.nombre} titulo={fechaLarga(fecha)}>
        <button className="boton-secundario w-11 px-0" aria-label="Día anterior" onClick={() => irA(sumarDias(fecha, -1))}>
          <ChevronLeft size={18} />
        </button>
        <input type="date" className="campo h-11 w-auto" value={fecha} max={hoy()} onChange={(e) => e.target.value && irA(e.target.value)} aria-label="Elegir día" />
        <button className="boton-secundario w-11 px-0" aria-label="Día siguiente" disabled={fecha >= hoy()} onClick={() => irA(sumarDias(fecha, 1))}>
          <ChevronRight size={18} />
        </button>
        {editor && (
          <button className="boton-secundario" onClick={() => setSubiendo(true)}>
            <ImagePlus size={18} /> Subir fotos
          </button>
        )}
        <BotonInforme obraId={id} fecha={fecha} editor={editor} estado={dia.informe?.estado} hayFotos={dia.fotos.length > 0} alGenerar={() => dia.mutate()} />
      </Encabezado>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero titulo="Fotos" valor={dia.fotos.length} />
        <Numero titulo="Informaron" valor={editor && campo.length ? `${[...autores].filter((a) => campo.some((c) => c.id === a)).length} de ${campo.length}` : autores.size} />
        <Numero titulo="Ítems con fotos" valor={itemsDelDia.length} />
        <Numero titulo="Personal en obra" valor={dia.registro ? personal : "—"} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="titulo text-[22px] font-bold">Lo que llegó de campo</h2>
            <div className="flex gap-1.5" role="group" aria-label="Ordenar">
              {(["item", "persona", "sector"] as const).map((a) => (
                <button key={a} className="chip" aria-pressed={agrupar === a} onClick={() => setAgrupar(a)}>
                  {a === "item" ? "Por ítem" : a === "persona" ? "Por persona" : "Por sector"}
                </button>
              ))}
            </div>
          </div>

          {(dia.fotos.length > 0 || hayFiltro) && (
            <div className="flex flex-wrap items-center gap-2.5" role="search" aria-label="Filtrar fotos">
              <select
                className="campo h-9 w-auto min-w-0 max-w-full flex-[1_1_220px]"
                aria-label="Filtrar por ítem"
                value={filtroItem}
                onChange={(e) => filtrar(e.target.value, filtroPersona)}
              >
                <option value="">Todos los ítems</option>
                {itemsDelDia.map((i) => (
                  <option key={i.id} value={i.id}>
                    {nombreItem(i)}
                  </option>
                ))}
                {filtroItem && !itemsDelDia.some((i) => i.id === filtroItem) && (
                  <option value={filtroItem}>{nombreItemDe(items, filtroItem)} (sin fotos este día)</option>
                )}
              </select>
              <select
                className="campo h-9 w-auto min-w-0 max-w-full flex-[1_1_180px]"
                aria-label="Filtrar por persona"
                value={filtroPersona}
                onChange={(e) => filtrar(filtroItem, e.target.value)}
              >
                <option value="">Todas las personas</option>
                {personasDelDia.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                {filtroPersona && !autores.has(filtroPersona) && <option value={filtroPersona}>{nombre(filtroPersona)} (sin fotos este día)</option>}
              </select>
              {hayFiltro && (
                <>
                  <span className="text-sm text-tenue">
                    {visibles.length} de {dia.fotos.length} fotos
                  </span>
                  <button className="chip gap-1" onClick={() => filtrar("", "")}>
                    <X size={14} /> Quitar filtros
                  </button>
                </>
              )}
            </div>
          )}

          {dia.cargando ? (
            <p className="text-tenue">Cargando…</p>
          ) : grupos.length === 0 && hayFiltro && dia.fotos.length > 0 ? (
            <Vacio icono={<Camera />} titulo="Ninguna foto con estos filtros" texto="Probá con otro ítem u otra persona.">
              <button className="boton-secundario" onClick={() => filtrar("", "")}>
                Quitar filtros
              </button>
            </Vacio>
          ) : grupos.length === 0 ? (
            <Vacio icono={<Camera />} titulo="Nada cargado este día" texto="Cuando el equipo saque fotos desde la app, aparecen acá." />
          ) : (
            grupos.map((g) => {
              const quienes = [...new Set(g.fotos.map((f) => f.autor_id))];
              return (
                <div key={g.k} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="sobretitulo">{g.titulo}</span>
                    {agrupar !== "persona" && quienes.length > 1 && editor && (
                      <span className="text-sm text-tenue">Cargaron {quienes.map((q) => nombre(q).split(" ")[0]).join(" y ")}</span>
                    )}
                  </div>
                  {g.fotos.map((f) => (
                    <TarjetaFoto
                      key={f.id}
                      foto={f}
                      src={urls[f.archivo_path]}
                      autor={nombre(f.autor_id)}
                      anotaciones={dia.anotaciones.filter((a) => a.foto_id === f.id)}
                      item={agrupar !== "item" ? items.find((i) => i.id === f.item_id) : undefined}
                      sector={agrupar !== "sector" ? sectores.find((s) => s.id === f.sector_id)?.nombre : undefined}
                      alAbrir={() => setVisor(enOrden.findIndex((x) => x.id === f.id))}
                      historial={historialDe(f.id)}
                      ctx={ctx}
                      alEditar={editor ? () => setEditando(f) : undefined}
                      alBorrar={editor ? () => setBorrando(f) : undefined}
                    />
                  ))}
                </div>
              );
            })
          )}

          {editor && dia.borradas.length > 0 && (
            <section className="flex flex-col gap-3">
              <button className="w-fit text-sm font-semibold text-plano" aria-expanded={verBorradas} onClick={() => setVerBorradas(!verBorradas)}>
                {verBorradas ? "Ocultar" : "Ver"} fotos borradas ({dia.borradas.length})
              </button>
              {verBorradas &&
                dia.borradas.map((f) => (
                  <FotoBorrada
                    key={f.id}
                    foto={f}
                    src={urls[f.miniatura_path]}
                    autor={nombre(f.autor_id)}
                    item={items.find((i) => i.id === f.item_id)}
                    borrado={historialDe(f.id).filter((h) => h.accion === "borrar" && !h.anotacion_id).at(-1)}
                    historial={historialDe(f.id)}
                    ctx={ctx}
                    alRestaurar={() => dia.mutate()}
                  />
                ))}
            </section>
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="tarjeta flex flex-col gap-4 p-5">
            <h2 className="titulo text-lg font-bold">Ítems con fotos</h2>
            {itemsDelDia.length === 0 && <p className="text-sm text-tenue">Ningún ítem con fotos este día.</p>}
            {itemsDelDia.map((i) => (
              <button
                key={i.id}
                className={`-mx-2 flex justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-fondo ${filtroItem === i.id ? "bg-acento-suave" : ""}`}
                aria-pressed={filtroItem === i.id}
                title={filtroItem === i.id ? "Ver todos los ítems" : "Ver solo las fotos de este ítem"}
                onClick={() => filtrar(filtroItem === i.id ? "" : i.id, filtroPersona)}
              >
                <span className="font-semibold">{nombreItem(i)}</span>
                <span className="whitespace-nowrap tabular-nums text-tenue">{dia.fotos.filter((f) => f.item_id === i.id).length} fotos</span>
              </button>
            ))}
            {editor && (
              <Link href={`/obras/${id}/items`} className="text-sm font-semibold text-plano">
                Ver el itemizado
              </Link>
            )}
          </section>

          {editor && campo.length > 0 && (
            <section className="tarjeta flex flex-col gap-3 p-5">
              <h2 className="titulo text-lg font-bold">Equipo de campo</h2>
              {campo.map((m) => {
                const n = dia.fotos.filter((f) => f.autor_id === m.id).length;
                return (
                  <button
                    key={m.id}
                    disabled={!n}
                    className={`-mx-2 flex justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm enabled:hover:bg-fondo ${filtroPersona === m.id ? "bg-acento-suave" : ""}`}
                    aria-pressed={filtroPersona === m.id}
                    title={n ? (filtroPersona === m.id ? "Ver a todos" : "Ver solo las fotos de esta persona") : undefined}
                    onClick={() => filtrar(filtroItem, filtroPersona === m.id ? "" : m.id)}
                  >
                    <span>
                      <span className="font-semibold">{m.nombre}</span>
                      <span className="text-tenue"> · {m.cargo ? CARGOS[m.cargo] : "Campo"}</span>
                    </span>
                    <span className={`shrink-0 font-semibold ${n ? "text-ok-texto" : "text-tenue"}`}>{n ? `${n} fotos` : "Sin cargas"}</span>
                  </button>
                );
              })}
            </section>
          )}
        </aside>
      </div>
      {visor !== null && (
        <VisorFotos
          inicial={visor}
          cerrar={() => setVisor(null)}
          fotos={enOrden.map((f) => {
            const it = items.find((i) => i.id === f.item_id);
            const sector = sectores.find((s) => s.id === f.sector_id)?.nombre;
            return {
              foto: f,
              src: urls[f.archivo_path],
              anotaciones: dia.anotaciones.filter((a) => a.foto_id === f.id),
              autor: nombre(f.autor_id),
              detalle: [it && nombreItem(it), sector].filter(Boolean).join(" · "),
            };
          })}
        />
      )}
      {editor && <SubirFotos obraId={id} fecha={fecha} abierto={subiendo} cerrar={() => setSubiendo(false)} alSubir={() => dia.mutate()} />}
      {editando && (
        <CorregirFoto
          key={editando.id}
          foto={editando}
          anotaciones={dia.anotaciones.filter((a) => a.foto_id === editando.id)}
          items={items}
          sectores={sectores}
          cerrar={() => setEditando(undefined)}
          alGuardar={() => dia.mutate()}
        />
      )}
      {borrando && (
        <BorrarFoto
          key={borrando.id}
          foto={borrando}
          hayInforme={!!dia.informe && dia.informe.estado !== "error"}
          cerrar={() => setBorrando(undefined)}
          alBorrar={() => dia.mutate()}
        />
      )}
    </div>
  );
}

const autoresDe = (fotos: Foto[], itemId: string) => fotos.filter((f) => f.item_id === itemId).map((f) => f.autor_id);

function nombreItemDe(items: Item[], id: string) {
  const it = items.find((i) => i.id === id);
  return it ? nombreItem(it) : "Ítem";
}

function BotonInforme({
  obraId,
  fecha,
  editor,
  estado,
  hayFotos,
  alGenerar,
}: {
  obraId: string;
  fecha: string;
  editor: boolean;
  estado?: string;
  hayFotos: boolean;
  alGenerar: () => void;
}) {
  const router = useRouter();
  const [armando, setArmando] = useState(false);
  const enlace = `/obras/${obraId}/informes/${fecha}`;

  if (!editor) {
    return estado === "publicado" ? (
      <Link href={enlace} className="boton-principal">
        <FileText size={18} /> Ver informe del día
      </Link>
    ) : null;
  }
  if (estado && estado !== "error") {
    return (
      <Link href={enlace} className="boton-principal">
        <FileText size={18} /> {estado === "publicado" ? "Ver informe del día" : "Revisar informe del día"}
      </Link>
    );
  }
  return (
    <button
      className="boton-principal"
      disabled={!hayFotos || armando}
      title={hayFotos ? undefined : "Todavía no hay fotos de este día"}
      onClick={async () => {
        setArmando(true);
        try {
          // 409: ya existe el informe de ese día; se abre igual.
          await api
            .generarInforme({ obra_id: obraId, tipo: "diario", fecha_desde: fecha, forzar: estado === "error" })
            .catch((e) => {
              if (!(e instanceof ErrorDeApi && e.estado === 409)) throw e;
            });
          alGenerar();
          router.push(enlace);
        } catch (e) {
          alert(`No se pudo armar el informe: ${e instanceof Error ? e.message : "error desconocido"}`);
        } finally {
          setArmando(false);
        }
      }}
    >
      <FileText size={18} /> {armando ? "Armando…" : "Armar informe del día"}
    </button>
  );
}

function TarjetaFoto({
  foto,
  src,
  autor,
  anotaciones,
  item,
  sector,
  alAbrir,
  historial,
  ctx,
  alEditar,
  alBorrar,
}: {
  foto: Foto;
  src?: string;
  autor: string;
  anotaciones: Anotacion[];
  item?: Item;
  sector?: string;
  alAbrir: () => void;
  historial: CambioFoto[];
  ctx: ContextoHistorial;
  /** Solo el editor: corregir o borrar la foto. */
  alEditar?: () => void;
  alBorrar?: () => void;
}) {
  const [activa, setActiva] = useState<number>();
  return (
    <article className="tarjeta flex flex-wrap overflow-hidden">
      <div className="grid flex-[1_1_300px] place-items-center bg-[#0b1220]">
        <FotoAnotada foto={foto} src={src} anotaciones={anotaciones} activa={activa} alActivar={setActiva} alAbrir={alAbrir} maxAlto={440} />
      </div>
      <div className="flex flex-[1_1_280px] flex-col gap-3 px-5 py-4">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <Avatar nombre={autor} oscuro />
            <span className="text-sm">
              <span className="font-semibold">{autor}</span> · {hora(foto.tomada_en)}
              {foto.origen === "web" && <span className="text-tenue"> · desde la web</span>}
            </span>
            {item && <span className="ml-auto text-[13px] font-semibold text-plano">{nombreItem(item)}</span>}
          </div>
          {alEditar && alBorrar && (
            <span className="-my-1 -mr-2 flex shrink-0 gap-0.5 print:hidden">
              <button className="grid size-9 place-items-center rounded-lg text-tenue hover:bg-fondo hover:text-tinta" aria-label="Corregir foto" title="Corregir foto" onClick={alEditar}>
                <Pencil size={16} />
              </button>
              <button className="grid size-9 place-items-center rounded-lg text-tenue hover:bg-peligro-suave hover:text-peligro-texto" aria-label="Borrar foto" title="Borrar foto" onClick={alBorrar}>
                <Trash2 size={16} />
              </button>
            </span>
          )}
        </div>
        {sector && <span className="w-fit rounded-full bg-fondo px-2.5 py-0.5 text-[13px] font-semibold text-tinta-suave">{sector}</span>}
        <HistorialFoto foto={foto} historial={historial} ctx={ctx} />
        {foto.comentario && <p className="leading-relaxed">{foto.comentario}</p>}
        {anotaciones.map((a) => (
          <div
            key={a.id}
            onMouseEnter={() => setActiva(a.numero)}
            onMouseLeave={() => setActiva(undefined)}
            className={`-mx-2 flex gap-2.5 rounded-lg px-2 py-1 leading-snug ${activa === a.numero ? "bg-acento-suave" : ""}`}
          >
            <NumeroMarca n={a.numero} activa={activa === a.numero} />
            {a.comentario ?? <span className="text-tenue">Sin comentario</span>}
          </div>
        ))}
      </div>
    </article>
  );
}

function FotoBorrada({
  foto,
  src,
  autor,
  item,
  borrado,
  historial,
  ctx,
  alRestaurar,
}: {
  foto: Foto;
  src?: string;
  autor: string;
  item?: Item;
  borrado?: CambioFoto;
  historial: CambioFoto[];
  ctx: ContextoHistorial;
  alRestaurar: () => void;
}) {
  const [restaurando, setRestaurando] = useState(false);
  return (
    <article className="tarjeta flex flex-wrap items-start gap-4 p-4 opacity-90">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="size-24 rounded-lg object-cover grayscale" /> : <div className="size-24 rounded-lg bg-pista" />}
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm">
        <span>
          <span className="font-semibold">{autor}</span> · {hora(foto.tomada_en)}
          {item && <span className="text-tenue"> · {nombreItem(item)}</span>}
        </span>
        {foto.comentario && <p className="text-tinta-suave">{foto.comentario}</p>}
        {borrado && (
          <span className="text-peligro-texto">
            Borrada por {borrado.usuario_id ? ctx.nombre(borrado.usuario_id) : "Sistema"} · {cuando(borrado.creado_en)}
            {borrado.motivo && ` · ${borrado.motivo}`}
          </span>
        )}
        <HistorialFoto foto={foto} historial={historial} ctx={ctx} />
      </div>
      <button
        className="boton-secundario"
        disabled={restaurando}
        onClick={async () => {
          setRestaurando(true);
          try {
            await api.cambiarFoto(foto.id, { eliminada: false });
            alRestaurar();
          } catch (e) {
            alert(`No se pudo restaurar: ${e instanceof Error ? e.message : "error desconocido"}`);
          } finally {
            setRestaurando(false);
          }
        }}
      >
        <RotateCcw size={16} /> {restaurando ? "Restaurando…" : "Restaurar"}
      </button>
    </article>
  );
}
