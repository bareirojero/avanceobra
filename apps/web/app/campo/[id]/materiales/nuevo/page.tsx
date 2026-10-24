"use client";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, PencilLine, Search, X } from "lucide-react";
import { FOTO, type Material } from "@registro-obra/contrato";
import { guardarEnvio } from "@/lib/cola-campo";
import { nombreItem, useItems, useMateriales, useYo } from "@/lib/datos";
import { hoy, sumarDias } from "@/lib/formato";
import { comprimir } from "@/lib/imagen";
import { buscarMateriales, esEspecial, leerCantidad, recientes, rubro, usarItem } from "@/lib/itemizado";
import { mostrarAviso, useUrlLocal } from "@/components/campo/base";
import { ElegirItem } from "@/components/campo/elegir-item";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Próximos 14 días para elegir cuándo hace falta: "Hoy", "Mañana", "Vie 24/10"… */
function proximosDias(desde: string) {
  return Array.from({ length: 14 }, (_, i) => {
    const fecha = sumarDias(desde, i);
    const [, m, d] = fecha.split("-");
    const texto = i === 0 ? "Hoy" : i === 1 ? "Mañana" : `${DIAS[new Date(`${fecha}T12:00:00`).getDay()]} ${d}/${m}`;
    return { fecha, texto };
  });
}

/**
 * Pedido de un material, como en la app: se busca el material (o se escribe si no está), la
 * cantidad, el sector (un ítem del itemizado) y para cuándo hace falta. Se guarda en el
 * celular y se envía solo.
 */
export default function NuevoPedido() {
  const { id: obraId } = useParams<{ id: string }>();
  const router = useRouter();
  const { yo } = useYo();
  const { materiales, cargando } = useMateriales();
  const items = useItems(obraId).items.filter((i) => !esEspecial(i));
  const [material, setMaterial] = useState<Material | null>(null);
  const [manual, setManual] = useState<{ texto: string; unidad: string } | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [cantidad, setCantidad] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [eligiendoSector, setEligiendoSector] = useState(false);
  const [necesarioPara, setNecesarioPara] = useState<string | null>(null);
  const [fotos, setFotos] = useState<{ id: string; blob: Blob }[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const dias = useMemo(() => proximosDias(hoy()), []);
  const usados = useMemo(() => recientes(obraId), [obraId]);

  const item = items.find((i) => i.id === itemId);
  const unidad = material?.unidad ?? (manual?.unidad.trim() || null);
  const numero = leerCantidad(cantidad);
  const faltaMaterial = !material && !manual?.texto.trim();

  async function agregarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])].slice(0, 3 - fotos.length);
    e.target.value = "";
    setProcesando(true);
    try {
      for (const a of archivos) {
        const [f] = await comprimir(a, [{ lado: FOTO.ladoMayor, calidad: FOTO.calidad }]);
        setFotos((actuales) => [...actuales, { id: crypto.randomUUID(), blob: f.blob }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar la foto.");
    } finally {
      setProcesando(false);
    }
  }

  async function enviar() {
    if (!yo || faltaMaterial) return;
    if (!numero) return setError("Escribí cuánto necesitás, por ejemplo 12 o 2,5.");
    if (!itemId) return setError("Elegí para qué sector es el material.");
    setGuardando(true);
    setError(undefined);
    try {
      await guardarEnvio({
        tipo: "pedido",
        id: crypto.randomUUID(),
        obraId,
        autorId: yo.usuario.id,
        creado: Date.now(),
        pedido: {
          obra_id: obraId,
          material_id: material?.id ?? null,
          material_texto: material ? null : manual!.texto.trim(),
          unidad_texto: material ? null : manual!.unidad.trim() || null,
          item_id: itemId,
          cantidad: numero,
          necesario_para: necesarioPara,
          pedido_en: new Date().toISOString(),
        },
        material: material?.descripcion ?? manual!.texto.trim(),
        unidad,
        fotos,
      });
      usarItem(obraId, itemId);
      mostrarAviso("Pedido guardado. Se envía solo.");
      router.replace(`/campo/${obraId}/materiales`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el pedido.");
      setGuardando(false);
    }
  }

  if (buscando) {
    return (
      <ElegirMaterial
        materiales={materiales}
        cargando={cargando}
        cerrar={() => (material || manual ? setBuscando(false) : router.back())}
        alElegir={(m) => {
          setMaterial(m);
          setManual(null);
          setBuscando(false);
        }}
        noEsta={(texto) => {
          setMaterial(null);
          setManual({ texto, unidad: "" });
          setBuscando(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mb-3 flex items-center gap-1">
          <button type="button" onClick={() => router.back()} aria-label="Volver" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-pista">
            <ChevronLeft size={26} strokeWidth={2.5} />
          </button>
          <h2 className="titulo text-xl">Pedir material</h2>
        </div>
        <div className="flex flex-col gap-4">
          {manual ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="etiqueta">Material que no está en la lista</span>
                <button type="button" className="text-sm font-semibold text-plano" onClick={() => setBuscando(true)}>
                  Buscar de nuevo
                </button>
              </div>
              <textarea className="campo" rows={2} value={manual.texto} onChange={(e) => setManual({ ...manual, texto: e.target.value })} placeholder="Escribí el material que necesitás" />
              <input
                className="campo h-12"
                value={manual.unidad}
                onChange={(e) => setManual({ ...manual, unidad: e.target.value.slice(0, 20) })}
                placeholder="Unidad (KG, M3, UN, BOLSA…)"
                autoCapitalize="characters"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setBuscando(true)} className="tarjeta flex items-center gap-3 px-4 py-3 text-left active:bg-pista">
              <span className="min-w-0 flex-1">
                <span className="etiqueta mb-0">Material</span>
                <span className="block text-[17px] font-semibold">{material?.descripcion}</span>
                {material?.unidad && <span className="block text-sm text-tenue">Se pide en {material.unidad}</span>}
              </span>
              <span className="text-sm font-semibold text-plano">Cambiar</span>
            </button>
          )}

          <label>
            <span className="etiqueta">Cantidad</span>
            <span className="flex items-center gap-3">
              <input
                className="campo h-14 flex-1 text-[22px]! font-semibold"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                aria-label={`Cantidad${unidad ? ` en ${unidad}` : ""}`}
              />
              {unidad && <span className="font-display text-lg font-bold">{unidad}</span>}
            </span>
          </label>

          <div>
            <span className="etiqueta">Sector</span>
            <button type="button" onClick={() => setEligiendoSector(true)} className="tarjeta flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-pista">
              <span className="min-w-0 flex-1">
                {item ? (
                  <>
                    <span className="block font-semibold">{nombreItem(item)}</span>
                    {rubro(items, item.id) && <span className="block truncate text-sm text-tenue">{rubro(items, item.id)}</span>}
                  </>
                ) : (
                  <span className="block font-semibold text-tenue">Elegí el sector</span>
                )}
              </span>
              <ChevronRight size={22} className="shrink-0 text-tenue" />
            </button>
          </div>

          <div>
            <span className="etiqueta">¿Para cuándo lo necesitás en obra?</span>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <button type="button" className="chip h-10 shrink-0" aria-pressed={necesarioPara === null} onClick={() => setNecesarioPara(null)}>
                Sin fecha
              </button>
              {dias.map((d) => (
                <button key={d.fecha} type="button" className="chip h-10 shrink-0" aria-pressed={necesarioPara === d.fecha} onClick={() => setNecesarioPara(d.fecha)}>
                  {d.texto}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="etiqueta">Fotos del producto (opcional, solo de referencia)</span>
            {fotos.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {fotos.map((f) => (
                  <FotoPedido key={f.id} blob={f.blob} quitar={() => setFotos(fotos.filter((x) => x.id !== f.id))} />
                ))}
              </div>
            )}
            {fotos.length < 3 && (
              <div className="flex gap-2">
                <button type="button" className="boton-secundario h-12 flex-1" disabled={procesando} onClick={() => camara.current?.click()}>
                  <Camera size={18} /> Sacar foto
                </button>
                <button type="button" className="boton-secundario h-12 flex-1" disabled={procesando} onClick={() => galeria.current?.click()}>
                  <ImagePlus size={18} /> Galería
                </button>
              </div>
            )}
            <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={agregarFotos} />
            <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={agregarFotos} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-4 pt-2 pb-3">
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <button type="button" className="boton-principal h-14 text-[17px]" disabled={guardando || procesando || faltaMaterial} onClick={enviar}>
          {guardando ? "Guardando…" : "Enviar pedido"}
        </button>
      </div>

      {eligiendoSector && (
        <ElegirItem
          titulo="¿Para qué sector?"
          subtitulo="Los mismos ítems que usás en las fotos."
          items={items}
          recientes={usados}
          elegido={itemId}
          alElegir={(id) => {
            setItemId(id);
            setEligiendoSector(false);
          }}
          cerrar={() => setEligiendoSector(false)}
        />
      )}
    </>
  );
}

function FotoPedido({ blob, quitar }: { blob: Blob; quitar: () => void }) {
  const src = useUrlLocal(blob);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-pista">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" aria-label="Quitar foto" onClick={quitar} className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-tinta/70 text-white">
        <X size={16} />
      </button>
    </div>
  );
}

function ElegirMaterial({
  materiales,
  cargando,
  cerrar,
  alElegir,
  noEsta,
}: {
  materiales: Material[];
  cargando: boolean;
  cerrar: () => void;
  alElegir: (m: Material) => void;
  noEsta: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const resultados = useMemo(() => buscarMateriales(materiales, texto), [materiales, texto]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <div className="mb-3 flex items-center gap-1">
        <button type="button" onClick={cerrar} aria-label="Volver" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-pista">
          <ChevronLeft size={26} strokeWidth={2.5} />
        </button>
        <h2 className="titulo text-xl">¿Qué material?</h2>
      </div>
      <label className="mb-3 flex h-12 items-center gap-2 rounded-[14px] border border-borde-fuerte bg-superficie px-3 focus-within:border-plano">
        <Search size={20} className="shrink-0 text-tenue" />
        <input
          type="search"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar: cemento, varilla 10…"
          autoCorrect="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        {texto && (
          <button type="button" onClick={() => setTexto("")} aria-label="Borrar búsqueda" className="p-1 text-tenue">
            <X size={20} />
          </button>
        )}
      </label>
      {!texto.trim() && (
        <p className="px-1 text-tenue">
          {cargando ? "Cargando la lista de materiales…" : materiales.length ? "Escribí una o más palabras del material." : "Todavía no está cargada la lista de materiales."}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {resultados.map((m) => (
          <button key={m.id} type="button" onClick={() => alElegir(m)} className="tarjeta flex min-h-14 items-center gap-3 px-4 py-3 text-left active:bg-pista">
            <span className="min-w-0 flex-1 font-semibold">{m.descripcion}</span>
            {m.unidad && <span className="shrink-0 text-sm text-tenue">{m.unidad}</span>}
          </button>
        ))}
        {texto.trim() && (
          <button type="button" onClick={() => noEsta(texto.trim())} className="flex min-h-14 items-center gap-3 rounded-[14px] border-2 border-dashed border-borde-fuerte px-4 py-3 text-left">
            <PencilLine size={20} className="shrink-0 text-tenue" />
            <span>
              <span className="block font-semibold">No está en la lista</span>
              <span className="block text-sm text-tenue">Pedir “{texto.trim()}” escrito a mano</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
