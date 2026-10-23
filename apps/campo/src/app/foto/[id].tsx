import type { Geometria, Item } from '@registro-obra/contrato';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  Lock,
  MapPin,
  PenLine,
  Square,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonIcono, BotonPrincipal, Chip, Texto } from '@/components/base';
import { FotoConMarcas } from '@/components/foto-con-marcas';
import { ElegirItem, tituloItem } from '@/components/selectores';
import { borrarSilencioso } from '@/data/fotos-disco';
import { eliminarFoto, guardarFoto, itemsDeObra, itemsRecientes, leerFoto, nuevoId } from '@/data/repositorio';
import { refrescarResumen, sincronizarPronto } from '@/data/sincronizacion';
import { fechaParte } from '@/domain/fechas';
import { rubro } from '@/domain/itemizado';
import {
  actualizarMarca,
  agregarMarca,
  borrarMarca,
  marcasSinComentario,
  moverMarca,
  visibles,
  type Marca,
  type Punto,
  type TipoMarca,
} from '@/domain/marcas';
import { useApp } from '@/state/app';
import { fotosNuevas, mostrarAviso } from '@/state/memoria';
import { acento, color, fuente, sobreAcento, toque } from '@/theme';

const HERRAMIENTAS: { tipo: TipoMarca; texto: string; icono: LucideIcon }[] = [
  { tipo: 'punto', texto: 'Punto', icono: MapPin },
  { tipo: 'circulo', texto: 'Círculo', icono: Circle },
  { tipo: 'rectangulo', texto: 'Recuadro', icono: Square },
  { tipo: 'flecha', texto: 'Flecha', icono: ArrowUpRight },
  { tipo: 'trazo', texto: 'Trazo', icono: PenLine },
];

const AYUDA: Record<TipoMarca, string> = {
  punto: 'Tocá la foto para marcar',
  circulo: 'Tocá el centro y arrastrá',
  rectangulo: 'Arrastrá de una esquina a la otra',
  flecha: 'Arrastrá hacia lo que querés señalar',
  trazo: 'Dibujá con el dedo',
};

interface Imagen {
  uri: string;
  miniatura: string;
  ancho: number;
  alto: number;
  tomadaEn: string;
  latitud: number | null;
  longitud: number | null;
  fecha: string;
}

const FOTO = 'foto';

export default function EditorFoto() {
  const { id, nueva } = useLocalSearchParams<{ id: string; nueva?: string }>();
  const esNueva = nueva === '1';
  const { sesion, obra } = useApp();
  // Por id: el objeto de la obra se renueva en cada sincronización y no debe recargar la foto
  // mientras se está editando.
  const obraId = obra?.id;
  const usuarioId = sesion?.usuarioId;
  const { height: altoPantalla } = useWindowDimensions();
  const teclado = useTecladoAbierto();

  const [imagen, setImagen] = useState<Imagen | null>(null);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [activa, setActiva] = useState<string>(FOTO);
  const [herramienta, setHerramienta] = useState<TipoMarca>('punto');
  const [paso, setPaso] = useState<'marcas' | 'item'>('marcas');
  const [cambios, setCambios] = useState(esNueva);
  const [guardando, setGuardando] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [recientes, setRecientes] = useState<string[]>([]);

  // Carga la foto (nueva, recién sacada, o una ya guardada) y la referencia de la obra.
  useEffect(() => {
    if (!obraId || !usuarioId) return;
    void (async () => {
      setItems(await itemsDeObra(obraId));
      setRecientes(await itemsRecientes(obraId, usuarioId));

      if (esNueva) {
        const f = fotosNuevas.leer(id);
        if (!f) return router.back();
        setImagen({
          uri: f.archivoLocal, miniatura: f.miniaturaLocal, ancho: f.ancho, alto: f.alto, tomadaEn: f.tomadaEn,
          latitud: f.latitud, longitud: f.longitud, fecha: fechaParte(new Date(f.tomadaEn)),
        });
        return;
      }
      const leida = await leerFoto(id);
      if (!leida || !leida.foto.archivo_local) return router.back();
      const f = leida.foto;
      setImagen({
        uri: f.archivo_local!, miniatura: f.miniatura_local ?? f.archivo_local!, ancho: f.ancho ?? 3, alto: f.alto ?? 4,
        tomadaEn: f.tomada_en, latitud: f.latitud, longitud: f.longitud, fecha: fechaParte(new Date(f.tomada_en)),
      });
      setMarcas(leida.marcas);
      setGuardadas(new Set(leida.marcas.map((m) => m.id)));
      setComentario(f.comentario ?? '');
      setItemId(f.item_id);
    })();
  }, [id, esNueva, obraId, usuarioId]);

  const lista = visibles(marcas);
  const marcaActiva = marcas.find((m) => m.id === activa);
  // El usuario de campo corrige o borra lo suyo solo el mismo día; después queda para el editor.
  const editable = esNueva || (imagen?.fecha ?? '') === fechaParte(new Date());

  function cambiarComentario(texto: string) {
    setCambios(true);
    if (activa === FOTO) setComentario(texto);
    else setMarcas((ms) => actualizarMarca(ms, activa, { comentario: texto }));
  }

  function crear(g: Geometria) {
    const nid = nuevoId();
    setMarcas((ms) => agregarMarca(ms, g, nid));
    setActiva(nid);
    setCambios(true);
  }

  function mover(mid: string, destino: Punto) {
    setMarcas((ms) => moverMarca(ms, mid, destino));
    setCambios(true);
  }

  function borrarActiva() {
    const restantes = lista.filter((m) => m.id !== activa);
    setMarcas((ms) => borrarMarca(ms, activa, new Set(ms.filter((m) => !guardadas.has(m.id)).map((m) => m.id))));
    setActiva(restantes[restantes.length - 1]?.id ?? FOTO);
    setCambios(true);
  }

  function salir() {
    const descartar = () => {
      if (esNueva && imagen) {
        borrarSilencioso(imagen.uri);
        borrarSilencioso(imagen.miniatura);
        fotosNuevas.quitar(id);
      }
      router.back();
    };
    if (!cambios) return descartar();
    Alert.alert(
      esNueva ? '¿Descartar la foto?' : '¿Salir sin guardar?',
      esNueva ? 'La foto no se va a guardar.' : 'Se pierden los cambios que hiciste.',
      [
        { text: 'Seguir', style: 'cancel' },
        { text: esNueva ? 'Descartar' : 'Salir', style: 'destructive', onPress: descartar },
      ],
    );
  }


  // Botón atrás de Android: del ítem vuelve a las marcas; de las marcas, sale.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paso === 'item') setPaso('marcas');
      else salir();
      return true;
    });
    return () => sub.remove();
  });

  async function guardar() {
    if (!imagen || !obra || !sesion) return;
    if (!itemId) return Alert.alert('Falta el ítem', 'Elegí a qué ítem corresponde la foto.');
    const sinComentario = marcasSinComentario(marcas);
    if (sinComentario.length && !(await confirmar(sinComentario))) return;
    setGuardando(true);
    try {
      await guardarFoto({
        id,
        obraId: obra.id,
        autorId: sesion.usuarioId,
        fecha: imagen.fecha,
        tomadaEn: imagen.tomadaEn,
        archivoLocal: imagen.uri,
        miniaturaLocal: imagen.miniatura,
        ancho: imagen.ancho,
        alto: imagen.alto,
        latitud: imagen.latitud,
        longitud: imagen.longitud,
        comentario,
        itemId,
        marcas,
        colorMarcas: acento,
      });
      fotosNuevas.quitar(id);
      await refrescarResumen();
      sincronizarPronto();
      mostrarAviso(esNueva ? 'Foto guardada en el teléfono' : 'Cambios guardados');
      router.back();
    } catch (e) {
      console.warn(e);
      setGuardando(false);
      Alert.alert('No se pudo guardar', 'Probá de nuevo. Si sigue pasando, avisale al editor.');
    }
  }

  function borrarFoto() {
    Alert.alert('¿Borrar esta foto?', 'Se borra también del informe.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarFoto(id);
          await refrescarResumen();
          sincronizarPronto();
          mostrarAviso('Foto borrada');
          router.back();
        },
      },
    ]);
  }

  if (!imagen) return <View style={{ flex: 1, backgroundColor: color.ink }} />;

  // ---------------------------------------------------------------------------
  // Paso 2: ítem (obligatorio)
  // ---------------------------------------------------------------------------
  if (paso === 'item') {
    const itemElegido = items.find((i) => i.id === itemId);
    return (
      <SafeAreaView style={s.claro}>
        <View style={s.cabeceraItem}>
          <BotonIcono icono={ArrowLeft} etiqueta="Volver a la foto" claro onPress={() => setPaso('marcas')} />
          <View style={{ flex: 1 }}>
            <Texto v="titulo">¿Qué ítem es?</Texto>
            <Texto v="nota" style={{ fontSize: 14 }}>Cada foto va a un ítem del itemizado.</Texto>
          </View>
          <FotoConMarcas uri={imagen.miniatura} foto={imagen} marcas={marcas} compacta style={s.miniatura} />
        </View>

        <View style={{ flex: 1 }}>
          <ElegirItem
            items={items}
            recientes={recientes}
            elegido={itemId}
            alElegir={(iid) => {
              setItemId(iid);
              setCambios(true);
            }}
          />
        </View>

        <View style={s.pieClaro}>
          {itemElegido ? (
            <View style={{ gap: 2 }}>
              <Text style={s.textoElegido} numberOfLines={2}>{tituloItem(itemElegido)}</Text>
              <Texto v="nota" numberOfLines={1}>{rubro(items, itemElegido.id)}</Texto>
            </View>
          ) : (
            <Texto v="nota" style={{ textAlign: 'center' }}>Elegí un ítem para guardar.</Texto>
          )}
          <BotonPrincipal texto="Guardar" icono={Check} onPress={guardar} cargando={guardando} disabled={!itemElegido} />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Paso 1: marcas y comentarios
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={s.oscuro} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* Con el teclado abierto la foto se achica y se esconden herramientas y pie: si no, el
            campo de comentario queda sin lugar y el teclado lo tapa. */}
        <View style={{ height: altoPantalla * (teclado ? 0.2 : 0.5) }}>
          <FotoConMarcas
            uri={imagen.uri}
            foto={imagen}
            marcas={marcas}
            activaId={activa}
            herramienta={editable ? herramienta : null}
            alCrear={crear}
            alSeleccionar={setActiva}
            alMover={mover}
            style={{ flex: 1 }}
          />
          <View style={s.sobreFoto} pointerEvents="box-none">
            <BotonIcono icono={X} etiqueta={esNueva ? 'Descartar foto' : 'Cerrar'} onPress={salir} />
            {editable && (
              <View style={s.ayuda} pointerEvents="none">
                <Text style={s.textoAyuda}>{AYUDA[herramienta]}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.hoja}>
          {editable && !teclado && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.herramientas}>
            {HERRAMIENTAS.map(({ tipo, texto, icono: Icono }) => {
              const elegida = herramienta === tipo;
              return (
                <Pressable
                  key={tipo}
                  accessibilityRole="button"
                  accessibilityState={{ selected: elegida }}
                  onPress={() => setHerramienta(tipo)}
                  style={[s.herramienta, elegida && s.herramientaElegida]}>
                  <Icono size={20} color={elegida ? sobreAcento : color.ink} strokeWidth={2.3} />
                  <Text style={[s.textoHerramienta, elegida && { color: sobreAcento }]}>{texto}</Text>
                </Pressable>
              );
            })}
          </ScrollView>}

          <ScrollView contentContainerStyle={s.contenidoHoja} keyboardShouldPersistTaps="handled">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip texto="Toda la foto" elegido={activa === FOTO} acentuado={activa === FOTO} onPress={() => setActiva(FOTO)} />
              {lista.map((m) => (
                <Chip key={m.id} texto={`Marca ${m.numero}`} elegido={activa === m.id} acentuado={activa === m.id} onPress={() => setActiva(m.id)} />
              ))}
              {editable && <Chip texto="+ Marca" punteado onPress={() => Alert.alert('Nueva marca', `${AYUDA[herramienta]}.`)} />}
            </ScrollView>

            <View style={{ gap: 8 }}>
              <Texto v="etiqueta">
                {activa === FOTO ? 'Comentario de la foto' : `Comentario de la marca ${marcaActiva?.numero}`}
              </Texto>
              {/* No controlado: con `value`, si el JS se atrasa al redibujar la foto, Android vuelve a
                  poner el texto viejo y el borrado no queda. `key` lo renueva al cambiar de marca. */}
              <TextInput
                key={activa}
                defaultValue={activa === FOTO ? comentario : (marcaActiva?.comentario ?? '')}
                onChangeText={cambiarComentario}
                placeholder={activa === FOTO ? 'Qué se ve, qué se hizo hoy' : 'Qué pasa en esta zona'}
                placeholderTextColor={color.muted}
                editable={editable}
                multiline
                style={s.campo}
              />
            </View>

            {!editable ? null : activa !== FOTO ? (
              <Pressable onPress={borrarActiva} accessibilityRole="button" style={s.borrar}>
                <Trash2 size={18} color={color.dangerText} />
                <Text style={s.textoBorrar}>Borrar marca {marcas.find((m) => m.id === activa)?.numero}</Text>
              </Pressable>
            ) : (
              !esNueva && (
                <Pressable onPress={borrarFoto} accessibilityRole="button" style={s.borrar}>
                  <Trash2 size={18} color={color.dangerText} />
                  <Text style={s.textoBorrar}>Borrar foto</Text>
                </Pressable>
              )
            )}
          </ScrollView>

          {!teclado && <View style={s.pieHoja}>
            {editable ? (
              <BotonPrincipal texto="Siguiente: ítem" icono={ArrowRight} onPress={() => setPaso('item')} style={{ minHeight: 72 }} />
            ) : (
              <View style={s.bloqueada}>
                <Lock size={20} color={color.inkSoft} />
                <Texto v="nota" style={{ flex: 1 }}>Las fotos se pueden corregir solo el día que se sacan.</Texto>
              </View>
            )}
          </View>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useTecladoAbierto() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', () => setAbierto(true));
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setAbierto(false));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);
  return abierto;
}

function confirmar(sinComentario: Marca[]): Promise<boolean> {
  const nums = sinComentario.map((m) => m.numero).join(', ');
  return new Promise((r) =>
    Alert.alert(
      sinComentario.length === 1 ? `La marca ${nums} no tiene comentario` : `Las marcas ${nums} no tienen comentario`,
      'Un comentario corto ayuda a que el informe diga qué pasa en esa zona.',
      [
        { text: 'Completar', style: 'cancel', onPress: () => r(false) },
        { text: 'Guardar igual', onPress: () => r(true) },
      ],
    ),
  );
}

const s = StyleSheet.create({
  oscuro: { flex: 1, backgroundColor: color.ink },
  claro: { flex: 1, backgroundColor: color.ground },
  sobreFoto: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ayuda: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.ink, justifyContent: 'center', flexShrink: 1 },
  textoAyuda: { color: color.onInk, fontFamily: fuente.bodySemi, fontSize: 15 },
  hoja: { flex: 1, backgroundColor: color.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -22 },
  herramientas: { gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  herramienta: {
    height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 2, borderColor: color.line,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  herramientaElegida: { backgroundColor: acento, borderColor: acento },
  textoHerramienta: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.ink },
  contenidoHoja: { padding: 16, gap: 16 },
  borrar: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8 },
  textoBorrar: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.dangerText },
  pieHoja: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
  cabeceraItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  miniatura: { width: 56, height: 56, borderRadius: 12 },
  pieClaro: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface },
  textoElegido: { fontFamily: fuente.bodySemi, fontSize: 17, color: color.ink },
  campo: {
    minHeight: 76, borderRadius: 12, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface,
    paddingHorizontal: 14, paddingVertical: 10, fontFamily: fuente.body, fontSize: 17, color: color.ink, textAlignVertical: 'top',
  },
  bloqueada: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: toque.control },
});
