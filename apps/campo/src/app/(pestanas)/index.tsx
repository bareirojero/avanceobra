import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Camera, ChevronDown, Upload } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aviso } from '@/components/aviso';
import { Boton, BotonPrincipal, Texto } from '@/components/base';
import { ChipSync } from '@/components/chip-sync';
import { SesionVencida } from '@/components/sesion-vencida';
import { procesarFoto } from '@/data/fotos-disco';
import { fotosDelDia, nuevoId, type FotoLocal } from '@/data/repositorio';
import { sincronizarPronto } from '@/data/sincronizacion';
import { diaYFecha, horaCorta } from '@/domain/fechas';
import { useApp, useSync } from '@/state/app';
import { useDatos } from '@/state/datos';
import { fotosNuevas } from '@/state/memoria';
import { color, fuente, syncState } from '@/theme';

const CARGOS: Record<string, string> = {
  capataz: 'Capataz', residente: 'Residente', jefe_obra: 'Jefe de obra', oficina_tecnica: 'Oficina Técnica', fiscal: 'Fiscal', cliente: 'Cliente', otro: '',
};

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export default function Hoy() {
  const { sesion, obra, obras, fecha, salir } = useApp();
  const sync = useSync();
  const { datos } = useDatos(useCallback(
    async () => (obra && sesion ? await fotosDelDia(obra.id, sesion.usuarioId, fecha) : null),
    [obra, sesion, fecha]),
  );

  const [subiendo, setSubiendo] = useState(false);

  if (!sesion) return null;
  if (!obra) return <SinObras />;

  /**
   * Una imagen de la galería o de los archivos del teléfono sigue el mismo camino que una
   * foto de la cámara: se comprime, se le ponen marcas y un ítem, y va al día de hoy.
   */
  async function subirArchivo() {
    if (subiendo) return;
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const elegida = r.canceled ? null : r.assets[0];
      if (!elegida) return;
      setSubiendo(true);
      const id = nuevoId();
      const procesada = await procesarFoto(elegida.uri, elegida.width, elegida.height, id);
      // Sin GPS: la imagen pudo sacarse en otro lado.
      fotosNuevas.poner({ id, tomadaEn: new Date().toISOString(), latitud: null, longitud: null, ...procesada });
      router.push({ pathname: '/foto/[id]', params: { id, nueva: '1' } });
    } catch (e) {
      console.warn('Subir archivo', e);
      Alert.alert('No se pudo abrir la imagen', 'Probá con otra. Si sigue pasando, avisale al editor.');
    } finally {
      setSubiendo(false);
    }
  }

  const fotos = datos ?? [];

  function menuPerfil() {
    const pendientes = sync.resumen.operaciones;
    Alert.alert(sesion!.nombre, `Usuario: ${sesion!.usuario}`, [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Cerrar sesión',
            pendientes > 0
              ? 'Hay cargas que todavía no se enviaron y se van a perder si cerrás la sesión. Esperá a tener señal.'
              : 'Se borran del teléfono las fotos y datos guardados. Lo enviado queda en el servidor.',
            pendientes > 0
              ? [{ text: 'Entendido', style: 'cancel' }]
              : [{ text: 'Volver', style: 'cancel' }, { text: 'Cerrar sesión', style: 'destructive', onPress: () => void salir() }],
          ),
      },
    ]);
  }

  return (
    <SafeAreaView style={s.pantalla} edges={['top']}>
      <Aviso />
      <View style={s.cabecera}>
        <View style={s.filaCabecera}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={obras.length > 1 ? `Obra ${obra.nombre}. Cambiar de obra` : `Obra ${obra.nombre}`}
            disabled={obras.length < 2}
            onPress={() => router.push('/obras')}
            style={s.obra}>
            <Text style={s.nombreObra} numberOfLines={1}>{obra.nombre}</Text>
            {obras.length > 1 && <ChevronDown size={24} color={color.ink} strokeWidth={2.5} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Mi perfil" onPress={menuPerfil} style={s.avatar}>
            <Text style={s.textoAvatar}>{iniciales(sesion.nombre)}</Text>
          </Pressable>
        </View>
        <View style={s.filaCabecera}>
          <Texto style={{ color: color.inkSoft, fontFamily: fuente.bodyMedium, flexShrink: 1 }}>
            {[diaYFecha(fecha), obra.cargo ? CARGOS[obra.cargo] : null].filter(Boolean).join(' · ')}
          </Texto>
          <Pressable onPress={() => router.navigate('/envios')} accessibilityRole="button">
            <ChipSync estado={sync} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.contenido}>
        <SesionVencida />
        <View style={{ gap: 10 }}>
          <View style={s.tituloFotos}>
            <Texto v="seccion">Mis fotos de hoy</Texto>
            {fotos.length > 0 && (
              <Pressable onPress={() => router.navigate('/envios')} hitSlop={10} accessibilityRole="link">
                <Text style={s.enlace}>{fotos.length === 1 ? 'Ver la foto' : `Ver las ${fotos.length}`}</Text>
              </Pressable>
            )}
          </View>
          {fotos.length === 0 ? (
            <Texto style={{ color: color.inkSoft }}>Todavía no sacaste fotos hoy. Tocá “Sacar foto” para empezar, o “Subir archivo” para cargar una imagen del teléfono.</Texto>
          ) : (
            <View style={s.grilla}>
              {fotos.map((f) => <Miniatura key={f.id} foto={f} />)}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={s.acciones}>
        <Boton
          texto={subiendo ? 'Preparando…' : 'Subir archivo'}
          icono={Upload}
          borde
          disabled={subiendo}
          onPress={subirArchivo}
          style={s.subir}
        />
        <BotonPrincipal texto="Sacar foto" icono={Camera} onPress={() => router.push('/camara')} />
      </View>
    </SafeAreaView>
  );
}

function Miniatura({ foto }: { foto: FotoLocal }) {
  const etiqueta =
    foto.estado === 'error'
      ? { texto: 'No se envió', bg: color.danger }
      : foto.estado === 'pendiente'
        ? { texto: 'En espera', bg: syncState.pendiente.fg }
        : { texto: 'Enviada', bg: syncState.subida.fg };
  return (
    <Pressable
      style={s.miniatura}
      accessibilityRole="button"
      accessibilityLabel={`Foto de las ${horaCorta(foto.tomada_en)}, ${etiqueta.texto}`}
      onPress={() => router.push({ pathname: '/foto/[id]', params: { id: foto.id } })}>
      <Image source={{ uri: foto.miniatura_local ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[s.etiqueta, { backgroundColor: etiqueta.bg }]}>
        <Text style={s.textoEtiqueta}>{etiqueta.texto}</Text>
      </View>
    </Pressable>
  );
}

function SinObras() {
  const { recargarObras, salir } = useApp();
  return (
    <SafeAreaView style={[s.pantalla, { padding: 24, gap: 16, justifyContent: 'center' }]}>
      <Texto v="titulo">Todavía no tenés obras</Texto>
      <Texto>Pedile al editor que te sume a una obra. Cuando lo haga, aparece acá sola (hace falta señal).</Texto>
      <Boton texto="Buscar de nuevo" onPress={() => { sincronizarPronto(0); void recargarObras(); }} />
      <Boton texto="Cerrar sesión" borde onPress={() => void salir()} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  cabecera: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10 },
  filaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  obra: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, flexShrink: 1 },
  nombreObra: { fontFamily: fuente.display, fontSize: 28, color: color.ink, flexShrink: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  textoAvatar: { color: color.onInk, fontFamily: fuente.bodySemi, fontSize: 16 },
  contenido: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  tituloFotos: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  enlace: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.plano },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniatura: { width: '31.8%', height: 104, borderRadius: 12, overflow: 'hidden', backgroundColor: color.track },
  etiqueta: { position: 'absolute', left: 6, bottom: 6, height: 24, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center' },
  textoEtiqueta: { color: '#fff', fontFamily: fuente.bodySemi, fontSize: 12 },
  acciones: { gap: 10, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },
  // Secundario y discreto: gris, más bajo que "Sacar foto".
  subir: { backgroundColor: color.track, borderColor: color.track, minHeight: 52 },
});
