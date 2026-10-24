"use client";
import { useMemo, useState } from "react";
import { ChevronRight, RotateCw, Trash2 } from "lucide-react";
import type { Anotacion, Foto, Item } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "@/lib/api";
import { cambiarEnvio, descartarEnvio, reintentar, type EnvioFoto } from "@/lib/cola-campo";
import { nombreItem, useUrls } from "@/lib/datos";
import { fechaLarga, hora } from "@/lib/formato";
import { recientes, rubro, usarItem } from "@/lib/itemizado";
import { FotoAnotada } from "@/components/foto-anotada";
import { Hoja, mostrarAviso, useUrlLocal } from "./base";
import { ElegirItem } from "./elegir-item";

type Props = { items: Item[]; cerrar: () => void } & (
  | { foto: Foto; fecha: string; anotaciones: Anotacion[]; editable: boolean; alCambiar: () => void; envio?: undefined }
  | { envio: EnvioFoto; foto?: undefined }
);

/**
 * Una foto propia. Las de hoy se pueden corregir (ítem y comentario) o borrar; las de días
 * anteriores solo se ven. Lo que todavía no se envió se corrige en el celular.
 */
export function VerFoto(p: Props) {
  const { items, cerrar } = p;
  const obraId = p.foto?.obra_id ?? p.envio!.obraId;
  const itemId = p.foto?.item_id ?? p.envio!.itemId;
  const comentarioActual = (p.foto ? p.foto.comentario : p.envio.comentario) ?? "";
  const editable = p.envio ? true : p.editable;
  const urls = useUrls(p.foto ? [p.foto.archivo_path] : []);
  const local = useUrlLocal(p.envio?.grande);
  const src = p.foto ? urls[p.foto.archivo_path] : local;
  const instante = p.foto?.tomada_en ?? p.envio!.tomadaEn;

  const [eligiendo, setEligiendo] = useState(false);
  const [comentario, setComentario] = useState(comentarioActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>();
  const usados = useMemo(() => recientes(obraId), [obraId]);
  const item = items.find((i) => i.id === itemId);

  async function cambiar(c: { item_id?: string; comentario?: string | null; eliminada?: boolean }) {
    setGuardando(true);
    setError(undefined);
    try {
      if (p.envio) {
        if (c.eliminada) await descartarEnvio(p.envio.id);
        else await cambiarEnvio(p.envio.id, { ...(c.item_id ? { itemId: c.item_id } : {}), ...(c.comentario !== undefined ? { comentario: c.comentario } : {}) });
      } else {
        await api.cambiarFoto(p.foto.id, c);
        p.alCambiar();
      }
      if (c.item_id) usarItem(obraId, c.item_id);
      if (c.eliminada) {
        mostrarAviso("Foto borrada.");
        cerrar();
      } else if (c.comentario !== undefined) mostrarAviso("Comentario guardado.");
    } catch (e) {
      setError(
        e instanceof ErrorDeApi && e.estado === 403
          ? "Ya no se puede corregir: solo las fotos del mismo día."
          : e instanceof Error
            ? e.message
            : "No se pudo guardar. Probá de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  if (eligiendo) {
    return (
      <ElegirItem
        items={items}
        recientes={usados}
        elegido={itemId}
        alElegir={(id) => {
          setEligiendo(false);
          if (id !== itemId) void cambiar({ item_id: id });
        }}
        cerrar={() => setEligiendo(false)}
      />
    );
  }

  const cambioComentario = comentario.trim() !== comentarioActual.trim();
  return (
    <Hoja titulo={`Foto de las ${hora(instante)}`} subtitulo={fechaLarga(p.foto ? p.fecha : p.envio.fecha)} cerrar={cerrar}>
      <div className="flex flex-col gap-4 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {p.foto ? (
          <FotoAnotada foto={p.foto} src={src} anotaciones={p.anotaciones} className="rounded-[14px]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="w-full rounded-[14px] bg-pista" />
        )}

        {p.envio?.error && (
          <div className="flex flex-col gap-2 rounded-[12px] bg-peligro-suave p-3 text-sm text-peligro-texto">
            <p>
              <b>No se envió:</b> {p.envio.error}
            </p>
            <button type="button" className="boton-secundario h-10" onClick={() => void reintentar(p.envio!.id)}>
              <RotateCw size={16} /> Reintentar
            </button>
          </div>
        )}

        <div>
          <span className="etiqueta">Ítem</span>
          <button
            type="button"
            disabled={!editable || guardando}
            onClick={() => setEligiendo(true)}
            className="tarjeta flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left enabled:active:bg-pista"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{item ? nombreItem(item) : "Ítem"}</span>
              {item && rubro(items, item.id) && <span className="block truncate text-sm text-tenue">{rubro(items, item.id)}</span>}
            </span>
            {editable && <ChevronRight size={22} className="shrink-0 text-tenue" />}
          </button>
        </div>

        {editable ? (
          <label>
            <span className="etiqueta">Comentario</span>
            <textarea className="campo min-h-24" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            {cambioComentario && (
              <button type="button" className="boton-tinta mt-2 h-11 w-full" disabled={guardando} onClick={() => void cambiar({ comentario: comentario.trim() || null })}>
                Guardar comentario
              </button>
            )}
          </label>
        ) : (
          comentarioActual && (
            <div>
              <span className="etiqueta">Comentario</span>
              <p className="tarjeta px-4 py-3 whitespace-pre-wrap">{comentarioActual}</p>
            </div>
          )
        )}

        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}

        {editable ? (
          <button
            type="button"
            disabled={guardando}
            className="boton h-12 border border-peligro/40 bg-superficie text-peligro-texto"
            onClick={() => confirm(p.envio ? "¿Descartar esta foto? Todavía no se envió." : "¿Borrar esta foto?") && void cambiar({ eliminada: true })}
          >
            <Trash2 size={18} /> {p.envio ? "Descartar foto" : "Borrar foto"}
          </button>
        ) : (
          <p className="text-center text-sm text-tenue">Solo se pueden corregir las fotos de hoy.</p>
        )}
      </div>
    </Hoja>
  );
}
