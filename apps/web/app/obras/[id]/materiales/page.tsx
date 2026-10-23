"use client";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileDown, FileSpreadsheet, Package, Upload } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { api } from "@/lib/api";
import { useMateriales, useObra, usePedidos, useUrls } from "@/lib/datos";
import { fechaNumerica, hora } from "@/lib/formato";
import type { Celda } from "@/lib/importar-items";
import { type CampoMaterial, type MapeoMaterial, descargarPedidos, detectarColumnas, filasDeMateriales } from "@/lib/materiales";
import { Encabezado, Modal, Vacio } from "@/components/ui";

export default function Materiales() {
  const { id } = useParams<{ id: string }>();
  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const { pedidos, cargando } = usePedidos(id);
  const { materiales, mutate } = useMateriales();
  const urls = useUrls(pedidos.flatMap((p) => p.fotos ?? []));
  const [importando, setImportando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string>();

  async function descargar() {
    if (!obra) return;
    setBajando(true);
    setError(undefined);
    try {
      // Siempre lo último: se vuelve a pedir la lista en el momento de descargar.
      await descargarPedidos(await api.pedidos(id), obra.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la planilla.");
    } finally {
      setBajando(false);
    }
  }

  if (!obra) return null;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Pedidos de materiales">
        {editor && (
          <button className="boton-secundario" onClick={() => setImportando(true)}>
            <Upload size={18} /> {materiales.length ? "Actualizar catálogo" : "Importar catálogo"}
          </button>
        )}
        <button className="boton-principal" onClick={descargar} disabled={bajando || pedidos.length === 0}>
          <FileDown size={18} /> {bajando ? "Armando…" : "Descargar Excel"}
        </button>
      </Encabezado>
      {error && <p className="rounded-[10px] bg-peligro-suave px-4 py-2.5 text-sm font-semibold text-peligro-texto">{error}</p>}

      {editor && (
        <p className="text-sm text-tenue">
          {materiales.length
            ? `El catálogo tiene ${materiales.length} materiales. El equipo de campo los busca desde la app (sin ver el código).`
            : "Todavía no hay catálogo de materiales: importalo para que el equipo de campo pueda hacer pedidos desde la app."}
        </p>
      )}

      {cargando ? (
        <p className="text-tenue">Cargando…</p>
      ) : pedidos.length === 0 ? (
        <Vacio
          icono={<Package />}
          titulo="Todavía no hay pedidos"
          texto="Cuando alguien de campo pida materiales desde la app, aparecen acá y en la planilla de Excel."
        >
          {editor && !materiales.length && (
            <button className="boton-principal" onClick={() => setImportando(true)}>
              <FileSpreadsheet size={18} /> Importar catálogo
            </button>
          )}
        </Vacio>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[820px] text-[15px]">
            <thead>
              <tr className="text-left text-sm text-tenue">
                <th className="border-b border-borde px-5 py-3 font-semibold">Pedido</th>
                <th className="border-b border-borde px-3 py-3 font-semibold">Material</th>
                <th className="border-b border-borde px-3 py-3 text-right font-semibold">Cantidad</th>
                <th className="border-b border-borde px-3 py-3 font-semibold">Sector</th>
                <th className="border-b border-borde px-5 py-3 font-semibold">Para el</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-b border-[#ECEAE4] align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="tabular-nums">
                      {fechaNumerica(new Date(p.pedido_en).toLocaleDateString("en-CA", { timeZone: "America/Asuncion" }))} {hora(p.pedido_en)}
                    </div>
                    <div className="text-sm text-tenue">{p.autor_nombre}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{p.material_descripcion}</div>
                    <div className="text-sm tabular-nums text-tenue">{p.material_codigo}</div>
                    {(p.fotos ?? []).length > 0 && (
                      <div className="mt-1.5 flex gap-1.5">
                        {p.fotos.map((r) =>
                          urls[r] ? (
                            <a key={r} href={urls[r]} target="_blank" rel="noopener" title="Foto de referencia">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={urls[r]} alt="Foto de referencia del material" className="size-12 rounded-md object-cover" />
                            </a>
                          ) : (
                            <span key={r} className="size-12 rounded-md bg-pista" />
                          ),
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {Number(p.cantidad).toLocaleString("es-PY")} {p.material_unidad ?? ""}
                  </td>
                  <td className="px-3 py-3">{p.item_numero ? `${p.item_numero} · ${p.item_descripcion}` : p.item_descripcion}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums">{p.necesario_para ? fechaNumerica(p.necesario_para) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor && <Importador abierto={importando} cerrar={() => setImportando(false)} hayCatalogo={materiales.length > 0} alImportar={() => mutate()} />}
    </div>
  );
}

const CAMPOS: { campo: CampoMaterial; texto: string; obligatorio?: boolean }[] = [
  { campo: "codigo", texto: "Código", obligatorio: true },
  { campo: "descripcion", texto: "Descripción", obligatorio: true },
  { campo: "unidad", texto: "Unidad" },
];

function Importador({ abierto, cerrar, hayCatalogo, alImportar }: { abierto: boolean; cerrar: () => void; hayCatalogo: boolean; alImportar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string>();
  const [filas, setFilas] = useState<Celda[][]>([]);
  const [encabezado, setEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<MapeoMaterial>({});
  const [error, setError] = useState<string>();
  const [guardando, setGuardando] = useState(false);

  const lista = useMemo(() => filasDeMateriales(filas, encabezado, mapeo), [filas, encabezado, mapeo]);
  const columnas = (filas[encabezado] ?? []).map((c, i) => (c == null || c === "" ? `Columna ${i + 1}` : String(c)));

  async function leer(f: File) {
    setError(undefined);
    try {
      const datos = (await readXlsxFile(f)) as Celda[][];
      const det = detectarColumnas(datos);
      setArchivo(f.name);
      setFilas(datos);
      setEncabezado(det.fila);
      setMapeo(det.mapeo);
    } catch {
      setError("No pude leer ese archivo. Tiene que ser un Excel .xlsx (si es .xls, guardalo como .xlsx).");
    }
  }

  function reiniciar() {
    setArchivo(undefined);
    setFilas([]);
    setMapeo({});
    setError(undefined);
    cerrar();
  }

  async function importar() {
    if (!archivo) return;
    setGuardando(true);
    setError(undefined);
    try {
      await api.importarMateriales({ archivo_nombre: archivo, filas: lista });
      alImportar();
      reiniciar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Importar catálogo de materiales" abierto={abierto} cerrar={reiniciar} ancho="max-w-3xl">
      {!archivo ? (
        <div
          className="flex flex-col items-center rounded-[14px] border-2 border-dashed border-borde-fuerte px-6 py-12 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) leer(f);
          }}
        >
          <FileSpreadsheet className="mb-3 text-ok" size={40} />
          <p className="titulo text-lg">Arrastrá la planilla de materiales acá</p>
          <p className="mb-4 max-w-md text-tenue">La exportación de materiales de SAP sirve tal cual (código, texto breve y UMB). Es una sola lista para todas las obras.</p>
          <button className="boton-principal" onClick={() => entrada.current?.click()}>
            Elegir archivo
          </button>
          <input ref={entrada} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
          {error && <p className="mt-3 text-sm font-semibold text-peligro-texto">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold">{archivo}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label>
              <span className="etiqueta">Fila de títulos</span>
              <input type="number" min={1} className="campo" value={encabezado + 1} onChange={(e) => setEncabezado(Math.max(0, Number(e.target.value) - 1))} />
            </label>
            {CAMPOS.map(({ campo, texto, obligatorio }) => (
              <label key={campo}>
                <span className="etiqueta">
                  {texto}
                  {obligatorio && " *"}
                </span>
                <select
                  className="campo"
                  value={mapeo[campo] ?? ""}
                  onChange={(e) => setMapeo({ ...mapeo, [campo]: e.target.value === "" ? undefined : Number(e.target.value) })}
                >
                  <option value="">No está</option>
                  {columnas.map((c, i) => (
                    <option key={i} value={i}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="max-h-72 overflow-auto rounded-[10px] border border-borde">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-fondo text-left text-tenue">
                <tr>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Material</th>
                  <th className="px-3 py-2 font-semibold">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 400).map((m, i) => (
                  <tr key={i} className="border-t border-borde">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-tenue">{m.codigo}</td>
                    <td className="px-3 py-1.5">{m.descripcion}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{m.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="p-4 text-center text-sm text-tenue">Elegí las columnas de código y descripción para ver los materiales.</p>}
          </div>

          {hayCatalogo && (
            <p className="rounded-[10px] bg-plano-suave px-3 py-2 text-sm text-plano-texto">
              Ya hay un catálogo cargado. Los materiales con el mismo código se actualizan y conservan sus pedidos; los que no estén en la planilla dejan de aparecer en la app.
            </p>
          )}
          {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">{lista.length} materiales</span>
            <div className="ml-auto flex gap-2">
              <button className="boton-secundario" onClick={() => setArchivo(undefined)}>
                Otro archivo
              </button>
              <button className="boton-principal" disabled={!lista.length || guardando} onClick={importar}>
                {guardando ? "Importando…" : `Importar ${lista.length} materiales`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
