import type { Geometria, TipoAnotacion } from '@registro-obra/contrato';

/**
 * Marcas (anotaciones) sobre una foto, mientras se editan en el teléfono.
 *
 * La geometría usa el formato del contrato: coordenadas normalizadas 0..1 sobre la
 * imagen, y el radio del círculo relativo al ancho. Así la misma marca se dibuja igual
 * en el teléfono, en el panel web y en el PDF.
 *
 * Los números no se reacomodan al borrar: el servidor tiene unique (foto_id, numero) y
 * la marca borrada sigue existiendo con eliminado_en. Además, un comentario que diga
 * "igual que en 2" no debe cambiar de sentido.
 */

export type TipoMarca = TipoAnotacion;

export interface Marca {
  id: string;
  numero: number;
  tipo: TipoMarca;
  geometria: Geometria;
  comentario: string;
  /** Borrada en el teléfono; se sube como borrado lógico. */
  eliminada: boolean;
}

export interface Tam {
  ancho: number;
  alto: number;
}

/** Rectángulo en píxeles de pantalla. */
export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Punto {
  x: number;
  y: number;
}

/** Dónde queda la foto dentro de su contenedor cuando se muestra entera ("contain"). */
export function encajar(contenedor: Tam, foto: Tam): Rect {
  if (foto.ancho <= 0 || foto.alto <= 0 || contenedor.ancho <= 0 || contenedor.alto <= 0) {
    return { x: 0, y: 0, ancho: 0, alto: 0 };
  }
  const escala = Math.min(contenedor.ancho / foto.ancho, contenedor.alto / foto.alto);
  const ancho = foto.ancho * escala;
  const alto = foto.alto * escala;
  return { x: (contenedor.ancho - ancho) / 2, y: (contenedor.alto - alto) / 2, ancho, alto };
}

const limitar = (v: number) => Math.min(1, Math.max(0, v));

/** Pantalla → foto. Devuelve null si el toque cae fuera de la foto. */
export function aNormalizado(p: Punto, rect: Rect): Punto | null {
  if (rect.ancho === 0 || rect.alto === 0) return null;
  const x = (p.x - rect.x) / rect.ancho;
  const y = (p.y - rect.y) / rect.alto;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** Como aNormalizado, pero lleva al borde lo que cae afuera (para arrastres). */
export function aNormalizadoLimitado(p: Punto, rect: Rect): Punto {
  if (rect.ancho === 0 || rect.alto === 0) return { x: 0, y: 0 };
  return { x: limitar((p.x - rect.x) / rect.ancho), y: limitar((p.y - rect.y) / rect.alto) };
}

/** Foto → pantalla. */
export function aPantalla(p: Punto, rect: Rect): Punto {
  return { x: rect.x + p.x * rect.ancho, y: rect.y + p.y * rect.alto };
}

/** Tamaño de lo que se crea con un toque, sin arrastrar (relativo al ancho de la foto). */
export const TAMANO_TOQUE = 0.06;
/** Por debajo de este recorrido el gesto cuenta como toque. */
export const ARRASTRE_MINIMO = 0.025;
/** Distancia mínima entre puntos de un trazo; evita guardar cientos de puntos iguales. */
export const PASO_TRAZO = 0.006;

/** Punto donde va el número de la marca y de donde se la agarra para moverla. */
export function ancla(g: Geometria): Punto {
  if ('cx' in g) return { x: g.cx, y: g.cy };
  if ('x1' in g) return { x: g.x1, y: g.y1 };
  if ('puntos' in g) return g.puntos.length ? { x: g.puntos[0][0], y: g.puntos[0][1] } : { x: 0, y: 0 };
  return { x: g.x, y: g.y };
}

/** Traslada la geometría para que su ancla quede en `destino`, sin salirse de la foto. */
export function trasladar(g: Geometria, destino: Punto): Geometria {
  if ('cx' in g) return { cx: limitar(destino.x), cy: limitar(destino.y), r: g.r };
  if (!('x1' in g) && !('w' in g) && !('puntos' in g)) return { x: limitar(destino.x), y: limitar(destino.y) };

  // Las formas con extensión se mueven enteras: el desplazamiento se recorta para que
  // ningún extremo salga de la foto.
  const xs = 'x1' in g ? [g.x1, g.x2] : 'w' in g ? [g.x, g.x + g.w] : g.puntos.map((p) => p[0]);
  const ys = 'x1' in g ? [g.y1, g.y2] : 'w' in g ? [g.y, g.y + g.h] : g.puntos.map((p) => p[1]);
  const a = ancla(g);
  const dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), destino.x - a.x));
  const dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), destino.y - a.y));
  if ('x1' in g) return { x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
  if ('w' in g) return { x: g.x + dx, y: g.y + dy, w: g.w, h: g.h };
  return { puntos: g.puntos.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

export const visibles = (marcas: Marca[]) => marcas.filter((m) => !m.eliminada);

/** El siguiente número cuenta también las borradas, para no repetir. */
export function siguienteNumero(marcas: Marca[]): number {
  return marcas.reduce((max, m) => Math.max(max, m.numero), 0) + 1;
}

/**
 * Convierte el recorrido del dedo (coordenadas normalizadas) en la geometría de la
 * herramienta elegida. Un toque sin arrastre crea la forma con un tamaño por defecto.
 * Las distancias se miden en unidades del ancho, como el radio del contrato, para que
 * un círculo quede redondo aunque la foto no sea cuadrada.
 */
export function geometriaDeGesto(trayecto: Punto[], modo: TipoMarca, foto: Tam): Geometria {
  const inicio = trayecto[0] ?? { x: 0.5, y: 0.5 };
  const fin = trayecto[trayecto.length - 1] ?? inicio;
  const proporcion = foto.ancho > 0 ? foto.alto / foto.ancho : 1;
  const largo = Math.hypot(fin.x - inicio.x, (fin.y - inicio.y) * proporcion);
  const toque = largo < ARRASTRE_MINIMO;
  // Lo que mide TAMANO_TOQUE del ancho, expresado en la escala del alto.
  const altoToque = TAMANO_TOQUE / proporcion;

  switch (modo) {
    case 'circulo':
      return { cx: inicio.x, cy: inicio.y, r: toque ? TAMANO_TOQUE : largo };
    case 'rectangulo': {
      if (toque) {
        return {
          x: limitar(inicio.x - TAMANO_TOQUE),
          y: limitar(inicio.y - altoToque),
          w: Math.min(2 * TAMANO_TOQUE, 1 - limitar(inicio.x - TAMANO_TOQUE)),
          h: Math.min(2 * altoToque, 1 - limitar(inicio.y - altoToque)),
        };
      }
      const x = Math.min(inicio.x, fin.x);
      const y = Math.min(inicio.y, fin.y);
      return { x, y, w: Math.abs(fin.x - inicio.x), h: Math.abs(fin.y - inicio.y) };
    }
    case 'flecha':
      // Se dibuja desde afuera hacia la zona: la punta queda donde se suelta el dedo.
      // Con un toque, una flecha corta que llega desde arriba a la izquierda.
      if (toque) {
        return {
          x1: limitar(inicio.x - 2 * TAMANO_TOQUE),
          y1: limitar(inicio.y - 2 * altoToque),
          x2: inicio.x,
          y2: inicio.y,
        };
      }
      return { x1: inicio.x, y1: inicio.y, x2: fin.x, y2: fin.y };
    case 'trazo': {
      if (toque) return { x: inicio.x, y: inicio.y };
      const puntos: [number, number][] = [[inicio.x, inicio.y]];
      for (const p of trayecto.slice(1)) {
        const [ux, uy] = puntos[puntos.length - 1];
        if (Math.hypot(p.x - ux, (p.y - uy) * proporcion) >= PASO_TRAZO) puntos.push([p.x, p.y]);
      }
      const [ux, uy] = puntos[puntos.length - 1];
      if (ux !== fin.x || uy !== fin.y) puntos.push([fin.x, fin.y]);
      return { puntos };
    }
    default:
      return { x: inicio.x, y: inicio.y };
  }
}

/** Tipo real de una geometría (un trazo de un solo toque queda como punto). */
export function tipoDeGeometria(g: Geometria): TipoMarca {
  if ('cx' in g) return 'circulo';
  if ('x1' in g) return 'flecha';
  if ('w' in g) return 'rectangulo';
  if ('puntos' in g) return 'trazo';
  return 'punto';
}

export function agregarMarca(marcas: Marca[], geometria: Geometria, id: string): Marca[] {
  return [
    ...marcas,
    {
      id,
      numero: siguienteNumero(marcas),
      tipo: tipoDeGeometria(geometria),
      geometria,
      comentario: '',
      eliminada: false,
    },
  ];
}

export function moverMarca(marcas: Marca[], id: string, destino: Punto): Marca[] {
  return marcas.map((m) => (m.id === id ? { ...m, geometria: trasladar(m.geometria, destino) } : m));
}

export function actualizarMarca(marcas: Marca[], id: string, cambios: Partial<Pick<Marca, 'comentario'>>): Marca[] {
  return marcas.map((m) => (m.id === id ? { ...m, ...cambios } : m));
}

/**
 * Borra una marca. Si nunca se subió (`nuevas` la incluye) se quita del todo; si no,
 * queda como borrada para mandarle eliminado_en al servidor.
 */
export function borrarMarca(marcas: Marca[], id: string, nuevas: ReadonlySet<string>): Marca[] {
  if (nuevas.has(id)) return marcas.filter((m) => m.id !== id);
  return marcas.map((m) => (m.id === id ? { ...m, eliminada: true } : m));
}

/** Dónde se dibuja el número de la marca, en coordenadas normalizadas. */
export function posicionNumero(g: Geometria, foto: Tam): Punto {
  if ('cx' in g) {
    // Arriba a la derecha, sobre el borde, para no tapar la zona marcada.
    const proporcion = foto.ancho > 0 ? foto.alto / foto.ancho : 1;
    return { x: g.cx + g.r * Math.SQRT1_2, y: g.cy - (g.r * Math.SQRT1_2) / proporcion };
  }
  if ('w' in g) return { x: g.x + g.w, y: g.y };
  return ancla(g);
}

/**
 * Qué marca está bajo el dedo. Gana la más cercana dentro de la tolerancia, que va en
 * píxeles porque lo que importa es el tamaño del dedo, no el de la foto. Se puede
 * agarrar por el número o por el dibujo.
 */
export function marcaEn(marcas: Marca[], p: Punto, rect: Rect, toleranciaPx = 28): Marca | null {
  const foto = { ancho: rect.ancho, alto: rect.alto };
  let mejor: Marca | null = null;
  let mejorDist = Infinity;
  for (const m of visibles(marcas)) {
    const g = m.geometria;
    const n = aPantalla(posicionNumero(g, foto), rect);
    let dist = Math.hypot(p.x - n.x, p.y - n.y);
    if ('cx' in g) {
      const c = aPantalla({ x: g.cx, y: g.cy }, rect);
      dist = Math.min(dist, Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - g.r * rect.ancho));
    } else if ('x1' in g) {
      dist = Math.min(dist, distanciaASegmento(p, aPantalla({ x: g.x1, y: g.y1 }, rect), aPantalla({ x: g.x2, y: g.y2 }, rect)));
    } else if ('w' in g) {
      const [a, b, c, d] = [
        { x: g.x, y: g.y },
        { x: g.x + g.w, y: g.y },
        { x: g.x + g.w, y: g.y + g.h },
        { x: g.x, y: g.y + g.h },
      ].map((q) => aPantalla(q, rect));
      dist = Math.min(dist, ...[[a, b], [b, c], [c, d], [d, a]].map(([u, v]) => distanciaASegmento(p, u, v)));
    } else if ('puntos' in g) {
      const pts = g.puntos.map(([x, y]) => aPantalla({ x, y }, rect));
      for (let i = 1; i < pts.length; i++) dist = Math.min(dist, distanciaASegmento(p, pts[i - 1], pts[i]));
    } else {
      const c = aPantalla(g, rect);
      dist = Math.min(dist, Math.hypot(p.x - c.x, p.y - c.y));
    }
    if (dist <= toleranciaPx && dist < mejorDist) {
      mejor = m;
      mejorDist = dist;
    }
  }
  return mejor;
}

function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const largo2 = vx * vx + vy * vy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / largo2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Marcas sin comentario: se avisan antes de guardar. */
export function marcasSinComentario(marcas: Marca[]): Marca[] {
  return visibles(marcas).filter((m) => m.comentario.trim() === '');
}
