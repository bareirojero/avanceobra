import type { MaterialCampo } from '@registro-obra/contrato';

import { agruparPorDia, buscarMateriales, cantidadTexto, leerCantidad, proximosDias } from '../materiales';

const base = { creado_en: '', actualizado_en: '', eliminado_en: null };
const MATERIALES: MaterialCampo[] = [
  { ...base, id: '1', descripcion: 'Cemento CPII 50 kg', unidad: 'BOLSA', orden: 1 },
  { ...base, id: '2', descripcion: 'Arena lavada', unidad: 'M3', orden: 2 },
  { ...base, id: '3', descripcion: 'Hierro Ø 10 mm', unidad: 'BARRA', orden: 3 },
];

describe('materiales', () => {
  it('busca por palabras sin importar tildes ni mayúsculas', () => {
    expect(buscarMateriales(MATERIALES, 'cemento cp').map((m) => m.id)).toEqual(['1']);
    expect(buscarMateriales(MATERIALES, 'ARENA').map((m) => m.id)).toEqual(['2']);
    expect(buscarMateriales(MATERIALES, 'barra')).toHaveLength(1);
    expect(buscarMateriales(MATERIALES, '  ')).toEqual([]);
    expect(buscarMateriales(MATERIALES, 'cemento arena')).toEqual([]);
  });

  it('lee cantidades con coma o punto', () => {
    expect(leerCantidad('12,5')).toBe(12.5);
    expect(leerCantidad('3')).toBe(3);
    expect(leerCantidad('0')).toBeNull();
    expect(leerCantidad('abc')).toBeNull();
    expect(leerCantidad('1.000,5')).toBeNull();
    expect(cantidadTexto(12.5)).toBe('12,5');
  });

  it('arma los próximos días desde hoy', () => {
    const dias = proximosDias('2026-10-30', 4);
    expect(dias.map((d) => d.fecha)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dias.map((d) => d.texto)).toEqual(['Hoy', 'Mañana', 'Dom 01/11', 'Lun 02/11']);
  });

  it('agrupa los pedidos por el día en que se hicieron, en hora de Paraguay', () => {
    const ahora = new Date('2026-10-24T15:00:00-03:00');
    const pedidos = [
      { id: 'a', pedido_en: '2026-10-24T09:00:00-03:00' },
      { id: 'b', pedido_en: '2026-10-24T01:30:00.000Z' }, // 23/10 22:30 en Paraguay
      { id: 'c', pedido_en: '2026-10-23T08:00:00-03:00' },
      { id: 'd', pedido_en: '2026-10-20T08:00:00-03:00' },
    ];
    expect(agruparPorDia(pedidos, ahora).map((g) => [g.titulo, g.data.map((p) => p.id)])).toEqual([
      ['Hoy 24/10', ['a']],
      ['Ayer 23/10', ['b', 'c']],
      ['Martes 20/10', ['d']],
    ]);
  });
});
