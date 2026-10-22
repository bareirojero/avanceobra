"use client";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, ListChecks, MapPinned, Plus, Upload } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { api } from "@/lib/api";
import { nombreItem, useItems, useObra, useSectores } from "@/lib/datos";
import { type Campo, type Celda, type Mapeo, detectarEncabezado, filasParaImportar, interpretar } from "@/lib/importar-items";
import { Encabezado, Modal, Vacio } from "@/components/ui";

export default function Itemizado() {
  const { id } = useParams<{ id: string }>();
  const { obra } = useObra(id);
  const { items, cargando, mutate } = useItems(id);
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState("");

  // La fila raíz (la obra misma, ej. OC.0054) no se muestra.
  const arbol = useMemo(() => items.filter((i) => !(i.nivel === 0 && i.es_titulo && items.length > 1)), [items]);
  const nivelBase = Math.min(...arbol.map((i) => i.nivel));
  const visibles = useMemo(() => {
    const f = filtro.toLowerCase();
    if (!f) return arbol;
    const coinciden = new Set(arbol.filter((i) => !i.es_titulo && `${i.numero ?? ""} ${i.codigo} ${i.descripcion}`.toLowerCase().includes(f)).map((i) => i.id));
    // Muestra también los rubros que contienen lo encontrado.
    const conPadres = new Set(coinciden);
    for (const i of arbol) {
      if (!coinciden.has(i.id)) continue;
      let p = i.padre_id;
      while (p && !conPadres.has(p)) {
        conPadres.add(p);
        p = arbol.find((x) => x.id === p)?.padre_id ?? null;
      }
    }
    return arbol.filter((i) => conPadres.has(i.id));
  }, [arbol, filtro]);

  const reales = items.filter((i) => !i.es_titulo);
  if (!obra) return null;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Itemizado">
        <button className="boton-principal" onClick={() => setImportando(true)}>
          <Upload size={18} /> {items.length ? "Actualizar desde Excel" : "Importar Excel"}
        </button>
      </Encabezado>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          {reales.length > 0 && (
            <div className="tarjeta flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
              <span className="flex-1 text-sm text-tenue">
                {reales.length} ítems en {arbol.filter((i) => i.es_titulo).length} rubros. Cada foto se vincula a uno de estos ítems.
              </span>
              <input className="campo w-full sm:w-64" placeholder="Buscar ítem…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            </div>
          )}

          {cargando ? (
            <p className="text-tenue">Cargando…</p>
          ) : items.length === 0 ? (
            <Vacio
              icono={<ListChecks />}
              titulo="La obra no tiene itemizado"
              texto="Subí el Excel que exportás de SAP. Reconozco el elemento PEP, la descripción, la versión, la cantidad y la unidad; las filas sin cantidad son rubros."
            >
              <button className="boton-principal" onClick={() => setImportando(true)}>
                <FileSpreadsheet size={18} /> Elegir planilla
              </button>
            </Vacio>
          ) : (
            <div className="tarjeta overflow-x-auto">
              <table className="w-full min-w-[560px] text-[15px]">
                <thead>
                  <tr className="text-left text-sm text-tenue">
                    <th className="border-b border-borde px-5 py-3 font-semibold">Ítem</th>
                    <th className="border-b border-borde px-3 py-3 font-semibold">Código PEP</th>
                    <th className="border-b border-borde px-5 py-3 text-right font-semibold">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((i) => {
                    const sangria = { paddingLeft: `${20 + (i.nivel - nivelBase) * 16}px` };
                    return i.es_titulo ? (
                      <tr key={i.id}>
                        <td colSpan={3} className="sobretitulo bg-fondo/60 pb-2 pr-5 pt-4" style={sangria}>
                          {i.descripcion}
                        </td>
                      </tr>
                    ) : (
                      <tr key={i.id} className="border-b border-[#ECEAE4] last:border-0">
                        <td className="py-3 pr-3" style={sangria}>
                          {nombreItem(i)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-tenue">{i.codigo}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-tenue">
                          {i.cantidad != null ? `${Number(i.cantidad).toLocaleString("es-PY")} ${i.unidad ?? ""}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Sectores obraId={id} />
      </div>

      <Importador obraId={id} hayItems={items.length > 0} abierto={importando} cerrar={() => setImportando(false)} alImportar={() => mutate()} />
    </div>
  );
}

function Sectores({ obraId }: { obraId: string }) {
  const { sectores, mutate } = useSectores(obraId);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string>();
  return (
    <aside className="tarjeta flex min-w-0 flex-[1_1_280px] flex-col gap-3 p-5">
      <h2 className="titulo flex items-center gap-2 text-lg font-bold">
        <MapPinned size={18} /> Sectores
      </h2>
      <p className="text-sm text-tenue">El equipo de campo los elige con un toque al guardar cada foto. Son opcionales.</p>
      <ul className="flex flex-wrap gap-1.5">
        {sectores.map((s) => (
          <li key={s.id} className="chip h-8 cursor-default">
            {s.nombre}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nuevo.trim()) return;
          setError(undefined);
          try {
            await api.crearSector(obraId, { nombre: nuevo.trim(), padre_id: null, orden: sectores.length });
            setNuevo("");
            mutate();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo agregar.");
          }
        }}
      >
        <input className="campo" placeholder="Ej.: Eje A, tramo 1-5" value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label="Nuevo sector" />
        <button className="boton-secundario w-10 shrink-0 px-0" aria-label="Agregar sector">
          <Plus size={18} />
        </button>
      </form>
      {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
    </aside>
  );
}

const CAMPOS: { campo: Campo; texto: string; obligatorio?: boolean }[] = [
  { campo: "codigo", texto: "Elemento PEP", obligatorio: true },
  { campo: "descripcion", texto: "Descripción", obligatorio: true },
  { campo: "version", texto: "Versión" },
  { campo: "cantidad", texto: "Cantidad" },
  { campo: "unidad", texto: "Unidad" },
];

function Importador({
  obraId,
  hayItems,
  abierto,
  cerrar,
  alImportar,
}: {
  obraId: string;
  hayItems: boolean;
  abierto: boolean;
  cerrar: () => void;
  alImportar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string>();
  const [filas, setFilas] = useState<Celda[][]>([]);
  const [encabezado, setEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [error, setError] = useState<string>();
  const [guardando, setGuardando] = useState(false);

  const vista = useMemo(() => interpretar(filas, encabezado, mapeo), [filas, encabezado, mapeo]);
  const crudas = useMemo(() => filasParaImportar(filas, encabezado, mapeo), [filas, encabezado, mapeo]);
  const cantItems = vista.filas.filter((r) => !r.es_titulo).length;
  const cantTitulos = vista.filas.length - cantItems;
  const columnas = (filas[encabezado] ?? []).map((c, i) => (c == null || c === "" ? `Columna ${i + 1}` : String(c)));

  async function leer(f: File) {
    setError(undefined);
    try {
      const datos = (await readXlsxFile(f)) as Celda[][];
      const det = detectarEncabezado(datos);
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
      await api.importarItems(obraId, { archivo_nombre: archivo, filas: crudas });
      alImportar();
      reiniciar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Importar itemizado desde Excel" abierto={abierto} cerrar={reiniciar} ancho="max-w-3xl">
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
          <p className="titulo text-lg">Arrastrá la planilla de SAP acá</p>
          <p className="mb-4 text-tenue">o elegila desde tu computadora</p>
          <button className="boton-principal" onClick={() => entrada.current?.click()}>
            Elegir archivo
          </button>
          <input ref={entrada} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
          {error && <p className="mt-3 text-sm font-semibold text-peligro-texto">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-semibold">{archivo}</span>
            {vista.obra && (
              <span>
                {" "}
                · obra <span className="font-semibold">{vista.obra.codigo}</span> {vista.obra.descripcion}
              </span>
            )}
            {vista.versiones.length > 0 && <span> · versión {vista.versiones.join(", ")}</span>}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  <th className="px-3 py-2 font-semibold">Ítem</th>
                  <th className="px-3 py-2 font-semibold">Código PEP</th>
                  <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {vista.filas.slice(0, 400).map((r) => (
                  <tr key={r.ref} className={`border-t border-borde ${r.es_titulo ? "bg-fondo/50 font-semibold" : ""}`}>
                    <td className={`px-3 py-1.5 ${r.es_titulo ? "uppercase tracking-wide" : "pl-6"}`}>{r.numero ? `${r.numero} · ${r.descripcion}` : r.descripcion}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-tenue">{r.codigo}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      {r.cantidad != null ? `${r.cantidad.toLocaleString("es-PY")} ${r.unidad ?? ""}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vista.filas.length === 0 && <p className="p-4 text-center text-sm text-tenue">Elegí las columnas de elemento PEP y descripción para ver los ítems.</p>}
          </div>

          {hayItems && (
            <p className="rounded-[10px] bg-plano-suave px-3 py-2 text-sm text-plano-texto">
              La obra ya tiene itemizado. Los ítems con el mismo elemento PEP se conservan con sus fotos; los que no estén en la planilla se dan de baja.
            </p>
          )}
          {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">
              {cantItems} ítems en {cantTitulos} rubros
            </span>
            <div className="ml-auto flex gap-2">
              <button className="boton-secundario" onClick={() => setArchivo(undefined)}>
                Otro archivo
              </button>
              <button className="boton-principal" disabled={!cantItems || !crudas.length || guardando} onClick={importar}>
                {guardando ? "Importando…" : `Importar ${cantItems} ítems`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
