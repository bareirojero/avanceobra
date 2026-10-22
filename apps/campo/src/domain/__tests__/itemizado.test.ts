import { ITEMIZADO_DEMO } from '@/data/itemizado-demo';

import { buscarItems, camino, cantidadDeHojas, hijos, itemsDesdePep, rubro, type FilaPep } from '../itemizado';

const FILAS: FilaPep[] = [
  ['OC.1234', 'OBRA DE PRUEBA', null, null],
  ['OC.1234D001', 'TRABAJOS PRELIMINARES', 'UN', null],
  ['OC.1234D001001', 'INSTALACIÓN DE OBRA', 'UN', null],
  ['OC.1234D00100101', '15-CERRAMIENTO PERIMETRAL (TAPIALES)', 'GLB', 1],
  ['OC.1234D002', 'ZAPATA CORRIDA Y MUROS', 'UN', null],
  ['OC.1234D002001', 'ZAPATA CORRIDA', 'UN', null],
  ['OC.1234D00200106', '25-COLOCACIÓN DE HORMIGÓN', 'M3', 200],
  ['OC.1234D002002', 'MUROS', 'UN', null],
  ['OC.1234D00200204', '32-HORMIGONADO DEL MURO', 'M3', 350],
  ['OC.1234D004', 'MOVIMIENTO DE SUELO Y DEMOLICIONES', 'UN', null],
  ['OC.1234D004001', '59-TERRAPLÉN COMPACTADO', 'M3', 6000],
];

const items = itemsDesdePep(FILAS, 'obra', (i) => `i${i}`, '2026-10-21T00:00:00Z');

describe('itemizado desde SAP', () => {
  it('no carga la fila de la obra y arma el árbol por el código PEP', () => {
    expect(items).toHaveLength(10);
    expect(hijos(items, null).map((i) => i.descripcion)).toEqual([
      'TRABAJOS PRELIMINARES', 'ZAPATA CORRIDA Y MUROS', 'MOVIMIENTO DE SUELO Y DEMOLICIONES',
    ]);
    expect(hijos(items, 'i9').map((i) => i.numero)).toEqual(['59']);
  });

  it('separa el número de ítem y marca como títulos las filas sin cantidad', () => {
    const cerramiento = items.find((i) => i.id === 'i3')!;
    expect(cerramiento).toMatchObject({
      codigo: 'OC.1234D00100101', numero: '15', descripcion: 'CERRAMIENTO PERIMETRAL (TAPIALES)', es_titulo: false, padre_id: 'i2', nivel: 3,
    });
    expect(items.find((i) => i.id === 'i2')).toMatchObject({ numero: null, es_titulo: true, padre_id: 'i1', nivel: 2 });
  });

  it('muestra el rubro del ítem', () => {
    expect(camino(items, 'i6').map((i) => i.id)).toEqual(['i4', 'i5']);
    expect(rubro(items, 'i6')).toBe('ZAPATA CORRIDA Y MUROS › ZAPATA CORRIDA');
    expect(cantidadDeHojas(items, 'i4')).toBe(2);
  });

  it('busca por número, por palabras sin tildes y en el nombre del rubro', () => {
    expect(buscarItems(items, '25').map((i) => i.numero)).toEqual(['25']);
    expect(buscarItems(items, 'hormigon').map((i) => i.numero)).toEqual(['25', '32']);
    expect(buscarItems(items, 'zapata hormigon').map((i) => i.numero)).toEqual(['25', '32']);
    expect(buscarItems(items, 'preliminares tapiales').map((i) => i.numero)).toEqual(['15']);
    expect(buscarItems(items, 'terraplen demolicion').map((i) => i.numero)).toEqual(['59']);
    expect(buscarItems(items, '  ')).toEqual([]);
  });

  it('el itemizado del modo demo se carga entero', () => {
    const odd = itemsDesdePep(ITEMIZADO_DEMO, 'obra', (i) => `x${i}`, '2026-10-21T00:00:00Z');
    expect(odd.length).toBe(ITEMIZADO_DEMO.length - 1);
    expect(odd.filter((i) => !i.es_titulo).every((i) => i.numero && i.padre_id)).toBe(true);
  });
});
