import { router } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonIcono, Texto } from '@/components/base';
import { useApp } from '@/state/app';
import { acento, color, fuente } from '@/theme';

export default function Obras() {
  const { obras, obra, elegirObra } = useApp();
  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.cabecera}>
        <Texto v="titulo" style={{ flex: 1 }}>Elegí la obra</Texto>
        <BotonIcono icono={X} etiqueta="Cerrar" claro onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={s.lista}>
        {obras.map((o) => {
          const elegida = o.id === obra?.id;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: elegida }}
              onPress={async () => {
                await elegirObra(o.id);
                router.back();
              }}
              style={[s.fila, elegida && s.elegida]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.nombre}>{o.nombre}</Text>
                {o.direccion ? <Text style={s.nota}>{o.direccion}</Text> : null}
              </View>
              {elegida && <Check size={26} color={color.ink} strokeWidth={3} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ground },
  cabecera: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  lista: { padding: 16, gap: 8 },
  fila: {
    minHeight: 72, borderRadius: 14, backgroundColor: color.surface, padding: 16, flexDirection: 'row',
    alignItems: 'center', gap: 12, borderWidth: 3, borderColor: 'transparent',
  },
  elegida: { borderColor: acento },
  nombre: { fontFamily: fuente.displayBold, fontSize: 20, color: color.ink },
  nota: { fontFamily: fuente.body, fontSize: 15, color: color.muted },
});
