// Tokens de diseño compartidos por apps/campo (Expo) y apps/web (Next.js).
// Fuente visual: lienzo "Avance de Obra · Diseño" (hilo Diseño visual y experiencia).

export const color = {
  // Marca "Avance de Obra" (sale del logo): azul marino, amarillo casco y verde avance.
  brandNavy: '#112037',
  brandYellow: '#FEC502',
  brandGreen: '#22D071', // solo sobre fondo oscuro o como relleno; para texto usar okText

  // Acción principal y marcas sobre la foto. Siempre con texto `onAccent`.
  accent: '#FEC502',
  onAccent: '#112037',
  accentSoft: '#FFF4CC', // resaltado de párrafo seleccionado en el informe

  ink: '#112037', // texto principal, barras, botón secundario (azul marino de la marca)
  inkSoft: '#36405A', // etiquetas en campo
  muted: '#4A5469', // texto secundario (pasa 4.5:1 sobre ground y surface)
  inkRaised: '#1E2D4A', // ítem activo del menú lateral web
  onInk: '#FFFFFF',
  onInkMuted: '#C4C9D4',

  ground: '#F1F2F4', // fondo general
  surface: '#FFFFFF', // tarjetas
  line: '#D6DAE1',
  lineStrong: '#C3C9D3', // bordes de botones web
  track: '#E4E7EC', // fondo de barras

  plano: '#1D5FD1', // enlaces y selección en web
  planoSoft: '#E7EEFB',
  planoText: '#164AA3',

  ok: '#1B8A50',
  okSoft: '#E1F5EA',
  okText: '#146A3D',

  pending: '#B4540A', // esperando señal
  pendingSoft: '#FBEBDD',
  pendingText: '#8F420A',

  danger: '#B42318', // incidente, error
  dangerSoft: '#FBE3E1',
  dangerText: '#8E1C13',
} as const;

export const font = {
  display: 'Archivo', // 700 / 800: títulos, botones principales, números grandes
  body: 'Inter', // 400 / 500 / 600; cifras con tabular-nums
} as const;

// Tamaños en px. Campo nunca baja de 17 en texto que hay que leer.
// Archivo también es la letra del logotipo (ExtraBold 800).
export const type = {
  campo: { hero: 28, title: 24, section: 20, body: 18, input: 18, label: 15, caption: 13, button: 22, number: 32 },
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

// Estado de un pedido de materiales (contrato: EstadoPedido). `dot` es el color pleno;
// la etiqueta va con `fg` sobre `bg`.
export const pedidoState = {
  enviado: { label: 'Enviado', bg: '#FFF4CC', fg: '#6B4F00', dot: '#FEC502' }, // amarillo
  rechazado: { label: 'Rechazado', bg: color.dangerSoft, fg: color.dangerText, dot: color.danger }, // rojo
  planificando: { label: 'Planificando', bg: '#FFEAD5', fg: '#8A4500', dot: '#F28C28' }, // naranja
  en_compra: { label: 'En compra', bg: '#F9DCC8', fg: '#6E2A05', dot: '#C2410C' }, // naranja oscuro
  disponible: { label: 'Disponible en obra', bg: color.okSoft, fg: color.okText, dot: color.ok }, // verde
} as const;

// Marcas sobre la foto: la seleccionada usa accent, las demás blanco, borde ink.
// Archivos de logo en packages/ui-tokens/assets/marca (ver el README de esa carpeta).
// El nombre del producto vive en @registro-obra/contrato (NOMBRE_APP).
export const logo = {
  icono: 'avance-obra-icono.svg',
  logotipoClaro: 'logotipo-positivo.svg',
  logotipoOscuro: 'logotipo-negativo.svg',
  marcaBlanca: 'marca-blanco.svg',
  marcaNegra: 'marca-negro.svg',
} as const;

export const marca = { size: 40, sizeWeb: 30, border: 3, selected: color.accent, idle: '#FFFFFF', outline: color.ink } as const;

// Texto legible sobre un color cualquiera (por ejemplo organizaciones.color_primario).
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.179 ? color.ink : color.onInk;
}
