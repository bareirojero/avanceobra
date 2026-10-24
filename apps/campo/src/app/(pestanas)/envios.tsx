import type { Item } from '@registro-obra/contrato';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, RefreshCw, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aviso } from '@/components/aviso';
import { Boton, Chip, Texto } from '@/components/base';
import { SesionVencida } from '@/components/sesion-vencida';
import { tituloItem } from '@/components/selectores';
import { adelantarReintentos, reintentarGrupo } from '@/data/cola-local';
import { misFotosAnterioresLocales, misFotosRemotas } from '@/data/historial';
import { fotosDelDia, itemsDeObra, type EstadoEnvio, type FotoLocal } from '@/data/repositorio';
import { cambiarSoloWifi, sincronizar } from '@/data/sincronizacion';
import { diaYFecha, fechaCorta, horaCorta } from '@/domain/fechas';
import { unirDias, type FotoAnterior } from '@/domain/historial';
import { useApp, useSync } from '@/state/app';
import { useDatos } from '@/state/datos';
import { fotosAnteriores } from '@/state/memoria';
import { color, fuente, syncState } from '@/theme';

/** Fila de la lista: título de un día, foto de hoy (editable) o de un día anterior (solo mirar). */
type Fila =
  | { tipo: 'dia'; clave: string; titulo: string }
  | { tipo: 'nota'; clave: string; texto: string }
  | { tipo: 'hoy'; clave: string; foto: FotoLocal }
  | { tipo: 'anterior'; clave: string; foto: FotoAnterior };

/** Las URLs firmadas del servidor duran 60 minutos: se renuevan antes de que venzan. */
const RENOVAR_MS = 40 * 60_000;

export default function Envios() {
  const { sesion, obra, fecha } = useApp();
  const sync = useSync();
  const { datos } = useDatos(useCallback(
    async () => {
      if (!obra || !sesion) return null;
      const [fotos, anteriores, items] = await Promise.all([
        fotosDelDia(obra.id, sesion.usuarioId, fecha),
        misFotosAnterioresLocales(obra.id, sesion.usuarioId, fecha),
        itemsDeObra(obra.id),
      ]);
      return { fotos, anteriores, items };
    },
    [obra, sesion, fecha]),
  );
  const remoto = useMisFotosRemotas(obra?.id ?? null, fecha);

  const { fotosEsperando: esperando, fotosConError: conError } = sync.resumen;
  // Filtro por ítem: solo los ítems que tienen fotos hoy, en el orden del itemizado.
  const [filtro, setFiltro] = useState<string | null>(null);
  const fotos = datos?.fotos ?? [];
  const items = datos?.items ?? [];
  const itemsDelDia = items.filter((i) => fotos.some((f) => f.item_id === i.id));
  const elegido = itemsDelDia.some((i) => i.id === filtro) ? filtro : null;
  const visibles = elegido ? fotos.filter((f) => f.item_id === elegido) : fotos;

  const dias = unirDias(datos?.anteriores ?? [], remoto.fotos, fecha);
  const filas: Fila[] = [
    ...(fotos.length || dias.length ? [{ tipo: 'dia' as const, clave: 'dia-hoy', titulo: `Hoy · ${fechaCorta(fecha)}` }] : []),
    ...(!fotos.length && dias.length ? [{ tipo: 'nota' as const, clave: 'nota-hoy', texto: 'Hoy todavía no hay fotos.' }] : []),
    ...visibles.map((f) => ({ tipo: 'hoy' as const, clave: f.id, foto: f })),
    ...dias.flatMap(({ fecha: dia, fotos: deDia }) => [
      { tipo: 'dia' as const, clave: `dia-${dia}`, titulo: `${diaYFecha(dia)} · ${deDia.length === 1 ? '1 foto' : `${deDia.length} fotos`}` },
      ...deDia.map((f) => ({ tipo: 'anterior' as const, clave: f.id, foto: f })),
    ]),
  ];

  async function enviarAhora() {
    await adelantarReintentos();
    void sincronizar();
  }

  return (
    <SafeAreaView style={s.pantalla} edges={['top']}>
      <Aviso />
      <FlatList
        data={filas}
        keyExtractor={(f) => f.clave}
        onEndReached={remoto.cargarMas}
        onEndReachedThreshold={0.5}
        contentContainerStyle={s.contenido}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4, paddingHorizontal: 4, paddingTop: 6 }}>
              <Texto v="hero">Envíos</Texto>
              <Texto style={{ color: color.inkSoft }}>{[obra?.nombre, 'mis fotos de todos los días'].filter(Boolean).join(' · ')}</Texto>
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

            {itemsDelDia.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtros} accessibilityLabel="Filtrar por ítem">
                <Chip texto={`Todas (${fotos.length})`} elegido={!elegido} onPress={() => setFiltro(null)} />
                {itemsDelDia.map((i) => (
                  <Chip
                    key={i.id}
                    texto={`${tituloItem(i)} (${fotos.filter((f) => f.item_id === i.id).length})`}
                    elegido={elegido === i.id}
                    onPress={() => setFiltro(elegido === i.id ? null : i.id)}
                    style={{ maxWidth: 260 }}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        }
        renderItem={({ item: fila }) =>
          fila.tipo === 'dia' ? (
            <Text style={s.tituloDia}>{fila.titulo}</Text>
          ) : fila.tipo === 'nota' ? (
            <Texto style={{ color: color.inkSoft, paddingHorizontal: 4 }}>{fila.texto}</Texto>
          ) : fila.tipo === 'hoy' ? (
            <FilaHoy foto={fila.foto} items={items} />
          ) : (
            <FilaAnterior foto={fila.foto} items={items} />
          )
        }
        ListEmptyComponent={datos ? <Texto style={{ color: color.inkSoft, padding: 4 }}>Todavía no hay fotos cargadas.</Texto> : undefined}
        ListFooterComponent={
          remoto.cargando ? (
            <ActivityIndicator color={color.ink} style={{ padding: 16 }} />
          ) : remoto.sinSenal ? (
            <View style={s.pie}>
              <Texto v="nota">Sin señal: se ven solo las fotos guardadas en este teléfono.</Texto>
              <Boton texto="Buscar de nuevo" borde onPress={remoto.reintentar} />
            </View>
          ) : remoto.siguiente ? (
            <View style={s.pie}>
              <Boton texto="Ver días anteriores" borde onPress={remoto.cargarMas} />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function FilaHoy({ foto, items }: { foto: FotoLocal; items: Item[] }) {
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
    <FilaFoto
      itemId={foto.item_id} items={items} tomadaEn={foto.tomada_en} marcas={foto.marcas}
      miniatura={foto.miniatura_local} estado={foto.estado} error={foto.error} onPress={tocar}
    />
  );
}

/** Foto de otro día: se mira, no se edita. Si quedó con error, igual se puede reintentar el envío. */
function FilaAnterior({ foto, items }: { foto: FotoAnterior; items: Item[] }) {
  async function tocar() {
    if (foto.estado === 'error') {
      await reintentarGrupo(foto.id);
      void sincronizar();
      return;
    }
    fotosAnteriores.poner(foto);
    router.push({ pathname: '/foto-anterior', params: { id: foto.id } });
  }
  return (
    <FilaFoto
      itemId={foto.item_id} items={items} tomadaEn={foto.tomada_en} marcas={foto.marcas}
      miniatura={foto.miniatura} claveMiniatura={foto.claveMiniatura} estado={foto.estado ?? 'subida'}
      error={foto.error} onPress={tocar}
    />
  );
}

function FilaFoto({ itemId, items, tomadaEn, marcas, miniatura, claveMiniatura, estado, error, onPress }: {
  itemId: string;
  items: Item[];
  tomadaEn: string;
  marcas: number;
  miniatura: string | null;
  claveMiniatura?: string | null;
  estado: EstadoEnvio;
  error: string | null;
  onPress: () => void;
}) {
  const item = items.find((i) => i.id === itemId);
  const titulo = item ? tituloItem(item) : 'Foto sin ítem';
  const meta = [
    horaCorta(tomadaEn),
    marcas ? (marcas === 1 ? '1 marca' : `${marcas} marcas`) : null,
  ].filter(Boolean).join(' · ');
  const tono = estado === 'error' ? syncState.error : estado === 'pendiente' ? syncState.pendiente : syncState.subida;
  const Icono = estado === 'error' ? AlertTriangle : estado === 'pendiente' ? Clock : Check;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.fila, pressed && { opacity: 0.8 }]}>
      <Image
        source={miniatura ? { uri: miniatura, cacheKey: claveMiniatura ?? undefined } : undefined}
        style={s.miniatura}
        contentFit="cover"
      />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={s.tituloFila} numberOfLines={1}>{titulo}</Text>
        <Text style={s.notaFila} numberOfLines={1}>{meta}</Text>
        {estado === 'error' && (
          <Text style={[s.notaFila, { color: color.dangerText }]} numberOfLines={2}>
            {error} Tocá para reintentar.
          </Text>
        )}
      </View>
      <View style={s.estadoFila}>
        <Icono size={16} color={tono.fg} strokeWidth={2.6} />
        <Text style={[s.textoEstadoFila, { color: tono.fg }]}>{estado === 'subida' ? 'Enviado' : tono.label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Mis fotos de días anteriores que tiene el servidor, de a páginas de días. Sin señal no
 * falla: la pantalla sigue mostrando lo guardado en el teléfono.
 */
function useMisFotosRemotas(obraId: string | null, hoy: string) {
  // Con la obra a la que pertenecen: al cambiar de obra no se muestran las de la anterior.
  const [pagina, setPagina] = useState<{ obraId: string; fotos: FotoAnterior[]; siguiente: string | null } | null>(null);
  const fotos = pagina?.obraId === obraId ? pagina.fotos : [];
  const siguiente = pagina?.obraId === obraId ? pagina.siguiente : null;
  const [cargando, setCargando] = useState(false);
  const [sinSenal, setSinSenal] = useState(false);
  const pedido = useRef(0);
  const cargadaEn = useRef(0);

  const cargar = useCallback(
    async (antes: string, desdeCero: boolean) => {
      if (!obraId) return;
      const este = ++pedido.current;
      setCargando(true);
      try {
        const r = await misFotosRemotas(obraId, antes);
        if (este !== pedido.current) return;
        setPagina((previa) => ({
          obraId,
          fotos: desdeCero || previa?.obraId !== obraId ? r.fotos : [...previa.fotos, ...r.fotos],
          siguiente: r.siguiente,
        }));
        setSinSenal(false);
        if (desdeCero) cargadaEn.current = Date.now();
      } catch (e) {
        if (este !== pedido.current) return;
        console.warn('Envíos anteriores', e);
        setSinSenal(true);
      } finally {
        if (este === pedido.current) setCargando(false);
      }
    },
    [obraId],
  );

  // Al entrar a la pestaña (y al cambiar de obra o de día) se pide la primera página; si
  // ya estaba, se vuelve a pedir solo después de un rato, porque las URLs vencen.
  const cargadaPara = useRef('');
  useFocusEffect(
    useCallback(() => {
      const para = `${obraId}/${hoy}`;
      if (cargadaPara.current === para && Date.now() - cargadaEn.current < RENOVAR_MS) return;
      cargadaPara.current = para;
      void cargar(hoy, true);
    }, [cargar, obraId, hoy]),
  );

  return {
    fotos,
    siguiente,
    cargando,
    sinSenal,
    cargarMas: () => {
      if (siguiente && !cargando && !sinSenal) void cargar(siguiente, false);
    },
    reintentar: () => void cargar(hoy, true),
  };
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  contenido: { padding: 16, gap: 8 },
  estado: { padding: 16, borderRadius: 16, gap: 8 },
  filaEstado: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tituloEstado: { fontFamily: fuente.displayBold, fontSize: 19 },
  textoEstado: { fontFamily: fuente.body, fontSize: 16, lineHeight: 23 },
  filtros: { gap: 8, paddingHorizontal: 4 },
  wifi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 4 },
  textoWifi: { fontFamily: fuente.bodySemi, fontSize: 16, color: color.ink },
  fila: { backgroundColor: color.surface, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniatura: { width: 64, height: 64, borderRadius: 10, backgroundColor: color.track },
  tituloFila: { fontFamily: fuente.bodySemi, fontSize: 16, color: color.ink },
  notaFila: { fontFamily: fuente.body, fontSize: 14, color: color.muted },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  textoEstadoFila: { fontFamily: fuente.bodySemi, fontSize: 14 },
  tituloDia: { fontFamily: fuente.displayBold, fontSize: 18, color: color.ink, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 2 },
  pie: { gap: 10, paddingVertical: 12, paddingHorizontal: 4 },
});
