import type { Item } from '@registro-obra/contrato';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { AlertTriangle, Check, Clock, RefreshCw, WifiOff } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aviso } from '@/components/aviso';
import { Texto } from '@/components/base';
import { SesionVencida } from '@/components/sesion-vencida';
import { tituloItem } from '@/components/selectores';
import { adelantarReintentos, reintentarGrupo } from '@/data/cola-local';
import { fotosDelDia, itemsDeObra, type FotoLocal } from '@/data/repositorio';
import { cambiarSoloWifi, sincronizar } from '@/data/sincronizacion';
import { fechaCorta, horaCorta } from '@/domain/fechas';
import { useApp, useSync } from '@/state/app';
import { useDatos } from '@/state/datos';
import { color, fuente, syncState } from '@/theme';

export default function Envios() {
  const { sesion, obra, fecha } = useApp();
  const sync = useSync();
  const { datos } = useDatos(useCallback(
    async () => {
      if (!obra || !sesion) return null;
      const [fotos, items] = await Promise.all([fotosDelDia(obra.id, sesion.usuarioId, fecha), itemsDeObra(obra.id)]);
      return { fotos, items };
    },
    [obra, sesion, fecha]),
  );

  const { fotosEsperando: esperando, fotosConError: conError } = sync.resumen;

  async function enviarAhora() {
    await adelantarReintentos();
    void sincronizar();
  }

  return (
    <SafeAreaView style={s.pantalla} edges={['top']}>
      <Aviso />
      <FlatList
        data={datos?.fotos ?? []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={s.contenido}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4, paddingHorizontal: 4, paddingTop: 6 }}>
              <Texto v="hero">Envíos de hoy</Texto>
              <Texto style={{ color: color.inkSoft }}>{[obra?.nombre, fechaCorta(fecha)].filter(Boolean).join(' · ')}</Texto>
            </View>

            <SesionVencida />

            {sync.sinSenal && esperando + conError > 0 ? (
              <View style={[s.estado, { backgroundColor: syncState.pendiente.bg }]}>
                <View style={s.filaEstado}>
                  <WifiOff size={24} color="#6E3207" strokeWidth={2.3} />
                  <Text style={[s.tituloEstado, { color: '#6E3207' }]}>
                    {sync.soloWifi ? 'Esperando Wi-Fi' : 'Sin señal ahora'}
                  </Text>
                </View>
                <Text style={[s.textoEstado, { color: '#6E3207' }]}>
                  {esperando === 1 ? '1 foto espera.' : `${esperando} fotos esperan.`} Se envían solas cuando vuelva la señal, no
                  hace falta hacer nada.
                </Text>
              </View>
            ) : esperando > 0 ? (
              <Pressable onPress={enviarAhora} style={[s.estado, { backgroundColor: syncState.subiendo.bg }]} accessibilityRole="button">
                <View style={s.filaEstado}>
                  <RefreshCw size={22} color={syncState.subiendo.fg} strokeWidth={2.3} />
                  <Text style={[s.tituloEstado, { color: syncState.subiendo.fg }]}>
                    {sync.enviando ? 'Enviando…' : esperando === 1 ? '1 foto por enviar' : `${esperando} fotos por enviar`}
                  </Text>
                </View>
                {!sync.enviando && <Text style={[s.textoEstado, { color: syncState.subiendo.fg }]}>Tocá para enviar ahora.</Text>}
              </Pressable>
            ) : conError === 0 ? (
              <View style={[s.estado, s.filaEstado, { backgroundColor: syncState.subida.bg }]}>
                <Check size={22} color={syncState.subida.fg} strokeWidth={2.6} />
                <Text style={[s.tituloEstado, { color: syncState.subida.fg }]}>Todo enviado</Text>
              </View>
            ) : null}

            {conError > 0 && (
              <View style={[s.estado, { backgroundColor: syncState.error.bg }]}>
                <View style={s.filaEstado}>
                  <AlertTriangle size={22} color={syncState.error.fg} strokeWidth={2.3} />
                  <Text style={[s.tituloEstado, { color: syncState.error.fg }]}>
                    {conError === 1 ? '1 foto no se pudo enviar' : `${conError} fotos no se pudieron enviar`}
                  </Text>
                </View>
                <Text style={[s.textoEstado, { color: syncState.error.fg }]}>Tocá la foto para ver qué pasó y reintentar.</Text>
              </View>
            )}

            <View style={s.wifi}>
              <Text style={s.textoWifi}>Enviar solo con Wi-Fi</Text>
              <Switch
                value={sync.soloWifi}
                onValueChange={cambiarSoloWifi}
                trackColor={{ true: color.ink, false: color.line }}
                thumbColor={color.surface}
                accessibilityLabel="Enviar solo con Wi-Fi"
              />
            </View>

          </View>
        }
        renderItem={({ item: f }) => (
          <FilaFoto foto={f} items={datos?.items ?? []} />
        )}
        ListEmptyComponent={datos ? <Texto style={{ color: color.inkSoft, padding: 4 }}>Hoy no hay fotos cargadas.</Texto> : undefined}
      />
    </SafeAreaView>
  );
}

function FilaFoto({ foto, items }: { foto: FotoLocal; items: Item[] }) {
  const item = items.find((i) => i.id === foto.item_id);
  const titulo = item ? tituloItem(item) : 'Foto sin ítem';
  const meta = [
    horaCorta(foto.tomada_en),
    foto.marcas ? (foto.marcas === 1 ? '1 marca' : `${foto.marcas} marcas`) : null,
  ].filter(Boolean).join(' · ');
  const tono = foto.estado === 'error' ? syncState.error : foto.estado === 'pendiente' ? syncState.pendiente : syncState.subida;
  const Icono = foto.estado === 'error' ? AlertTriangle : foto.estado === 'pendiente' ? Clock : Check;

  async function tocar() {
    if (foto.estado === 'error') {
      // Reintenta lo de esta foto; el error se muestra hasta que el reintento lo resuelva.
      await reintentarGrupo(foto.id);
      void sincronizar();
      return;
    }
    router.push({ pathname: '/foto/[id]', params: { id: foto.id } });
  }

  return (
    <Pressable onPress={tocar} accessibilityRole="button" style={({ pressed }) => [s.fila, pressed && { opacity: 0.8 }]}>
      <Image source={{ uri: foto.miniatura_local ?? undefined }} style={s.miniatura} contentFit="cover" />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={s.tituloFila} numberOfLines={1}>{titulo}</Text>
        <Text style={s.notaFila} numberOfLines={1}>{meta}</Text>
        {foto.estado === 'error' && (
          <Text style={[s.notaFila, { color: color.dangerText }]} numberOfLines={2}>
            {foto.error} Tocá para reintentar.
          </Text>
        )}
      </View>
      <View style={s.estadoFila}>
        <Icono size={16} color={tono.fg} strokeWidth={2.6} />
        <Text style={[s.textoEstadoFila, { color: tono.fg }]}>{foto.estado === 'subida' ? 'Enviado' : tono.label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  contenido: { padding: 16, gap: 8 },
  estado: { padding: 16, borderRadius: 16, gap: 8 },
  filaEstado: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tituloEstado: { fontFamily: fuente.displayBold, fontSize: 19 },
  textoEstado: { fontFamily: fuente.body, fontSize: 16, lineHeight: 23 },
  wifi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 4 },
  textoWifi: { fontFamily: fuente.bodySemi, fontSize: 16, color: color.ink },
  fila: { backgroundColor: color.surface, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniatura: { width: 64, height: 64, borderRadius: 10, backgroundColor: color.track },
  tituloFila: { fontFamily: fuente.bodySemi, fontSize: 16, color: color.ink },
  notaFila: { fontFamily: fuente.body, fontSize: 14, color: color.muted },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  textoEstadoFila: { fontFamily: fuente.bodySemi, fontSize: 14 },
});
