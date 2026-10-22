import { router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSync } from '@/state/app';
import { fuente, syncState } from '@/theme';

/** Aparece solo si la sesión venció: lleva a escribir la contraseña de nuevo. */
export function SesionVencida() {
  const { sesionVencida } = useSync();
  if (!sesionVencida) return null;
  const tono = syncState.error;
  return (
    <Pressable onPress={() => router.push('/reingresar')} accessibilityRole="button" style={[s.caja, { backgroundColor: tono.bg }]}>
      <KeyRound size={22} color={tono.fg} strokeWidth={2.3} />
      <Text style={[s.texto, { color: tono.fg }]}>Tu sesión venció. Tocá acá y escribí tu contraseña para seguir enviando.</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14 },
  texto: { flex: 1, fontFamily: fuente.bodySemi, fontSize: 16, lineHeight: 22 },
});
