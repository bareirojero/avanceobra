"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Package, RotateCw, Trash2 } from "lucide-react";
import type { DiaRespuesta, Foto } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { descartarEnvio, escucharEnviados, reintentar, useCola, type EnvioFoto, type EnvioPedido } from "@/lib/cola-campo";
import { useItems, useUrls, useYo } from "@/lib/datos";
import { fechaLarga, hoy, hora, sumarDias } from "@/lib/formato";
import { cantidadTexto } from "@/lib/itemizado";
import { Miniatura, MiniaturaEnvio } from "@/components/campo/base";
import { VerFoto } from "@/components/campo/ver-foto";

const DIAS_POR_TANDA = 7;

/**
 * Envíos: lo que espera señal arriba, y debajo mis fotos de todos los días, del más nuevo
 * al más viejo. Solo las de hoy se pueden corregir.
 */
export default function Envios() {
  const { id: obraId } = useParams<{ id: string }>();
  const cola = useCola();
  const { items } = useItems(obraId);
  const [dias, setDias] = useState(DIAS_POR_TANDA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const fecha = hoy();

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
      <div className="flex flex-col gap-5">
        {Array.from({ length: dias }, (_, i) => (
          <DiaMio key={i} obraId={obraId} fecha={sumarDias(fecha, -i)} editable={i === 0} items={items} />
        ))}
      </div>
      <button type="button" className="boton-secundario mt-5 h-12 w-full" onClick={() => setDias(dias + DIAS_POR_TANDA)}>
        Ver días anteriores
      </button>

      {envioAbierto && <VerFoto envio={envioAbierto} items={items} cerrar={() => setAbierto(null)} />}
    </div>
  );
}

function DiaMio({ obraId, fecha, editable, items }: { obraId: string; fecha: string; editable: boolean; items: ReturnType<typeof useItems>["items"] }) {
  const { yo } = useYo();
  const { data, mutate } = useSWR<DiaRespuesta>(`/obras/${obraId}/dia/${fecha}`, api.get, { revalidateOnFocus: editable });
  const [abierta, setAbierta] = useState<string | null>(null);
  // Hoy: al terminar de enviar una foto aparece acá.
  useEffect(() => (editable ? escucharEnviados(() => void mutate()) : undefined), [editable, mutate]);
  const mias = (data?.fotos ?? []).filter((f) => f.autor_id === yo?.usuario.id && !f.eliminado_en).sort((a, b) => b.tomada_en.localeCompare(a.tomada_en));
  const urls = useUrls(mias.map((f) => f.miniatura_path));
  if (!mias.length) return null;
  const foto: Foto | undefined = mias.find((f) => f.id === abierta);

  return (
    <section>
      <h3 className="mb-2 font-semibold first-letter:uppercase">
        {fechaLarga(fecha)} <span className="font-normal text-tenue">· {mias.length === 1 ? "1 foto" : `${mias.length} fotos`}</span>
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {mias.map((f) => (
          <Miniatura key={f.id} src={urls[f.miniatura_path]} estado="enviada" etiqueta={`Foto de las ${hora(f.tomada_en)}`} alTocar={() => setAbierta(f.id)} />
        ))}
      </div>
      {foto && (
        <VerFoto
          foto={foto}
          fecha={fecha}
          anotaciones={(data?.anotaciones ?? []).filter((a) => a.foto_id === foto.id && !a.eliminado_en)}
          editable={editable}
          alCambiar={() => void mutate()}
          items={items}
          cerrar={() => setAbierta(null)}
        />
      )}
    </section>
  );
}
