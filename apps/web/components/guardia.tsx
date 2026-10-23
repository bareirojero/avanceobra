"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useYo } from "@/lib/datos";
import { BarraLateral } from "./barra-lateral";

/** Pide sesión para todo salvo /ingresar, y arma el marco con la barra lateral. */
export function Guardia({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const { yo, caida, mutate } = useYo();
  const lento = useDemora(4000);
  const publica = ruta === "/ingresar";

  useEffect(() => {
    if (yo === null && !publica) router.replace("/ingresar");
  }, [yo, publica, router]);

  if (publica) return <>{children}</>;
  if (!yo) {
    // Mientras la API responde (en Render puede tardar ~1 minuto en despertar) no queda en blanco.
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/reporte-app.png" alt="" className="size-14" />
          <Loader2 className="animate-spin text-tenue" size={28} />
          {(caida || lento) && (
            <>
              <p className="font-semibold">Conectando con el servidor…</p>
              <p className="text-sm text-tenue">Si estuvo un rato sin uso puede tardar hasta un minuto en despertar. Se reintenta solo.</p>
              {caida && (
                <button className="boton-secundario h-9 text-sm" onClick={() => mutate()}>
                  Reintentar ahora
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BarraLateral />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function useDemora(ms: number) {
  const [paso, setPaso] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPaso(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return paso;
}
