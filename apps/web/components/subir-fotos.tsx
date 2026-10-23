"use client";
// El editor sube fotos desde la computadora. Cada foto queda en su parte del día,
// vinculada a un ítem, igual que las que llegan del teléfono.
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { FOTO, idParte, rutaFoto, rutaMiniatura } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { nombreItem, useItems, useSectores, useYo } from "@/lib/datos";
import { Modal } from "./ui";

/** Achica la foto como la app del teléfono: lado mayor `lado` px, JPEG. */
async function comprimir(bmp: ImageBitmap, lado: number, calidad: number) {
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo comprimir"))), "image/jpeg", calidad));
  return { blob, ancho: lienzo.width, alto: lienzo.height };
}

async function subirArchivo(ruta: string, blob: Blob) {
  const s = await api.subida(ruta);
  // Con SharePoint la URL apunta a la API (/api/archivos/datos/…): se usa la ruta
  // relativa para pasar por el mismo origen y evitar CORS.
  const u = new URL(s.url, location.href);
  const destino = u.pathname.startsWith("/api/archivos/datos/") ? u.pathname + u.search : s.url;
  const r = await fetch(destino, { method: s.metodo, headers: { ...s.encabezados, "content-type": "image/jpeg" }, body: blob });
  if (!r.ok) throw new Error(`No se pudo subir la foto (${r.status})`);
}

/** Hora local (Paraguay, UTC-3) de la última modificación del archivo, en la fecha elegida. */
function tomadaEn(fecha: string, archivo: File) {
  const local = new Date(archivo.lastModified - 3 * 3600e3).toISOString().slice(11, 19);
  return `${fecha}T${local}-03:00`;
}

export function SubirFotos({
  obraId,
  fecha,
  abierto,
  cerrar,
  alSubir,
}: {
  obraId: string;
  fecha: string;
  abierto: boolean;
  cerrar: () => void;
  alSubir: () => void;
}) {
  const { yo } = useYo();
  const items = useItems(obraId).items.filter((i) => !i.es_titulo);
  const { sectores } = useSectores(obraId);
  const [error, setError] = useState<string>();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [itemId, setItemId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);

  function salir() {
    setArchivos([]);
    setItemId("");
    setSectorId("");
    setComentario("");
    cerrar();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!yo) return;
    setGuardando(true);
    setError(undefined);
    try {
      const autor = yo.usuario.id;
      const parte = idParte(obraId, autor, fecha);
      await api.guardarParte(parte, { obra_id: obraId, fecha, notas: null });
      for (const [orden, archivo] of archivos.entries()) {
        const id = crypto.randomUUID();
        const bmp = await createImageBitmap(archivo);
        const grande = await comprimir(bmp, FOTO.ladoMayor, FOTO.calidad);
        const mini = await comprimir(bmp, FOTO.miniaturaLadoMayor, FOTO.miniaturaCalidad);
        await subirArchivo(rutaFoto(obraId, autor, id), grande.blob);
        await subirArchivo(rutaMiniatura(obraId, autor, id), mini.blob);
        await api.guardarFoto(id, {
          parte_id: parte,
          obra_id: obraId,
          item_id: itemId,
          sector_id: sectorId || null,
          origen: "web",
          tomada_en: tomadaEn(fecha, archivo),
          latitud: null,
          longitud: null,
          archivo_path: rutaFoto(obraId, autor, id),
          miniatura_path: rutaMiniatura(obraId, autor, id),
          ancho: grande.ancho,
          alto: grande.alto,
          comentario: comentario.trim() || null,
          orden,
          eliminado_en: null,
        });
      }
      alSubir();
      salir();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron subir las fotos.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Subir fotos" abierto={abierto} cerrar={salir} ancho="max-w-xl">
      <form onSubmit={guardar} className="grid gap-4">
        <div
          className="flex flex-wrap gap-2 rounded-[14px] border-2 border-dashed border-borde-fuerte p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setArchivos([...archivos, ...[...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))]);
          }}
        >
          {archivos.map((a, n) => (
            <div key={n} className="relative size-24 overflow-hidden rounded-lg bg-pista">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(a)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Quitar foto"
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-tinta/70 text-white"
                onClick={() => setArchivos(archivos.filter((_, k) => k !== n))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg bg-fondo text-sm text-tenue hover:text-tinta" onClick={() => entrada.current?.click()}>
            <ImagePlus size={22} />
            Elegir
          </button>
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              setArchivos([...archivos, ...(e.target.files ? [...e.target.files] : [])]);
              e.target.value = "";
            }}
          />
        </div>
        <label>
          <span className="etiqueta">Ítem *</span>
          <select className="campo" required value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Elegí el ítem…</option>
            <optgroup label="Otros registros">
              {items
                .filter((i) => i.categoria !== "obra")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.descripcion}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Ítems de obra">
              {items
                .filter((i) => i.categoria === "obra")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {nombreItem(i)}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        {sectores.length > 0 && (
          <label>
            <span className="etiqueta">Sector</span>
            <select className="campo" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Sin sector</option>
              {sectores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="etiqueta">Comentario</span>
          <textarea className="campo" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={salir}>
            Cancelar
          </button>
          <button className="boton-principal" disabled={!archivos.length || !itemId || guardando}>
            {guardando ? "Subiendo…" : `Subir ${archivos.length || ""} foto${archivos.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
