import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { escucharSync } from '@/data/sincronizacion';

/**
 * Carga datos de la base local al entrar a la pantalla y cada vez que la sincronización
 * cambia algo (una foto que se subió, ítems nuevos). `cargar` tiene que venir de un
 * useCallback: cuando cambia, se vuelve a cargar.
 */
export function useDatos<T>(cargar: () => Promise<T>): { datos: T | null; recargar: () => void } {
  const [datos, setDatos] = useState<T | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useFocusEffect(recargar);
  useEffect(() => escucharSync(recargar), [recargar]);
  useEffect(() => {
    let vigente = true;
    cargar().then(
      (d) => vigente && setDatos(d),
      (e) => console.warn(e),
    );
    return () => {
      vigente = false;
    };
  }, [cargar, vuelta]);

  return { datos, recargar };
}
