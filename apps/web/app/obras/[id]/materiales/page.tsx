"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileDown, FileSpreadsheet, Filter, Package, Upload, X } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { ESTADOS_PEDIDO, type EstadoPedido, NOMBRE_ESTADO_PEDIDO, type PedidoMaterialDetalle } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { useMateriales, useObra, usePedidos, useUrls } from "@/lib/datos";
import { fechaNumerica, hora } from "@/lib/formato";
import type { Celda } from "@/lib/importar-items";
import {
  COLOR_ESTADO,
  type CampoMaterial,
  type ColumnaPedido,
  type FiltrosPedido,
  type MapeoMaterial,
  descargarPedidos,
  detectarColumnas,
  filasDeMateriales,
  filtrarPedidos,
  valoresDeColumna,
} from "@/lib/materiales";
import { Encabezado, Modal, Vacio } from "@/components/ui";

export default function Materiales() {
  const { id } = useParams<{ id: string }>();
  const { obra, rol } = useObra(id);
  const editor = rol === "editor";
  const { pedidos, cargando, mutate: refrescar } = usePedidos(id);
  const { materiales, mutate } = useMateriales();
  const urls = useUrls(pedidos.flatMap((p) => p.fotos ?? []));
  const [importando, setImportando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string>();
  const [filtros, setFiltros] = useState<FiltrosPedido>({});
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [cambiando, setCambiando] = useState(false);

  const visibles = useMemo(() => filtrarPedidos(pedidos, filtros), [pedidos, filtros]);
  const hayFiltro = Object.keys(filtros).length > 0;
  // Lo elegido que sigue a la vista (un filtro nuevo no cambia en silencio pedidos ocultos).
  const elegidosVisibles = visibles.filter((p) => elegidos.has(p.id));
  const todosElegidos = visibles.length > 0 && elegidosVisibles.length === visibles.length;

  function filtrar(columna: ColumnaPedido, valores: string[] | undefined) {
    setFiltros(({ [columna]: _, ...resto }) => (valores ? { ...resto, [columna]: valores } : resto));
  }

  function elegir(pedido: string, si: boolean) {
    setElegidos((e) => {
      const n = new Set(e);
      if (si) n.add(pedido);
      else n.delete(pedido);
      return n;
    });
  }

  async function cambiarEstado(ids: string[], estado: EstadoPedido) {
    if (!ids.length) return;
    setCambiando(true);
    setError(undefined);
    const cambiar = new Set(ids);
    try {
      // Se ve al instante; si falla, se vuelve a lo que diga el servidor.
      await refrescar(
        async (actuales) => {
          await api.cambiarEstadoPedidos(id, { ids, estado });
          return (actuales ?? []).map((p) => (cambiar.has(p.id) ? { ...p, estado } : p));
        },
        { optimisticData: (actuales) => (actuales ?? []).map((p) => (cambiar.has(p.id) ? { ...p, estado } : p)), rollbackOnError: true, revalidate: true },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setCambiando(false);
    }
  }

  async function descargar() {
    if (!obra) return;
    setBajando(true);
    setError(undefined);
    try {
      // Siempre lo último: se vuelve a pedir la lista en el momento de descargar. Con filtros, sale lo filtrado.
      await descargarPedidos(filtrarPedidos(await api.pedidos(id), filtros), obra.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la planilla.");
    } finally {
      setBajando(false);
    }
  }

  const encabezado = (columna: ColumnaPedido, titulo: string, clase = "") => (
    <th className={`border-b border-borde py-3 font-semibold ${clase}`}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {titulo}
        <FiltroColumna
          titulo={titulo}
          valores={valoresDeColumna(filtrarPedidos(pedidos, filtros, columna), columna)}
          elegidos={filtros[columna]}
          cambiar={(v) => filtrar(columna, v)}
        />
      </span>
    </th>
  );

  if (!obra) return null;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Pedidos de materiales">
        {editor && (
          <button className="boton-secundario" onClick={() => setImportando(true)}>
            <Upload size={18} /> {materiales.length ? "Actualizar catálogo" : "Importar catálogo"}
          </button>
        )}
        <button className="boton-principal" onClick={descargar} disabled={bajando || visibles.length === 0}>
          <FileDown size={18} /> {bajando ? "Armando…" : hayFiltro ? "Descargar Excel (filtrado)" : "Descargar Excel"}
        </button>
      </Encabezado>
      {error && <p className="rounded-[10px] bg-peligro-suave px-4 py-2.5 text-sm font-semibold text-peligro-texto">{error}</p>}

      {editor && (
        <p className="text-sm text-tenue">
          {materiales.length
            ? `El catálogo tiene ${materiales.length} materiales. El equipo de campo los busca desde la app (sin ver el código) y ve el estado de cada pedido que hizo.`
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
        <div className="flex flex-col gap-3">
          {(hayFiltro || (editor && elegidosVisibles.length > 0)) && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[14px] bg-superficie px-4 py-2.5 shadow-sm">
              {editor && elegidosVisibles.length > 0 ? (
                <>
                  <span className="text-sm font-semibold">
                    {elegidosVisibles.length === 1 ? "1 pedido elegido" : `${elegidosVisibles.length} pedidos elegidos`}. Pasar a:
                  </span>
                  {ESTADOS_PEDIDO.map((e) => (
                    <button
                      key={e}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold disabled:opacity-50"
                      style={{ background: COLOR_ESTADO[e].bg, color: COLOR_ESTADO[e].fg }}
                      disabled={cambiando}
                      onClick={async () => {
                        await cambiarEstado(elegidosVisibles.map((p) => p.id), e);
                        setElegidos(new Set());
                      }}
                    >
                      <span className="size-2.5 rounded-full" style={{ background: COLOR_ESTADO[e].dot }} />
                      {NOMBRE_ESTADO_PEDIDO[e]}
                    </button>
                  ))}
                  <button className="ml-auto text-sm font-semibold text-plano-texto hover:underline" onClick={() => setElegidos(new Set())}>
                    No elegir ninguno
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-tenue">
                    Mostrando {visibles.length} de {pedidos.length} pedidos
                  </span>
                  <button className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-plano-texto hover:underline" onClick={() => setFiltros({})}>
                    <X size={14} /> Quitar filtros
                  </button>
                </>
              )}
            </div>
          )}
          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[980px] text-[15px]">
              <thead>
                <tr className="text-left text-sm text-tenue">
                  {editor && (
                    <th className="w-10 border-b border-borde py-3 pl-5">
                      <input
                        type="checkbox"
                        aria-label="Elegir todos los pedidos a la vista"
                        className="size-4 accent-tinta"
                        checked={todosElegidos}
                        ref={(el) => {
                          if (el) el.indeterminate = elegidosVisibles.length > 0 && !todosElegidos;
                        }}
                        onChange={(e) => setElegidos(e.target.checked ? new Set(visibles.map((p) => p.id)) : new Set())}
                      />
                    </th>
                  )}
                  {encabezado("fecha", "Pedido", editor ? "px-3" : "px-5")}
                  {encabezado("autor", "Solicitado por", "px-3")}
                  {encabezado("material", "Material", "px-3")}
                  {encabezado("cantidad", "Cantidad", "px-3")}
                  {encabezado("sector", "Sector", "px-3")}
                  {encabezado("para", "Para el", "px-3")}
                  {encabezado("estado", "Estado", "px-5")}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <FilaPedido
                    key={p.id}
                    p={p}
                    urls={urls}
                    editor={editor}
                    elegido={elegidos.has(p.id)}
                    elegir={(si) => elegir(p.id, si)}
                    cambiarEstado={(e) => cambiarEstado([p.id], e)}
                  />
                ))}
              </tbody>
            </table>
            {visibles.length === 0 && (
              <div className="p-8 text-center text-tenue">
                Ningún pedido con estos filtros.{" "}
                <button className="font-semibold text-plano-texto hover:underline" onClick={() => setFiltros({})}>
                  Quitar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editor && <Importador abierto={importando} cerrar={() => setImportando(false)} hayCatalogo={materiales.length > 0} alImportar={() => mutate()} />}
    </div>
  );
}

function FilaPedido({
  p,
  urls,
  editor,
  elegido,
  elegir,
  cambiarEstado,
}: {
  p: PedidoMaterialDetalle;
  urls: Record<string, string>;
  editor: boolean;
  elegido: boolean;
  elegir: (si: boolean) => void;
  cambiarEstado: (e: EstadoPedido) => void;
}) {
  const estado = p.estado ?? "enviado";
  return (
    <tr className={`border-b border-[#ECEAE4] align-top last:border-0 ${elegido ? "bg-acento-suave" : ""}`}>
      {editor && (
        <td className="py-3 pl-5">
          <input
            type="checkbox"
            aria-label="Elegir este pedido"
            className="mt-1 size-4 accent-tinta"
            checked={elegido}
            onChange={(e) => elegir(e.target.checked)}
          />
        </td>
      )}
      <td className={`whitespace-nowrap py-3 tabular-nums ${editor ? "px-3" : "px-5"}`}>
        {fechaNumerica(new Date(p.pedido_en).toLocaleDateString("en-CA", { timeZone: "America/Asuncion" }))} {hora(p.pedido_en)}
      </td>
      <td className="px-3 py-3">{p.autor_nombre}</td>
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
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{p.necesario_para ? fechaNumerica(p.necesario_para) : "—"}</td>
      <td className="whitespace-nowrap px-5 py-3">
        {editor ? (
          <select
            aria-label="Estado del pedido"
            className="h-9 cursor-pointer rounded-full border-0 py-0 pl-3 pr-8 text-[13px] font-bold outline-none focus:ring-2 focus:ring-plano/30"
            style={{ background: COLOR_ESTADO[estado].bg, color: COLOR_ESTADO[estado].fg }}
            value={estado}
            onChange={(e) => cambiarEstado(e.target.value as EstadoPedido)}
          >
            {ESTADOS_PEDIDO.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ESTADO_PEDIDO[e]}
              </option>
            ))}
          </select>
        ) : (
          <ChipEstadoPedido estado={estado} />
        )}
      </td>
    </tr>
  );
}

function ChipEstadoPedido({ estado }: { estado: EstadoPedido }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold" style={{ background: c.bg, color: c.fg }}>
      <span className="size-2.5 rounded-full" style={{ background: c.dot }} />
      {NOMBRE_ESTADO_PEDIDO[estado]}
    </span>
  );
}

/** Filtro tipo Excel: lista de los valores de la columna para tildar los que se quieren ver. */
function FiltroColumna({
  titulo,
  valores,
  elegidos,
  cambiar,
}: {
  titulo: string;
  valores: { valor: string; n: number }[];
  elegidos: string[] | undefined;
  cambiar: (v: string[] | undefined) => void;
}) {
  // Fijo en pantalla: la tabla tiene scroll horizontal y un menú adentro quedaría cortado.
  const [abierto, setAbierto] = useState<{ top: number; left: number } | null>(null);
  const [buscar, setBuscar] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: Event) => {
      if (e.type === "scroll" && menu.current?.contains(e.target as Node)) return; // la lista del propio menú
      setAbierto(null);
    };
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);
  const activo = elegidos !== undefined;
  const vale = new Set(elegidos ?? valores.map((v) => v.valor));
  const lista = buscar ? valores.filter((v) => v.valor.toLowerCase().includes(buscar.trim().toLowerCase())) : valores;

  function tildar(valor: string, si: boolean) {
    const n = new Set(vale);
    if (si) n.add(valor);
    else n.delete(valor);
    // Todo tildado = sin filtro.
    cambiar(valores.every((v) => n.has(v.valor)) ? undefined : [...n]);
  }

  return (
    <span>
      <button
        type="button"
        aria-label={`Filtrar por ${titulo.toLowerCase()}`}
        aria-expanded={!!abierto}
        title={activo ? "Filtro activo" : "Filtrar"}
        className={`grid size-7 place-items-center rounded-md hover:bg-fondo ${activo ? "bg-plano-suave text-plano-texto" : "text-tenue"}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAbierto(abierto ? null : { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
        }}
      >
        <Filter size={14} strokeWidth={activo ? 2.6 : 2} fill={activo ? "currentColor" : "none"} />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAbierto(null)} />
          <div ref={menu} style={abierto} className="fixed z-30 flex w-72 flex-col gap-2 rounded-[12px] border border-borde bg-superficie p-3 font-normal text-tinta shadow-lg">
            {valores.length > 8 && <input className="campo" placeholder="Buscar…" value={buscar} autoFocus onChange={(e) => setBuscar(e.target.value)} />}
            <div className="flex gap-3 text-sm">
              <button className="font-semibold text-plano-texto hover:underline" onClick={() => cambiar(undefined)}>
                Todos
              </button>
              <button className="font-semibold text-plano-texto hover:underline" onClick={() => cambiar([])}>
                Ninguno
              </button>
            </div>
            <ul className="max-h-[min(16rem,50vh)] overflow-auto">
              {lista.map((v) => (
                <li key={v.valor}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-fondo">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-tinta" checked={vale.has(v.valor)} onChange={(e) => tildar(v.valor, e.target.checked)} />
                    <span className="flex-1">{v.valor}</span>
                    <span className="tabular-nums text-tenue">{v.n}</span>
                  </label>
                </li>
              ))}
              {lista.length === 0 && <li className="px-1.5 py-1 text-sm text-tenue">Nada coincide.</li>}
            </ul>
            <button className="boton-secundario h-9" onClick={() => setAbierto(null)}>
              <Check size={16} /> Listo
            </button>
          </div>
        </>
      )}
    </span>
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
