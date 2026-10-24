"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, MapPin, Plus } from "lucide-react";
import type { Obra, RolObra } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { useYo } from "@/lib/datos";
import { hoy, ROLES } from "@/lib/formato";
import { Encabezado, Modal, Vacio } from "@/components/ui";

const destino = (o: Obra, rol: RolObra) =>
  rol === "editor" ? `/obras/${o.id}` : rol === "gerente" ? `/obras/${o.id}/dashboard` : `/obras/${o.id}/informes`;

export default function Obras() {
  const router = useRouter();
  const { yo } = useYo();
  const [creando, setCreando] = useState(false);
  const obras = (yo?.obras ?? []).filter((o) => !o.obra.eliminado_en && o.obra.estado !== "archivada");
  const rolEn = (o: (typeof obras)[number]) => (yo?.usuario.es_admin ? "editor" : o.rol);

  // Con una sola obra no hace falta elegir: se entra directo.
  useEffect(() => {
    if (obras.length === 1 && !yo?.usuario.es_admin) router.replace(destino(obras[0].obra, rolEn(obras[0])));
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado titulo="Obras">
        {yo?.usuario.es_admin && (
          <button className="boton-principal" onClick={() => setCreando(true)}>
            <Plus size={18} /> Nueva obra
          </button>
        )}
      </Encabezado>

      {obras.length === 0 ? (
        <Vacio icono={<Building2 />} titulo="No tenés obras asignadas" texto="Pedile al editor que te sume a una obra." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {obras.map((o) => (
            <Link key={o.obra.id} href={destino(o.obra, rolEn(o))} className="tarjeta flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="titulo text-xl">{o.obra.nombre}</h2>
                  {o.obra.codigo && <p className="text-sm font-medium text-tinta-suave">{o.obra.codigo}</p>}
                </div>
                <span className="rounded-full bg-fondo px-2.5 py-0.5 text-[13px] font-semibold text-tinta-suave">{ROLES[rolEn(o)]}</span>
              </div>
              {o.obra.direccion && (
                <p className="flex items-center gap-1 text-sm text-tenue">
                  <MapPin size={13} /> {o.obra.direccion}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <NuevaObra abierto={creando} cerrar={() => setCreando(false)} />
    </div>
  );
}

function NuevaObra({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const router = useRouter();
  const { mutate } = useYo();
  const [datos, setDatos] = useState({ nombre: "", codigo: "", sigla: "", direccion: "", fecha_inicio: hoy() });
  const [error, setError] = useState<string>();
  const cambiar = (k: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos({ ...datos, [k]: e.target.value });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    try {
      const obra = await api.crearObra({
        nombre: datos.nombre.trim(),
        codigo: datos.codigo.trim() || null,
        sigla: datos.sigla.trim().toUpperCase() || null,
        direccion: datos.direccion.trim() || null,
        fecha_inicio: datos.fecha_inicio || null,
      });
      await mutate();
      cerrar();
      router.push(`/obras/${obra.id}/items`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la obra.");
    }
  }

  return (
    <Modal titulo="Nueva obra" abierto={abierto} cerrar={cerrar}>
      <form onSubmit={crear} className="grid gap-4">
        <label>
          <span className="etiqueta">Nombre de la obra</span>
          <input className="campo" required autoFocus value={datos.nombre} onChange={cambiar("nombre")} placeholder="Ej.: ODD - Fundaciones" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label>
            <span className="etiqueta">Código SAP</span>
            <input className="campo" value={datos.codigo} onChange={cambiar("codigo")} placeholder="Ej.: OC.0054" />
          </label>
          <label>
            <span className="etiqueta">Sigla para los informes</span>
            <input className="campo uppercase" maxLength={6} value={datos.sigla} onChange={cambiar("sigla")} placeholder="Ej.: ODD" />
          </label>
        </div>
        <label>
          <span className="etiqueta">Ubicación</span>
          <input className="campo" value={datos.direccion} onChange={cambiar("direccion")} />
        </label>
        <label>
          <span className="etiqueta">Inicio</span>
          <input type="date" className="campo" value={datos.fecha_inicio} onChange={cambiar("fecha_inicio")} />
        </label>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <p className="text-sm text-tenue">Después de crearla seguís con el itemizado.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button className="boton-principal">Crear obra</button>
        </div>
      </form>
    </Modal>
  );
}
