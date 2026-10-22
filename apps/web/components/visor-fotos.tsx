"use client";
// Visor a pantalla completa: zoom con la rueda, los botones, doble clic o pellizco,
// y arrastre para moverse por la foto ampliada. Flechas para pasar de foto.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { Anotacion, Foto } from "@registro-obra/contrato";
import { hora } from "@/lib/formato";
import { FotoAnotada, NumeroMarca, proporcion } from "./foto-anotada";

const MIN = 1;
const MAX = 6;
const limitar = (z: number) => Math.min(MAX, Math.max(MIN, z));

export interface FotoEnVisor {
  foto: Foto;
  src: string | undefined;
  anotaciones: Anotacion[];
  autor: string;
  /** "4 · Excavación de zanja · Eje A" */
  detalle?: string;
}

export function VisorFotos({ fotos, inicial, cerrar }: { fotos: FotoEnVisor[]; inicial: number; cerrar: () => void }) {
  const [n, setN] = useState(inicial);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [activa, setActiva] = useState<number>();
  const area = useRef<HTMLDivElement>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ distancia: number; zoom: number } | null>(null);
  const actual = fotos[n];

  const reiniciar = useCallback(() => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, []);
  const ir = useCallback(
    (d: number) => {
      setN((k) => (k + d + fotos.length) % fotos.length);
      setActiva(undefined);
      reiniciar();
    },
    [fotos.length, reiniciar],
  );

  /** Amplía manteniendo fijo el punto (cx, cy) de la pantalla, relativo al centro del área. */
  const ampliar = useCallback((nuevo: number, cx = 0, cy = 0) => {
    setZoom((z) => {
      const destino = limitar(nuevo);
      const f = destino / z;
      setPos((p) => (destino === 1 ? { x: 0, y: 0 } : { x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f }));
      return destino;
    });
  }, []);

  const relativo = (e: { clientX: number; clientY: number }) => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
      else if (e.key === "+" || e.key === "=") ampliar(zoom * 1.5);
      else if (e.key === "-") ampliar(zoom / 1.5);
      else if (e.key === "0") reiniciar();
    };
    window.addEventListener("keydown", tecla);
    const desborde = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = desborde;
    };
  }, [cerrar, ir, ampliar, reiniciar, zoom]);

  // La rueda necesita un listener no pasivo para evitar el scroll de la página.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const p = relativo(e);
      ampliar(zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [ampliar, zoom]);

  if (!actual) return null;
  const marcasConTexto = actual.anotaciones.filter((a) => a.comentario);

  return (
    <div role="dialog" aria-modal aria-label="Visor de fotos" className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220] text-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {actual.autor} · {hora(actual.foto.tomada_en)}
          </div>
          {actual.detalle && <div className="truncate text-sm text-white/70">{actual.detalle}</div>}
        </div>
        {fotos.length > 1 && (
          <span className="text-sm tabular-nums text-white/70">
            {n + 1} de {fotos.length}
          </span>
        )}
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
          <BotonVisor etiqueta="Alejar" onClick={() => ampliar(zoom / 1.5)} disabled={zoom <= MIN}>
            <Minus size={18} />
          </BotonVisor>
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <BotonVisor etiqueta="Acercar" onClick={() => ampliar(zoom * 1.5)} disabled={zoom >= MAX}>
            <Plus size={18} />
          </BotonVisor>
          <BotonVisor etiqueta="Tamaño original" onClick={reiniciar} disabled={zoom === 1}>
            <RotateCcw size={16} />
          </BotonVisor>
        </div>
        <BotonVisor etiqueta="Cerrar" onClick={cerrar}>
          <X size={22} />
        </BotonVisor>
      </div>

      <div
        ref={area}
        className={`relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        onDoubleClick={(e) => {
          const p = relativo(e);
          if (zoom > 1) reiniciar();
          else ampliar(2.5, p.x, p.y);
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (punteros.current.size === 2) {
            const [a, b] = [...punteros.current.values()];
            gesto.current = { distancia: Math.hypot(a.x - b.x, a.y - b.y), zoom };
          }
        }}
        onPointerMove={(e) => {
          const previo = punteros.current.get(e.pointerId);
          if (!previo) return;
          punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (punteros.current.size === 2 && gesto.current) {
            // Pellizco: zoom alrededor del punto medio de los dos dedos.
            const [a, b] = [...punteros.current.values()];
            const medio = relativo({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
            ampliar((gesto.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / gesto.current.distancia, medio.x, medio.y);
          } else if (zoom > 1) {
            setPos((p) => ({ x: p.x + e.clientX - previo.x, y: p.y + e.clientY - previo.y }));
          }
        }}
        onPointerUp={(e) => {
          punteros.current.delete(e.pointerId);
          if (punteros.current.size < 2) gesto.current = null;
        }}
        onPointerCancel={(e) => punteros.current.delete(e.pointerId)}
      >
        <div
          className="will-change-transform"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
            transition: punteros.current.size ? "none" : "transform 120ms ease-out",
            // La foto entra entera en el área, con su proporción.
            width: `min(calc(100vw - 32px), calc((100vh - 200px) * ${proporcion(actual.foto)}))`,
          }}
        >
          <FotoAnotada foto={actual.foto} src={actual.src} anotaciones={actual.anotaciones} activa={activa} alActivar={setActiva} className="rounded-sm" />
        </div>
        {fotos.length > 1 && (
          <>
            <BotonVisor etiqueta="Foto anterior" onClick={() => ir(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40">
              <ChevronLeft size={26} />
            </BotonVisor>
            <BotonVisor etiqueta="Foto siguiente" onClick={() => ir(1)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40">
              <ChevronRight size={26} />
            </BotonVisor>
          </>
        )}
      </div>

      {(actual.foto.comentario || marcasConTexto.length > 0) && (
        <div className="max-h-[30vh] overflow-auto border-t border-white/10 px-4 py-3 text-[15px] leading-relaxed">
          {actual.foto.comentario && <p className="m-0">{actual.foto.comentario}</p>}
          {marcasConTexto.length > 0 && (
            <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
              {marcasConTexto.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 ${activa === a.numero ? "bg-white/15" : ""}`}
                  onMouseEnter={() => setActiva(a.numero)}
                  onMouseLeave={() => setActiva(undefined)}
                >
                  <span className={activa === a.numero ? "text-tinta" : "text-white [&>span]:border-white"}>
                    <NumeroMarca n={a.numero} activa={activa === a.numero} />
                  </span>
                  {a.comentario}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BotonVisor({
  etiqueta,
  onClick,
  disabled,
  className = "",
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`grid size-10 place-items-center rounded-full hover:bg-white/15 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
