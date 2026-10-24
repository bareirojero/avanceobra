"use client";
// Piezas de la versión de celular (/campo): hojas a pantalla completa, avisos cortos y
// la miniatura de una foto con su estado de envío.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ChevronLeft, X } from "lucide-react";
import type { EnvioFoto } from "@/lib/cola-campo";
import { hora } from "@/lib/formato";

/** Última obra usada en este celular (localStorage). */
export const OBRA_GUARDADA = "campo:obra";

/** Pantalla completa encima de todo (elegir ítem, ver una foto…), con las zonas seguras del iPhone. */
export function Hoja({
  titulo,
  subtitulo,
  cerrar,
  volver,
  children,
  pie,
}: {
  titulo: string;
  subtitulo?: string;
  cerrar: () => void;
  /** Flecha en vez de cruz. */
  volver?: boolean;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  // Sin scroll de la página de atrás mientras la hoja está abierta.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = antes);
  }, []);
  return (
    <div role="dialog" aria-label={titulo} className="movil fixed inset-0 z-50 flex flex-col bg-fondo pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" onClick={cerrar} aria-label={volver ? "Volver" : "Cerrar"} className="grid size-12 shrink-0 place-items-center rounded-full active:bg-pista">
          {volver ? <ChevronLeft size={28} strokeWidth={2.5} /> : <X size={26} strokeWidth={2.5} />}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="titulo truncate text-[22px] leading-tight">{titulo}</h2>
          {subtitulo && <p className="truncate text-sm text-tenue">{subtitulo}</p>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {pie && <div className="flex flex-col gap-2 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">{pie}</div>}
    </div>
  );
}

// --- Avisos cortos ("Foto guardada. Se envía sola.") ---

let aviso: { texto: string; n: number } | null = null;
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setTimeout> | undefined;

export function mostrarAviso(texto: string) {
  aviso = { texto, n: (aviso?.n ?? 0) + 1 };
  oyentes.forEach((o) => o());
  clearTimeout(reloj);
  reloj = setTimeout(() => {
    aviso = null;
    oyentes.forEach((o) => o());
  }, 3500);
}

export function Aviso() {
  const a = useSyncExternalStore(
    (o) => (oyentes.add(o), () => void oyentes.delete(o)),
    () => aviso,
    () => null,
  );
  if (!a) return null;
  return (
    <div
      role="status"
      key={a.n}
      className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[60] rounded-[14px] bg-tinta px-4 py-3 text-center font-semibold text-white shadow-lg"
    >
      {a.texto}
    </div>
  );
}

// --- Miniaturas ---

export type EstadoEnvio = "enviada" | "pendiente" | "error";

const ETIQUETA: Record<EstadoEnvio, { texto: string; clase: string }> = {
  enviada: { texto: "Enviada", clase: "bg-ok" },
  pendiente: { texto: "En espera", clase: "bg-pendiente" },
  error: { texto: "No se envió", clase: "bg-peligro" },
};

/** URL local de un Blob guardado en el celular, mientras el componente está a la vista. */
export function useUrlLocal(blob: Blob | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export function Miniatura({ src, estado, etiqueta, alTocar }: { src: string | undefined; estado: EstadoEnvio; etiqueta: string; alTocar: () => void }) {
  const e = ETIQUETA[estado];
  return (
    <button type="button" onClick={alTocar} aria-label={`${etiqueta}, ${e.texto}`} className="relative aspect-square overflow-hidden rounded-xl bg-pista active:opacity-80">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <span className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-white ${e.clase}`}>{e.texto}</span>
    </button>
  );
}

/** Foto guardada en el celular que todavía no se envió (o que el servidor rechazó). */
export function MiniaturaEnvio({ envio, alTocar }: { envio: EnvioFoto; alTocar: () => void }) {
  const src = useUrlLocal(envio.mini);
  return <Miniatura src={src} estado={envio.error ? "error" : "pendiente"} etiqueta={`Foto de las ${hora(envio.tomadaEn)}`} alTocar={alTocar} />;
}
