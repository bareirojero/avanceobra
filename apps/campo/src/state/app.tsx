import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { backend, type Sesion } from '@/data/backend';
import { guardarAjuste, leerAjuste, vaciarBase } from '@/data/db';
import { borrarTodasLasFotos } from '@/data/fotos-disco';
import { misObras, type ObraMia } from '@/data/repositorio';
import { bajarNovedades, escucharSync, estadoSync, iniciarSincronizacion } from '@/data/sincronizacion';
import { fechaParte } from '@/domain/fechas';

interface App {
  cargando: boolean;
  sesion: Sesion | null;
  obras: ObraMia[];
  obra: ObraMia | null;
  /** Fecha del parte de hoy (AAAA-MM-DD, hora de Paraguay). */
  fecha: string;
  elegirObra: (id: string) => Promise<void>;
  ingresar: (usuario: string, contrasena: string) => Promise<void>;
  salir: () => Promise<void>;
  recargarObras: () => Promise<void>;
}

const Contexto = createContext<App | null>(null);

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [obras, setObras] = useState<ObraMia[]>([]);
  const [obraId, setObraId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => fechaParte(new Date()));

  const recargarObras = useCallback(async () => {
    if (!sesion) return;
    const lista = await misObras(sesion.usuarioId);
    setObras(lista);
    const guardada = await leerAjuste('obra_actual');
    setObraId((actual) => {
      const elegida = actual ?? guardada;
      return lista.some((o) => o.id === elegida) ? elegida : (lista[0]?.id ?? null);
    });
  }, [sesion]);

  // Sesión guardada: entra directo, aunque no haya señal.
  useEffect(() => {
    void (async () => {
      try {
        setSesion(await backend().sesionGuardada());
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sesion) return;
    // recargarObras actualiza el estado después de leer la base (asíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargarObras();
    void iniciarSincronizacion();
    // Cuando termina una sincronización pueden haber llegado obras o ítems nuevos.
    let ultima = estadoSync().ultimaVez;
    return escucharSync((e) => {
      if (e.ultimaVez !== ultima) {
        ultima = e.ultimaVez;
        void recargarObras();
      }
    });
  }, [sesion, recargarObras]);

  // A medianoche (o al volver a la app al otro día) empieza un parte nuevo.
  useEffect(() => {
    const revisar = () => setFecha(fechaParte(new Date()));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && revisar());
    const reloj = setInterval(revisar, 60_000);
    return () => {
      sub.remove();
      clearInterval(reloj);
    };
  }, []);

  const valor = useMemo<App>(
    () => ({
      cargando,
      sesion,
      obras,
      obra: obras.find((o) => o.id === obraId) ?? null,
      fecha,
      recargarObras,
      async elegirObra(id) {
        setObraId(id);
        await guardarAjuste('obra_actual', id);
      },
      async ingresar(usuario, contrasena) {
        const nueva = await backend().iniciarSesion(usuario, contrasena);
        await guardarAjuste('ultimo_usuario', usuario.trim());
        // Baja la obra y el itemizado antes de entrar, para que el capataz vea su obra.
        try {
          await bajarNovedades();
        } catch {
          // Sin señal: entra igual y baja después.
        }
        setSesion(nueva);
      },
      async salir() {
        await backend().cerrarSesion();
        await vaciarBase();
        borrarTodasLasFotos();
        setObras([]);
        setObraId(null);
        setSesion(null);
      },
    }),
    [cargando, sesion, obras, obraId, fecha, recargarObras],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp() {
  const app = useContext(Contexto);
  if (!app) throw new Error('useApp fuera de ProveedorApp');
  return app;
}

export function useSync() {
  return useSyncExternalStore(escucharSync, estadoSync);
}
