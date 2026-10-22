import type { OperacionPendiente } from '@registro-obra/contrato';

import {
  ErrorPermanente,
  ErrorSinConexion,
  esperaReintento,
  ESPERA_BASE_MS,
  ESPERA_MAXIMA_MS,
  procesarCola,
  type AlmacenCola,
  type EntradaCola,
} from '../cola';

/** Almacén en memoria con la misma semántica que el de SQLite. */
class AlmacenMemoria implements AlmacenCola {
  entradas: EntradaCola[] = [];
  private seq = 0;

  agregar(op: OperacionPendiente, grupos: string[]) {
    this.entradas.push({ seq: ++this.seq, op, grupos, intentos: 0, proximoIntento: 0, rev: 0, error: null });
  }
  async listar() {
    return this.entradas.map((e) => ({ ...e }));
  }
  async quitar(seq: number, rev: number) {
    this.entradas = this.entradas.filter((e) => !(e.seq === seq && e.rev === rev));
  }
  async reprogramar(seq: number, intentos: number, proximoIntento: number, error: string) {
    Object.assign(this.entradas.find((e) => e.seq === seq)!, { intentos, proximoIntento, error: null, ultimo: error });
  }
  async marcarError(seq: number, error: string) {
    this.entradas.find((e) => e.seq === seq)!.error = error;
  }
}

const archivo = (id: string): OperacionPendiente => ({
  tipo: 'subir_archivo', id, ruta: `fotos/o/a/${id}.jpg`, uriLocal: `file:///${id}.jpg`, contentType: 'image/jpeg',
});
const fila = (recurso: 'partes' | 'fotos' | 'anotaciones', id: string): OperacionPendiente => ({
  tipo: 'upsert', id, recurso, fila: {},
});

/** Parte P1 con la foto F1 y una anotación, y otro parte P2 con la foto F2. */
function colaDeEjemplo() {
  const a = new AlmacenMemoria();
  a.agregar(fila('partes', 'P1'), ['P1']);
  a.agregar(archivo('F1'), ['P1', 'F1']);
  a.agregar(fila('fotos', 'F1'), ['P1', 'F1']);
  a.agregar(fila('anotaciones', 'A1'), ['P1', 'F1']);
  a.agregar(fila('partes', 'P2'), ['P2']);
  a.agregar(archivo('F2'), ['P2', 'F2']);
  a.agregar(fila('fotos', 'F2'), ['P2', 'F2']);
  return a;
}

const ids = (ops: OperacionPendiente[]) => ops.map((o) => `${o.tipo === 'upsert' ? o.recurso : 'archivo'}:${o.id}`);

describe('procesarCola', () => {
  it('sube todo en orden FIFO y vacía la cola', async () => {
    const almacen = colaDeEjemplo();
    const hechas: OperacionPendiente[] = [];
    const r = await procesarCola(almacen, { ejecutar: async (op) => void hechas.push(op) });
    expect(r).toMatchObject({ subidas: 7, conError: 0, frenada: false });
    expect(ids(hechas)).toEqual([
      'partes:P1', 'archivo:F1', 'fotos:F1', 'anotaciones:A1', 'partes:P2', 'archivo:F2', 'fotos:F2',
    ]);
    expect(almacen.entradas).toHaveLength(0);
  });

  it('sin señal frena todo y reprograma solo la primera', async () => {
    const almacen = colaDeEjemplo();
    let llamadas = 0;
    const r = await procesarCola(
      almacen,
      { ejecutar: async () => { llamadas++; throw new ErrorSinConexion(); } },
      { ahora: () => 1_000, azar: () => 0.5 },
    );
    expect(r).toMatchObject({ subidas: 0, frenada: true, sinConexion: true });
    expect(llamadas).toBe(1);
    expect(almacen.entradas[0]).toMatchObject({ intentos: 1, proximoIntento: 1_000 + ESPERA_BASE_MS });
  });

  it('nunca adelanta una fila a su archivo: un error pasajero en el archivo frena la foto', async () => {
    const almacen = colaDeEjemplo();
    const hechas: OperacionPendiente[] = [];
    await procesarCola(almacen, {
      ejecutar: async (op) => {
        if (op.tipo === 'subir_archivo' && op.id === 'F1') throw new Error('503');
        hechas.push(op);
      },
    });
    expect(ids(hechas)).toEqual(['partes:P1']);
  });

  it('un error permanente bloquea solo lo de esa foto y sigue con lo demás', async () => {
    const almacen = colaDeEjemplo();
    const hechas: OperacionPendiente[] = [];
    const r = await procesarCola(almacen, {
      ejecutar: async (op) => {
        if (op.tipo === 'upsert' && op.id === 'F1') throw new ErrorPermanente('403 sin permiso');
        hechas.push(op);
      },
    });
    expect(r).toMatchObject({ subidas: 5, conError: 1 });
    expect(ids(hechas)).toEqual(['partes:P1', 'archivo:F1', 'partes:P2', 'archivo:F2', 'fotos:F2']);
    expect(almacen.entradas.map((e) => [e.op.id, e.error])).toEqual([
      ['F1', '403 sin permiso'],
      ['A1', null],
    ]);
  });

  it('en la pasada siguiente sigue respetando el bloqueo', async () => {
    const almacen = colaDeEjemplo();
    await procesarCola(almacen, {
      ejecutar: async (op) => { if (op.id === 'F1' && op.tipo === 'upsert') throw new ErrorPermanente('x'); },
    });
    const ejecutar = jest.fn(async () => {});
    await procesarCola(almacen, { ejecutar });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('espera al próximo intento antes de reintentar', async () => {
    const almacen = colaDeEjemplo();
    almacen.entradas[0].proximoIntento = 5_000;
    const ejecutar = jest.fn(async () => {});
    const r = await procesarCola(almacen, { ejecutar }, { ahora: () => 4_000 });
    expect(ejecutar).not.toHaveBeenCalled();
    expect(r.frenada).toBe(true);
  });

  it('si la fila cambió mientras se subía, no la saca de la cola', async () => {
    const almacen = colaDeEjemplo();
    await procesarCola(almacen, {
      ejecutar: async (op) => {
        if (op.id === 'F1' && op.tipo === 'upsert') {
          // El usuario edita la foto en ese momento: la entrada cambia de rev.
          almacen.entradas.find((e) => e.op === op || (e.op.id === 'F1' && e.op.tipo === 'upsert'))!.rev = 1;
        }
      },
    });
    expect(almacen.entradas.map((e) => e.op.id)).toEqual(['F1']);
  });
});

describe('esperaReintento', () => {
  it('duplica la espera y no pasa del máximo', () => {
    const sinAzar = () => 0.5;
    expect(esperaReintento(1, sinAzar)).toBe(ESPERA_BASE_MS);
    expect(esperaReintento(2, sinAzar)).toBe(2 * ESPERA_BASE_MS);
    expect(esperaReintento(30, sinAzar)).toBe(ESPERA_MAXIMA_MS);
  });

  it('varía ±20%', () => {
    expect(esperaReintento(1, () => 0)).toBe(ESPERA_BASE_MS * 0.8);
    expect(esperaReintento(1, () => 1)).toBe(ESPERA_BASE_MS * 1.2);
  });
});
