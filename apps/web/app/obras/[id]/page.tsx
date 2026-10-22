"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, FileText, ImagePlus } from "lucide-react";
import type { Anotacion, Foto, Item } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "@/lib/api";
import { nombreItem, useDia, useEquipo, useItems, useObra, useSectores, useUrls } from "@/lib/datos";
import { CARGOS, fechaLarga, hora, hoy, sumarDias } from "@/lib/formato";
import { Avatar, Encabezado, Numero, Vacio } from "@/components/ui";
import { SubirFotos } from "@/components/subir-fotos";
import { FotoAnotada, NumeroMarca } from "@/components/foto-anotada";

type Agrupar = "item" | "persona" | "sector";

export default function DiaDeObra() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const fecha = params.get("fecha") ?? hoy();
  const irA = (f: string) => router.replace(`/obras/${id}?fecha=${f}`, { scroll: false });

  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const { equipo, nombre } = useEquipo(id);
  const { sectores } = useSectores(id);
  const { items } = useItems(id);
  const dia = useDia(id, fecha);
  const urls = useUrls(dia.fotos.map((f) => f.archivo_path));
  const [agrupar, setAgrupar] = useState<Agrupar>("item");
  const [subiendo, setSubiendo] = useState(false);

  const campo = equipo.filter((m) => m.rol === "campo");
  const autores = new Set(dia.fotos.map((f) => f.autor_id));
  const personal = dia.registro?.personal.reduce((t, p) => t + p.cantidad, 0) ?? 0;

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
    dia.fotos.forEach((f) => m.set(clave(f), [...(m.get(clave(f)) ?? []), f]));
    const orden = (k: string) => (agrupar === "item" ? (items.find((i) => i.id === k)?.orden ?? 1e9) : 0);
    return [...m.entries()].map(([k, fotos]) => ({ k, titulo: titulo(k), fotos })).sort((a, b) => orden(a.k) - orden(b.k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia.fotos, agrupar, sectores, items, equipo]);

  const itemsDelDia = items.filter((i) => autoresDe(dia.fotos, i.id).length > 0);
  if (!obra) return null;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
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
            <div className="flex gap-1.5" role="group" aria-label="Agrupar">
              {(["item", "persona", "sector"] as const).map((a) => (
                <button key={a} className="chip" aria-pressed={agrupar === a} onClick={() => setAgrupar(a)}>
                  {a === "item" ? "Por ítem" : a === "persona" ? "Por persona" : "Por sector"}
                </button>
              ))}
            </div>
          </div>

          {dia.cargando ? (
            <p className="text-tenue">Cargando…</p>
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
                    />
                  ))}
                </div>
              );
            })
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="tarjeta flex flex-col gap-4 p-5">
            <h2 className="titulo text-lg font-bold">Ítems con fotos</h2>
            {itemsDelDia.length === 0 && <p className="text-sm text-tenue">Ningún ítem con fotos este día.</p>}
            {itemsDelDia.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{nombreItem(i)}</span>
                <span className="whitespace-nowrap tabular-nums text-tenue">{dia.fotos.filter((f) => f.item_id === i.id).length} fotos</span>
              </div>
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
                  <div key={m.id} className="flex justify-between gap-2 text-sm">
                    <span>
                      <span className="font-semibold">{m.nombre}</span>
                      <span className="text-tenue"> · {m.cargo ? CARGOS[m.cargo] : "Campo"}</span>
                    </span>
                    <span className={`shrink-0 font-semibold ${n ? "text-ok-texto" : "text-tenue"}`}>{n ? `${n} fotos` : "Sin cargas"}</span>
                  </div>
                );
              })}
            </section>
          )}
        </aside>
      </div>
      {editor && <SubirFotos obraId={id} fecha={fecha} abierto={subiendo} cerrar={() => setSubiendo(false)} alSubir={() => dia.mutate()} />}
    </div>
  );
}

const autoresDe = (fotos: Foto[], itemId: string) => fotos.filter((f) => f.item_id === itemId).map((f) => f.autor_id);

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
}: {
  foto: Foto;
  src?: string;
  autor: string;
  anotaciones: Anotacion[];
  item?: Item;
  sector?: string;
}) {
  const [activa, setActiva] = useState<number>();
  return (
    <article className="tarjeta flex flex-wrap overflow-hidden">
      <FotoAnotada foto={foto} src={src} anotaciones={anotaciones} activa={activa} alActivar={setActiva} className="min-h-[240px] flex-[1_1_300px]" />
      <div className="flex flex-[1_1_280px] flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Avatar nombre={autor} oscuro />
          <span className="text-sm">
            <span className="font-semibold">{autor}</span> · {hora(foto.tomada_en)}
            {foto.origen === "web" && <span className="text-tenue"> · desde la web</span>}
          </span>
          {item && <span className="ml-auto text-[13px] font-semibold text-plano">{nombreItem(item)}</span>}
        </div>
        {sector && <span className="w-fit rounded-full bg-fondo px-2.5 py-0.5 text-[13px] font-semibold text-tinta-suave">{sector}</span>}
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
