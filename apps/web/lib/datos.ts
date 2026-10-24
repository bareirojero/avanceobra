"use client";
// Lecturas de la API para las pantallas, con caché y revalidación (SWR).
import { useMemo } from "react";
import useSWR from "swr";
import type { CargoObra, DiaRespuesta, Informe, InformeConRevision, Item, Material, PedidoMaterialDetalle, RevisionInforme, RolObra, Sector, UsuarioConObras, Yo } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "./api";

const opciones = { revalidateOnFocus: true, shouldRetryOnError: (e: unknown) => !(e instanceof ErrorDeApi && e.estado < 500) };

/** Usuario con sesión y sus obras. `undefined` mientras carga; `null` sin sesión. */
export function useYo() {
  const { data, error, isLoading, mutate } = useSWR<Yo>("/yo", api.get, opciones);
  const sinSesion = error instanceof ErrorDeApi && error.estado === 401;
  // Error que no es falta de sesión: la API no responde (p. ej. el servidor está despertando).
  const caida = !!error && !sinSesion && !data;
  return { yo: sinSesion ? null : data, cargando: isLoading, caida, mutate };
}

export function useObra(id: string | undefined) {
  const { yo } = useYo();
  const fila = yo?.obras.find((o) => o.obra.id === id);
  // El admin de la organización actúa como editor en todas las obras.
  const rol: RolObra | null = fila ? (yo!.usuario.es_admin ? "editor" : fila.rol) : null;
  return { obra: fila?.obra, rol, cargo: fila?.cargo ?? null };
}

export function useItems(obraId: string) {
  const { data, mutate, isLoading } = useSWR<Item[]>(`/obras/${obraId}/items`, api.get, opciones);
  const items = useMemo(() => (data ?? []).filter((i) => !i.eliminado_en).sort((a, b) => a.orden - b.orden), [data]);
  return { items, cargando: isLoading, mutate };
}

export function useSectores(obraId: string) {
  const { data, mutate } = useSWR<Sector[]>(`/obras/${obraId}/sectores`, api.get, opciones);
  const sectores = useMemo(() => (data ?? []).filter((s) => !s.eliminado_en).sort((a, b) => a.orden - b.orden), [data]);
  return { sectores, mutate };
}

/** Catálogo de materiales de la organización. */
export function useMateriales() {
  const { data, mutate, isLoading } = useSWR<Material[]>("/materiales", api.get, opciones);
  return { materiales: data ?? [], cargando: isLoading, mutate };
}

/** Pedidos de materiales de la obra, del más nuevo al más viejo. Se refresca cada minuto. */
export function usePedidos(obraId: string) {
  const { data, mutate, isLoading } = useSWR<PedidoMaterialDetalle[]>(`/obras/${obraId}/pedidos`, api.get, { ...opciones, refreshInterval: 60000 });
  return { pedidos: data ?? [], cargando: isLoading, mutate };
}

export function useUsuarios(activo = true) {
  const { data, mutate } = useSWR<UsuarioConObras[]>(activo ? "/usuarios" : null, api.get, opciones);
  return { usuarios: data ?? [], mutate };
}

export type Miembro = UsuarioConObras & { rol: RolObra; cargo: CargoObra | null };

/** Personas de la obra con su rol. */
export function useEquipo(obraId: string) {
  const { rol } = useObra(obraId);
  // Todos los de la obra ven los nombres (para "Informaron" y los autores de las fotos).
  const { usuarios, mutate } = useUsuarios(rol !== null);
  const equipo = useMemo(
    () =>
      usuarios.flatMap((u) => {
        const m = u.obras.find((o) => o.obra_id === obraId);
        return m ? [{ ...u, rol: m.rol, cargo: m.cargo }] : [];
      }),
    [usuarios, obraId],
  );
  const nombre = (id: string) => equipo.find((u) => u.id === id)?.nombre ?? "Campo";
  return { equipo, nombre, mutate };
}

/** Lo cargado en un día. Mientras el informe se genera, consulta cada 3 s. */
export function useDia(obraId: string, fecha: string) {
  const { data, mutate, isLoading } = useSWR<DiaRespuesta>(`/obras/${obraId}/dia/${fecha}`, api.get, {
    ...opciones,
    refreshInterval: (d) => (d?.informe?.estado === "generando" ? 3000 : 60000),
  });
  const dia = useMemo(() => {
    const todas = (data?.fotos ?? []).sort((a, b) => a.tomada_en.localeCompare(b.tomada_en));
    const fotos = todas.filter((f) => !f.eliminado_en);
    const ids = new Set(fotos.map((f) => f.id));
    const marcas = (data?.anotaciones ?? []).sort((a, b) => a.numero - b.numero);
    return {
      partes: (data?.partes ?? []).filter((p) => !p.eliminado_en),
      fotos,
      anotaciones: marcas.filter((a) => ids.has(a.foto_id) && !a.eliminado_en),
      // Solo llegan al editor: fotos borradas (para restaurarlas) y marcas borradas (para el historial).
      borradas: todas.filter((f) => f.eliminado_en),
      todasLasMarcas: marcas,
      historial: data?.historial ?? [],
      registro: data?.registro ?? null,
      informe: data?.informe ?? null,
    };
  }, [data]);
  return { ...dia, cargando: isLoading, mutate };
}

export function useInformes(obraId: string) {
  const { data, mutate } = useSWR<Informe[]>(`/obras/${obraId}/informes`, api.get, opciones);
  const informes = useMemo(
    () => (data ?? []).filter((i) => !i.eliminado_en && i.tipo === "diario").sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde)),
    [data],
  );
  return { informes, mutate };
}

export function useInforme(id: string | undefined) {
  const { data, mutate } = useSWR<InformeConRevision>(id ? `/informes/${id}` : null, api.get, {
    ...opciones,
    refreshInterval: (d) => (d?.estado === "generando" ? 3000 : 0),
  });
  return { informe: data, mutate };
}

/** Revisiones publicadas del informe, la más nueva primero. */
export function useRevisiones(id: string | undefined) {
  const { data, mutate } = useSWR<RevisionInforme[]>(id ? `/informes/${id}/revisiones` : null, api.get, opciones);
  return { revisiones: data ?? [], mutate };
}

/** URLs firmadas de lectura para rutas del almacenamiento (válidas 1 h; se renuevan a los 50 min). */
export function useUrls(rutas: string[]) {
  const clave = rutas.length ? ["/archivos/ver", ...[...new Set(rutas)].sort()] : null;
  const { data } = useSWR(clave, ([, ...r]: string[]) => api.ver(r).then((x) => x.urls), { refreshInterval: 50 * 60 * 1000, revalidateOnFocus: false });
  return data ?? {};
}

/** "21 · Excavación de zanja" (número de ítem del itemizado + descripción). */
export function nombreItem(i: { numero: string | null; descripcion: string }) {
  return i.numero ? `${i.numero} · ${i.descripcion}` : i.descripcion;
}
