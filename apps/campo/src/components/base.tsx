import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { acento, color, fuente, radius, sobreAcento, t, toque } from '@/theme';

type Variante = 'titulo' | 'seccion' | 'cuerpo' | 'etiqueta' | 'nota' | 'numero' | 'hero';

const estilosTexto = StyleSheet.create({
  hero: { fontFamily: fuente.display, fontSize: t.hero, color: color.ink },
  titulo: { fontFamily: fuente.display, fontSize: t.title, color: color.ink },
  seccion: { fontFamily: fuente.displayBold, fontSize: t.section, color: color.ink },
  cuerpo: { fontFamily: fuente.body, fontSize: t.body - 1, color: color.ink, lineHeight: 24 },
  etiqueta: { fontFamily: fuente.bodySemi, fontSize: t.label, color: color.inkSoft },
  nota: { fontFamily: fuente.body, fontSize: t.caption, color: color.muted },
  numero: { fontFamily: fuente.display, fontSize: t.number, color: color.ink, fontVariant: ['tabular-nums'] },
});

export function Texto({ v = 'cuerpo', style, ...props }: TextProps & { v?: Variante }) {
  return <Text {...props} style={[estilosTexto[v], style]} />;
}

interface BotonProps extends Omit<PressableProps, 'style' | 'children'> {
  texto: string;
  icono?: LucideIcon;
  cargando?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Acción principal: abajo, a lo ancho, 76 px, acento con texto tinta. */
export function BotonPrincipal({ texto, icono: Icono, cargando, disabled, style, ...props }: BotonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || cargando}
      style={({ pressed }) => [s.principal, (disabled || cargando) && s.deshabilitado, pressed && s.apretado, style]}
      {...props}>
      {cargando ? (
        <ActivityIndicator color={sobreAcento} />
      ) : (
        Icono && <Icono size={30} color={sobreAcento} strokeWidth={2.4} />
      )}
      <Text style={s.textoPrincipal}>{texto}</Text>
    </Pressable>
  );
}

/** Botón secundario: tinta con texto blanco, o con borde. */
export function Boton({
  texto,
  icono: Icono,
  borde,
  peligro,
  style,
  ...props
}: BotonProps & { borde?: boolean; peligro?: boolean }) {
  const fg = peligro ? color.dangerText : borde ? color.ink : color.onInk;
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        s.secundario,
        borde && s.conBorde,
        peligro && s.peligro,
        pressed && s.apretado,
        props.disabled && s.deshabilitado,
        style,
      ]}
      {...props}>
      {Icono && <Icono size={22} color={fg} strokeWidth={2.3} />}
      <Text style={[s.textoSecundario, { color: fg }]}>{texto}</Text>
    </Pressable>
  );
}

/** Botón redondo de solo ícono (cerrar, volver, micrófono): siempre con accessibilityLabel. */
export function BotonIcono({
  icono: Icono,
  etiqueta,
  claro,
  tamano = toque.min,
  style,
  ...props
}: Omit<PressableProps, 'style'> & {
  icono: LucideIcon;
  etiqueta: string;
  claro?: boolean;
  tamano?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={8}
      style={({ pressed }) => [
        { width: tamano, height: tamano, borderRadius: tamano / 2 },
        s.icono,
        claro && s.iconoClaro,
        pressed && s.apretado,
        style,
      ]}
      {...props}>
      <Icono size={Math.round(tamano * 0.46)} color={claro ? color.ink : color.onInk} strokeWidth={2.5} />
    </Pressable>
  );
}

/** Chip de selección: 44 px, píldora; elegido en tinta, libre con borde. */
export function Chip({
  texto,
  elegido,
  acentuado,
  punteado,
  style,
  ...props
}: Omit<PressableProps, 'style'> & {
  texto: string;
  elegido?: boolean;
  acentuado?: boolean;
  punteado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!elegido }}
      style={({ pressed }) => [
        s.chip,
        elegido && s.chipElegido,
        acentuado && s.chipAcento,
        punteado && s.chipPunteado,
        pressed && s.apretado,
        style,
      ]}
      {...props}>
      <Text
        style={[s.textoChip, elegido && !acentuado && { color: color.onInk }, acentuado && s.textoChipAcento]}
        numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

const s = StyleSheet.create({
  principal: {
    minHeight: toque.primary,
    borderRadius: radius.xxl,
    backgroundColor: acento,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  textoPrincipal: { fontFamily: fuente.display, fontSize: 23, color: sobreAcento },
  secundario: {
    minHeight: toque.control,
    borderRadius: 12,
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  conBorde: { backgroundColor: color.surface, borderWidth: 2, borderColor: color.line },
  peligro: { backgroundColor: color.surface, borderWidth: 2, borderColor: color.danger },
  textoSecundario: { fontFamily: fuente.bodySemi, fontSize: 16 },
  icono: { backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  iconoClaro: { backgroundColor: color.surface },
  chip: {
    minHeight: toque.chip,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.line,
    backgroundColor: color.surface,
    justifyContent: 'center',
  },
  chipElegido: { backgroundColor: color.ink, borderColor: color.ink },
  chipAcento: { backgroundColor: acento, borderColor: acento },
  chipPunteado: { borderStyle: 'dashed', borderColor: '#8C8F94' },
  textoChip: { fontFamily: fuente.bodySemi, fontSize: 15, color: color.ink },
  textoChipAcento: { fontFamily: fuente.display, fontSize: 16, color: sobreAcento },
  tarjeta: { backgroundColor: color.surface, borderRadius: radius.xl, padding: 18, gap: 16 },
  apretado: { opacity: 0.75 },
  deshabilitado: { opacity: 0.45 },
});
