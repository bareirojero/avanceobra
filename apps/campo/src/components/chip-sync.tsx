import { AlertTriangle, Check, Clock, RefreshCw, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { EstadoSync } from '@/data/sincronizacion';
import { fuente, syncState } from '@/theme';

/** El estado de envío en palabras (regla 3 de la guía): "3 esperan señal". */
export function textoSync(e: EstadoSync): { estado: keyof typeof syncState; texto: string; icono: LucideIcon } {
  const { fotosEsperando: n, fotosConError: err } = e.resumen;
  if (err > 0) return { estado: 'error', texto: err === 1 ? '1 no se pudo enviar' : `${err} no se pudieron enviar`, icono: AlertTriangle };
  if (n > 0 && e.enviando) return { estado: 'subiendo', texto: n === 1 ? 'Enviando 1 foto' : `Enviando ${n} fotos`, icono: RefreshCw };
  if (n > 0) {
    const sinRed = e.sinSenal ? (e.soloWifi ? 'esperan Wi-Fi' : 'esperan señal') : 'por enviar';
    return { estado: 'pendiente', texto: n === 1 ? `1 ${sinRed.replace('esperan', 'espera')}` : `${n} ${sinRed}`, icono: Clock };
  }
  if (e.resumen.operaciones > 0) return { estado: 'pendiente', texto: e.sinSenal ? 'Esperando señal' : 'Por enviar', icono: Clock };
  return { estado: 'subida', texto: 'Todo enviado', icono: Check };
}

export function ChipSync({ estado }: { estado: EstadoSync }) {
  const { estado: clave, texto, icono: Icono } = textoSync(estado);
  const tono = syncState[clave];
  return (
    <View style={[s.chip, { backgroundColor: tono.bg }]} accessibilityRole="text" accessibilityLabel={texto}>
      <Icono size={16} color={tono.fg} strokeWidth={2.5} />
      <Text style={[s.texto, { color: tono.fg }]}>{texto}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6 },
  texto: { fontFamily: fuente.bodySemi, fontSize: 14 },
});
