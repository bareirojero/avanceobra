import { ZONA_HORARIA } from '@registro-obra/contrato';

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Fecha del parte (AAAA-MM-DD) en hora de Paraguay, como pide el contrato, aunque el
 * teléfono tenga otra zona configurada. Si el motor no trae datos de zonas horarias, usa
 * la hora local del teléfono.
 */
export function fechaParte(instante: Date): string {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_HORARIA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instante);
    const v = (t: string) => partes.find((p) => p.type === t)?.value;
    const [a, m, d] = [v('year'), v('month'), v('day')];
    if (a && m && d) return `${a}-${m}-${d}`;
  } catch {
    // Sin soporte de zonas horarias.
  }
  return `${instante.getFullYear()}-${dos(instante.getMonth() + 1)}-${dos(instante.getDate())}`;
}

/** "21/10", como pide la guía de diseño. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "Martes 21/10". */
export function diaYFecha(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${fechaCorta(fecha)}`;
}

export function horaCorta(iso: string): string {
  const f = new Date(iso);
  return `${dos(f.getHours())}:${dos(f.getMinutes())}`;
}
