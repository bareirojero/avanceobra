"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useObra } from "@/lib/datos";

export default function LayoutObra({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const ruta = usePathname();
  const router = useRouter();
  const { obra, rol } = useObra(id);
  // Campo y solo lectura miran el día de obra y los informes publicados; no editan nada.
  // Solo lectura también baja los pedidos de materiales.
  const permitido =
    rol === "editor" ||
    (!!rol && (ruta === `/obras/${id}` || ruta.startsWith(`/obras/${id}/informes`))) ||
    (rol === "lector" && (ruta.startsWith(`/obras/${id}/materiales`) || ruta.startsWith(`/obras/${id}/dashboard`)));

  useEffect(() => {
    if (obra && rol && !permitido) router.replace(`/obras/${id}/informes`);
  }, [obra, rol, permitido, id, router]);

  if (!obra || !rol) {
    return (
      <div className="p-8">
        <p>No encontré esa obra o no tenés acceso.</p>
        <Link href="/obras" className="text-plano underline">
          Volver a obras
        </Link>
      </div>
    );
  }
  return permitido ? <>{children}</> : null;
}
