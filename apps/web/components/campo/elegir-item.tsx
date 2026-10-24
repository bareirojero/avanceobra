"use client";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CloudRain, Drone, Search, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { Item } from "@registro-obra/contrato";
import { nombreItem } from "@/lib/datos";
import { buscarItems, cantidadDeHojas, especiales, hijos, rubro } from "@/lib/itemizado";
import { Hoja } from "./base";

const ICONO: Record<string, LucideIcon> = { incidente: TriangleAlert, dron: Drone, pluviometro: CloudRain };

/**
 * Elegir el ítem de la foto (o el sector de un pedido), como en la app: arriba el buscador;
 * sin buscar, las entradas fijas (incidente, dron, pluviómetro), los usados hace poco y el
 * itemizado por rubros. Los títulos no se eligen, solo agrupan.
 */
export function ElegirItem({
  titulo = "¿Qué ítem es?",
  subtitulo,
  items,
  recientes,
  elegido,
  alElegir,
  cerrar,
}: {
  titulo?: string;
  subtitulo?: string;
  items: Item[];
  recientes: string[];
  elegido: string | null;
  alElegir: (id: string) => void;
  cerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const rubroAbierto = abierto ? items.find((i) => i.id === abierto) : undefined;
  const fijas = useMemo(() => especiales(items), [items]);
  const buscando = !!texto.trim();

  const filas = useMemo(() => {
    if (buscando) return { usados: [], lista: buscarItems(items, texto), conRubro: true };
    if (abierto) return { usados: [], lista: hijos(items, abierto), conRubro: false };
    const usados = recientes.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i && !i.es_titulo);
    return { usados, lista: hijos(items, null), conRubro: false };
  }, [items, recientes, texto, abierto, buscando]);

  const fila = (i: Item, conRubro: boolean, clave = i.id) =>
    i.es_titulo ? (
      <button
        key={clave}
        type="button"
        onClick={() => {
          setTexto("");
          setAbierto(i.id);
        }}
        className="flex min-h-14 w-full items-center gap-3 rounded-[14px] bg-superficie px-4 py-3 text-left active:bg-pista"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{i.descripcion}</span>
          <span className="block text-sm text-tenue">{cantidadDeHojas(items, i.id) === 1 ? "1 ítem" : `${cantidadDeHojas(items, i.id)} ítems`}</span>
        </span>
        <ChevronRight size={22} className="shrink-0 text-tenue" />
      </button>
    ) : (
      <button
        key={clave}
        type="button"
        role="radio"
        aria-checked={elegido === i.id}
        onClick={() => alElegir(i.id)}
        className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left ${
          elegido === i.id ? "bg-tinta text-white" : "bg-superficie active:bg-pista"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{nombreItem(i)}</span>
          {conRubro && rubro(items, i.id) && (
            <span className={`block truncate text-sm ${elegido === i.id ? "text-sobre-tinta-tenue" : "text-tenue"}`}>{rubro(items, i.id)}</span>
          )}
        </span>
        {elegido === i.id && <Check size={22} className="shrink-0" />}
      </button>
    );

  return (
    <Hoja titulo={titulo} subtitulo={subtitulo} cerrar={cerrar} volver>
      <div className="flex flex-col gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <label className="flex h-12 items-center gap-2 rounded-[14px] border border-borde-fuerte bg-superficie px-3 focus-within:border-plano">
          <Search size={20} className="shrink-0 text-tenue" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por número o nombre"
            autoCorrect="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          {texto && (
            <button type="button" onClick={() => setTexto("")} aria-label="Borrar búsqueda" className="p-1 text-tenue">
              <X size={20} />
            </button>
          )}
        </label>

        {!buscando && !rubroAbierto && fijas.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {fijas.map((i) => {
              const Icono = ICONO[i.categoria] ?? Check;
              const esElegido = elegido === i.id;
              const incidente = i.categoria === "incidente";
              return (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={esElegido}
                  onClick={() => alElegir(i.id)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[14px] border-2 px-2 py-2 text-center text-sm font-semibold ${
                    esElegido
                      ? incidente
                        ? "border-peligro bg-peligro text-white"
                        : "border-tinta bg-tinta text-white"
                      : incidente
                        ? "border-peligro/40 bg-peligro-suave text-peligro-texto"
                        : "border-transparent bg-superficie"
                  }`}
                >
                  <Icono size={24} />
                  {i.descripcion}
                </button>
              );
            })}
          </div>
        )}

        {!buscando && rubroAbierto && (
          <button
            type="button"
            onClick={() => setAbierto(rubroAbierto.padre_id ?? null)}
            className="flex min-h-14 items-center gap-2 rounded-[14px] bg-pista px-2 py-2 text-left"
            aria-label="Volver al rubro anterior"
          >
            <ChevronLeft size={26} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {rubroAbierto.padre_id && <span className="block truncate text-sm text-tenue">{rubro(items, rubroAbierto.id)}</span>}
              <span className="block font-display font-bold">{rubroAbierto.descripcion}</span>
            </span>
          </button>
        )}

        {filas.usados.length > 0 && (
          <>
            <p className="sobretitulo mt-2 px-1">Usados hace poco</p>
            {filas.usados.map((i) => fila(i, true, `r-${i.id}`))}
            <p className="sobretitulo mt-2 px-1">Por rubro</p>
          </>
        )}
        {filas.lista.map((i) => fila(i, filas.conRubro))}
        {buscando && filas.lista.length === 0 && <p className="px-1 py-4 text-tenue">No hay ítems con “{texto.trim()}”.</p>}
        {!buscando && items.length === 0 && <p className="px-1 py-4 text-tenue">La obra todavía no tiene itemizado cargado.</p>}
      </div>
    </Hoja>
  );
}
