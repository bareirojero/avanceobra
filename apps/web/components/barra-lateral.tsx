"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, CalendarDays, FileText, ListChecks, LogOut, Package, Settings, Users } from "lucide-react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { useObra, useYo } from "@/lib/datos";

export function BarraLateral() {
  const ruta = usePathname();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { yo } = useYo();
  const obraId = ruta.match(/^\/obras\/([^/]+)/)?.[1];
  const { obra, rol } = useObra(obraId);
  const base = `/obras/${obraId}`;

  const deObra = !obra
    ? []
    : [
        { href: base, texto: "Día de obra", icono: CalendarDays, activo: ruta === base },
        { href: `${base}/informes`, texto: "Informes", icono: FileText, activo: ruta.startsWith(`${base}/informes`) },
        ...(rol === "editor" || rol === "lector"
          ? [{ href: `${base}/materiales`, texto: "Materiales", icono: Package, activo: ruta.startsWith(`${base}/materiales`) }]
          : []),
        ...(rol === "editor"
          ? [
              { href: `${base}/items`, texto: "Itemizado", icono: ListChecks, activo: ruta.startsWith(`${base}/items`) },
              { href: `${base}/usuarios`, texto: "Usuarios", icono: Users, activo: ruta.startsWith(`${base}/usuarios`) },
              { href: `${base}/obra`, texto: "Obra", icono: Settings, activo: ruta.startsWith(`${base}/obra`) },
            ]
          : []),
      ];

  return (
    <aside className="flex shrink-0 flex-col gap-6 bg-marca-fondo px-4 py-4 text-white md:sticky md:top-0 md:h-screen md:w-60 md:py-6 print:hidden">
      <Link href="/obras" className="flex items-center gap-2.5 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/avance-de-obra-app.png" alt="" className="size-9" />
        <span className="font-display text-base font-bold">Avance de Obra</span>
      </Link>

      <nav aria-label="Principal" className="flex flex-wrap gap-1 md:flex-col">
        <Enlace href="/obras" activo={ruta === "/obras"} icono={Building2}>
          Obras
        </Enlace>
        {obra && (
          <>
            <div className="mt-3 hidden truncate px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sobre-tinta-tenue md:block">
              {obra.nombre}
            </div>
            {deObra.map((e) => (
              <Enlace key={e.href} href={e.href} activo={e.activo} icono={e.icono}>
                {e.texto}
              </Enlace>
            ))}
          </>
        )}
      </nav>

      {yo && (
        <div className="mt-auto hidden rounded-[10px] bg-white/10 p-3 text-[13px] leading-relaxed text-sobre-tinta-tenue md:block">
          <span className="font-semibold text-white">{yo.usuario.nombre}</span>
          <br />
          {yo.usuario.usuario}
          <button
            className="mt-2 flex items-center gap-1.5 text-xs text-sobre-tinta-tenue hover:text-white"
            onClick={async () => {
              await api.salir().catch(() => {});
              // Borra todo lo guardado en caché de la sesión anterior.
              await mutate(() => true, undefined, { revalidate: false });
              router.replace("/ingresar");
            }}
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </aside>
  );
}

function Enlace({ href, activo, icono: Icono, children }: { href: string; activo: boolean; icono: typeof Building2; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] ${
        activo ? "bg-white/15 font-semibold text-white" : "font-medium text-sobre-tinta-tenue hover:text-white"
      }`}
    >
      <Icono size={18} />
      {children}
    </Link>
  );
}
