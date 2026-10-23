import { Encabezado } from "@/components/ui";

const HERRAMIENTAS = [
  "Next.js y React (panel web)",
  "Expo y React Native (app Android)",
  "Node.js y Fastify (API)",
  "PostgreSQL en Neon (base de datos)",
  "Google Drive (fotos e informes PDF)",
  "Render (publicación)",
  "GitHub (código)",
  "Claude Code (desarrollo con IA)",
];

/** Registro de versiones: la primera es la vigente. Sumar arriba en cada entrega. */
const VERSIONES = [
  {
    version: "0.3",
    fecha: "23/10/2026",
    cambios: [
      "Nuevo nombre: ReporTE.",
      "Dashboard gerencial (maqueta con datos de ejemplo).",
      "Página Acerca de la app con el registro de versiones.",
      "El usuario de solo lectura ve las fotos del informe y descarga el PDF.",
    ],
  },
  {
    version: "0.2",
    fecha: "22/10/2026",
    cambios: [
      "Visor de fotos a pantalla completa con zoom.",
      "Cargo Oficina Técnica.",
      "Módulo Materiales: pedidos desde la app y planilla Excel.",
      "Opción para reiniciar la contraseña del editor.",
    ],
  },
  {
    version: "0.1",
    fecha: "21/10/2026",
    cambios: [
      "Primera versión: app de campo con fotos, marcas y comentarios por ítem.",
      "Panel web: día de obra, itemizado desde SAP, usuarios y datos de la obra.",
      "Informe diario con el formato de la empresa, descarga en PDF.",
    ],
  },
];

export default function Acerca() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado titulo="Acerca de la app" />

      <section className="tarjeta flex flex-col gap-3 p-6">
        <p className="titulo text-lg leading-snug">Hecho con entusiasmo, con soporte de IA en la Gerencia Técnica Civil desde la obra ODD Olimpia.</p>
        <p className="text-sm text-tenue">Herramientas: {HERRAMIENTAS.join(" · ")}.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="sobretitulo">Versiones</h2>
        {VERSIONES.map((v, n) => (
          <article key={v.version} className="tarjeta flex flex-col gap-2 px-6 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="titulo text-lg font-bold">ReporTE {v.version}</span>
              <span className="text-sm text-tenue">{v.fecha}</span>
              {n === 0 && <span className="chip h-7 cursor-default bg-ok-suave text-ok-texto">Vigente</span>}
            </div>
            <ul className="m-0 list-disc pl-5 leading-relaxed">
              {v.cambios.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
