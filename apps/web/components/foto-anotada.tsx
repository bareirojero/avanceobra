"use client";
import type { Anotacion, Foto } from "@registro-obra/contrato";

/** Dónde va el número de la marca, igual que en la app de campo (domain/marcas.ts). */
function posicionNumero(a: Anotacion, proporcionFoto: number): { x: number; y: number } {
  const g = a.geometria;
  // Círculo: arriba a la derecha, sobre el borde, para no tapar la zona marcada.
  if ("cx" in g) return { x: g.cx + g.r * Math.SQRT1_2, y: g.cy - g.r * Math.SQRT1_2 * proporcionFoto };
  if ("w" in g) return { x: g.x + g.w, y: g.y };
  if ("x1" in g) return { x: g.x1, y: g.y1 };
  if ("puntos" in g) return { x: g.puntos[0]?.[0] ?? 0.5, y: g.puntos[0]?.[1] ?? 0.5 };
  return { x: g.x, y: g.y };
}

/** Proporción ancho/alto de la foto (4:3 si no se conoce). */
export const proporcion = (f: Pick<Foto, "ancho" | "alto">) => (f.ancho && f.alto ? f.ancho / f.alto : 4 / 3);

/** Trazos de las marcas (círculo, recuadro, flecha, trazo) como en la app: blanco con borde oscuro. */
function Trazos({ anotaciones, proporcionFoto, activa }: { anotaciones: Anotacion[]; proporcionFoto: number; activa?: number }) {
  const W = 1000;
  const H = W / proporcionFoto;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {anotaciones.map((a) => {
        const g = a.geometria;
        const capas = [
          { stroke: "#0f1f3c", strokeWidth: 6, strokeOpacity: 0.55 },
          { stroke: activa === a.numero ? "#F5B700" : "#FFFFFF", strokeWidth: 3, strokeOpacity: 1 },
        ].map((c) => ({ ...c, fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }));
        let forma: React.ReactNode = null;
        if ("cx" in g) forma = capas.map((c, k) => <ellipse key={k} cx={g.cx * W} cy={g.cy * H} rx={g.r * W} ry={g.r * W} {...c} />);
        else if ("w" in g) forma = capas.map((c, k) => <rect key={k} x={g.x * W} y={g.y * H} width={g.w * W} height={g.h * H} rx={8} {...c} />);
        else if ("x1" in g) {
          const [ax, ay, bx, by] = [g.x1 * W, g.y1 * H, g.x2 * W, g.y2 * H];
          const ang = Math.atan2(by - ay, bx - ax);
          const ala = (giro: number) => `${bx - 28 * Math.cos(ang + giro)},${by - 28 * Math.sin(ang + giro)}`;
          forma = (
            <>
              {capas.map((c, k) => <line key={k} x1={ax} y1={ay} x2={bx} y2={by} {...c} />)}
              <polygon points={`${bx},${by} ${ala(0.45)} ${ala(-0.45)}`} fill={capas[1].stroke} stroke="#0f1f3c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </>
          );
        } else if ("puntos" in g) forma = capas.map((c, k) => <polyline key={k} points={g.puntos.map(([x, y]) => `${x * W},${y * H}`).join(" ")} {...c} />);
        return <g key={a.id}>{forma}</g>;
      })}
    </svg>
  );
}

/**
 * Foto con las marcas numeradas que dibujó el usuario de campo. La caja toma la
 * proporción de la foto, así las marcas caen exactas. La activa va en acento.
 */
export function FotoAnotada({
  foto,
  src,
  anotaciones,
  activa,
  alActivar,
  alAbrir,
  maxAlto,
  className = "",
}: {
  foto: Pick<Foto, "comentario" | "ancho" | "alto">;
  /** URL firmada de la imagen. */
  src: string | undefined;
  anotaciones: Anotacion[];
  activa?: number;
  alActivar?: (n?: number) => void;
  /** Abre el visor a pantalla completa. */
  alAbrir?: () => void;
  /** Alto máximo en px: la foto se achica a lo ancho para no pasarlo. */
  maxAlto?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-pista ${alAbrir ? "cursor-zoom-in" : ""} ${className}`}
      style={{ aspectRatio: proporcion(foto), ...(maxAlto ? { width: "100%", maxWidth: maxAlto * proporcion(foto) } : {}) }}
      onClick={alAbrir}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={foto.comentario ?? "Foto de obra"} draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
      <Trazos anotaciones={anotaciones} proporcionFoto={proporcion(foto)} activa={activa} />
      {anotaciones.map((a) => {
        const { x, y } = posicionNumero(a, proporcion(foto));
        return (
          <button
            key={a.id}
            type="button"
            aria-label={`Marca ${a.numero}: ${a.comentario ?? ""}`}
            onClick={(e) => {
              e.stopPropagation();
              alActivar?.(a.numero);
            }}
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
