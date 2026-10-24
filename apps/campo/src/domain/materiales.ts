import type { MaterialCampo } from '@registro-obra/contrato';

import { diaYFecha, fechaCorta, fechaParte } from './fechas';

const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Busca materiales por palabras sueltas, sin importar tildes ni mayúsculas: "cemento cp"
 * encuentra "Cemento CPII 50 kg". Todas las palabras tienen que aparecer.
 */
export function buscarMateriales(materiales: MaterialCampo[], consulta: string, limite = 60): MaterialCampo[] {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const salida: MaterialCampo[] = [];
  for (const m of materiales) {
    const texto = normal(`${m.descripcion} ${m.unidad ?? ''}`);
    if (palabras.every((p) => texto.includes(p))) salida.push(m);
    if (salida.length >= limite) break;
  }
  return salida;
}

/** "12,5" o "12.5" → 12.5. Null si no es un número mayor a cero. */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d+)?$/.test(limpio)) return null;
  const n = Number(limpio.replace(',', '.'));
  return n > 0 ? n : null;
}

/** 12.5 → "12,5", como se escribe en Paraguay. */
export const cantidadTexto = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Próximos días para elegir cuándo hace falta el material: "Hoy", "Mañana", "Vie 24/10"... */
export function proximosDias(hoy: string, cantidad = 14): { fecha: string; texto: string }[] {
  const [a, m, d] = hoy.split('-').map(Number);
  return Array.from({ length: cantidad }, (_, i) => {
    const f = new Date(Date.UTC(a, m - 1, d + i));
    const fecha = f.toISOString().slice(0, 10);
    const texto = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DIAS[f.getUTCDay()]} ${fechaCorta(fecha)}`;
    return { fecha, texto };
  });
}

/**
 * Pedidos agrupados por el día en que se hicieron (hora de Paraguay), en el orden en que
 * vienen: "Hoy 24/10", "Ayer 23/10", "Martes 21/10".
 */
export function agruparPorDia<T extends { pedido_en: string }>(pedidos: T[], ahora = new Date()): { titulo: string; data: T[] }[] {
  const hoy = fechaParte(ahora);
  const ayer = fechaParte(new Date(ahora.getTime() - 86_400_000));
  const grupos: { titulo: string; data: T[] }[] = [];
  for (const p of pedidos) {
    const f = fechaParte(new Date(p.pedido_en));
    const titulo = f === hoy ? `Hoy ${fechaCorta(f)}` : f === ayer ? `Ayer ${fechaCorta(f)}` : diaYFecha(f);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.titulo === titulo) ultimo.data.push(p);
    else grupos.push({ titulo, data: [p] });
  }
  return grupos;
}
