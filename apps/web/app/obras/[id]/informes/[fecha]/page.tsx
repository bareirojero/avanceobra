"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileDown, FileText, Loader2, Lock, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { numeroInforme, type Alerta, type ContenidoInforme, type PersonalEnObra, type RevisionInforme } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { useDia, useEquipo, useInforme, useItems, useObra, useRevisiones, useSectores, useUrls } from "@/lib/datos";
import { fechaNumerica, hora } from "@/lib/formato";
import { ChipAutomatico, ChipEstado, Vacio } from "@/components/ui";
import { DocumentoInforme, type Seleccion } from "@/components/documento-informe";
import { VisorFotos } from "@/components/visor-fotos";

const ALERTA: Record<Alerta["tipo"], { titulo: string; clase: string }> = {
  contradiccion: { titulo: "No coinciden.", clase: "bg-pendiente-suave text-[#6E3207]" },
  falta_info: { titulo: "Faltan datos.", clase: "bg-fondo text-tinta" },
  seguridad: { titulo: "Seguridad.", clase: "bg-peligro-suave text-peligro-texto" },
  calidad: { titulo: "Calidad.", clase: "bg-plano-suave text-plano-texto" },
};

type EstadoGuardado = "guardado" | "pendiente" | "guardando" | { error: string };

export default function InformeDelDia() {
  const { id, fecha } = useParams<{ id: string; fecha: string }>();
  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const dia = useDia(id, fecha);
  const { informe, mutate } = useInforme(dia.informe?.id);
  const { items } = useItems(id);
  const { sectores } = useSectores(id);
  const { nombre: nombreEquipo } = useEquipo(id);
  const { revisiones, mutate: mutateRevisiones } = useRevisiones(informe?.revision !== null ? informe?.id : undefined);
  // Publicado, el informe se muestra con los datos congelados de su revisión, no con los de ahora.
  const congelado = informe?.estado === "publicado" ? (informe.revision_vigente?.datos ?? null) : null;
  const fotosDoc = congelado?.fotos ?? dia.fotos;
  const anotacionesDoc = congelado?.anotaciones ?? dia.anotaciones;
  const itemsDoc = congelado?.items ?? items;
  const nombre = (u: string) => congelado?.usuarios.find((x) => x.id === u)?.nombre ?? nombreEquipo(u);
  const urls = useUrls(fotosDoc.map((f) => f.archivo_path));
  const minis = useUrls(dia.fotos.map((f) => f.miniatura_path));
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [visor, setVisor] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [ocupado, setOcupado] = useState(false);

  // Copia local del contenido: se guarda sola un segundo después de cada cambio.
  const [borrador, setBorrador] = useState<ContenidoInforme | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>("guardado");
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ultimo = useRef<ContenidoInforme | null>(null);

  useEffect(() => {
    if (informe?.contenido && guardado === "guardado") setBorrador(informe.contenido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [informe?.contenido, informe?.actualizado_en]);

  async function guardarYa() {
    clearTimeout(temporizador.current);
    const c = ultimo.current;
    if (!informe || !c) return;
    ultimo.current = null;
    setGuardado("guardando");
    try {
      const r = await api.guardarInforme(informe.id, c);
      await mutate((p) => (p ? { ...p, ...r } : p), { revalidate: false });
      setGuardado(ultimo.current ? "pendiente" : "guardado");
    } catch (e) {
      ultimo.current ??= c;
      setGuardado({ error: e instanceof Error ? e.message : "No se pudo guardar" });
      throw e;
    }
  }

  function cambiar(c: ContenidoInforme) {
    setBorrador(c);
    ultimo.current = c;
    setGuardado("pendiente");
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardarYa().catch(() => {}), 1000);
  }

  async function hacer(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError(undefined);
    try {
      await guardarYa();
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setOcupado(false);
    }
  }

  const volver = (
    <Link href={`/obras/${id}?fecha=${fecha}`} className="flex items-center gap-1.5 text-sm font-semibold text-plano">
      <ArrowLeft size={16} /> Día de obra
    </Link>
  );

  if (!obra || dia.cargando) return null;

  if (!editor && dia.informe?.estado !== "publicado") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-10">
        {volver}
        <Vacio icono={<FileText />} titulo="El informe de este día no está publicado" texto="Cuando el editor lo publique, lo vas a ver acá y lo vas a poder descargar en PDF." />
      </div>
    );
  }

  if (!dia.informe || dia.informe.estado === "error") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-10">
        {volver}
        <Vacio
          icono={<FileText />}
          titulo={dia.informe ? "No se pudo armar el informe" : "Todavía no hay informe de este día"}
          texto={
            dia.fotos.length
              ? `Se arma con las ${dia.fotos.length} fotos del día ordenadas por ítem, con sus comentarios y marcas. Después completás el resumen y lo publicás.`
              : "No hay fotos cargadas este día."
          }
        >
          {dia.informe?.error && <p className="mb-3 text-sm text-peligro-texto">{dia.informe.error}</p>}
          <button
            className="boton-principal"
            disabled={!dia.fotos.length || ocupado}
            onClick={() => hacer(async () => {
              await api.generarInforme({ obra_id: id, tipo: "diario", fecha_desde: fecha, forzar: !!dia.informe });
              await dia.mutate();
            })}
          >
            <FileText size={18} /> Armar informe del día
          </button>
          {error && <p className="mt-3 text-sm font-semibold text-peligro-texto">{error}</p>}
        </Vacio>
      </div>
    );
  }

  if (!informe || informe.estado === "generando" || !borrador) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-10">
        {volver}
        <div className="tarjeta flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Loader2 className="animate-spin text-tenue" size={32} />
          <h2 className="titulo text-xl">Armando el informe…</h2>
          <p className="max-w-md text-tenue">Ordeno {dia.fotos.length} fotos por ítem con sus comentarios y marcas.</p>
        </div>
      </div>
    );
  }

  const publicado = informe.estado === "publicado";
  const vigente = publicado ? informe.revision_vigente : null;
  const numero = vigente?.codigo ?? numeroInforme(obra.sigla, informe.numero);
  const proxima = informe.revision === null ? 0 : informe.revision + 1;
  const obraDoc = congelado ? { ...obra, codigo: congelado.obra.codigo, nombre: congelado.obra.nombre } : obra;
  const datos = {
    obra: obraDoc, numero, fecha, contenido: borrador, fotos: fotosDoc, anotaciones: anotacionesDoc, items: itemsDoc,
    sectores: congelado?.sectores ?? sectores, nombre, urls,
  };
  // Fotos del informe en el orden en que aparecen, para el visor.
  const fotosInforme = borrador.avances.flatMap((a) =>
    a.fotos.flatMap((fi) => {
      const foto = fotosDoc.find((f) => f.id === fi.foto_id);
      const it = itemsDoc.find((i) => i.id === a.item_id);
      return foto
        ? [{ foto, src: urls[foto.archivo_path], anotaciones: anotacionesDoc.filter((x) => x.foto_id === foto.id), autor: nombre(foto.autor_id), detalle: it?.numero ? `${it.numero} · ${a.titulo}` : a.titulo }]
        : [];
    }),
  );
  const avanceSel = seleccion?.tipo === "avance" ? borrador.avances.find((a) => a.id === seleccion.id) : undefined;
  const fuentes = avanceSel ? dia.fotos.filter((f) => avanceSel.fuentes.foto_ids.includes(f.id) || avanceSel.fotos.some((x) => x.foto_id === f.id)) : [];

  function irA(alerta: Alerta) {
    if (!alerta.avance_id) return;
    setSeleccion({ tipo: "avance", id: alerta.avance_id });
    document.getElementById(alerta.avance_id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-borde bg-superficie px-4 py-4 md:px-8">
        {volver}
        <h1 className="titulo text-[22px]">
          Informe {numero} · {fechaNumerica(fecha).slice(0, 5)}
        </h1>
        {editor && informe.automatico && <ChipAutomatico />}
        {editor && <ChipEstado estado={informe.estado} />}
        {editor && <EstadoDeGuardado estado={guardado} />}
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href={api.urlPdf(informe.id)}
            target="_blank"
            rel="noopener"
            aria-disabled={guardado !== "guardado"}
            title={guardado !== "guardado" ? "Esperá a que se guarden los cambios" : undefined}
            className={`boton-secundario h-10 ${guardado !== "guardado" ? "pointer-events-none opacity-50" : ""}`}
          >
            <FileDown size={16} /> {publicado ? "Descargar PDF" : "Vista previa PDF"}
          </a>
          {editor &&
            (publicado ? (
              <button
                className="boton-secundario h-10"
                disabled={ocupado}
                onClick={() => {
                  if (!confirm(`La ${numero} queda guardada tal como está. Al publicar de nuevo se crea la Rev. ${proxima}. ¿Seguimos?`)) return;
                  hacer(async () => {
                    await api.guardarInforme(informe.id, borrador);
                    await mutate();
                  });
                }}
              >
                <RotateCcw size={16} /> Editar de nuevo
              </button>
            ) : (
              <button
                className="boton-principal h-10"
                disabled={ocupado}
                onClick={() => hacer(async () => {
                  await api.publicarInforme(informe.id);
                  await Promise.all([mutate(), mutateRevisiones()]);
                })}
              >
                <Check size={18} /> {informe.revision === null ? "Aprobar y publicar" : `Publicar Rev. ${proxima}`}
              </button>
            ))}
        </div>
      </header>
      {error && <p className="mx-4 mt-4 rounded-[10px] bg-peligro-suave px-4 py-2.5 text-sm font-semibold text-peligro-texto md:mx-8">{error}</p>}

      <div className="flex flex-1 flex-wrap items-start gap-7 px-4 py-7 md:px-8">
        <div className="min-w-0 max-w-[860px] flex-[999_1_560px] overflow-hidden rounded-md shadow-sm">
          <DocumentoInforme
            datos={datos}
            editable={editor && !publicado}
            seleccion={seleccion}
            seleccionar={setSeleccion}
            cambiar={cambiar}
            alAbrirFoto={(fotoId) => setVisor(Math.max(0, fotosInforme.findIndex((x) => x.foto.id === fotoId)))}
          />
          {visor !== null && <VisorFotos fotos={fotosInforme} inicial={visor} cerrar={() => setVisor(null)} />}
        </div>

        {editor && (
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-24">
            {publicado ? (
              <>
                <p className="tarjeta flex gap-3 p-5 text-sm text-tenue">
                  <Lock size={18} className="mt-0.5 shrink-0 text-tinta" />
                  <span>
                    <b className="text-tinta">{numero}</b> publicada{informe.publicado_por ? ` por ${nombre(informe.publicado_por)}` : ""}
                    {informe.publicado_en && ` el ${fechaNumerica(informe.publicado_en)} a las ${hora(informe.publicado_en)}`}. Lo ven los usuarios de solo
                    lectura. Quedó congelada: si después se corrigen o borran fotos, este informe y su PDF no cambian. Para corregirlo, tocá
                    «Editar de nuevo» y publicalo como Rev. {proxima}.
                  </span>
                </p>
                <Revisiones informeId={informe.id} revisiones={revisiones} nombre={nombre} />
              </>
            ) : (
              <>
                <ClimaYPersonal
                  obraId={id}
                  fecha={fecha}
                  inicial={borrador}
                  observaciones={dia.registro?.observaciones ?? null}
                  alGuardar={(clima, personal) => cambiar({ ...borrador, clima, personal })}
                />

                {borrador.alertas.length > 0 && (
                  <section className="tarjeta flex flex-col gap-3 p-5">
                    <h2 className="titulo text-lg font-bold">Para revisar</h2>
                    {borrador.alertas.map((a, n) => (
                      <div key={n} className={`rounded-[10px] px-3.5 py-3 text-sm leading-normal ${ALERTA[a.tipo].clase}`}>
                        <b>{ALERTA[a.tipo].titulo}</b> {a.texto}
                        <div className="mt-2.5 flex gap-2">
                          {a.avance_id && (
                            <button className="boton h-9 border border-current/40 bg-transparent px-3 text-[13px]" onClick={() => irA(a)}>
                              Ver ítem
                            </button>
                          )}
                          <button className="boton-tinta h-9 px-3 text-[13px]" onClick={() => cambiar({ ...borrador, alertas: borrador.alertas.filter((_, k) => k !== n) })}>
                            Listo
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <section className="tarjeta flex flex-col gap-3 p-5">
                  <h2 className="titulo text-lg font-bold">{avanceSel ? "Lo que cargó el equipo" : "Fuentes"}</h2>
                  {avanceSel ? (
                    <ul className="flex flex-col gap-3 text-sm">
                      {fuentes.map((f) => (
                        <li key={f.id} className="flex gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {minis[f.miniatura_path] && <img src={minis[f.miniatura_path]} alt="" className="size-14 shrink-0 rounded-md object-cover" />}
                          <span>
                            <span className="font-semibold">{nombre(f.autor_id).split(" ")[0]}</span>
                            <span className="text-tenue"> {hora(f.tomada_en)}:</span> {f.comentario ?? <span className="text-tenue">sin comentario</span>}
                            {dia.anotaciones
                              .filter((x) => x.foto_id === f.id && x.comentario)
                              .map((x) => (
                                <span key={x.id} className="block">
                                  <b>{x.numero}.</b> {x.comentario}
                                </span>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-[13px] text-tenue">Tocá un ítem del informe para ver las fotos y comentarios de los que sale.</span>
                  )}
                </section>

                {revisiones.length > 0 && (
                  <p className="tarjeta p-5 text-sm text-tenue">
                    Estás editando sobre la {revisiones[0].codigo}, que sigue guardada. Al publicar queda como Rev. {proxima}.
                  </p>
                )}
                <Revisiones informeId={informe.id} revisiones={revisiones} nombre={nombre} />

                <button
                  className="flex items-center gap-1.5 self-start text-sm font-semibold text-tenue hover:text-tinta"
                  disabled={ocupado}
                  onClick={() => {
                    if (!confirm("Se vuelve a armar el informe con las fotos de ahora y se pierden los textos que escribiste. ¿Seguimos?")) return;
                    hacer(async () => {
                      await api.generarInforme({ obra_id: id, tipo: "diario", fecha_desde: fecha, forzar: true });
                      setBorrador(null);
                      await Promise.all([dia.mutate(), mutate()]);
                    });
                  }}
                >
                  <RefreshCw size={14} /> Volver a armar con las fotos nuevas
                </button>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Versiones publicadas: cada una con su código y su PDF congelado. */
function Revisiones({ informeId, revisiones, nombre }: { informeId: string; revisiones: RevisionInforme[]; nombre: (id: string) => string }) {
  if (!revisiones.length) return null;
  return (
    <section className="tarjeta flex flex-col gap-3 p-5">
      <h2 className="titulo text-lg font-bold">Revisiones</h2>
      <ul className="flex flex-col divide-y divide-borde text-sm">
        {revisiones.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold tabular-nums">{r.codigo}</span>
              <span className="text-tenue">
                {fechaNumerica(r.publicado_en)} {hora(r.publicado_en)}
                {r.publicado_por ? ` · ${nombre(r.publicado_por)}` : ""}
              </span>
            </span>
            <a href={api.urlPdf(informeId, r.revision)} target="_blank" rel="noopener" className="boton-secundario h-9 shrink-0 text-sm">
              <FileDown size={16} /> PDF
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstadoDeGuardado({ estado }: { estado: EstadoGuardado }) {
  if (typeof estado === "object") return <span className="text-sm font-semibold text-peligro-texto">No se guardó: {estado.error}</span>;
  return <span className="text-sm text-tenue">{estado === "guardado" ? "Cambios guardados" : "Guardando…"}</span>;
}

/** Clima y personal del día: los carga el editor a mano. Van al registro del día y al informe. */
function ClimaYPersonal({
  obraId,
  fecha,
  inicial,
  observaciones,
  alGuardar,
}: {
  obraId: string;
  fecha: string;
  inicial: ContenidoInforme;
  observaciones: string | null;
  alGuardar: (clima: ContenidoInforme["clima"], personal: PersonalEnObra[]) => void;
}) {
  const [clima, setClima] = useState(inicial.clima?.descripcion ?? "");
  const [lluvia, setLluvia] = useState(!!inicial.clima?.hubo_lluvia);
  const [personal, setPersonal] = useState<PersonalEnObra[]>(
    inicial.personal.length ? inicial.personal : [{ oficio: "Oficiales", cantidad: 0 }, { oficio: "Ayudantes", cantidad: 0 }],
  );
  const [estado, setEstado] = useState<string>();

  const cambiarFila = (n: number, cambio: Partial<PersonalEnObra>) => {
    setPersonal(personal.map((p, k) => (k === n ? { ...p, ...cambio } : p)));
    setEstado(undefined);
  };

  return (
    <form
      className="tarjeta flex flex-col gap-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const filas = personal.filter((p) => p.oficio.trim() && p.cantidad > 0).map((p) => ({ ...p, oficio: p.oficio.trim() }));
        const c = clima.trim() ? { descripcion: clima.trim(), hubo_lluvia: lluvia } : null;
        setEstado("Guardando…");
        try {
          await api.guardarRegistro(obraId, fecha, { clima: c?.descripcion ?? null, hubo_lluvia: c ? lluvia : null, personal: filas, observaciones });
          alGuardar(c, filas);
          setEstado("Guardado");
        } catch (err) {
          setEstado(err instanceof Error ? err.message : "No se pudo guardar");
        }
      }}
    >
      <h2 className="titulo text-lg font-bold">Clima y personal</h2>
      <label>
        <span className="etiqueta">Clima</span>
        <input className="campo" placeholder="Ej.: Soleado, 31 °C" value={clima} onChange={(e) => (setClima(e.target.value), setEstado(undefined))} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={lluvia} onChange={(e) => (setLluvia(e.target.checked), setEstado(undefined))} className="size-4" />
        Hubo lluvia
      </label>
      <span className="etiqueta mb-0">Personal en obra</span>
      {personal.map((p, n) => (
        <div key={n} className="flex gap-2">
          <input className="campo" aria-label="Oficio" placeholder="Oficio" value={p.oficio} onChange={(e) => cambiarFila(n, { oficio: e.target.value })} />
          <input
            className="campo w-20 shrink-0 text-right tabular-nums"
            aria-label={`Cantidad de ${p.oficio}`}
            type="number"
            min={0}
            value={p.cantidad}
            onChange={(e) => cambiarFila(n, { cantidad: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
          <button type="button" aria-label="Quitar fila" className="shrink-0 px-1 text-tenue hover:text-tinta" onClick={() => setPersonal(personal.filter((_, k) => k !== n))}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="flex items-center gap-1 self-start text-sm font-semibold text-plano" onClick={() => setPersonal([...personal, { oficio: "", cantidad: 0 }])}>
        <Plus size={14} /> Agregar oficio
      </button>
      <div className="flex items-center justify-end gap-3">
        {estado && <span className="text-sm text-tenue">{estado}</span>}
        <button className="boton-secundario h-10">Guardar</button>
      </div>
    </form>
  );
}
