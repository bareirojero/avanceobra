"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, FileDown, FileText } from "lucide-react";
import { numeroInforme } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "@/lib/api";
import { useInformes, useObra } from "@/lib/datos";
import { fechaLarga, hoy } from "@/lib/formato";
import { ChipEstado, Encabezado, Vacio } from "@/components/ui";

export default function Informes() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const { informes: todos } = useInformes(id);
  // Fuera del editor solo se ven los publicados.
  const informes = editor ? todos : todos.filter((i) => i.estado === "publicado");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState<string>();
  const existe = todos.some((i) => i.fecha_desde === fecha);

  async function armar() {
    setError(undefined);
    try {
      if (!existe) await api.generarInforme({ obra_id: id, tipo: "diario", fecha_desde: fecha });
      router.push(`/obras/${id}/informes/${fecha}`);
    } catch (e) {
      if (e instanceof ErrorDeApi && e.estado === 409) router.push(`/obras/${id}/informes/${fecha}`);
      else setError(e instanceof Error ? e.message : "No se pudo armar el informe.");
    }
  }

  if (!obra) return null;
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Informes">
        {editor && (
          <>
            <input type="date" className="campo h-11 w-auto" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} aria-label="Día del informe" />
            <button className="boton-principal" onClick={armar}>
              <FileText size={18} /> {existe ? "Abrir informe" : "Armar informe"}
            </button>
          </>
        )}
      </Encabezado>
      {error && <p className="rounded-[10px] bg-peligro-suave px-4 py-2.5 text-sm font-semibold text-peligro-texto">{error}</p>}

      {informes.length === 0 ? (
        <Vacio
          icono={<FileText />}
          titulo={editor ? "Todavía no hay informes" : "Todavía no hay informes publicados"}
          texto={editor ? "Elegí un día con fotos y se arma el borrador ordenado por ítem para que lo completes y lo publiques." : "Cuando el editor publique un informe, aparece acá para descargarlo en PDF."}
        />
      ) : (
        <div className="tarjeta divide-y divide-borde">
          {informes.map((i) => (
            <div key={i.id} className="flex items-center gap-4 px-5 py-4 hover:bg-fondo/50">
              <Link href={`/obras/${id}/informes/${i.fecha_desde}`} className="flex min-w-0 flex-1 items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-fondo text-tenue">
                  <FileText size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold first-letter:uppercase">{fechaLarga(i.fecha_desde)}</div>
                  <div className="text-sm tabular-nums text-tenue">{numeroInforme(obra.sigla, i.numero)}</div>
                </div>
              </Link>
              {editor && <ChipEstado estado={i.estado} />}
              {i.estado === "publicado" && (
                <a href={api.urlPdf(i.id)} className="boton-secundario h-9 text-sm" target="_blank" rel="noopener">
                  <FileDown size={16} /> PDF
                </a>
              )}
              <ChevronRight size={18} className="text-tenue" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
