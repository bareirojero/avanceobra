"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Package, RotateCw, Trash2 } from "lucide-react";
import type { Item, MisFotosRespuesta } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { descartarEnvio, escucharEnviados, reintentar, useCola, type EnvioFoto, type EnvioPedido } from "@/lib/cola-campo";
import { useItems } from "@/lib/datos";
import { fechaLarga, hoy, hora } from "@/lib/formato";
import { cantidadTexto } from "@/lib/itemizado";
import { Miniatura, MiniaturaEnvio } from "@/components/campo/base";
import { VerFoto } from "@/components/campo/ver-foto";

/**
 * Envíos: lo que espera señal arriba, y debajo mis fotos de todos los días, del más nuevo
 * al más viejo. Solo las de hoy se pueden corregir.
 */
export default function Envios() {
  const { id: obraId } = useParams<{ id: string }>();
  const cola = useCola();
  const { items } = useItems(obraId);
  const [abierto, setAbierto] = useState<string | null>(null);
  const fotos = cola.envios.filter((e): e is EnvioFoto => e.tipo === "foto" && e.obraId === obraId);
  const pedidos = cola.envios.filter((e): e is EnvioPedido => e.tipo === "pedido" && e.obraId === obraId);
  const envioAbierto = fotos.find((e) => e.id === abierto);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      {(fotos.length > 0 || pedidos.length > 0) && (
        <section className="mb-6 flex flex-col gap-2">
          <h2 className="titulo text-lg">Esperando para enviar</h2>
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((e) => (
                <MiniaturaEnvio key={e.id} envio={e} alTocar={() => setAbierto(e.id)} />
              ))}
            </div>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="tarjeta flex items-center gap-3 px-4 py-3">
              <Package size={20} className="shrink-0 text-tenue" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {cantidadTexto(p.pedido.cantidad)} {p.unidad ?? ""} · {p.material}
                </p>
                <p className={`text-sm ${p.error ? "text-peligro-texto" : "text-pendiente-texto"}`}>{p.error ? `No se envió: ${p.error}` : "En espera"}</p>
              </div>
              {p.error && (
                <>
                  <button type="button" aria-label="Reintentar" className="grid size-10 place-items-center rounded-full bg-pista" onClick={() => void reintentar(p.id)}>
                    <RotateCw size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Descartar pedido"
                    className="grid size-10 place-items-center rounded-full bg-peligro-suave text-peligro-texto"
                    onClick={() => confirm("¿Descartar este pedido? No se envió.") && void descartarEnvio(p.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <h2 className="titulo mb-1 text-lg">Mis fotos</h2>
      <p className="mb-3 text-sm text-tenue">Solo las fotos de hoy se pueden corregir.</p>
      <MisFotos obraId={obraId} items={items} />

      {envioAbierto && <VerFoto envio={envioAbierto} items={items} cerrar={() => setAbierto(null)} />}
    </div>
  );
}

/** Mis fotos de todos los días (GET /mis-fotos), de a 7 días con fotos. */
function MisFotos({ obraId, items }: { obraId: string; items: Item[] }) {
  const fecha = hoy();
  const { data, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<MisFotosRespuesta>(
    (i, anterior: MisFotosRespuesta | null) =>
      i === 0 ? `/obras/${obraId}/mis-fotos` : anterior?.siguiente ? `/obras/${obraId}/mis-fotos?antes=${anterior.siguiente}` : null,
    api.get,
    { revalidateFirstPage: true },
  );
  const [abierta, setAbierta] = useState<string | null>(null);
  // Al terminar de enviar una foto aparece acá.
  useEffect(() => escucharEnviados(() => void mutate()), [mutate]);

  const dias = (data ?? []).flatMap((p) => p.dias);
  const hayMas = !!data?.[data.length - 1]?.siguiente;
  const dia = dias.find((d) => d.fotos.some((f) => f.id === abierta));
  const foto = dia?.fotos.find((f) => f.id === abierta);

  return (
    <>
      {!isLoading && dias.length === 0 && <p className="text-tenue">Todavía no enviaste fotos en esta obra.</p>}
      <div className="flex flex-col gap-5">
        {dias.map((d) => (
          <section key={d.fecha}>
            <h3 className="mb-2 font-semibold first-letter:uppercase">
              {fechaLarga(d.fecha)} <span className="font-normal text-tenue">· {d.fotos.length === 1 ? "1 foto" : `${d.fotos.length} fotos`}</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {d.fotos.map((f) => (
                <Miniatura key={f.id} src={f.miniatura_url} estado="enviada" etiqueta={`Foto de las ${hora(f.tomada_en)}`} alTocar={() => setAbierta(f.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {(hayMas || isLoading) && (
        <button type="button" className="boton-secundario mt-5 h-12 w-full" disabled={isValidating} onClick={() => setSize(size + 1)}>
          {isValidating ? "Cargando…" : "Ver días anteriores"}
        </button>
      )}
      {foto && dia && (
        <VerFoto
          foto={foto}
          fecha={dia.fecha}
          anotaciones={foto.anotaciones}
          editable={dia.fecha === fecha}
          alCambiar={() => void mutate()}
          items={items}
          cerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}
