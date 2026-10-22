import { color, marca, onColor, radius, space, syncState, touch, type } from '@registro-obra/ui-tokens';

/**
 * Tema de la app de campo. Los valores salen de @registro-obra/ui-tokens (hilo de
 * Diseño); acá solo se agregan los nombres de las fuentes cargadas.
 *
 * El acento es provisorio hasta tener la marca: cuando llegue, sale de
 * organizaciones.color_primario y el texto encima usa onColor().
 */
export { color, marca, onColor, radius, space, syncState };

export const t = type.campo;
export const toque = touch.campo;

export const fuente = {
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const acento = color.accent;
export const sobreAcento = onColor(color.accent);
