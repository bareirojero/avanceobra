"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { PackagePlus } from "lucide-react";
import type { PedidoMaterialDetalle } from "@registro-obra/contrato";
import { escucharEnviados, useCola, type EnvioPedido } from "@/lib/cola-campo";
import { nombreItem, usePedidos, useYo } from "@/lib/datos";
import { fechaLarga, fechaNumerica, hora } from "@/lib/formato";
import { cantidadTexto } from "@/lib/itemizado";

/** Estados del pedido que marca el editor (los mismos colores que la app de Android). */
const ESTADOS: Record<string, { texto: string; clase: string }> = {
  enviado: { texto: "Enviado", clase: "bg-[#fff3c4] text-[#7a5a00]" },
  rechazado: { texto: "Rechazado", clase: "bg-peligro-suave text-peligro-texto" },
  planificando: { texto: "Planificando", clase: "bg-[#ffe8cc] text-[#9a4a00]" },
  en_compra: { texto: "En compra", clase: "bg-[#f9d3b4] text-[#7c2d06]" },
  disponible: { texto: "Disponible en obra", clase: "bg-ok-suave text-ok-texto" },
};

/** Fecha de Paraguay de un instante (AAAA-MM-DD). */
const fechaDe = (instante: string) => new Date(new Date(instante).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

/** Materiales: mis pedidos agrupados por día de pedido, con su estado, y "Pedir material". */
export default function Materiales() {
  const { id: obraId } = useParams<{ id: string }>();
  const { yo } = useYo();
  const { pedidos, cargando, mutate } = usePedidos(obraId);
  const cola = useCola();
  useEffect(() => escucharEnviados((e) => e.tipo === "pedido" && void mutate()), [mutate]);

  const esperando = cola.envios.filter((e): e is EnvioPedido => e.tipo === "pedido" && e.obraId === obraId);
  const porDia = useMemo(() => {
    const grupos = new Map<string, PedidoMaterialDetalle[]>();
    for (const p of pedidos.filter((p) => p.autor_id === yo?.usuario.id)) {
      const f = fechaDe(p.pedido_en);
      grupos.set(f, [...(grupos.get(f) ?? []), p]);
    }
    return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [pedidos, yo]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="titulo mb-3 text-lg">Mis pedidos</h2>
        {esperando.length > 0 && (
          <section className="mb-5 flex flex-col gap-2">
            <h3 className="font-semibold">Esperando para enviar</h3>
            {esperando.map((p) => (
              <div key={p.id} className="tarjeta flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {cantidadTexto(p.pedido.cantidad)} {p.unidad ?? ""} · {p.material}
                  </p>
                  {p.error && <p className="text-sm text-peligro-texto">No se envió: {p.error}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.error ? "bg-peligro-suave text-peligro-texto" : "bg-pendiente-suave text-pendiente-texto"}`}>
                  {p.error ? "Error" : "En espera"}
                </span>
              </div>
            ))}
          </section>
        )}
        {porDia.length === 0 && esperando.length === 0 && (
          <p className="text-tenue">{cargando ? "Cargando…" : "Todavía no pediste materiales. Tocá “Pedir material” para empezar."}</p>
        )}
        <div className="flex flex-col gap-5">
          {porDia.map(([fecha, lista]) => (
            <section key={fecha} className="flex flex-col gap-2">
              <h3 className="font-semibold first-letter:uppercase">
                {fechaLarga(fecha)} <span className="font-normal text-tenue">· {fechaNumerica(fecha)}</span>
              </h3>
              {lista.map((p) => (
                <FilaPedido key={p.id} pedido={p} />
              ))}
            </section>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-4 pt-2 pb-3">
        <Link href={`/campo/${obraId}/materiales/nuevo`} className="boton-principal h-16 w-full text-[19px]">
          <PackagePlus size={26} strokeWidth={2.3} /> Pedir material
        </Link>
      </div>
    </>
  );
}

function FilaPedido({ pedido: p }: { pedido: PedidoMaterialDetalle }) {
  // El estado lo agrega el módulo de estados de pedidos; mientras no esté, todo figura "Enviado".
  const estado = ESTADOS[(p as { estado?: string }).estado ?? "enviado"] ?? ESTADOS.enviado;
  const meta = [
    `a las ${hora(p.pedido_en)}`,
    p.necesario_para ? `para el ${fechaNumerica(p.necesario_para).slice(0, 5)}` : null,
    p.fotos?.length ? (p.fotos.length === 1 ? "1 foto" : `${p.fotos.length} fotos`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="tarjeta flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {cantidadTexto(Number(p.cantidad))} {p.material_unidad ?? ""} · {p.material_descripcion}
        </p>
        <p className="truncate text-sm text-tenue">{nombreItem({ numero: p.item_numero, descripcion: p.item_descripcion })}</p>
        <p className="text-sm text-tenue">{meta}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${estado.clase}`}>{estado.texto}</span>
    </div>
  );
}
