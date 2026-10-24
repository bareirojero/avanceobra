import type { Item } from '@registro-obra/contrato';
import { router, useLocalSearchParams } from 'expo-router';
import { Lock, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonIcono, Chip, Texto } from '@/components/base';
import { FotoConMarcas } from '@/components/foto-con-marcas';
import { tituloItem } from '@/components/selectores';
import { itemsDeObra, leerFoto } from '@/data/repositorio';
import { diaYFecha, fechaParte, horaCorta } from '@/domain/fechas';
import { visibles, type Marca } from '@/domain/marcas';
import { useApp } from '@/state/app';
import { fotosAnteriores } from '@/state/memoria';
import { color, fuente, toque } from '@/theme';

interface Vista {
  uri: string;
  claveCache: string | null;
  ancho: number;
  alto: number;
  fecha: string;
  tomadaEn: string;
  itemId: string;
  comentario: string | null;
  marcas: Marca[];
}

/**
 * Foto de un día anterior, solo para mirar: las fotos se corrigen el día que se sacan
 * (después, solo el editor desde el panel). Usa el archivo del teléfono si está; si no, la
 * imagen del servidor que trajo Envíos.
 */
export default function FotoAnterior() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { obra } = useApp();
  const obraId = obra?.id;
  const { height: altoPantalla } = useWindowDimensions();
  const [vista, setVista] = useState<Vista | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activa, setActiva] = useState<string | null>(null);

  useEffect(() => {
    if (!obraId) return;
    void (async () => {
      setItems(await itemsDeObra(obraId));
      const local = await leerFoto(id);
      const remota = fotosAnteriores.leer(id);
      if (local?.foto.archivo_local) {
        const f = local.foto;
        setVista({
          uri: f.archivo_local!, claveCache: null, ancho: f.ancho ?? 3, alto: f.alto ?? 4,
          fecha: remota?.fecha ?? fechaParte(new Date(f.tomada_en)), tomadaEn: f.tomada_en, itemId: f.item_id,
          comentario: f.comentario, marcas: local.marcas,
        });
        return;
      }
      if (!remota?.archivo) return router.back();
      setVista({
        uri: remota.archivo, claveCache: remota.claveArchivo, ancho: remota.ancho ?? 3, alto: remota.alto ?? 4,
        fecha: remota.fecha, tomadaEn: remota.tomada_en, itemId: remota.item_id, comentario: remota.comentario,
        marcas: remota.anotaciones.map((a) => ({
          id: a.id, numero: a.numero, tipo: a.tipo, geometria: a.geometria, comentario: a.comentario ?? '', eliminada: false,
        })),
      });
    })();
  }, [id, obraId]);

  if (!vista) return <View style={s.oscuro} />;

  const lista = visibles(vista.marcas);
  const item = items.find((i) => i.id === vista.itemId);
  const marcaActiva = lista.find((m) => m.id === activa);

  return (
    <SafeAreaView style={s.oscuro} edges={['top', 'bottom']}>
      <View style={{ height: altoPantalla * 0.5 }}>
        <FotoConMarcas
          uri={vista.uri}
          claveCache={vista.claveCache}
          foto={vista}
          marcas={vista.marcas}
          activaId={activa}
          alSeleccionar={setActiva}
          style={{ flex: 1 }}
        />
        <View style={s.sobreFoto} pointerEvents="box-none">
          <BotonIcono icono={X} etiqueta="Cerrar" onPress={() => router.back()} />
        </View>
      </View>

      <View style={s.hoja}>
        <ScrollView contentContainerStyle={s.contenido}>
          <View style={{ gap: 4 }}>
            <Texto v="etiqueta">{`${diaYFecha(vista.fecha)} · ${horaCorta(vista.tomadaEn)}`}</Texto>
            <Text style={s.item}>{item ? tituloItem(item) : 'Foto sin ítem'}</Text>
          </View>

          {lista.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip texto="Toda la foto" elegido={!marcaActiva} acentuado={!marcaActiva} onPress={() => setActiva(null)} />
              {lista.map((m) => (
                <Chip
                  key={m.id}
                  texto={`Marca ${m.numero}`}
                  elegido={activa === m.id}
                  acentuado={activa === m.id}
                  onPress={() => setActiva(m.id)}
                />
              ))}
            </ScrollView>
          )}

          <View style={{ gap: 6 }}>
            <Texto v="etiqueta">{marcaActiva ? `Comentario de la marca ${marcaActiva.numero}` : 'Comentario de la foto'}</Texto>
            <Texto style={{ color: color.inkSoft }}>
              {(marcaActiva ? marcaActiva.comentario : vista.comentario)?.trim() || 'Sin comentario.'}
            </Texto>
          </View>
        </ScrollView>

        <View style={s.bloqueada}>
          <Lock size={20} color={color.inkSoft} />
          <Texto v="nota" style={{ flex: 1 }}>
            Las fotos se pueden corregir solo el día que se sacan. Si hay que cambiar algo, avisale al editor.
          </Texto>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  oscuro: { flex: 1, backgroundColor: color.ink },
  sobreFoto: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row' },
  hoja: { flex: 1, backgroundColor: color.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -22 },
  contenido: { padding: 16, paddingTop: 20, gap: 16 },
  item: { fontFamily: fuente.bodySemi, fontSize: 18, color: color.ink },
  bloqueada: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: toque.control,
    paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: 1, borderTopColor: color.line,
  },
});
