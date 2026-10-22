"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useYo } from "@/lib/datos";
import { BarraLateral } from "./barra-lateral";

/** Pide sesión para todo salvo /ingresar, y arma el marco con la barra lateral. */
export function Guardia({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const { yo } = useYo();
  const publica = ruta === "/ingresar";

  useEffect(() => {
    if (yo === null && !publica) router.replace("/ingresar");
  }, [yo, publica, router]);

  if (publica) return <>{children}</>;
  if (!yo) return null;
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BarraLateral />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
