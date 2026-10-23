"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { iniciales } from "@/lib/formato";
import type { EstadoInforme } from "@registro-obra/contrato";

export function Avatar({ nombre, chico, oscuro }: { nombre: string; chico?: boolean; oscuro?: boolean }) {
  return (
    <span
      title={nombre}
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-superficie ${
        oscuro ? "bg-tinta" : "bg-tenue"
      } ${chico ? "size-7 text-xs" : "size-8 text-[13px]"}`}
    >
      {iniciales(nombre)}
    </span>
  );
}

const ESTADO_INFORME: Record<EstadoInforme, { texto: string; clase: string }> = {
  generando: { texto: "Armando…", clase: "bg-pista text-tinta" },
  borrador: { texto: "Borrador", clase: "bg-plano-suave text-plano-texto" },
  publicado: { texto: "Publicado", clase: "bg-ok-suave text-ok-texto" },
  error: { texto: "Error", clase: "bg-peligro-suave text-peligro-texto" },
};

export function ChipEstado({ estado }: { estado: EstadoInforme }) {
  const e = ESTADO_INFORME[estado];
  return <span className={`inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-bold ${e.clase}`}>{e.texto}</span>;
}

/** El informe lo armó el sistema a las 23:55 porque nadie lo había generado ese día. */
export function ChipAutomatico() {
  return (
    <span
      title="Nadie lo había armado a las 23:55 y el sistema lo generó solo. Revisalo antes de publicar."
      className="inline-flex h-[30px] items-center rounded-full bg-fondo px-3 text-[13px] font-bold text-tenue"
    >
      Automático
    </span>
  );
}

export function Numero({ titulo, valor, peligro }: { titulo: string; valor: React.ReactNode; peligro?: boolean }) {
  return (
    <div className="tarjeta flex flex-col gap-1 px-5 py-4">
      <span className="text-sm text-tenue">{titulo}</span>
      <span className={`titulo text-[32px] leading-tight ${peligro ? "text-peligro" : ""}`}>{valor}</span>
    </div>
  );
}

export function Modal({
  titulo,
  abierto,
  cerrar,
  children,
  ancho = "max-w-lg",
}: {
  titulo: string;
  abierto: boolean;
  cerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4" onClick={cerrar}>
      <div
        role="dialog"
        aria-label={titulo}
        className={`tarjeta max-h-[90vh] w-full overflow-auto shadow-xl ${ancho}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="titulo text-lg">{titulo}</h2>
          <button onClick={cerrar} className="rounded p-1 text-tenue hover:bg-fondo" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Vacio({ icono, titulo, texto, children }: { icono: React.ReactNode; titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-fondo text-tenue">{icono}</div>
      <h3 className="titulo text-lg">{titulo}</h3>
      <p className="mt-1 max-w-sm text-tenue">{texto}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Encabezado({ miga, titulo, children }: { miga?: React.ReactNode; titulo: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {miga && <span className="text-sm text-tenue">{miga}</span>}
        <h1 className="titulo text-[28px] leading-tight first-letter:uppercase md:text-[36px]">{titulo}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}
