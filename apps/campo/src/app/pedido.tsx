import type { Item, MaterialCampo } from '@registro-obra/contrato';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { ArrowLeft, Camera, Check, ChevronRight, ImagePlus, PencilLine, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, BotonIcono, BotonPrincipal, Chip, Texto } from '@/components/base';
import { ElegirItem, tituloItem } from '@/components/selectores';
import { borrarSilencioso, procesarFoto } from '@/data/fotos-disco';
import { guardarPedido, itemsDeObra, itemsRecientes, materiales as leerMateriales, nuevoId } from '@/data/repositorio';
import { refrescarResumen, sincronizarPronto } from '@/data/sincronizacion';
import { rubro } from '@/domain/itemizado';
import { buscarMateriales, leerCantidad, proximosDias } from '@/domain/materiales';
import { useApp } from '@/state/app';
import { mostrarAviso } from '@/state/memoria';
import { color, fuente, toque } from '@/theme';

/**
 * Pedido de un material: se busca el material, se escribe la cantidad (en su unidad), se
 * elige el sector (un ítem del itemizado, como en las fotos) y para cuándo hace falta.
 * Queda guardado en el teléfono y se envía solo.
 */
export default function Pedido() {
  const { sesion, obra, fecha } = useApp();
  const obraId = obra?.id;
  const usuarioId = sesion?.usuarioId;

  const [catalogo, setCatalogo] = useState<MaterialCampo[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [paso, setPaso] = useState<'material' | 'detalle' | 'sector'>('material');
  const [material, setMaterial] = useState<MaterialCampo | null>(null);
  // Material que no está en el catálogo: se escribe a mano.
  const [manual, setManual] = useState<{ texto: string; unidad: string } | null>(null);
  const [fotos, setFotos] = useState<{ id: string; archivoLocal: string }[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [necesarioPara, setNecesarioPara] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!obraId || !usuarioId) return;
    void (async () => {
      setCatalogo(await leerMateriales());
      setItems(await itemsDeObra(obraId));
      setRecientes(await itemsRecientes(obraId, usuarioId));
    })();
  }, [obraId, usuarioId]);

  // Botón atrás de Android: vuelve al paso anterior.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paso === 'sector') setPaso('detalle');
      else if (paso === 'detalle') setPaso('material');
      else router.back();
      return true;
    });
    return () => sub.remove();
  });

  const dias = useMemo(() => proximosDias(fecha), [fecha]);
  const numero = leerCantidad(cantidad);
  const item = items.find((i) => i.id === itemId);

  const unidad = material?.unidad ?? (manual?.unidad.trim() || null);
  const faltaMaterial = !material && !manual?.texto.trim();

  /** Foto de referencia del producto, de la cámara o de la galería. Se comprime como las de obra. */
  async function agregarFoto(desde: 'camara' | 'galeria') {
    try {
      if (desde === 'camara' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        return Alert.alert('Sin permiso de cámara', 'Habilitá la cámara para la app en los ajustes del teléfono.');
      }
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const r = desde === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      const elegida = r.canceled ? null : r.assets[0];
      if (!elegida) return;
      setProcesando(true);
      const id = nuevoId();
      const f = await procesarFoto(elegida.uri, elegida.width, elegida.height, id);
      borrarSilencioso(f.miniaturaLocal); // el pedido no usa miniatura
      setFotos((actuales) => [...actuales, { id, archivoLocal: f.archivoLocal }]);
    } catch (e) {
      console.warn(e);
      Alert.alert('No se pudo agregar la foto', String(e instanceof Error ? e.message : e));
    } finally {
      setProcesando(false);
    }
  }

  function quitarFoto(id: string) {
    setFotos((actuales) => {
      borrarSilencioso(actuales.find((f) => f.id === id)?.archivoLocal);
      return actuales.filter((f) => f.id !== id);
    });
  }

  async function enviar() {
    if (!obra || !sesion || faltaMaterial) return;
    if (!numero) return Alert.alert('Falta la cantidad', 'Escribí cuánto necesitás, por ejemplo 12 o 2,5.');
    if (!itemId) return Alert.alert('Falta el sector', 'Elegí para qué sector es el material.');
    setGuardando(true);
    try {
      await guardarPedido({
        obraId: obra.id, autorId: sesion.usuarioId, materialId: material?.id ?? null,
        materialTexto: manual?.texto.trim() || null, unidadTexto: manual?.unidad.trim() || null,
        itemId, cantidad: numero, necesarioPara, fotos,
      });
      await refrescarResumen();
      sincronizarPronto();
      mostrarAviso('Pedido guardado. Se envía solo.');
      router.back();
    } catch (e) {
      console.warn(e);
      setGuardando(false);
      Alert.alert('No se pudo guardar', `Probá de nuevo. Si sigue pasando, avisale al editor.\n\nDetalle: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (paso === 'material') {
    return (
      <SafeAreaView style={s.pantalla}>
        <View style={s.cabecera}>
          <BotonIcono icono={X} etiqueta="Cerrar" claro onPress={() => router.back()} />
          <Texto v="titulo" style={{ flex: 1 }}>¿Qué material?</Texto>
        </View>
        <ElegirMaterial
          materiales={catalogo}
          alElegir={(m) => {
            setMaterial(m);
            setManual(null);
            setPaso('detalle');
          }}
          noEncontrado={(texto) => {
            setMaterial(null);
            setManual({ texto, unidad: '' });
            setPaso('detalle');
          }}
        />
      </SafeAreaView>
    );
  }

  if (paso === 'sector') {
    return (
      <SafeAreaView style={s.pantalla}>
        <View style={s.cabecera}>
          <BotonIcono icono={ArrowLeft} etiqueta="Volver al pedido" claro onPress={() => setPaso('detalle')} />
          <View style={{ flex: 1 }}>
            <Texto v="titulo">¿Para qué sector?</Texto>
            <Texto v="nota" style={{ fontSize: 14 }}>Los mismos ítems que usás en las fotos.</Texto>
          </View>
        </View>
        <ElegirItem
          items={items}
          recientes={recientes}
          elegido={itemId}
          alElegir={(id) => {
            setItemId(id);
            setPaso('detalle');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.cabecera}>
        <BotonIcono icono={ArrowLeft} etiqueta="Cambiar material" claro onPress={() => setPaso('material')} />
        <Texto v="titulo" style={{ flex: 1 }}>Pedido</Texto>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          {manual ? (
            <View style={{ gap: 6 }}>
              <View style={s.filaEtiqueta}>
                <Texto v="etiqueta">Material que no está en la lista</Texto>
                <Pressable onPress={() => setPaso('material')} hitSlop={10} accessibilityRole="button">
                  <Text style={s.enlace}>Buscar de nuevo</Text>
                </Pressable>
              </View>
              <TextInput
                value={manual.texto}
                onChangeText={(texto) => setManual({ ...manual, texto })}
                placeholder="Escribí el material que necesitás"
                placeholderTextColor={color.muted}
                multiline
                style={s.campoTexto}
              />
              <TextInput
                value={manual.unidad}
                onChangeText={(u) => setManual({ ...manual, unidad: u.slice(0, 20) })}
                placeholder="Unidad (KG, M3, UN, BOLSA…)"
                placeholderTextColor={color.muted}
                autoCapitalize="characters"
                style={s.campoUnidad}
              />
            </View>
          ) : (
            <Pressable onPress={() => setPaso('material')} accessibilityRole="button" style={s.tarjeta}>
              <View style={{ flex: 1, gap: 2 }}>
                <Texto v="etiqueta">Material</Texto>
                <Text style={s.textoGrande}>{material?.descripcion}</Text>
                {material?.unidad ? <Texto v="nota" style={{ fontSize: 15 }}>Se pide en {material.unidad}</Texto> : null}
              </View>
              <Text style={s.enlace}>Cambiar</Text>
            </Pressable>
          )}

          <View style={{ gap: 6 }}>
            <Texto v="etiqueta">Cantidad</Texto>
            <View style={s.cantidad}>
              <TextInput
                value={cantidad}
                onChangeText={setCantidad}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={color.muted}
                style={s.campoCantidad}
                accessibilityLabel={`Cantidad${unidad ? ` en ${unidad}` : ''}`}
              />
              {unidad ? <Text style={s.unidad}>{unidad}</Text> : null}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Texto v="etiqueta">Sector</Texto>
            <Pressable onPress={() => setPaso('sector')} accessibilityRole="button" style={s.tarjeta}>
              <View style={{ flex: 1, gap: 2 }}>
                {item ? (
                  <>
                    <Text style={s.textoItem}>{tituloItem(item)}</Text>
                    <Texto v="nota" numberOfLines={1}>{rubro(items, item.id)}</Texto>
                  </>
                ) : (
                  <Text style={[s.textoItem, { color: color.muted }]}>Elegí el sector</Text>
                )}
              </View>
              <ChevronRight size={24} color={color.inkSoft} strokeWidth={2.5} />
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            <Texto v="etiqueta">¿Para cuándo lo necesitás en obra?</Texto>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip texto="Sin fecha" elegido={necesarioPara === null} onPress={() => setNecesarioPara(null)} />
              {dias.map((d) => (
                <Chip key={d.fecha} texto={d.texto} elegido={necesarioPara === d.fecha} onPress={() => setNecesarioPara(d.fecha)} />
              ))}
            </ScrollView>
          </View>

          <View style={{ gap: 8 }}>
            <Texto v="etiqueta">Fotos del producto (opcional, solo de referencia)</Texto>
            {fotos.length > 0 && (
              <View style={s.fotos}>
                {fotos.map((f) => (
                  <View key={f.id}>
                    <Image source={{ uri: f.archivoLocal }} style={s.foto} contentFit="cover" />
                    <BotonIcono icono={X} etiqueta="Quitar foto" tamano={32} style={s.quitar} onPress={() => quitarFoto(f.id)} />
                  </View>
                ))}
              </View>
            )}
            {fotos.length < 3 && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Boton texto="Sacar foto" icono={Camera} borde style={{ flex: 1 }} disabled={procesando} onPress={() => agregarFoto('camara')} />
                <Boton texto="Galería" icono={ImagePlus} borde style={{ flex: 1 }} disabled={procesando} onPress={() => agregarFoto('galeria')} />
              </View>
            )}
          </View>
        </ScrollView>
        <View style={s.pie}>
          <BotonPrincipal texto="Enviar pedido" icono={Check} onPress={enviar} cargando={guardando || procesando} disabled={!numero || !itemId || faltaMaterial} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Buscador del catálogo. Sin escribir no muestra nada: la lista de SAP es larga. */
function ElegirMaterial({
  materiales,
  alElegir,
  noEncontrado,
}: {
  materiales: MaterialCampo[];
  alElegir: (m: MaterialCampo) => void;
  noEncontrado: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const encontrados = useMemo(() => buscarMateriales(materiales, texto), [materiales, texto]);
  return (
    <FlatList
      data={encontrados}
      keyExtractor={(m) => m.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <View style={s.buscador}>
          <Search size={22} color={color.inkSoft} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar material"
            placeholderTextColor={color.muted}
            style={s.campoBuscar}
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
          />
          {texto ? (
            <Pressable onPress={() => setTexto('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
              <X size={22} color={color.inkSoft} />
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item: m }) => (
        <Pressable onPress={() => alElegir(m)} accessibilityRole="button" style={({ pressed }) => [s.fila, pressed && { opacity: 0.8 }]}>
          <Text style={[s.textoItem, { flex: 1 }]}>{m.descripcion}</Text>
          {m.unidad ? <Text style={s.unidadFila}>{m.unidad}</Text> : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <Texto v="nota" style={{ padding: 4 }}>
          {texto.trim() ? 'No hay materiales con ese nombre. Probá con otra palabra.' : 'Escribí parte del nombre, por ejemplo “cemento” o “diesel”.'}
        </Texto>
      }
      ListFooterComponent={
        <Pressable onPress={() => noEncontrado(texto.trim())} accessibilityRole="button" style={({ pressed }) => [s.noEncontrado, pressed && { opacity: 0.8 }]}>
          <PencilLine size={22} color={color.ink} />
          <View style={{ flex: 1 }}>
            <Text style={s.textoItem}>Material no encontrado</Text>
            <Texto v="nota">Escribilo a mano y se pide para crear en SAP.</Texto>
          </View>
        </Pressable>
      }
    />
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  contenido: { padding: 16, gap: 18 },
  lista: { padding: 16, gap: 8 },
  tarjeta: {
    backgroundColor: color.surface, borderRadius: 14, borderWidth: 2, borderColor: color.line, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
  },
  textoGrande: { fontFamily: fuente.displayBold, fontSize: 20, color: color.ink },
  textoItem: { fontFamily: fuente.bodySemi, fontSize: 17, color: color.ink },
  enlace: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.plano },
  cantidad: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 64,
    borderRadius: 12, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface,
  },
  campoCantidad: { flex: 1, fontFamily: fuente.display, fontSize: 28, color: color.ink, minHeight: 60 },
  unidad: { fontFamily: fuente.displayBold, fontSize: 20, color: color.inkSoft },
  unidadFila: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.muted },
  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 2,
    minHeight: toque.control, borderRadius: 12, backgroundColor: color.surface, borderWidth: 2, borderColor: color.line,
  },
  campoBuscar: { flex: 1, fontFamily: fuente.body, fontSize: 17, color: color.ink, minHeight: toque.control },
  fila: {
    minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2,
    borderColor: color.line, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  filaEtiqueta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  campoTexto: {
    minHeight: 64, borderRadius: 12, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface,
    paddingHorizontal: 14, paddingVertical: 10, fontFamily: fuente.bodySemi, fontSize: 18, color: color.ink, textAlignVertical: 'top',
  },
  campoUnidad: {
    minHeight: toque.control, borderRadius: 12, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface,
    paddingHorizontal: 14, fontFamily: fuente.body, fontSize: 17, color: color.ink,
  },
  noEncontrado: {
    minHeight: 64, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2,
    borderStyle: 'dashed', borderColor: '#8C8F94', flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  fotos: { flexDirection: 'row', gap: 8 },
  foto: { width: 96, height: 96, borderRadius: 12, backgroundColor: color.track },
  quitar: { position: 'absolute', top: 4, right: 4 },
  pie: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface },
});
