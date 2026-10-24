import { router } from 'expo-router';
import { useCallback } from 'react';
import { AlertTriangle, Clock, PackagePlus } from 'lucide-react-native';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aviso } from '@/components/aviso';
import { BotonPrincipal, Texto } from '@/components/base';
import { SesionVencida } from '@/components/sesion-vencida';
import { tituloItem } from '@/components/selectores';
import { reintentarGrupo } from '@/data/cola-local';
import { itemsDeObra, materiales, misPedidos, type PedidoLocal } from '@/data/repositorio';
import { sincronizar } from '@/data/sincronizacion';
import { fechaCorta, horaCorta } from '@/domain/fechas';
import { agruparPorDia, cantidadTexto } from '@/domain/materiales';
import { useApp } from '@/state/app';
import { useDatos } from '@/state/datos';
import { color, fuente, pedidoState, syncState } from '@/theme';

export default function Materiales() {
  const { sesion, obra } = useApp();
  const { datos } = useDatos(useCallback(
    async () => {
      if (!obra || !sesion) return null;
      const [pedidos, items, catalogo] = await Promise.all([misPedidos(obra.id, sesion.usuarioId), itemsDeObra(obra.id), materiales()]);
      // Agrupados por el día en que se pidieron (la lista ya viene del más nuevo al más viejo).
      return { pedidos, dias: agruparPorDia(pedidos), items, hayCatalogo: catalogo.length > 0 };
    },
    [obra, sesion]),
  );

  return (
    <SafeAreaView style={s.pantalla} edges={['top']}>
      <Aviso />
      <SectionList
        sections={datos?.dias ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.contenido}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4, paddingHorizontal: 4, paddingTop: 6 }}>
              <Texto v="hero">Materiales</Texto>
              <Texto style={{ color: color.inkSoft }}>{obra?.nombre}</Texto>
            </View>
            <SesionVencida />
            {datos && !datos.hayCatalogo && (
              <Texto style={{ color: color.inkSoft, padding: 4 }}>
                Todavía no está cargada la lista de materiales. Avisale al editor; cuando la cargue aparece acá sola (hace falta señal).
              </Texto>
            )}
            {(datos?.pedidos.length ?? 0) > 0 && <Texto v="seccion" style={{ marginTop: 4 }}>Mis pedidos</Texto>}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={s.dia}>{section.titulo}</Text>}
        renderItem={({ item: p }) => {
          const item = datos?.items.find((i) => i.id === p.item_id);
          return <FilaPedido pedido={p} sector={item ? tituloItem(item) : 'Sector'} />;
        }}
        ListEmptyComponent={
          datos?.hayCatalogo ? (
            <Texto style={{ color: color.inkSoft, padding: 4 }}>Todavía no pediste materiales. Tocá “Pedir material” para empezar.</Texto>
          ) : undefined
        }
      />
      <View style={s.acciones}>
        <BotonPrincipal
          texto="Pedir material"
          icono={PackagePlus}
          style={{ flex: 1 }}
          disabled={!datos?.hayCatalogo}
          onPress={() => router.push('/pedido')}
        />
      </View>
    </SafeAreaView>
  );
}

function FilaPedido({ pedido: p, sector }: { pedido: PedidoLocal; sector: string }) {
  const meta = [
    `Pedido a las ${horaCorta(p.pedido_en)}`,
    p.necesario_para ? `para el ${fechaCorta(p.necesario_para)}` : null,
    p.fotos ? (p.fotos === 1 ? '1 foto' : `${p.fotos} fotos`) : null,
  ].filter(Boolean).join(' · ');

  async function tocar() {
    if (p.envio !== 'error') return;
    await reintentarGrupo(p.id);
    void sincronizar();
  }

  return (
    <Pressable onPress={tocar} disabled={p.envio !== 'error'} accessibilityRole="button" style={s.fila}>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={s.tituloFila} numberOfLines={2}>
          {cantidadTexto(p.cantidad)} {p.unidad ?? ''} · {p.material}
        </Text>
        <Text style={s.notaFila} numberOfLines={1}>{sector}</Text>
        <Text style={s.notaFila} numberOfLines={1}>{meta}</Text>
        {p.envio === 'error' && (
          <Text style={[s.notaFila, { color: color.dangerText }]} numberOfLines={2}>
            {p.error} Tocá para reintentar.
          </Text>
        )}
      </View>
      {p.envio === 'subida' ? <ChipEstado estado={p.estado} /> : <ChipEnvio envio={p.envio} />}
    </Pressable>
  );
}

/** En qué anda el pedido, según lo marcó la oficina. */
function ChipEstado({ estado }: { estado: PedidoLocal['estado'] }) {
  const e = pedidoState[estado] ?? pedidoState.enviado;
  return (
    <View style={[s.chip, { backgroundColor: e.bg }]} accessibilityLabel={`Estado: ${e.label}`}>
      <View style={[s.punto, { backgroundColor: e.dot }]} />
      <Text style={[s.textoChip, { color: e.fg }]} numberOfLines={2}>{e.label}</Text>
    </View>
  );
}

/** Todavía en el teléfono: esperando señal o con error. */
function ChipEnvio({ envio }: { envio: 'pendiente' | 'error' }) {
  const tono = envio === 'error' ? syncState.error : syncState.pendiente;
  const Icono = envio === 'error' ? AlertTriangle : Clock;
  return (
    <View style={s.estadoFila}>
      <Icono size={16} color={tono.fg} strokeWidth={2.6} />
      <Text style={[s.textoEstadoFila, { color: tono.fg }]}>{tono.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  contenido: { padding: 16, gap: 8 },
  acciones: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },
  fila: { backgroundColor: color.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tituloFila: { fontFamily: fuente.bodySemi, fontSize: 16, color: color.ink },
  notaFila: { fontFamily: fuente.body, fontSize: 14, color: color.muted },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  textoEstadoFila: { fontFamily: fuente.bodySemi, fontSize: 14 },
  dia: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.inkSoft, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 130 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  textoChip: { fontFamily: fuente.bodySemi, fontSize: 14, flexShrink: 1 },
});
