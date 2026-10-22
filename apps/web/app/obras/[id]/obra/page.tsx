"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Obra } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { useObra, useYo } from "@/lib/datos";
import { Encabezado } from "@/components/ui";

type Campos = Pick<Obra, "nombre" | "codigo" | "sigla" | "cliente" | "direccion" | "fecha_inicio" | "fecha_fin_prevista" | "notas_para_informe">;
const CLAVES: (keyof Campos)[] = ["nombre", "codigo", "sigla", "cliente", "direccion", "fecha_inicio", "fecha_fin_prevista", "notas_para_informe"];

/** Datos de la obra que salen en el encabezado del informe. */
export default function DatosObra() {
  const { id } = useParams<{ id: string }>();
  const { obra } = useObra(id);
  const { mutate } = useYo();
  const [datos, setDatos] = useState<Record<keyof Campos, string>>();
  const [estado, setEstado] = useState<"guardando" | "guardado" | string>();

  useEffect(() => {
    if (obra && !datos) setDatos(Object.fromEntries(CLAVES.map((k) => [k, obra[k] ?? ""])) as Record<keyof Campos, string>);
  }, [obra, datos]);

  if (!obra || !datos) return null;
  const cambiar = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDatos({ ...datos, [k]: k === "sigla" ? e.target.value.toUpperCase() : e.target.value });
    setEstado(undefined);
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Datos de la obra" />
      <form
        className="tarjeta grid gap-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setEstado("guardando");
          try {
            await api.cambiarObra(id, Object.fromEntries(CLAVES.map((k) => [k, datos[k].trim() || null])) as Partial<Campos>);
            await mutate();
            setEstado("guardado");
          } catch (err) {
            setEstado(err instanceof Error ? err.message : "No se pudo guardar.");
          }
        }}
      >
        <label>
          <span className="etiqueta">Nombre</span>
          <input className="campo" required value={datos.nombre} onChange={cambiar("nombre")} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="etiqueta">Código SAP</span>
            <input className="campo" value={datos.codigo} onChange={cambiar("codigo")} placeholder="Ej.: OC.0054" />
          </label>
          <label>
            <span className="etiqueta">Sigla para numerar informes</span>
            <input className="campo" maxLength={6} value={datos.sigla} onChange={cambiar("sigla")} placeholder="Ej.: ODD" />
          </label>
          <label>
            <span className="etiqueta">Cliente</span>
            <input className="campo" value={datos.cliente} onChange={cambiar("cliente")} />
          </label>
          <label>
            <span className="etiqueta">Ubicación</span>
            <input className="campo" value={datos.direccion} onChange={cambiar("direccion")} />
          </label>
          <label>
            <span className="etiqueta">Inicio</span>
            <input type="date" className="campo" value={datos.fecha_inicio} onChange={cambiar("fecha_inicio")} />
          </label>
          <label>
            <span className="etiqueta">Fin previsto</span>
            <input type="date" className="campo" value={datos.fecha_fin_prevista} onChange={cambiar("fecha_fin_prevista")} />
          </label>
        </div>
        <label>
          <span className="etiqueta">Notas fijas para el informe</span>
          <textarea className="campo" rows={3} value={datos.notas_para_informe} onChange={cambiar("notas_para_informe")} placeholder="Ej.: nombres de ejes, cómo se llama cada sector" />
        </label>
        <div className="flex items-center justify-end gap-3">
          {estado && estado !== "guardando" && (
            <span className={`text-sm font-semibold ${estado === "guardado" ? "text-ok-texto" : "text-peligro-texto"}`}>{estado === "guardado" ? "Guardado" : estado}</span>
          )}
          <button className="boton-principal" disabled={estado === "guardando"}>
            {estado === "guardando" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
