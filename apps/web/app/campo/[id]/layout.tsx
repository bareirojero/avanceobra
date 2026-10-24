"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, CloudOff, Loader2, LogIn, Package, Upload, type LucideIcon } from "lucide-react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { fijarUsuario, reintentar, useCola } from "@/lib/cola-campo";
import { useObra, useYo } from "@/lib/datos";
import { CARGOS, iniciales } from "@/lib/formato";
import { Aviso, Hoja, OBRA_GUARDADA } from "@/components/campo/base";

/** Marco de la versión de celular: obra arriba, pestañas Hoy, Materiales y Envíos abajo. */
export default function MarcoCampo({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const ruta = usePathname();
  const { yo } = useYo();
  const { obra, rol, cargo } = useObra(id);
  const cola = useCola();
  const [perfil, setPerfil] = useState(false);
  const cantidadObras = (yo?.obras ?? []).filter((o) => !o.obra.eliminado_en && o.rol !== "lector").length;

  useEffect(() => {
    if (yo) fijarUsuario(yo.usuario.id);
  }, [yo]);
  useEffect(() => {
    try {
      if (obra) localStorage.setItem(OBRA_GUARDADA, obra.id);
    } catch {}
  }, [obra]);

  if (!yo) return null;
  if (!obra || rol === "lector") {
    return (
      <div className="movil grid min-h-dvh place-items-center bg-fondo px-6 text-center">
        <div className="flex flex-col gap-3">
          <p className="titulo text-xl">{obra ? "En esta obra tu usuario es de solo lectura" : "No tenés acceso a esta obra"}</p>
          <Link href="/campo?elegir" className="boton-principal">
            Elegir otra obra
          </Link>
        </div>
      </div>
    );
  }

  const base = `/campo/${id}`;
  const pestanas: { href: string; texto: string; icono: LucideIcon; activa: boolean; contador?: number; alerta?: boolean }[] = [
    { href: base, texto: "Hoy", icono: CalendarDays, activa: ruta === base },
    { href: `${base}/materiales`, texto: "Materiales", icono: Package, activa: ruta.startsWith(`${base}/materiales`) },
    {
      href: `${base}/envios`,
      texto: "Envíos",
      icono: Upload,
      activa: ruta.startsWith(`${base}/envios`),
      contador: cola.envios.length,
      alerta: cola.envios.some((e) => e.error),
    },
  ];

  return (
    <div className="movil flex h-dvh flex-col bg-fondo">
      <Aviso />
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2">
        <div className="min-w-0">
          {cantidadObras > 1 ? (
            <Link href="/campo?elegir" className="flex min-h-11 items-center gap-1" aria-label={`Obra ${obra.nombre}. Cambiar de obra`}>
              <span className="titulo truncate text-[24px] leading-tight">{obra.nombre}</span>
              <ChevronDown size={22} strokeWidth={2.5} className="shrink-0" />
            </Link>
          ) : (
            <p className="titulo truncate text-[24px] leading-tight">{obra.nombre}</p>
          )}
          {cargo && <p className="text-sm text-tenue">{CARGOS[cargo]}</p>}
        </div>
        <button
          type="button"
          onClick={() => setPerfil(true)}
          aria-label="Mi perfil"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-tinta text-sm font-semibold text-white"
        >
          {iniciales(yo.usuario.nombre)}
        </button>
      </header>

      <EstadoEnvios />

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <nav aria-label="Secciones" className="flex shrink-0 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)]">
        {pestanas.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.activa ? "page" : undefined}
            className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[13px] ${p.activa ? "font-display font-bold text-tinta" : "font-semibold text-tenue"}`}
          >
            <span className="relative">
              <p.icono size={24} strokeWidth={p.activa ? 2.3 : 2} />
              {!!p.contador && (
                <span
                  className={`absolute -top-1.5 -right-3.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-semibold text-white ${p.alerta ? "bg-peligro" : "bg-pendiente"}`}
                >
                  {p.contador}
                </span>
              )}
            </span>
            {p.texto}
          </Link>
        ))}
      </nav>

      {perfil && <Perfil cerrar={() => setPerfil(false)} pendientes={cola.envios.length} />}
    </div>
  );
}

/** Franja arriba: sin señal, enviando, o hay que volver a ingresar. */
function EstadoEnvios() {
  const cola = useCola();
  const router = useRouter();
  if (cola.sinSesion) {
    return (
      <button
        type="button"
        onClick={() => router.push("/ingresar?campo=1")}
        className="mx-4 mb-2 flex items-center gap-2 rounded-[12px] bg-peligro-suave px-3 py-2.5 text-left text-sm font-semibold text-peligro-texto"
      >
        <LogIn size={18} className="shrink-0" />
        La sesión venció. Tocá para volver a ingresar; lo guardado no se pierde.
      </button>
    );
  }
  if (!cola.envios.length) return null;
  if (cola.sinSenal && !cola.enviando) {
    return (
      <button
        type="button"
        onClick={() => cola.envios[0] && void reintentar(cola.envios[0].id)}
        className="mx-4 mb-2 flex items-center gap-2 rounded-[12px] bg-pendiente-suave px-3 py-2.5 text-left text-sm font-semibold text-pendiente-texto"
      >
        <CloudOff size={18} className="shrink-0" />
        Sin señal: {cola.envios.length === 1 ? "1 envío espera" : `${cola.envios.length} envíos esperan`}. Se envían solos al volver la señal.
      </button>
    );
  }
  if (cola.enviando) {
    return (
      <p className="mx-4 mb-2 flex items-center gap-2 rounded-[12px] bg-plano-suave px-3 py-2.5 text-sm font-semibold text-plano-texto">
        <Loader2 size={18} className="shrink-0 animate-spin" />
        Enviando {cola.envios.length === 1 ? "1 cosa" : `${cola.envios.length} cosas`}…
      </p>
    );
  }
  return null;
}

function Perfil({ cerrar, pendientes }: { cerrar: () => void; pendientes: number }) {
  const { yo } = useYo();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  if (!yo) return null;
  return (
    <Hoja titulo={yo.usuario.nombre} subtitulo={`Usuario: ${yo.usuario.usuario}`} cerrar={cerrar}>
      <div className="flex flex-col gap-3 px-4 pt-2">
        <Link href="/obras" className="boton-secundario h-12">
          Ir al panel completo
        </Link>
        {pendientes > 0 && (
          <p className="rounded-[12px] bg-pendiente-suave px-3 py-2.5 text-sm text-pendiente-texto">
            Hay {pendientes === 1 ? "1 envío" : `${pendientes} envíos`} esperando señal. Si cerrás la sesión quedan guardados en este celular y se envían
            cuando vuelvas a ingresar con tu usuario.
          </p>
        )}
        <button
          type="button"
          className="boton h-12 border border-peligro/40 bg-superficie text-peligro-texto"
          onClick={async () => {
            await api.salir().catch(() => {});
            await mutate(() => true, undefined, { revalidate: false });
            router.replace("/ingresar?campo=1");
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </Hoja>
  );
}
