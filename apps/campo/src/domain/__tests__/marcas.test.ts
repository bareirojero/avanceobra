import {
  actualizarMarca,
  agregarMarca,
  aNormalizado,
  borrarMarca,
  encajar,
  geometriaDeGesto,
  marcaEn,
  marcasSinComentario,
  moverMarca,
  siguienteNumero,
  TAMANO_TOQUE,
  trasladar,
  visibles,
  type Marca,
} from '../marcas';

const foto = { ancho: 4000, alto: 3000 };
// Foto 4:3 en un contenedor de 400x400: queda de 400x300 centrada en vertical.
const rect = encajar({ ancho: 400, alto: 400 }, foto);

describe('encajar y conversión de coordenadas', () => {
  it('centra la foto respetando su proporción', () => {
    expect(rect).toEqual({ x: 0, y: 50, ancho: 400, alto: 300 });
  });

  it('pasa de pantalla a foto y descarta toques fuera de la foto', () => {
    expect(aNormalizado({ x: 200, y: 200 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(aNormalizado({ x: 200, y: 20 }, rect)).toBeNull();
  });
});

describe('geometriaDeGesto', () => {
  it('un toque con la herramienta punto crea un punto', () => {
    expect(geometriaDeGesto([{ x: 0.3, y: 0.4 }], 'punto', foto)).toEqual({ x: 0.3, y: 0.4 });
  });

  it('el radio del círculo se mide en ancho de foto', () => {
    // 0,3 de alto en una foto 4:3 son 0,225 de ancho.
    const g = geometriaDeGesto([{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }], 'circulo', foto);
    expect(g).toEqual({ cx: 0.5, cy: 0.2, r: expect.closeTo(0.225, 6) });
  });

  it('un toque con círculo usa el tamaño por defecto', () => {
    expect(geometriaDeGesto([{ x: 0.5, y: 0.5 }], 'circulo', foto)).toEqual({ cx: 0.5, cy: 0.5, r: TAMANO_TOQUE });
  });

  it('el rectángulo se normaliza aunque se dibuje hacia arriba a la izquierda', () => {
    const g = geometriaDeGesto([{ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 }], 'rectangulo', foto);
    expect(g).toEqual({ x: 0.2, y: 0.3, w: expect.closeTo(0.4, 6), h: expect.closeTo(0.4, 6) });
  });

  it('la flecha apunta a donde se suelta el dedo', () => {
    expect(geometriaDeGesto([{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.5 }], 'flecha', foto)).toEqual({
      x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.5,
    });
  });

  it('el trazo descarta puntos demasiado juntos pero conserva el final', () => {
    const trayecto = [
      { x: 0.1, y: 0.1 },
      { x: 0.101, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.3, y: 0.1 },
      { x: 0.302, y: 0.1 },
    ];
    expect(geometriaDeGesto(trayecto, 'trazo', foto)).toEqual({
      puntos: [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1], [0.302, 0.1]],
    });
  });
});

describe('lista de marcas', () => {
  const crear = () => {
    let marcas: Marca[] = [];
    marcas = agregarMarca(marcas, { x: 0.2, y: 0.2 }, 'a');
    marcas = agregarMarca(marcas, { cx: 0.7, cy: 0.7, r: 0.1 }, 'b');
    return marcas;
  };

  it('numera en orden y deduce el tipo', () => {
    const marcas = crear();
    expect(marcas.map((m) => [m.numero, m.tipo])).toEqual([[1, 'punto'], [2, 'circulo']]);
  });

  it('al borrar no renumera: la marca subida queda como borrada y el número no se reutiliza', () => {
    const borradas = borrarMarca(crear(), 'a', new Set());
    expect(visibles(borradas).map((m) => m.numero)).toEqual([2]);
    expect(siguienteNumero(borradas)).toBe(3);
  });

  it('una marca que nunca se subió se quita del todo', () => {
    expect(borrarMarca(crear(), 'a', new Set(['a'])).map((m) => m.id)).toEqual(['b']);
  });

  it('actualiza el comentario y avisa las que faltan comentar', () => {
    const marcas = actualizarMarca(crear(), 'a', { comentario: 'Fisura' });
    expect(marcas[0]).toMatchObject({ comentario: 'Fisura' });
    expect(marcasSinComentario(marcas).map((m) => m.id)).toEqual(['b']);
  });

  it('mueve la marca sin sacarla de la foto', () => {
    expect(moverMarca(crear(), 'a', { x: 1.4, y: -1 })[0].geometria).toEqual({ x: 1, y: 0 });
  });
});

describe('trasladar', () => {
  it('mueve la flecha entera y frena en el borde sin deformarla', () => {
    const g = trasladar({ x1: 0.5, y1: 0.5, x2: 0.8, y2: 0.6 }, { x: 0.9, y: 0.5 });
    expect(g).toEqual({ x1: expect.closeTo(0.7, 6), y1: 0.5, x2: 1, y2: 0.6 });
  });

  it('mueve el rectángulo sin cambiar su tamaño', () => {
    expect(trasladar({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, { x: 0.9, y: 0.0 })).toEqual({
      x: expect.closeTo(0.7, 6), y: 0, w: 0.3, h: 0.2,
    });
  });
});

describe('marcaEn', () => {
  const marcas: Marca[] = [
    ...agregarMarca([], { x: 0.25, y: 0.5 }, 'p'),
    ...agregarMarca([], { x: 0.5, y: 0.2, w: 0.3, h: 0.3 }, 'r').map((m) => ({ ...m, numero: 2 })),
  ];

  it('agarra el punto más cercano dentro de la tolerancia', () => {
    // (0.25, 0.5) está en pantalla en (100, 200).
    expect(marcaEn(marcas, { x: 110, y: 205 }, rect)?.id).toBe('p');
    expect(marcaEn(marcas, { x: 160, y: 300 }, rect)).toBeNull();
  });

  it('agarra el rectángulo tocando su borde', () => {
    // Borde izquierdo: x = 200, de y = 110 a y = 200.
    expect(marcaEn(marcas, { x: 205, y: 150 }, rect)?.id).toBe('r');
  });

  it('ignora las marcas borradas', () => {
    expect(marcaEn(borrarMarca(marcas, 'p', new Set()), { x: 100, y: 200 }, rect)).toBeNull();
  });
});
