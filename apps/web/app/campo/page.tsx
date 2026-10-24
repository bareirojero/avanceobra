"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { useYo } from "@/lib/datos";
import { CARGOS } from "@/lib/formato";
import { OBRA_GUARDADA } from "@/components/campo/base";

/** Versión de celular: elegir la obra. Con una sola, o con la última usada, se entra directo. */
export default function ElegirObra() {
  const router = useRouter();
  const { yo } = useYo();
  const [elegir, setElegir] = useState(false);
  const obras = (yo?.obras ?? []).filter(
    (o) => !o.obra.eliminado_en && o.obra.estado !== "archivada" && (yo?.usuario.es_admin || (o.rol !== "lector" && o.rol !== "gerente")),
  );

  useEffect(() => {
    if (!yo) return;
    if (new URLSearchParams(location.search).has("elegir")) return setElegir(true);
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(OBRA_GUARDADA);
    } catch {}
    const directa = obras.length === 1 ? obras[0] : obras.find((o) => o.obra.id === guardada);
    if (directa) router.replace(`/campo/${directa.obra.id}`);
    else setElegir(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo]);

  if (!elegir) return null;
  return (
    <div className="movil min-h-dvh bg-fondo px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-8">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <h1 className="titulo text-[28px]">¿En qué obra estás?</h1>
        {obras.length === 0 ? (
          <div className="tarjeta flex flex-col items-center gap-3 p-6 text-center">
            <Building2 className="text-tenue" size={32} />
            <p className="font-semibold">Todavía no tenés obras para cargar</p>
            <p className="text-sm text-tenue">Pedile al editor que te sume a una obra como usuario de campo.</p>
          </div>
        ) : (
          obras.map((o) => (
            <Link
              key={o.obra.id}
              href={`/campo/${o.obra.id}`}
              className="tarjeta flex min-h-16 items-center gap-3 px-4 py-3 active:bg-pista"
              onClick={() => {
                try {
                  localStorage.setItem(OBRA_GUARDADA, o.obra.id);
                } catch {}
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold">{o.obra.nombre}</span>
                {o.cargo && <span className="block text-sm text-tenue">{CARGOS[o.cargo]}</span>}
              </span>
              <ChevronRight className="shrink-0 text-tenue" />
            </Link>
          ))
        )}
        <Link href="/obras" className="mt-4 text-center text-sm font-semibold text-plano">
          Ir al panel completo
        </Link>
      </div>
    </div>
  );
}
