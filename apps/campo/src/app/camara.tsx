import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { X, Zap, ZapOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, BotonIcono, Texto } from '@/components/base';
import { procesarFoto } from '@/data/fotos-disco';
import { nuevoId } from '@/data/repositorio';
import { fotosNuevas } from '@/state/memoria';
import { acento, color } from '@/theme';

/** Ubicación aproximada sin hacer esperar: la última conocida, si hay permiso. */
async function ubicacionRapida(): Promise<{ latitud: number; longitud: number } | null> {
  try {
    const permiso = await Location.getForegroundPermissionsAsync();
    if (!permiso.granted) return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return pos ? { latitud: pos.coords.latitude, longitud: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

export default function Camara() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef<CameraView>(null);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [lista, setLista] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // El permiso de ubicación se pide una vez; si lo niegan, las fotos van sin GPS.
    void Location.requestForegroundPermissionsAsync().catch(() => undefined);
  }, []);

  async function sacar() {
    if (!camara.current || guardando) return;
    setGuardando(true);
    try {
      const tomadaEn = new Date().toISOString();
      const [foto, gps] = await Promise.all([
        camara.current.takePictureAsync({ quality: 1, exif: false, shutterSound: false }),
        ubicacionRapida(),
      ]);
      const id = nuevoId();
      const procesada = await procesarFoto(foto.uri, foto.width, foto.height, id);
      fotosNuevas.poner({ id, tomadaEn, latitud: gps?.latitud ?? null, longitud: gps?.longitud ?? null, ...procesada });
      router.replace({ pathname: '/foto/[id]', params: { id, nueva: '1' } });
    } catch (e) {
      console.warn('Cámara', e);
      setGuardando(false);
    }
  }

  if (!permiso) return <View style={s.negro} />;

  if (!permiso.granted) {
    return (
      <SafeAreaView style={[s.negro, { padding: 24, justifyContent: 'center', gap: 16 }]}>
        <Texto v="titulo" style={{ color: color.onInk }}>Falta permiso para la cámara</Texto>
        <Texto style={{ color: color.onInkMuted }}>La app necesita la cámara para sacar las fotos de la obra.</Texto>
        {permiso.canAskAgain ? (
          <Boton texto="Dar permiso" onPress={pedirPermiso} style={{ backgroundColor: acento }} />
        ) : (
          <Boton texto="Abrir ajustes del teléfono" onPress={() => Linking.openSettings()} borde />
        )}
        <Boton texto="Volver" borde onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <View style={s.negro}>
      <CameraView ref={camara} style={StyleSheet.absoluteFill} facing="back" flash={flash} onCameraReady={() => setLista(true)} />
      <SafeAreaView style={s.capa} pointerEvents="box-none">
        <View style={s.arriba}>
          <BotonIcono icono={X} etiqueta="Cerrar cámara" onPress={() => router.back()} />
          <BotonIcono
            icono={flash === 'off' ? ZapOff : Zap}
            etiqueta={flash === 'off' ? 'Flash apagado' : 'Flash automático'}
            onPress={() => setFlash((f) => (f === 'off' ? 'auto' : 'off'))}
          />
        </View>
        <View style={s.abajo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sacar foto"
            disabled={!lista || guardando}
            onPress={sacar}
            style={({ pressed }) => [s.disparador, pressed && { transform: [{ scale: 0.94 }] }]}>
            {guardando ? <ActivityIndicator size="large" color={color.ink} /> : <View style={s.disparadorInterior} />}
          </Pressable>
          {guardando && <Texto style={{ color: color.onInk }}>Guardando…</Texto>}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  negro: { flex: 1, backgroundColor: '#000' },
  capa: { flex: 1, justifyContent: 'space-between' },
  arriba: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  abajo: { alignItems: 'center', paddingBottom: 32, gap: 10 },
  disparador: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  disparadorInterior: { width: 68, height: 68, borderRadius: 34, backgroundColor: acento },
});
