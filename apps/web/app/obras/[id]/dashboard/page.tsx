"use client";
// Dashboard gerencial: las cifras de avance todavía son de ejemplo; la galería trae las fotos
// reales del último día con fotos. Es lo único que ve el usuario Gerente.
import { useParams } from "next/navigation";
import { useDashboard, useObra } from "@/lib/datos";
import { fechaLarga, fechaNumerica, hoy } from "@/lib/formato";
import { Encabezado } from "@/components/ui";
import { GaleriaDashboard } from "@/components/galeria-dashboard";

interface Elemento {
  nombre: string;
  unidad: "Unidad" | "m³";
  total: number;
  liberado: number;
  ejecutado: number;
}

const ELEMENTOS: Elemento[] = [
  { nombre: "Pilotes cimentación", unidad: "Unidad", total: 1753, liberado: 361, ejecutado: 107 },
  { nombre: "Pilotes contención", unidad: "Unidad", total: 962, liberado: 475, ejecutado: 416 },
  { nombre: "Vigas", unidad: "m³", total: 70.66, liberado: 70.66, ejecutado: 0 },
  { nombre: "Cabezales", unidad: "m³", total: 0, liberado: 0, ejecutado: 0 },
  { nombre: "Zapata corrida", unidad: "m³", total: 0, liberado: 0, ejecutado: 0 },
  { nombre: "Muro contención", unidad: "m³", total: 31.03, liberado: 28.33, ejecutado: 0 },
];

const SECTORES = [
  { nombre: "N", valor: 3 },
  { nombre: "NE", valor: 19 },
  { nombre: "NO", valor: 35 },
  { nombre: "S", valor: 67 },
  { nombre: "SE", valor: 0 },
  { nombre: "SO", valor: 52 },
  { nombre: "E", valor: 13 },
  { nombre: "O", valor: 47 },
];

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("es-PY", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);
const fmt = (v: number, u: Elemento["unidad"]) => v.toLocaleString("es-PY", u === "m³" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});

function suma(unidad: Elemento["unidad"], nombre: string): Elemento {
  const de = ELEMENTOS.filter((e) => e.unidad === unidad);
  return { nombre, unidad, total: de.reduce((t, e) => t + e.total, 0), liberado: de.reduce((t, e) => t + e.liberado, 0), ejecutado: de.reduce((t, e) => t + e.ejecutado, 0) };
}
const TOTALES = [suma("Unidad", "Total pilotes"), suma("m³", "Total estructura")];

export default function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const { obra } = useObra(id);
  const dashboard = useDashboard(id);
  if (!obra) return null;
  // La situación es la del último día con fotos; sin fotos todavía, la de hoy.
  const fecha = dashboard.fecha ?? hoy();

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      {/* Misma cabecera de presentación que el Día de obra: video en loop sin sonido. */}
      <video
        className="aspect-[1168/350] w-full rounded-xl bg-white object-cover print:hidden"
        src="/cabecera/dia-de-obra.mp4"
        poster="/cabecera/dia-de-obra.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <Encabezado miga={obra.nombre} titulo="Dashboard gerencial" />
      <p className="rounded-[10px] bg-plano-suave px-4 py-2.5 text-sm font-semibold text-plano-texto">
        {dashboard.cargando ? "Situación de obra" : `Situación de obra actualizada a ${fechaNumerica(fecha)}`} - VERSIÓN BETA del visor de obra
      </p>

      <GaleriaDashboard fotos={dashboard.fotos} titulo={dashboard.fecha ? `Fotos del día · ${fechaLarga(dashboard.fecha)}` : "Fotos del día"} />

      <div className="grid gap-4 md:grid-cols-2">
        {TOTALES.map((t) => (
          <Resumen key={t.nombre} e={t} />
        ))}
      </div>

      <section className="tarjeta overflow-x-auto">
        <h2 className="titulo px-5 pt-4 text-lg font-bold">Avance por elemento</h2>
        <table className="mt-2 w-full min-w-[760px] text-[15px] tabular-nums">
          <thead>
            <tr className="text-left text-sm text-tenue">
              <th className="border-b border-borde px-5 py-3 font-semibold">Elemento</th>
              <th className="border-b border-borde px-3 py-3 text-right font-semibold">Total</th>
              <th className="border-b border-borde px-3 py-3 text-right font-semibold">Liberado</th>
              <th className="border-b border-borde px-3 py-3 text-right font-semibold">Ejecutado</th>
              <th className="w-[34%] border-b border-borde px-5 py-3 font-semibold">Ejecutado y liberado sobre el total</th>
            </tr>
          </thead>
          <tbody>
            {[...ELEMENTOS, ...TOTALES].map((e, n) => {
              const total = n >= ELEMENTOS.length;
              return (
                <tr key={e.nombre} className={`border-b border-[#ECEAE4] last:border-0 ${total ? "bg-fondo/60 font-bold" : ""}`}>
                  <td className="px-5 py-3">
                    {e.nombre} <span className="text-sm font-normal text-tenue">· {e.unidad}</span>
                  </td>
                  <td className="px-3 py-3 text-right">{fmt(e.total, e.unidad)}</td>
                  <td className="px-3 py-3 text-right">
                    {fmt(e.liberado, e.unidad)} <span className="text-sm font-normal text-tenue">{fmtPct(pct(e.liberado, e.total))}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {fmt(e.ejecutado, e.unidad)} <span className="text-sm font-normal text-tenue">{fmtPct(pct(e.ejecutado, e.total))}</span>
                  </td>
                  <td className="px-5 py-3">
                    <BarraDoble e={e} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex gap-5 px-5 pb-4 pt-1 text-sm text-tenue">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-plano" /> Ejecutado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-plano/30" /> Liberado
          </span>
        </div>
      </section>

      <section className="tarjeta flex flex-col gap-4 p-5">
        <h2 className="titulo text-lg font-bold">Pilotes liberados por sector</h2>
        <div className="relative flex h-64 items-end gap-3 border-b border-borde pl-10">
          {[0, 25, 50, 75, 100].map((g) => (
            <div key={g} className="pointer-events-none absolute left-0 right-0 border-t border-[#ECEAE4]" style={{ bottom: `${g}%` }}>
              <span className="absolute -top-2.5 left-0 text-xs tabular-nums text-tenue">{g}%</span>
            </div>
          ))}
          {SECTORES.map((s) => (
            <div key={s.nombre} className="relative flex h-full flex-1 flex-col justify-end">
              <span className="mb-1 text-center text-sm font-semibold tabular-nums">{s.valor}%</span>
              <div className="rounded-t-[4px] bg-plano" style={{ height: `${s.valor}%` }} title={`Sector ${s.nombre}: ${s.valor}%`} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pl-10">
          {SECTORES.map((s) => (
            <span key={s.nombre} className="flex-1 text-center text-sm text-tenue">
              {s.nombre}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Resumen({ e }: { e: Elemento }) {
  return (
    <div className="tarjeta flex flex-col gap-3 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="titulo text-lg font-bold">{e.nombre}</span>
        <span className="text-sm text-tenue">
          {fmt(e.total, e.unidad)} {e.unidad === "Unidad" ? "unidades" : "m³"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Dato titulo="Liberado" valor={fmtPct(pct(e.liberado, e.total))} />
        <Dato titulo="Ejecutado" valor={fmtPct(pct(e.ejecutado, e.total))} />
        <Dato titulo="Ejec. vs liberado" valor={fmtPct(pct(e.ejecutado, e.liberado))} />
      </div>
      <BarraDoble e={e} />
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div className="text-sm text-tenue">{titulo}</div>
      <div className="titulo text-[26px] leading-tight tabular-nums">{valor}</div>
    </div>
  );
}

/** Barra del total: liberado en tono claro y ejecutado encima, en tono pleno. */
function BarraDoble({ e }: { e: Elemento }) {
  const lib = pct(e.liberado, e.total) ?? 0;
  const eje = pct(e.ejecutado, e.total) ?? 0;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-pista" title={`Liberado ${fmtPct(lib)} · Ejecutado ${fmtPct(eje)}`}>
      <div className="absolute inset-y-0 left-0 bg-plano/30" style={{ width: `${lib}%` }} />
      <div className="absolute inset-y-0 left-0 bg-plano" style={{ width: `${eje}%` }} />
    </div>
  );
}
