"use client";
// El editor corrige o borra fotos y comentarios de cualquier día. La base registra
// cada cambio (historial_fotos): acá se muestra quién cambió qué y por qué.
import { useState } from "react";
import { History, Trash2 } from "lucide-react";
import type { Anotacion, CambioFoto, Foto, Item, Sector } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { nombreItem } from "@/lib/datos";
import { fechaNumerica, hora, hoy } from "@/lib/formato";
import { NumeroMarca } from "./foto-anotada";
import { Modal } from "./ui";

const sinVacios = (t: string) => t.trim() || null;

export function CorregirFoto({
  foto,
  anotaciones,
  items,
  sectores,
  cerrar,
  alGuardar,
}: {
  foto: Foto;
  anotaciones: Anotacion[];
  items: Item[];
  sectores: Sector[];
  cerrar: () => void;
  alGuardar: () => void;
}) {
  const [itemId, setItemId] = useState(foto.item_id);
  const [sectorId, setSectorId] = useState(foto.sector_id ?? "");
  const [comentario, setComentario] = useState(foto.comentario ?? "");
  const [marcas, setMarcas] = useState(() => anotaciones.map((a) => ({ a, comentario: a.comentario ?? "", quitar: false })));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>();
  const elegibles = items.filter((i) => !i.es_titulo);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(undefined);
    try {
      const m = sinVacios(motivo);
      const cambio = {
        ...(itemId !== foto.item_id && { item_id: itemId }),
        ...((sectorId || null) !== foto.sector_id && { sector_id: sectorId || null }),
        ...(sinVacios(comentario) !== foto.comentario && { comentario: sinVacios(comentario) }),
      };
      if (Object.keys(cambio).length) await api.cambiarFoto(foto.id, { ...cambio, motivo: m });
      for (const x of marcas) {
        if (x.quitar) await api.cambiarAnotacion(x.a.id, { eliminada: true, motivo: m });
        else if (sinVacios(x.comentario) !== x.a.comentario) await api.cambiarAnotacion(x.a.id, { comentario: sinVacios(x.comentario), motivo: m });
      }
      alGuardar();
      cerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Corregir foto" abierto cerrar={cerrar} ancho="max-w-xl">
      <form onSubmit={guardar} className="grid gap-4">
        <label>
          <span className="etiqueta">Ítem</span>
          <select className="campo" required value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {elegibles.map((i) => (
              <option key={i.id} value={i.id}>
                {nombreItem(i)}
              </option>
            ))}
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
        {marcas.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="etiqueta">Marcas sobre la foto</legend>
            {marcas.map((x, k) => (
              <div key={x.a.id} className="flex items-center gap-2">
                <NumeroMarca n={x.a.numero} />
                <input
                  className={`campo ${x.quitar ? "line-through opacity-50" : ""}`}
                  value={x.comentario}
                  disabled={x.quitar}
                  placeholder="Sin comentario"
                  aria-label={`Comentario de la marca ${x.a.numero}`}
                  onChange={(e) => setMarcas(marcas.map((y, j) => (j === k ? { ...y, comentario: e.target.value } : y)))}
                />
                <button
                  type="button"
                  className="boton-secundario w-11 shrink-0 px-0"
                  aria-pressed={x.quitar}
                  aria-label={x.quitar ? `No quitar la marca ${x.a.numero}` : `Quitar la marca ${x.a.numero}`}
                  title={x.quitar ? "No quitar" : "Quitar la marca"}
                  onClick={() => setMarcas(marcas.map((y, j) => (j === k ? { ...y, quitar: !y.quitar } : y)))}
                >
                  <Trash2 size={16} className={x.quitar ? "text-peligro" : ""} />
                </button>
              </div>
            ))}
          </fieldset>
        )}
        <label>
          <span className="etiqueta">Motivo de la corrección (opcional, queda en el historial)</span>
          <input className="campo" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button className="boton-principal" disabled={guardando || !itemId}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function BorrarFoto({ foto, hayInforme, cerrar, alBorrar }: { foto: Foto; hayInforme: boolean; cerrar: () => void; alBorrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Modal titulo="Borrar foto" abierto cerrar={cerrar}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBorrando(true);
          try {
            await api.cambiarFoto(foto.id, { eliminada: true, motivo: sinVacios(motivo) });
            alBorrar();
            cerrar();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo borrar.");
            setBorrando(false);
          }
        }}
      >
        <p className="leading-relaxed">
          La foto deja de verse en el día, en la app y en los próximos informes. Queda registrado quién la borró y se puede restaurar desde “Fotos
          borradas”.
          {hayInforme && " El informe de este día ya está armado: si la incluye, volvé a armarlo."}
        </p>
        <label>
          <span className="etiqueta">Motivo (opcional, queda en el historial)</span>
          <input className="campo" value={motivo} maxLength={500} autoFocus onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button className="boton bg-peligro text-white hover:brightness-95" disabled={borrando}>
            <Trash2 size={18} /> {borrando ? "Borrando…" : "Borrar foto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lo que necesita el historial para poner nombres en vez de ids. */
export interface ContextoHistorial {
  nombre: (usuarioId: string) => string;
  items: Item[];
  sectores: Sector[];
  marcas: Anotacion[];
}

const fechaPy = (instante: string) => new Date(Date.parse(instante) - 3 * 3600e3).toISOString().slice(0, 10);

/** "14:32" si fue hoy; "21/10/2026 14:32" si no. */
export function cuando(instante: string) {
  const dia = fechaPy(instante);
  return dia === hoy() ? hora(instante) : `${fechaNumerica(dia)} ${hora(instante)}`;
}

const citar = (v: unknown) => (typeof v === "string" && v ? `«${v}»` : "vacío");

/** Frases de un cambio: "Cambió el comentario: «a» → «b»". */
export function describirCambio(h: CambioFoto, ctx: ContextoHistorial): string[] {
  const marca = h.anotacion_id ? ctx.marcas.find((a) => a.id === h.anotacion_id) : undefined;
  const que = h.anotacion_id ? `la marca ${marca?.numero ?? ""}`.trim() : "la foto";
  if (h.accion === "borrar") return [`Borró ${que}`];
  if (h.accion === "restaurar") return [`Restauró ${que}`];
  const item = (id: unknown) => {
    const i = ctx.items.find((x) => x.id === id);
    return i ? nombreItem(i) : "otro ítem";
  };
  const sector = (id: unknown) => (id ? (ctx.sectores.find((s) => s.id === id)?.nombre ?? "otro sector") : "sin sector");
  return Object.entries(h.cambios).map(([campo, { antes, despues }]) => {
    if (campo === "item_id") return `Cambió el ítem: ${item(antes)} → ${item(despues)}`;
    if (campo === "sector_id") return `Cambió el sector: ${sector(antes)} → ${sector(despues)}`;
    if (campo === "geometria") return `Movió ${que}`;
    const de = h.anotacion_id ? ` de ${que}` : "";
    if (!antes) return `Agregó el comentario${de}: ${citar(despues)}`;
    if (!despues) return `Quitó el comentario${de} (${citar(antes)})`;
    return `Cambió el comentario${de}: ${citar(antes)} → ${citar(despues)}`;
  });
}

/** Aviso "Corregida por …" con el detalle desplegable de todos los cambios. */
export function HistorialFoto({ foto, historial, ctx }: { foto: Foto; historial: CambioFoto[]; ctx: ContextoHistorial }) {
  const [abierto, setAbierto] = useState(false);
  // Las correcciones del propio autor (el mismo día, desde la app) no se anuncian, pero se listan.
  const ajenos = historial.filter((h) => h.usuario_id !== foto.autor_id);
  if (ajenos.length === 0) return null;
  const ultimo = ajenos.at(-1)!;
  return (
    <div className="text-[13px]">
      <button
        type="button"
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-plano-suave px-2.5 py-0.5 text-left font-semibold text-plano-texto"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
      >
        <History size={14} />
        Corregida por {ultimo.usuario_id ? ctx.nombre(ultimo.usuario_id) : "Sistema"} · {cuando(ultimo.creado_en)}
      </button>
      {abierto && (
        <ol className="mt-2 grid gap-2 border-l-2 border-borde pl-3">
          {historial.map((h) => (
            <li key={h.id}>
              <div className="text-tenue">
                {h.usuario_id ? ctx.nombre(h.usuario_id) : "Sistema"} · {cuando(h.creado_en)}
              </div>
              {describirCambio(h, ctx).map((t, k) => (
                <div key={k}>{t}</div>
              ))}
              {h.motivo && <div className="text-tenue">Motivo: {h.motivo}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
