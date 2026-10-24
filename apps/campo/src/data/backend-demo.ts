import { CATEGORIAS_ESPECIALES, type Item, type MaterialCampo, type Obra } from '@registro-obra/contrato';
import NetInfo from '@react-native-community/netinfo';

import { ErrorSinConexion } from '@/domain/cola';
import { itemsDesdePep } from '@/domain/itemizado';

import { ErrorDeIngreso, type Backend } from './backend';
import { guardarAjuste, leerAjuste } from './db';
import { ITEMIZADO_DEMO } from './itemizado-demo';

/**
 * Modo demo: la app completa funciona sin servidor, con una obra y un itemizado inventados
 * (los mismos de db/seed/desarrollo.sql). Las fotos quedan en el teléfono y la "subida"
 * solo simula la espera de la red (y respeta si hay señal o no, para poder probar el modo
 * sin conexión). Se usa mientras la API no esté publicada, y sirve para mostrar la app.
 */
const ACTUALIZADO = '2026-10-21T20:00:00.000Z';
const ORG = 'b0000000-0000-4000-8000-000000000001';
const YO = 'a0000000-0000-4000-8000-000000000003';
const OBRA = 'c0000000-0000-4000-8000-000000000001';

const base = { creado_en: ACTUALIZADO, actualizado_en: ACTUALIZADO, eliminado_en: null };
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const OBRA_DEMO: Obra = {
  ...base, id: OBRA, organizacion_id: ORG, nombre: 'Obra de prueba - Fundaciones', codigo: 'OC.9999', sigla: 'PRB',
  cliente: null, direccion: 'Asunción', latitud: null, longitud: null, fecha_inicio: null, fecha_fin_prevista: null,
  estado: 'activa', notas_para_informe: null,
};

// Algunos materiales de la exportación de SAP, para probar el pedido sin servidor.
const MATERIALES_DEMO: MaterialCampo[] = (
  [
    ['ALCOHOL', 'L'], ['GAS LICUADO DE PETROLEO', 'KG'], ['DIESEL PODIUM', 'L'], ['CEMENTO CPII 50 KG', 'BOLSA'],
    ['ARENA LAVADA', 'M3'], ['PIEDRA TRITURADA 4ª', 'M3'], ['HIERRO CA-50 Ø 10 MM', 'BARRA'], ['ALAMBRE RECOCIDO Nº 18', 'KG'],
  ] as const
).map(([descripcion, unidad], i) => ({ ...base, id: `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, descripcion, unidad, orden: i + 1 }));

// Las entradas fijas que la base crea en cada obra (incidente, dron, pluviómetro).
const ESPECIALES_DEMO: Item[] = CATEGORIAS_ESPECIALES.map(({ categoria, nombre }, n) => ({
  ...base, id: id(900 + n), obra_id: OBRA, padre_id: null, codigo: categoria.toUpperCase(), numero: null,
  descripcion: nombre, unidad: null, cantidad: null, es_titulo: false, categoria, nivel: 0,
  orden: categoria === 'incidente' ? -1 : 1000000 + n, inicio_previsto: null, fin_previsto: null, importacion_id: null,
}));

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hayRed() {
  const estado = await NetInfo.fetch();
  return estado.isConnected !== false && estado.isInternetReachable !== false;
}

export function crearBackendDemo(): Backend {
  let nombre = 'Residente de prueba';
  let usuario = 'residente';

  return {
    modo: 'demo',

    async iniciarSesion(u, clave) {
      if (!u.trim() || !clave) throw new ErrorDeIngreso('Escribí un usuario y una contraseña');
      usuario = u.trim().toLowerCase();
      nombre = u.trim();
      await guardarAjuste('demo.sesion', u.trim());
      return { usuarioId: YO, nombre, usuario };
    },

    async sesionGuardada() {
      const u = await leerAjuste('demo.sesion');
      if (!u) return null;
      nombre = u;
      usuario = u.toLowerCase();
      return { usuarioId: YO, nombre, usuario };
    },

    async cerrarSesion() {
      await guardarAjuste('demo.sesion', '');
    },

    transporte: {
      async ejecutar(op) {
        if (!(await hayRed())) throw new ErrorSinConexion();
        await espera(op.tipo === 'subir_archivo' ? 600 : 150);
      },
    },

    async yo() {
      return {
        usuario: { ...base, id: YO, organizacion_id: ORG, usuario, nombre, es_admin: false, activo: true, ultimo_ingreso: null },
        obras: [{ obra: OBRA_DEMO, rol: 'campo', cargo: 'residente' }],
      };
    },

    async novedades(_obraId, desde) {
      const vacio = { hasta: ACTUALIZADO, obra: OBRA_DEMO, miembros: [], sectores: [], items: [], partes: [], fotos: [], anotaciones: [], registros_dia: [], materiales: [] };
      if (desde && desde >= ACTUALIZADO) return vacio;
      return {
        ...vacio,
        miembros: [{ ...base, obra_id: OBRA, usuario_id: YO, rol: 'campo', cargo: 'residente', nombre, usuario }],
        items: [...ESPECIALES_DEMO, ...itemsDesdePep(ITEMIZADO_DEMO, OBRA, (i) => id(i + 1), ACTUALIZADO)],
        materiales: MATERIALES_DEMO,
      };
    },

    // Sin servidor no hay más fotos que las del teléfono.
    async misFotos() {
      if (!(await hayRed())) throw new ErrorSinConexion();
      return { dias: [], siguiente: null };
    },
  };
}
