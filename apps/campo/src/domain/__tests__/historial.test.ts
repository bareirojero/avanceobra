import { unirDias, type FotoAnterior } from '../historial';

const foto = (id: string, fecha: string, hora: string, extra: Partial<FotoAnterior> = {}): FotoAnterior => ({
  id, fecha, item_id: 'i1', tomada_en: `${fecha}T${hora}:00.000Z`, comentario: null, ancho: 3, alto: 4,
  miniatura: null, archivo: null, claveMiniatura: null, claveArchivo: null, marcas: 0, estado: null, error: null,
  anotaciones: [], ...extra,
});

describe('envíos de días anteriores', () => {
  it('agrupa por día, del más nuevo al más viejo, y deja afuera lo de hoy', () => {
    const dias = unirDias(
      [foto('a', '2026-10-22', '10:00'), foto('hoy', '2026-10-24', '09:00')],
      [foto('b', '2026-10-23', '08:00'), foto('c', '2026-10-22', '15:00'), foto('d', '2026-08-01', '12:00')],
      '2026-10-24',
    );
    expect(dias.map((d) => d.fecha)).toEqual(['2026-10-23', '2026-10-22', '2026-08-01']);
    expect(dias[1].fotos.map((f) => f.id)).toEqual(['c', 'a']);
  });

  it('prefiere el archivo del teléfono y el estado local, y usa la URL del servidor si falta', () => {
    const remota = foto('a', '2026-10-22', '10:00', {
      miniatura: 'https://x/mini', claveMiniatura: 'fotos/a_mini.jpg', archivo: 'https://x/a', claveArchivo: 'fotos/a.jpg',
      marcas: 2, anotaciones: [{ id: 'm1' } as never],
    });
    const [conArchivo] = unirDias(
      [foto('a', '2026-10-22', '10:00', { miniatura: 'file:///a_mini.jpg', archivo: 'file:///a.jpg', estado: 'pendiente' })],
      [remota],
      '2026-10-24',
    );
    expect(conArchivo.fotos[0]).toMatchObject({
      miniatura: 'file:///a_mini.jpg', claveMiniatura: null, archivo: 'file:///a.jpg', estado: 'pendiente', anotaciones: [{ id: 'm1' }],
    });

    const [sinArchivo] = unirDias([foto('a', '2026-10-22', '10:00', { estado: 'subida' })], [remota], '2026-10-24');
    expect(sinArchivo.fotos[0]).toMatchObject({ miniatura: 'https://x/mini', claveMiniatura: 'fotos/a_mini.jpg', estado: 'subida' });
  });

  it('sin señal muestra solo lo guardado en el teléfono', () => {
    const dias = unirDias([foto('a', '2026-10-20', '10:00', { estado: 'error', error: 'x' })], [], '2026-10-24');
    expect(dias).toHaveLength(1);
    expect(dias[0].fotos[0].estado).toBe('error');
  });
});
