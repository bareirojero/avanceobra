import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { escucharAvisos } from '@/state/memoria';
import { acento, color, fuente, sobreAcento } from '@/theme';

/** Aviso arriba, como "Foto guardada en el teléfono". Se va solo. */
export function Aviso() {
  const [texto, setTexto] = useState<string | null>(null);
  const [opacidad] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let reloj: ReturnType<typeof setTimeout>;
    const quitar = escucharAvisos((t) => {
      setTexto(t);
      Animated.timing(opacidad, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        Animated.timing(opacidad, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setTexto(null));
      }, 3200);
    });
    return () => {
      quitar();
      clearTimeout(reloj);
    };
  }, [opacidad]);

  if (!texto) return null;
  return (
    <Animated.View style={[s.aviso, { opacity: opacidad }]} accessibilityLiveRegion="polite" pointerEvents="none">
      <View style={s.tilde}>
        <Check size={18} color={sobreAcento} strokeWidth={3} />
      </View>
      <Text style={s.texto}>{texto}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  aviso: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 6,
  },
  tilde: { width: 32, height: 32, borderRadius: 16, backgroundColor: acento, alignItems: 'center', justifyContent: 'center' },
  texto: { flex: 1, fontFamily: fuente.bodySemi, fontSize: 16, color: color.onInk },
});
