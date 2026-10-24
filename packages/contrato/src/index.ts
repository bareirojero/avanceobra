// =============================================================================
// @registro-obra/contrato: contrato compartido por la app de campo, el panel web
// y la API. Refleja db/migrations y docs/API.md.
// =============================================================================

import { v5 as uuidv5 } from 'uuid';

export type Uuid = string;
/** Instante ISO 8601 con zona, ej. "2026-10-21T14:05:00-03:00". */
export type Instante = string;
/** Fecha de calendario en America/Asuncion, "AAAA-MM-DD". */
export type Fecha = string;

export const ZONA_HORARIA = 'America/Asuncion';
export const NOMBRE_APP = 'ReporTE';

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/** 'gerente': solo web, solo ve el Dashboard de la obra. */
export type RolObra = 'editor' | 'campo' | 'lector' | 'gerente';
export type CargoObra = 'capataz' | 'residente' | 'jefe_obra' | 'oficina_tecnica' | 'fiscal' | 'cliente' | 'otro';
export type EstadoObra = 'activa' | 'pausada' | 'terminada' | 'archivada';
export type TipoAnotacion = 'punto' | 'circulo' | 'rectangulo' | 'flecha' | 'trazo';
export type OrigenFoto = 'app' | 'web';
export type TipoInforme = 'diario' | 'semanal' | 'mensual';
export type EstadoInforme = 'generando' | 'borrador' | 'publicado' | 'error';
/** 'obra': ítem del Excel de SAP. Las otras son entradas fijas que la base crea en cada obra. */
export type CategoriaItem = 'obra' | 'incidente' | 'dron' | 'pluviometro';

/** Estado de subida que la app muestra por foto (solo local). */
export type EstadoSubida = 'pendiente' | 'subiendo' | 'subida' | 'error';

// -----------------------------------------------------------------------------
// Filas (como las devuelve la API)
// -----------------------------------------------------------------------------

interface ConFechas {
  creado_en: Instante;
  actualizado_en: Instante;
}
interface Sincronizable extends ConFechas {
  eliminado_en: Instante | null;
}

export interface Usuario extends ConFechas {
  id: Uuid;
  organizacion_id: Uuid;
  usuario: string;
  nombre: string;
  es_admin: boolean;
  activo: boolean;
  ultimo_ingreso: Instante | null;
}

export interface Obra extends Sincronizable {
  id: Uuid;
  organizacion_id: Uuid;
  nombre: string;
  codigo: string | null; // PEP SAP raíz, ej. "OC.0054"
  sigla: string | null; // ej. "ODD", para numerar informes
  cliente: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  fecha_inicio: Fecha | null;
  fecha_fin_prevista: Fecha | null;
  estado: EstadoObra;
  notas_para_informe: string | null;
}

export interface ObraMiembro extends Sincronizable {
  obra_id: Uuid;
  usuario_id: Uuid;
  rol: RolObra;
  cargo: CargoObra | null;
}

export interface Sector extends Sincronizable {
  id: Uuid;
  obra_id: Uuid;
  padre_id: Uuid | null;
  nombre: string;
  orden: number;
}

export interface Item extends Sincronizable {
  id: Uuid;
  obra_id: Uuid;
  padre_id: Uuid | null;
  codigo: string; // elemento PEP SAP
  numero: string | null; // "15" de "15-CERRAMIENTO..."
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  es_titulo: boolean; // agrupador: no se le asignan fotos
  categoria: CategoriaItem;
  nivel: number;
  orden: number;
  inicio_previsto: Fecha | null;
  fin_previsto: Fecha | null;
  importacion_id: Uuid | null;
}

/** Entradas fijas del itemizado, en el orden en que se ofrecen. */
export const CATEGORIAS_ESPECIALES: { categoria: Exclude<CategoriaItem, 'obra'>; nombre: string }[] = [
  { categoria: 'incidente', nombre: 'Incidente de obra' },
  { categoria: 'dron', nombre: 'Vuelo de dron' },
  { categoria: 'pluviometro', nombre: 'Pluviómetro' },
];

/** Orden en el informe: los incidentes siempre primero, después la obra, al final dron y pluviómetro. */
export const ORDEN_CATEGORIA: Record<CategoriaItem, number> = { incidente: 0, obra: 1, dron: 2, pluviometro: 3 };

export interface ImportacionItems extends ConFechas {
  id: Uuid;
  obra_id: Uuid;
  archivo_nombre: string;
  version: string | null; // "V01"
  filas: number;
  importado_por: Uuid;
}

export interface ParteDiario extends Sincronizable {
  id: Uuid; // idParte(obra_id, autor_id, fecha)
  obra_id: Uuid;
  autor_id: Uuid;
  fecha: Fecha;
  notas: string | null;
}

export interface Foto extends Sincronizable {
  id: Uuid; // uuid v4 generado por quien la sube
  parte_id: Uuid;
  obra_id: Uuid;
  autor_id: Uuid;
  item_id: Uuid; // obligatorio, nunca un ítem título
  sector_id: Uuid | null;
  origen: OrigenFoto;
  tomada_en: Instante;
  latitud: number | null;
  longitud: number | null;
  archivo_path: string; // rutaFoto(...)
  miniatura_path: string; // rutaMiniatura(...)
  ancho: number | null;
  alto: number | null;
  comentario: string | null;
  orden: number;
  descripcion_ia: string | null; // solo la escribe el servidor
}

/** Coordenadas normalizadas 0..1 sobre la imagen; x a la derecha, y hacia abajo. */
export type Geometria =
  | { x: number; y: number } // punto
  | { cx: number; cy: number; r: number } // circulo (r relativo al ancho)
  | { x: number; y: number; w: number; h: number } // rectangulo
  | { x1: number; y1: number; x2: number; y2: number } // flecha, punta en (x2, y2)
  | { puntos: [number, number][] }; // trazo

export interface Anotacion extends Sincronizable {
  id: Uuid;
  foto_id: Uuid;
  obra_id: Uuid;
  autor_id: Uuid;
  numero: number; // nunca se reutiliza ni renumera
  tipo: TipoAnotacion;
  geometria: Geometria;
  color: string;
  comentario: string | null;
}

/** Clima y personal del día, los carga a mano el editor. Uno por obra y día. */
export interface RegistroDia extends Sincronizable {
  obra_id: Uuid;
  fecha: Fecha;
  clima: string | null; // "Soleado, 31 °C"
  hubo_lluvia: boolean | null;
  personal: PersonalEnObra[];
  observaciones: string | null;
  actualizado_por: Uuid | null;
}
export interface PersonalEnObra {
  oficio: string; // "oficial", "ayudante"
  cantidad: number;
  empresa?: string;
}

export interface Informe extends Sincronizable {
  id: Uuid;
  obra_id: Uuid;
  tipo: TipoInforme;
  numero: number; // correlativo por obra y tipo, lo asigna la base
  fecha_desde: Fecha;
  fecha_hasta: Fecha;
  estado: EstadoInforme;
  contenido_ia: ContenidoInforme | null;
  contenido: ContenidoInforme | null;
  version_esquema: number;
  modelo_ia: string | null;
  error: string | null;
  pdf_path: string | null;
  automatico: boolean; // lo generó la tarea de las 23:55 porque nadie lo había armado
  generado_por: Uuid | null;
  publicado_por: Uuid | null;
  publicado_en: Instante | null;
}

/** Material del catálogo de la organización (se importa desde Excel). */
export interface Material extends Sincronizable {
  id: Uuid;
  organizacion_id: Uuid;
  codigo: string; // no se muestra en la app de campo; sale en el Excel de pedidos
  descripcion: string;
  unidad: string | null;
  orden: number;
  importacion_id: Uuid | null;
}

/** Lo que baja la app de campo: el material sin su código. */
export type MaterialCampo = Omit<Material, 'codigo' | 'organizacion_id' | 'importacion_id'>;

export interface ImportacionMateriales extends ConFechas {
  id: Uuid;
  organizacion_id: Uuid;
  archivo_nombre: string;
  filas: number;
  importado_por: Uuid;
}

/** Pedido de un material para la obra, hecho desde la app de campo. */
export interface PedidoMaterial extends Sincronizable {
  id: Uuid; // uuid v4 generado en el teléfono
  obra_id: Uuid;
  autor_id: Uuid;
  material_id: Uuid | null; // null: material escrito a mano (no está en el catálogo)
  material_texto: string | null; // el material escrito a mano
  unidad_texto: string | null;
  item_id: Uuid; // sector: un ítem del itemizado (no título)
  cantidad: number;
  necesario_para: Fecha | null;
  pedido_en: Instante;
  fotos: string[]; // rutaFotoPedido(...), solo de referencia
}

/** Código que sale en el Excel para un material escrito a mano. */
export const CODIGO_MATERIAL_NUEVO = 'CREAR RECURSO EN SAP';

// -----------------------------------------------------------------------------
// Contenido del informe (jsonb). Dueño de la forma: services/informes
// (esquema zod en src/tipos.ts). v3: un avance por ítem, sin porcentajes.
// -----------------------------------------------------------------------------

export const VERSION_CONTENIDO_INFORME = 3;

export interface FotoEnInforme {
  foto_id: Uuid;
  epigrafe: string;
  anotaciones: number[]; // números de anotación a dibujar sobre la foto
}

export interface AvanceEnInforme {
  id: string; // estable, 'av-<item_id>'
  item_id: Uuid;
  titulo: string;
  texto: string; // el avance va en palabras
  sector_ids: Uuid[];
  fotos: FotoEnInforme[];
  autores: Uuid[];
  fuentes: { foto_ids: Uuid[]; anotacion_ids: Uuid[] };
}

export interface Alerta {
  tipo: 'contradiccion' | 'falta_info' | 'seguridad' | 'calidad';
  texto: string;
  foto_ids: Uuid[];
  avance_id: string | null;
}

export interface ContenidoInforme {
  version_esquema: 3;
  titulo: string;
  resumen: string;
  clima: { descripcion: string; hubo_lluvia: boolean | null } | null;
  personal: PersonalEnObra[];
  avances: AvanceEnInforme[];
  incidentes: { tipo: 'accidente' | 'demora' | 'faltante' | 'visita' | 'otro'; texto: string; fotos: FotoEnInforme[] }[];
  pendientes: string[];
  observaciones: string | null;
  autores: Uuid[]; // quienes cargaron fotos ese día
  alertas: Alerta[]; // solo en el panel, no salen en el PDF
  items_sin_registro: string[];
}

// -----------------------------------------------------------------------------
// Ids y rutas de archivos
// -----------------------------------------------------------------------------

export const NAMESPACE_PARTE = '6f1c2a4e-8b3d-4c7a-9e2f-5a1b3c4d5e6f';

/** uuid v5 de "{obra}/{autor}/{fecha}". Igual a la función SQL id_parte. */
export const idParte = (obra: Uuid, autor: Uuid, fecha: Fecha): Uuid =>
  uuidv5(`${obra}/${autor}/${fecha}`, NAMESPACE_PARTE);

/** Foto: lado mayor 2048 px, JPEG 0,8. Miniatura: lado mayor 400 px. */
export const FOTO = { ladoMayor: 2048, calidad: 0.8, miniaturaLadoMayor: 400, miniaturaCalidad: 0.7 } as const;

export const rutaFoto = (obra: Uuid, autor: Uuid, foto: Uuid) => `fotos/${obra}/${autor}/${foto}.jpg`;
export const rutaMiniatura = (obra: Uuid, autor: Uuid, foto: Uuid) => `fotos/${obra}/${autor}/${foto}_mini.jpg`;
export const rutaFotoPedido = (obra: Uuid, autor: Uuid, foto: Uuid) => `pedidos/${obra}/${autor}/${foto}.jpg`;
export const rutaInforme = (obra: Uuid, informe: Uuid) => `informes/${obra}/${informe}.pdf`;

/** Número visible del informe, ej. "ODD-001-007" (obras.sigla + correlativo de la base). */
export const numeroInforme = (sigla: string | null, numero: number) =>
  `${sigla ?? 'INF'}-001-${String(numero).padStart(3, '0')}`;

// -----------------------------------------------------------------------------
// Sincronización offline
// -----------------------------------------------------------------------------

/** Margen que se resta al cursor de bajada para no perder filas de transacciones lentas. */
export const SOLAPE_CURSOR_MS = 2 * 60 * 1000;
/** Días de carga de campo que baja el teléfono (la referencia baja completa). */
export const DIAS_HISTORIA_EN_TELEFONO = 14;

export type OperacionPendiente =
  | { tipo: 'subir_archivo'; id: Uuid; ruta: string; uriLocal: string; contentType: 'image/jpeg' }
  | { tipo: 'upsert'; id: Uuid; recurso: 'partes' | 'fotos' | 'anotaciones' | 'pedidos'; fila: Record<string, unknown> };

// -----------------------------------------------------------------------------
// API REST (detalle en docs/API.md). Base: /api. JSON en UTF-8.
// Autenticación: "Authorization: Bearer <acceso>" (app) o cookie httpOnly
// "ao_acceso" (web, mismo origen). Errores: { error: { codigo, mensaje } }.
// -----------------------------------------------------------------------------

export interface ErrorApi {
  error: { codigo: CodigoError; mensaje: string; detalle?: unknown };
}
export type CodigoError =
  | 'no_autenticado' // 401: token vencido o inválido, renovar
  | 'credenciales_invalidas' // 401 en login
  | 'sin_permiso' // 403
  | 'no_encontrado' // 404
  | 'conflicto' // 409
  | 'datos_invalidos' // 422
  | 'error_interno'; // 500

// --- Autenticación ---

/** POST /api/auth/login */
export interface LoginPedido {
  usuario: string;
  clave: string;
  dispositivo: 'app' | 'web';
}
/** En la web los tokens van en cookies httpOnly y el cuerpo no los trae. */
export interface LoginRespuesta {
  acceso?: string; // JWT, vence en `acceso_vence_en`
  renovacion?: string; // opaco, 180 días (app) o 30 días (web), se rota en cada uso
  acceso_vence_en: Instante;
  yo: Yo;
}
/** POST /api/auth/renovar (cuerpo en la app; cookie "ao_renovacion" en la web) */
export interface RenovarPedido {
  renovacion?: string;
}
export type RenovarRespuesta = Omit<LoginRespuesta, 'yo'>;
/** POST /api/auth/salir */
/** POST /api/auth/clave */
export interface CambiarMiClavePedido {
  actual: string;
  nueva: string;
}

/** GET /api/yo */
export interface Yo {
  usuario: Usuario;
  obras: { obra: Obra; rol: RolObra; cargo: CargoObra | null }[];
}

// --- Sincronización (app) ---

/** GET /api/obras/:obraId/sync?desde=<Instante>  (sin "desde" = todo) */
export interface SyncRespuesta {
  hasta: Instante; // usar como próximo "desde" (la app resta SOLAPE_CURSOR_MS)
  obra: Obra;
  miembros: (ObraMiembro & { nombre: string; usuario: string })[];
  sectores: Sector[];
  items: Item[];
  partes: ParteDiario[]; // últimos DIAS_HISTORIA_EN_TELEFONO días
  fotos: Foto[];
  anotaciones: Anotacion[];
  registros_dia: RegistroDia[];
  /** Catálogo de materiales de la organización, sin código. */
  materiales: MaterialCampo[];
}

/**
 * GET /api/obras/:obraId/mis-fotos?antes=<Fecha>&dias=<n>: las fotos propias (no borradas)
 * de los `dias` días con fotos anteriores a `antes` (sin `antes`, desde hoy), del más nuevo
 * al más viejo. Para la página siguiente se pasa antes = siguiente; null = no hay más.
 */
export interface MisFotosRespuesta {
  dias: { fecha: Fecha; fotos: FotoConUrls[] }[];
  siguiente: Fecha | null;
}
/** Foto con URLs firmadas de lectura (60 min) y sus marcas vigentes. */
export interface FotoConUrls extends Foto {
  archivo_url: string;
  miniatura_url: string;
  anotaciones: Anotacion[];
}
/**
 * GET /api/obras/:obraId/dashboard — situación de obra para el Dashboard: la fecha
 * del último día con fotos (null si todavía no hay) y sus fotos, con URLs firmadas.
 * Lo pide cualquier miembro de la obra, también el gerente.
 */
export interface DashboardRespuesta {
  fecha: Fecha | null;
  fotos: FotoDashboard[];
}
export interface FotoDashboard {
  id: Uuid;
  archivo_url: string;
  miniatura_url: string;
  ancho: number | null;
  alto: number | null;
  tomada_en: Instante;
  comentario: string | null;
  autor: string;
  /** "21 · Excavación de zanja" */
  item: string | null;
}

/** Días por página de mis-fotos (por defecto y máximo). */
export const MIS_FOTOS_DIAS = { porDefecto: 7, maximo: 31 } as const;

/** PUT /api/obras/:obraId/dia/:fecha/registro (solo editor) */
export type RegistroDiaPedido = Pick<RegistroDia, 'clima' | 'hubo_lluvia' | 'personal' | 'observaciones'>;

/** PUT /api/partes/:id   (upsert idempotente) */
export type PartePedido = Pick<ParteDiario, 'obra_id' | 'fecha' | 'notas'>;
/** PUT /api/fotos/:id */
export type FotoPedido = Omit<Foto, 'id' | 'autor_id' | 'descripcion_ia' | 'creado_en' | 'actualizado_en'>;
/** PUT /api/anotaciones/:id */
export type AnotacionPedido = Omit<Anotacion, 'id' | 'autor_id' | 'creado_en' | 'actualizado_en'>;
// Borrar = PUT con eliminado_en. Campo solo corrige lo suyo del mismo día.
/** PUT /api/pedidos/:id (idempotente: si ya existe, devuelve el guardado) */
export type PedidoMaterialPedido = Pick<
  PedidoMaterial,
  'obra_id' | 'material_id' | 'material_texto' | 'unidad_texto' | 'item_id' | 'cantidad' | 'necesario_para' | 'pedido_en' | 'fotos'
>;

// --- Archivos ---

/** POST /api/archivos/subida: URL firmada (PUT directo al almacenamiento, 15 min). */
export interface SubidaPedido {
  ruta: string; // rutaFoto / rutaMiniatura; debe ser una carpeta propia
  content_type: 'image/jpeg';
}
export interface SubidaRespuesta {
  url: string;
  metodo: 'PUT';
  encabezados: Record<string, string>; // ej. { "x-ms-blob-type": "BlockBlob" }
  vence_en: Instante;
}
/** POST /api/archivos/ver: URLs firmadas de lectura (1 h) */
export interface VerPedido {
  rutas: string[];
}
export interface VerRespuesta {
  urls: Record<string, string>;
}

// --- Panel del editor ---

/** GET  /api/obras/:obraId/items        → Item[] (incluye títulos, ordenados)
 *  POST /api/obras/:obraId/items/importar → ImportacionItems */
export interface ImportarItemsPedido {
  archivo_nombre: string;
  filas: FilaItemizado[];
}
/** Una fila del Excel SAP, tal cual: la jerarquía sale del código. */
export interface FilaItemizado {
  codigo: string; // "Elemento PEP SAP"
  descripcion: string; // "Descripción"
  version?: string | null; // "VERSIÓN"
  cantidad?: number | null; // "CANTIDAD"; vacía = título
  unidad?: string | null; // "UNIDAD MEDIDA"
  inicio_previsto?: Fecha | null;
  fin_previsto?: Fecha | null;
}
/** GET  /api/materiales → Material[] (catálogo de la organización)
 *  POST /api/materiales/importar → ImportacionMateriales (solo editor) */
export interface ImportarMaterialesPedido {
  archivo_nombre: string;
  filas: FilaMaterial[];
}
export interface FilaMaterial {
  codigo: string;
  descripcion: string;
  unidad?: string | null;
}

/** GET /api/obras/:obraId/pedidos → todos los pedidos de la obra, para el Excel (editor y solo lectura) */
export interface PedidoMaterialDetalle extends PedidoMaterial {
  autor_nombre: string;
  material_codigo: string; // CODIGO_MATERIAL_NUEVO si se escribió a mano
  material_descripcion: string;
  material_unidad: string | null;
  item_codigo: string;
  item_numero: string | null;
  item_descripcion: string;
}

/** PATCH /api/items/:id */
export type ItemCambio = Partial<Pick<Item, 'descripcion' | 'inicio_previsto' | 'fin_previsto'>>;

/** GET /api/obras/:obraId/sectores → Sector[]; POST crea; PATCH /api/sectores/:id */
export type SectorPedido = Pick<Sector, 'nombre' | 'padre_id' | 'orden'>;

/** POST /api/obras → Obra (solo admin); PATCH /api/obras/:id */
export type ObraPedido = Partial<Omit<Obra, 'id' | 'organizacion_id' | 'creado_en' | 'actualizado_en' | 'eliminado_en'>>;

/** GET /api/usuarios → UsuarioConObras[] */
export interface UsuarioConObras extends Usuario {
  obras: { obra_id: Uuid; rol: RolObra; cargo: CargoObra | null }[];
}
/** POST /api/usuarios (solo editor) */
export interface CrearUsuarioPedido {
  usuario: string; // 3 a 40 caracteres: a-z 0-9 . _ -
  nombre: string;
  clave: string; // mínimo 6
  rol: RolObra;
  obra_id: Uuid;
  cargo?: CargoObra | null;
}
/** PATCH /api/usuarios/:id (solo editor) */
export interface CambiarUsuarioPedido {
  nombre?: string;
  activo?: boolean;
  clave?: string;
}
/** PUT /api/obras/:obraId/miembros/:usuarioId  { rol, cargo } ; DELETE quita */
export type MiembroPedido = Pick<ObraMiembro, 'rol' | 'cargo'>;

/** GET /api/obras/:obraId/dia/:fecha: lo cargado ese día, para revisar */
export interface DiaRespuesta {
  fecha: Fecha;
  partes: ParteDiario[];
  /** Vigentes y, para el editor, también las borradas (eliminado_en no nulo) para poder restaurarlas. */
  fotos: Foto[];
  anotaciones: Anotacion[];
  registro: RegistroDia | null;
  informe: Informe | null;
  /** Cambios en las fotos del día (solo los ve el editor y el autor de cada foto). */
  historial: CambioFoto[];
}

/** Máximo de fotos que devuelve una consulta del historial de obra. */
export const LIMITE_HISTORIAL = 500;

/** GET /api/obras/:obraId/historial?desde&hasta[&item][&persona]: fotos vigentes de varios días.
 * Un ítem título incluye las fotos de todos sus subítems. */
export interface HistorialRespuesta {
  desde: Fecha;
  hasta: Fecha;
  /** De la más nueva a la más vieja, con la fecha del parte al que pertenecen. */
  fotos: (Foto & { fecha: Fecha })[];
  anotaciones: Anotacion[];
  /** Clima, personal y observaciones de los días que tienen fotos en el resultado. */
  registros: RegistroDia[];
  /** Hubo más de LIMITE_HISTORIAL fotos: se devolvieron las más nuevas. */
  truncado: boolean;
}

export type AccionHistorial = 'editar' | 'borrar' | 'restaurar';

/** Un cambio en una foto o en una de sus marcas; lo registra la base, nunca la API. */
export interface CambioFoto {
  id: Uuid;
  obra_id: Uuid;
  foto_id: Uuid;
  anotacion_id: Uuid | null; // null: cambio en la foto
  usuario_id: Uuid | null;
  accion: AccionHistorial;
  /** { comentario: { antes, despues }, item_id: {...}, sector_id: {...}, geometria: {...} } */
  cambios: Record<string, { antes: unknown; despues: unknown }>;
  motivo: string | null;
  creado_en: Instante;
}

/** PATCH /api/fotos/:id (editor, cualquier día; autor, el mismo día) → Foto */
export interface FotoCambio {
  item_id?: Uuid;
  sector_id?: Uuid | null;
  comentario?: string | null;
  eliminada?: boolean; // true borra (lógico), false restaura
  motivo?: string | null; // queda en el historial
}
/** PATCH /api/anotaciones/:id → Anotacion */
export interface AnotacionCambio {
  comentario?: string | null;
  eliminada?: boolean;
  motivo?: string | null;
}

// --- Informes ---

/** GET /api/obras/:obraId/informes → Informe[] (sin contenido) */
/** GET /api/informes/:id → Informe */
/** POST /api/informes/generar (solo editor). Responde enseguida; se consulta el estado con GET. */
export interface GenerarInformePedido {
  obra_id: Uuid;
  tipo: TipoInforme;
  fecha_desde: Fecha;
  fecha_hasta?: Fecha;
  forzar?: boolean; // regenera aunque exista; si estaba publicado vuelve a borrador
  avance_id?: string; // regenera solo ese avance
  indicacion?: string; // indicación del editor para la IA
}
export interface GenerarInformeRespuesta {
  informe_id: Uuid;
}
/** PATCH /api/informes/:id { contenido } (solo editor, en borrador) */
export interface GuardarInformePedido {
  contenido: ContenidoInforme;
}
/** POST /api/informes/:id/publicar (solo editor) → Informe */
/** GET  /api/informes/:id/pdf → 302 a URL firmada del PDF (lo genera si falta) */
