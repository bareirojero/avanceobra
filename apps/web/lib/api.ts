// Cliente de la API (/api en el mismo origen). La sesión viaja en cookies httpOnly:
// ante un 401 "no_autenticado" se renueva una vez y se reintenta.
import type {
  Anotacion,
  AnotacionCambio,
  CambiarUsuarioPedido,
  ContenidoInforme,
  CrearUsuarioPedido,
  DiaRespuesta,
  ErrorApi,
  Foto,
  FotoCambio,
  FotoPedido,
  GenerarInformePedido,
  GenerarInformeRespuesta,
  ImportacionItems,
  ImportacionMateriales,
  ImportarItemsPedido,
  ImportarMaterialesPedido,
  Informe,
  InformeConRevision,
  Item,
  LoginRespuesta,
  Material,
  MiembroPedido,
  Obra,
  RevisionInforme,
  ObraPedido,
  PartePedido,
  PedidoMaterialDetalle,
  RegistroDia,
  RegistroDiaPedido,
  Sector,
  SectorPedido,
  SubidaRespuesta,
  UsuarioConObras,
  VerRespuesta,
  Yo,
} from "@registro-obra/contrato";

export class ErrorDeApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

let renovando: Promise<boolean> | null = null;

function renovar() {
  renovando ??= fetch("/api/auth/renovar", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (renovando = null), 0));
  return renovando;
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, reintento = true): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    credentials: "same-origin",
    headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (r.ok) return (r.status === 204 ? undefined : await r.json()) as T;

  let error: ErrorApi["error"] = { codigo: "error_interno", mensaje: `Error ${r.status}` };
  try {
    error = ((await r.json()) as ErrorApi).error ?? error;
  } catch {}
  if (r.status === 401 && error.codigo === "no_autenticado" && reintento && (await renovar())) {
    return pedir<T>(metodo, ruta, cuerpo, false);
  }
  throw new ErrorDeApi(r.status, error.codigo, error.mensaje);
}

const get = <T>(ruta: string) => pedir<T>("GET", ruta);

export const api = {
  get,

  login: (usuario: string, clave: string) => pedir<LoginRespuesta>("POST", "/auth/login", { usuario, clave, dispositivo: "web" }),
  salir: () => pedir<void>("POST", "/auth/salir"),
  yo: () => get<Yo>("/yo"),

  crearObra: (o: ObraPedido) => pedir<Obra>("POST", "/obras", o),
  cambiarObra: (id: string, o: ObraPedido) => pedir<Obra>("PATCH", `/obras/${id}`, o),

  items: (obra: string) => get<Item[]>(`/obras/${obra}/items`),
  importarItems: (obra: string, p: ImportarItemsPedido) => pedir<ImportacionItems>("POST", `/obras/${obra}/items/importar`, p),

  materiales: () => get<Material[]>("/materiales"),
  importarMateriales: (p: ImportarMaterialesPedido) => pedir<ImportacionMateriales>("POST", "/materiales/importar", p),
  pedidos: (obra: string) => get<PedidoMaterialDetalle[]>(`/obras/${obra}/pedidos`),

  sectores: (obra: string) => get<Sector[]>(`/obras/${obra}/sectores`),
  crearSector: (obra: string, s: SectorPedido) => pedir<Sector>("POST", `/obras/${obra}/sectores`, s),

  usuarios: () => get<UsuarioConObras[]>("/usuarios"),
  crearUsuario: (u: CrearUsuarioPedido) => pedir<UsuarioConObras>("POST", "/usuarios", u),
  cambiarUsuario: (id: string, u: CambiarUsuarioPedido) => pedir<UsuarioConObras>("PATCH", `/usuarios/${id}`, u),
  ponerMiembro: (obra: string, usuario: string, m: MiembroPedido) => pedir<void>("PUT", `/obras/${obra}/miembros/${usuario}`, m),
  quitarMiembro: (obra: string, usuario: string) => pedir<void>("DELETE", `/obras/${obra}/miembros/${usuario}`),

  dia: (obra: string, fecha: string) => get<DiaRespuesta>(`/obras/${obra}/dia/${fecha}`),
  guardarRegistro: (obra: string, fecha: string, r: RegistroDiaPedido) => pedir<RegistroDia>("PUT", `/obras/${obra}/dia/${fecha}/registro`, r),

  subida: (ruta: string) => pedir<SubidaRespuesta>("POST", "/archivos/subida", { ruta, content_type: "image/jpeg" }),
  ver: (rutas: string[]) => pedir<VerRespuesta>("POST", "/archivos/ver", { rutas }),
  /** Upsert idempotente: el parte agrupa las fotos de una persona en el día. */
  guardarParte: (id: string, p: PartePedido) => pedir<unknown>("PUT", `/partes/${id}`, p),
  guardarFoto: (id: string, f: FotoPedido) => pedir<unknown>("PUT", `/fotos/${id}`, f),
  /** Corrige o borra una foto (queda en el historial). */
  cambiarFoto: (id: string, c: FotoCambio) => pedir<Foto>("PATCH", `/fotos/${id}`, c),
  cambiarAnotacion: (id: string, c: AnotacionCambio) => pedir<Anotacion>("PATCH", `/anotaciones/${id}`, c),

  informes: (obra: string) => get<Informe[]>(`/obras/${obra}/informes`),
  informe: (id: string) => get<InformeConRevision>(`/informes/${id}`),
  revisiones: (id: string) => get<RevisionInforme[]>(`/informes/${id}/revisiones`),
  generarInforme: (p: GenerarInformePedido) => pedir<GenerarInformeRespuesta>("POST", "/informes/generar", p),
  guardarInforme: (id: string, contenido: ContenidoInforme) => pedir<Informe>("PATCH", `/informes/${id}`, { contenido }),
  publicarInforme: (id: string) => pedir<Informe>("POST", `/informes/${id}/publicar`),
  /** Redirige a la URL firmada del PDF: el congelado de la revisión vigente (o de la indicada); si es borrador, una vista previa. */
  urlPdf: (id: string, revision?: number) => `/api/informes/${id}/pdf${revision === undefined ? "" : `?revision=${revision}`}`,
};
