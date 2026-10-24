"use client";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { FOTO, type Item } from "@registro-obra/contrato";
import { guardarEnvio } from "@/lib/cola-campo";
import { nombreItem } from "@/lib/datos";
import { hoy } from "@/lib/formato";
import { comprimir } from "@/lib/imagen";
import { recientes, rubro, usarItem } from "@/lib/itemizado";
import { Hoja, mostrarAviso, useUrlLocal } from "./base";
import { ElegirItem } from "./elegir-item";

export type Ubicacion = { latitud: number; longitud: number } | null;

/** Hora de la foto: ahora si se sacó con la cámara; si se subió, la del archivo (en el día de hoy). */
function tomadaEn(archivo: File, deCamara: boolean, fecha: string) {
  if (deCamara) return new Date().toISOString();
  const local = new Date(archivo.lastModified - 3 * 3600e3).toISOString().slice(11, 19);
  return `${fecha}T${local}-03:00`;
}

/**
 * Después de sacar o elegir fotos: el ítem (obligatorio) y un comentario. Se guardan en el
 * celular y se envían solas.
 */
export function NuevaFoto({
  obraId,
  autorId,
  archivos,
  deCamara,
  ubicacion,
  items,
  cerrar,
}: {
  obraId: string;
  autorId: string;
  archivos: File[];
  deCamara: boolean;
  /** Se pide al tocar "Sacar foto"; puede no llegar nunca (sin permiso). */
  ubicacion: Promise<Ubicacion>;
  items: Item[];
  cerrar: () => void;
}) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(true);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>();
  const usados = useMemo(() => recientes(obraId), [obraId]);
  const item = items.find((i) => i.id === itemId);
  const varias = archivos.length > 1;

  async function guardar() {
    if (!itemId) return setEligiendo(true);
    setGuardando(true);
    setError(undefined);
    try {
      const fecha = hoy();
      // La ubicación no puede demorar el guardado.
      const lugar = await Promise.race([ubicacion, new Promise<Ubicacion>((ok) => setTimeout(() => ok(null), 1500))]);
      for (const [n, archivo] of archivos.entries()) {
        const [grande, mini] = await comprimir(archivo, [
          { lado: FOTO.ladoMayor, calidad: FOTO.calidad },
          { lado: FOTO.miniaturaLadoMayor, calidad: FOTO.miniaturaCalidad },
        ]);
        await guardarEnvio({
          tipo: "foto",
          id: crypto.randomUUID(),
          obraId,
          autorId,
          creado: Date.now() + n,
          fecha,
          itemId,
          comentario: comentario.trim() || null,
          tomadaEn: tomadaEn(archivo, deCamara, fecha),
          latitud: lugar?.latitud ?? null,
          longitud: lugar?.longitud ?? null,
          ancho: grande.ancho,
          alto: grande.alto,
          grande: grande.blob,
          mini: mini.blob,
        });
      }
      usarItem(obraId, itemId);
      mostrarAviso(varias ? `${archivos.length} fotos guardadas. Se envían solas.` : "Foto guardada. Se envía sola.");
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la foto.");
      setGuardando(false);
    }
  }

  if (eligiendo) {
    return (
      <ElegirItem
        subtitulo={varias ? `Para las ${archivos.length} fotos` : undefined}
        items={items}
        recientes={usados}
        elegido={itemId}
        alElegir={(id) => {
          setItemId(id);
          setEligiendo(false);
        }}
        cerrar={() => (itemId ? setEligiendo(false) : cerrar())}
      />
    );
  }

  return (
    <Hoja
      titulo={varias ? `${archivos.length} fotos` : "Foto"}
      cerrar={cerrar}
      pie={
        <>
          {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
          <button type="button" className="boton-principal h-14 text-[17px]" disabled={guardando || !itemId} onClick={guardar}>
            {guardando ? "Guardando…" : varias ? `Guardar ${archivos.length} fotos` : "Guardar foto"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className={varias ? "grid grid-cols-3 gap-2" : ""}>
          {archivos.map((a, n) => (
            <Vista key={n} archivo={a} chica={varias} />
          ))}
        </div>
        <div>
          <span className="etiqueta">Ítem</span>
          <button type="button" onClick={() => setEligiendo(true)} className="tarjeta flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-pista">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{item ? nombreItem(item) : "Elegí el ítem"}</span>
              {item && rubro(items, item.id) && <span className="block truncate text-sm text-tenue">{rubro(items, item.id)}</span>}
            </span>
            <ChevronRight size={22} className="shrink-0 text-tenue" />
          </button>
        </div>
        <label>
          <span className="etiqueta">Comentario (opcional)</span>
          <textarea className="campo min-h-24" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="¿Qué se ve en la foto?" />
        </label>
      </div>
    </Hoja>
  );
}

function Vista({ archivo, chica }: { archivo: File; chica: boolean }) {
  const src = useUrlLocal(archivo);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`w-full rounded-[14px] bg-pista object-cover ${chica ? "aspect-square" : "max-h-[45dvh]"}`} />
  );
}
