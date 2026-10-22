import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { CalendarDays, Package, Upload, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSync } from '@/state/app';
import { color, fuente } from '@/theme';

const ICONOS: Record<string, LucideIcon> = { index: CalendarDays, materiales: Package, envios: Upload };

export default function Pestanas() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <Barra {...p} />}>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="materiales" options={{ title: 'Materiales' }} />
      <Tabs.Screen name="envios" options={{ title: 'Envíos' }} />
    </Tabs>
  );
}

/** Barra inferior de 72 px: Hoy, Materiales y Envíos (con contador si hay algo esperando). */
function Barra({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { bottom } = useSafeAreaInsets();
  const { resumen } = useSync();
  const esperando = resumen.fotosEsperando + resumen.fotosConError;

  return (
    <View style={[s.barra, { paddingBottom: bottom, height: 72 + bottom }]} accessibilityRole="tablist">
      {state.routes.map((ruta, i) => {
        const activa = state.index === i;
        const Icono = ICONOS[ruta.name] ?? CalendarDays;
        const titulo = descriptors[ruta.key].options.title ?? ruta.name;
        const fg = activa ? color.ink : color.muted;
        return (
          <Pressable
            key={ruta.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            onPress={() => !activa && navigateToTab(ruta.key)}
            style={s.pestana}>
            <View>
              <Icono size={24} color={fg} strokeWidth={activa ? 2.3 : 2} />
              {ruta.name === 'envios' && esperando > 0 && (
                <View style={[s.contador, resumen.fotosConError > 0 && { backgroundColor: color.danger }]}>
                  <Text style={s.textoContador}>{esperando}</Text>
                </View>
              )}
            </View>
            <Text style={[s.titulo, { color: fg, fontFamily: activa ? fuente.display : fuente.bodySemi }]}>{titulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line },
  pestana: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  titulo: { fontSize: 13 },
  contador: {
    position: 'absolute',
    top: -6,
    right: -14,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: color.pending,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoContador: { color: '#fff', fontFamily: fuente.bodySemi, fontSize: 12 },
});
