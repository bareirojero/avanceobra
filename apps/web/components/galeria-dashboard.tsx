"use client";
// Galería del Dashboard: pasa sola por las fotos del día; al tocar una se abre el visor.
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Maximize2, Pause, Play } from "lucide-react";
import type { FotoDashboard } from "@registro-obra/contrato";
import { hora } from "@/lib/formato";
import { VisorFotos } from "./visor-fotos";

const CADA_MS = 4500;

export function GaleriaDashboard({ fotos, titulo }: { fotos: FotoDashboard[]; titulo: string }) {
  const [n, setN] = useState(0);
  const [corriendo, setCorriendo] = useState(true);
  const [encima, setEncima] = useState(false);
  const [visor, setVisor] = useState<number | null>(null);
  const tira = useRef<HTMLDivElement>(null);
  const actual = fotos[n];

  // Si al refrescar llegan menos fotos, vuelve a la primera.
  useEffect(() => {
    if (n >= fotos.length && n > 0) setN(0);
  }, [n, fotos.length]);

  useEffect(() => {
    if (!corriendo || encima || visor !== null || fotos.length < 2) return;
    const t = setInterval(() => setN((k) => (k + 1) % fotos.length), CADA_MS);
    return () => clearInterval(t);
  }, [corriendo, encima, visor, fotos.length]);

  // La miniatura activa queda a la vista en la tira.
  useEffect(() => {
    const el = tira.current?.children[n] as HTMLElement | undefined;
    const caja = tira.current;
    if (el && caja) caja.scrollTo({ left: el.offsetLeft - caja.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [n]);

  const ir = (d: number) => setN((k) => (k + d + fotos.length) % fotos.length);

  return (
    <section className="tarjeta flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="titulo text-lg font-bold">{titulo}</h2>
        {fotos.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-tenue">
              {n + 1} de {fotos.length}
            </span>
            <button className="boton-secundario h-9 text-sm" onClick={() => setCorriendo((c) => !c)}>
              {corriendo ? <Pause size={16} /> : <Play size={16} />} {corriendo ? "Pausar" : "Reproducir"}
            </button>
          </div>
        )}
      </div>

      {!actual ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-fondo px-6 py-14 text-center">
          <Camera className="text-tenue" size={28} />
          <p className="font-semibold">Todavía no llegaron fotos de campo</p>
        </div>
      ) : (
        <>
          <div
            className="group relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#0b1220]"
            onMouseEnter={() => setEncima(true)}
            onMouseLeave={() => setEncima(false)}
          >
            {fotos.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.id}
                src={Math.abs(i - n) <= 1 || (n === fotos.length - 1 && i === 0) ? f.archivo_url : f.miniatura_url}
                alt={f.item ?? "Foto del día"}
                className={`absolute inset-0 size-full object-contain transition-opacity duration-700 ${i === n ? "opacity-100" : "pointer-events-none opacity-0"}`}
              />
            ))}
            <button
              className="absolute inset-0 cursor-zoom-in"
              aria-label="Ver la foto en grande"
              onClick={() => setVisor(n)}
            />
            <span className="pointer-events-none absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 size={16} />
            </span>
            {fotos.length > 1 && (
              <>
                <FlechaGaleria etiqueta="Foto anterior" lado="left-3" onClick={() => ir(-1)}>
                  <ChevronLeft size={24} />
                </FlechaGaleria>
                <FlechaGaleria etiqueta="Foto siguiente" lado="right-3" onClick={() => ir(1)}>
                  <ChevronRight size={24} />
                </FlechaGaleria>
              </>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-white">
              {actual.item && <div className="truncate font-semibold">{actual.item}</div>}
              <div className="truncate text-sm text-white/80">
                {actual.autor} · {hora(actual.tomada_en)}
                {actual.comentario ? ` · ${actual.comentario}` : ""}
              </div>
            </div>
          </div>

          {fotos.length > 1 && (
            <div ref={tira} className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Fotos del día">
              {fotos.map((f, i) => (
                <button
                  key={f.id}
                  role="listitem"
                  aria-label={`Foto ${i + 1}${f.item ? `: ${f.item}` : ""}`}
                  aria-current={i === n}
                  onClick={() => setN(i)}
                  onDoubleClick={() => setVisor(i)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${i === n ? "border-plano" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.miniatura_url} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {visor !== null && (
        <VisorFotos
          fotos={fotos.map((f) => ({ foto: f, src: f.archivo_url, anotaciones: [], autor: f.autor, detalle: f.item ?? undefined }))}
          inicial={visor}
          cerrar={() => {
            setVisor(null);
          }}
        />
      )}
    </section>
  );
}

function FlechaGaleria({ etiqueta, lado, onClick, children }: { etiqueta: string; lado: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      className={`absolute ${lado} top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white hover:bg-black/65`}
    >
      {children}
    </button>
  );
}
