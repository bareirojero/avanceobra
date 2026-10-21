// Tokens de diseño compartidos por apps/campo (Expo) y apps/web (Next.js).
// Fuente visual: canvas "Registro de obra · Diseño" (hilo Diseño visual y experiencia).

export const color = {
  // Acción principal y marcas sobre la foto. Siempre con texto `onAccent`.
  // Se reemplaza por organizaciones.color_primario cuando la marca esté definida.
  accent: '#FFC20E',
  onAccent: '#15181C',
  accentSoft: '#FFF6D6', // resaltado de párrafo seleccionado en el informe

  ink: '#15181C', // texto principal, barras, botón secundario
  inkSoft: '#3D4148', // etiquetas en campo
  muted: '#4A4E55', // texto secundario (pasa 4.5:1 sobre ground y surface)
  inkRaised: '#2A2E34', // ítem activo del menú lateral web
  onInk: '#FFFFFF',
  onInkMuted: '#C9CBCF',

  ground: '#F3F2EE', // fondo "hormigón"
  surface: '#FFFFFF', // tarjetas
  line: '#D9D7D0',
  lineStrong: '#CFCCC4', // bordes de botones web
  track: '#E8E6E0', // fondo de barras de avance

  plano: '#1D5FD1', // enlaces, selección, avance en web
  planoSoft: '#E7EEFB',
  planoText: '#164AA3',

  ok: '#1E7A4F',
  okSoft: '#E3F1EA',
  okText: '#155C3B',

  pending: '#B4540A', // esperando señal
  pendingSoft: '#FBEBDD',
  pendingText: '#8F420A',

  danger: '#B42318', // incidente, atraso, error
  dangerSoft: '#FBE3E1',
  dangerText: '#8E1C13',
} as const;

export const font = {
  display: 'Archivo', // 700 / 800: títulos, botones principales, números grandes
  body: 'Inter', // 400 / 500 / 600; cifras con tabular-nums
} as const;

// Tamaños en px. Campo nunca baja de 17 en texto que hay que leer.
export const type = {
  campo: { hero: 28, title: 24, section: 20, body: 18, label: 15, caption: 13, button: 22, number: 40 },
  web: { hero: 36, title: 22, section: 18, body: 15, label: 14, caption: 13, button: 15, number: 32 },
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;

export const radius = { sm: 8, md: 10, lg: 14, xl: 16, xxl: 18, pill: 999 } as const;

// Alturas mínimas de toque.
export const touch = {
  campo: { min: 48, control: 52, primary: 76, chip: 44 },
  web: { min: 40, control: 40, primary: 44, chip: 36 },
} as const;

export const icon = { library: 'lucide', stroke: 2, strokeActive: 2.3 } as const;

// Estados de sincronización por foto (contrato: esperando señal / subida).
export const syncState = {
  pendiente: { label: 'Esperando', bg: color.pendingSoft, fg: color.pendingText },
  subiendo: { label: 'Enviando', bg: color.planoSoft, fg: color.planoText },
  subida: { label: 'Enviado', bg: color.okSoft, fg: color.okText },
  error: { label: 'No se pudo enviar', bg: color.dangerSoft, fg: color.dangerText },
} as const;

// Estados del informe (contrato: generando, borrador, publicado, error).
export const informeState = {
  generando: { label: 'Armando…', bg: color.track, fg: color.ink },
  borrador: { label: 'Borrador', bg: color.planoSoft, fg: color.planoText },
  publicado: { label: 'Publicado', bg: color.okSoft, fg: color.okText },
  error: { label: 'Error', bg: color.dangerSoft, fg: color.dangerText },
} as const;

// Marcas sobre la foto: la seleccionada usa accent, las demás blanco, borde ink.
export const marca = { size: 40, sizeWeb: 30, border: 3, selected: color.accent, idle: '#FFFFFF', outline: color.ink } as const;

// Texto legible sobre un color de marca cualquiera (por si color_primario es oscuro).
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.179 ? color.ink : color.onInk;
}
