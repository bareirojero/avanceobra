import type { Item } from '@registro-obra/contrato';
import { Check, ChevronLeft, ChevronRight, CloudRain, Drone, Search, TriangleAlert, X, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buscarItems, cantidadDeHojas, especiales, hijos, rubro, tituloItem } from '@/domain/itemizado';
import { color, fuente, toque } from '@/theme';

import { Texto } from './base';

export { tituloItem };

type Fila =
  | { tipo: 'seccion'; clave: string; texto: string }
  | { tipo: 'rubro'; clave: string; item: Item; cantidad: number }
  | { tipo: 'item'; clave: string; item: Item; rubro?: string };

const ICONO: Record<string, LucideIcon> = { incidente: TriangleAlert, dron: Drone, pluviometro: CloudRain };

/**
 * Elegir el ítem de la foto: arriba el buscador; sin buscar, las entradas fijas (incidente
 * de obra, vuelo de dron, pluviómetro), los usados hace poco y el itemizado por rubros (se
 * entra a un rubro y se vuelve con la flecha). Los títulos no se eligen, solo agrupan.
 * Las entradas fijas aparecen solo si vienen en `items`.
 */
export function ElegirItem({
  items,
  recientes,
  elegido,
  alElegir,
  cabecera,
}: {
  items: Item[];
  recientes: string[];
  elegido: string | null;
  alElegir: (id: string) => void;
  cabecera?: React.ReactElement;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const comoFila = (i: Item, conRubro: boolean): Fila =>
      i.es_titulo
        ? { tipo: 'rubro', clave: i.id, item: i, cantidad: cantidadDeHojas(items, i.id) }
        : { tipo: 'item', clave: i.id, item: i, rubro: conRubro ? rubro(items, i.id) : undefined };

    if (texto.trim()) return buscarItems(items, texto).map((i) => comoFila(i, true));
    if (abierto) return hijos(items, abierto).map((i) => comoFila(i, false));

    const salida: Fila[] = [];
    const usados = recientes.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i && !i.es_titulo);
    if (usados.length) {
      salida.push({ tipo: 'seccion', clave: 's-recientes', texto: 'Usados hace poco' });
      salida.push(...usados.map((i) => ({ ...comoFila(i, true), clave: `r-${i.id}` })));
      salida.push({ tipo: 'seccion', clave: 's-rubros', texto: 'Por rubro' });
    }
    salida.push(...hijos(items, null).map((i) => comoFila(i, false)));
    return salida;
  }, [items, recientes, texto, abierto]);

  const rubroAbierto = abierto ? items.find((i) => i.id === abierto) : undefined;
  const fijas = useMemo(() => especiales(items), [items]);
  const subir = () => setAbierto(rubroAbierto?.padre_id ?? null);

  return (
    <FlatList
      data={filas}
      keyExtractor={(f) => f.clave}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {cabecera}
          <View style={s.buscador}>
            <Search size={22} color={color.inkSoft} />
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Buscar por número o nombre"
              placeholderTextColor={color.muted}
              style={s.campoBuscar}
              autoCorrect={false}
              returnKeyType="search"
            />
            {texto ? (
              <Pressable onPress={() => setTexto('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
                <X size={22} color={color.inkSoft} />
              </Pressable>
            ) : null}
          </View>
          {!texto.trim() && !rubroAbierto && fijas.length > 0 && (
            <View style={s.fijas}>
              {fijas.map((i) => {
                const Icono = ICONO[i.categoria] ?? Check;
                const esElegido = elegido === i.id;
                const incidente = i.categoria === 'incidente';
                const tinta = esElegido ? '#fff' : incidente ? color.dangerText : color.ink;
                return (
                  <Pressable
                    key={i.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: esElegido }}
                    onPress={() => alElegir(i.id)}
                    style={({ pressed }) => [
                      s.fija,
                      incidente && s.fijaIncidente,
                      esElegido && (incidente ? s.fijaIncidenteElegida : s.fijaElegida),
                      pressed && s.apretada,
                    ]}>
                    <Icono size={26} color={tinta} strokeWidth={2.25} />
                    <Text style={[s.textoFija, { color: tinta }]} numberOfLines={2}>{i.descripcion}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!texto.trim() && rubroAbierto && (
            <Pressable onPress={subir} accessibilityRole="button" accessibilityLabel="Volver al rubro anterior" style={s.volver}>
              <ChevronLeft size={26} color={color.ink} strokeWidth={2.5} />
              <View style={{ flex: 1 }}>
                {rubroAbierto.padre_id && <Text style={s.notaItem} numberOfLines={1}>{rubro(items, rubroAbierto.id)}</Text>}
                <Text style={s.textoVolver}>{rubroAbierto.descripcion}</Text>
              </View>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item: f }) => {
        if (f.tipo === 'seccion') return <Text style={s.seccion}>{f.texto}</Text>;
        if (f.tipo === 'rubro') {
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => { setTexto(''); setAbierto(f.item.id); }}
              style={({ pressed }) => [s.fila, pressed && s.apretada]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.textoRubro}>{f.item.descripcion}</Text>
                <Text style={s.notaItem}>{f.cantidad === 1 ? '1 ítem' : `${f.cantidad} ítems`}</Text>
              </View>
              <ChevronRight size={24} color={color.inkSoft} strokeWidth={2.5} />
            </Pressable>
          );
        }
        const esElegido = elegido === f.item.id;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: esElegido }}
            onPress={() => alElegir(f.item.id)}
            style={({ pressed }) => [s.fila, esElegido && s.filaElegida, pressed && s.apretada]}>
            <View style={[s.radio, esElegido && s.radioElegido]}>
              {esElegido && <Check size={16} color="#fff" strokeWidth={3} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.textoItem}>{tituloItem(f.item)}</Text>
              {f.rubro ? <Text style={s.notaItem} numberOfLines={1}>{f.rubro}</Text> : null}
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Texto v="nota">
          {texto.trim() ? 'No hay ítems con ese nombre o número.' : 'La obra todavía no tiene el itemizado cargado. Avisale al editor.'}
        </Texto>
      }
    />
  );
}

const s = StyleSheet.create({
  lista: { padding: 16, gap: 8 },
  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    minHeight: toque.control, borderRadius: 12, backgroundColor: color.surface, borderWidth: 2, borderColor: color.line,
  },
  campoBuscar: { flex: 1, fontFamily: fuente.body, fontSize: 17, color: color.ink, minHeight: toque.control },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: toque.control, paddingVertical: 4 },
  textoVolver: { fontFamily: fuente.displayBold, fontSize: 18, color: color.ink },
  fijas: { flexDirection: 'row', gap: 8 },
  fija: {
    flex: 1, minHeight: 84, paddingHorizontal: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 2,
    borderColor: color.line, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  fijaIncidente: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  fijaElegida: { borderColor: color.ink, backgroundColor: color.ink },
  fijaIncidenteElegida: { borderColor: color.danger, backgroundColor: color.danger },
  textoFija: { fontFamily: fuente.bodySemi, fontSize: 15, textAlign: 'center' },
  seccion: { fontFamily: fuente.displayBold, fontSize: 15, color: color.inkSoft, textTransform: 'uppercase', marginTop: 8 },
  fila: {
    minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2,
    borderColor: color.line, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  filaElegida: { borderWidth: 3, borderColor: color.ink },
  apretada: { opacity: 0.8 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#8C8F94', alignItems: 'center', justifyContent: 'center' },
  radioElegido: { backgroundColor: color.ink, borderColor: color.ink },
  textoRubro: { fontFamily: fuente.bodySemi, fontSize: 17, color: color.ink },
  textoItem: { fontFamily: fuente.bodySemi, fontSize: 17, color: color.ink },
  notaItem: { fontFamily: fuente.body, fontSize: 14, color: color.muted },
});
