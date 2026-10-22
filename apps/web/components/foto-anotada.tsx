"use client";
import type { Anotacion, Foto } from "@registro-obra/contrato";

/** Centro de la marca según su geometría (coordenadas 0..1 del contrato). */
function centro(a: Anotacion): { x: number; y: number } {
  const g = a.geometria;
  if ("cx" in g) return { x: g.cx, y: g.cy };
  if ("w" in g) return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  if ("x2" in g) return { x: g.x2, y: g.y2 };
  if ("puntos" in g) return { x: g.puntos[0]?.[0] ?? 0.5, y: g.puntos[0]?.[1] ?? 0.5 };
  return { x: g.x, y: g.y };
}

/** Foto con las marcas numeradas que dibujó el usuario de campo. La activa va en acento. */
export function FotoAnotada({
  foto,
  src,
  anotaciones,
  activa,
  alActivar,
  className = "",
}: {
  foto: Pick<Foto, "comentario">;
  /** URL firmada de la imagen. */
  src: string | undefined;
  anotaciones: Anotacion[];
  activa?: number;
  alActivar?: (n?: number) => void;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-pista ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={foto.comentario ?? "Foto de obra"} className="absolute inset-0 h-full w-full object-cover" />}
      {anotaciones.map((a) => {
        const { x, y } = centro(a);
        return (
          <button
            key={a.id}
            type="button"
            aria-label={`Marca ${a.numero}: ${a.comentario ?? ""}`}
            onMouseEnter={() => alActivar?.(a.numero)}
            onMouseLeave={() => alActivar?.(undefined)}
            onFocus={() => alActivar?.(a.numero)}
            className={`absolute grid size-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-tinta font-display text-sm font-extrabold text-tinta transition-transform ${
              activa === a.numero ? "scale-110 bg-acento" : "bg-white"
            }`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            {a.numero}
          </button>
        );
      })}
    </div>
  );
}

export function NumeroMarca({ n, activa }: { n: number; activa?: boolean }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold ${
        activa ? "bg-acento" : "border-2 border-tinta"
      }`}
    >
      {n}
    </span>
  );
}
