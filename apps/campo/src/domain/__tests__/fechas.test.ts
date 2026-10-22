import { diaYFecha, fechaCorta, fechaParte } from '../fechas';

describe('fechas', () => {
  it('la fecha del parte se calcula en hora de Paraguay', () => {
    // 02:30 UTC del 22/10 son las 23:30 del 21/10 en Asunción (UTC-3).
    expect(fechaParte(new Date('2026-10-22T02:30:00Z'))).toBe('2026-10-21');
    expect(fechaParte(new Date('2026-10-22T03:30:00Z'))).toBe('2026-10-22');
  });

  it('formatea como pide la guía', () => {
    expect(fechaCorta('2026-10-21')).toBe('21/10');
    expect(diaYFecha('2026-10-21')).toBe('Miércoles 21/10');
  });
});
