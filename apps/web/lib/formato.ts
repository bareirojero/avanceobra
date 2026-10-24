import { ZONA_HORARIA, type CargoObra, type RolObra } from "@registro-obra/contrato";

/** Fecha de hoy en Paraguay (UTC-3 todo el año desde 2024). */
export const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export function fechaLarga(iso: string) {
  const d = aFecha(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function fechaNumerica(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function diaSemana(iso: string) {
  return DIAS[aFecha(iso).getDay()].slice(0, 3);
}

export function sumarDias(iso: string, n: number) {
  const d = aFecha(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const FORMATO_HORA = new Intl.DateTimeFormat("es-PY", { timeZone: ZONA_HORARIA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Hora "HH:mm" en Paraguay de un instante. */
export function hora(instante: string) {
  return FORMATO_HORA.format(new Date(instante));
}

export const ROLES: Record<RolObra, string> = {
  editor: "Editor",
  campo: "Campo",
  lector: "Solo lectura",
  gerente: "Gerente",
};

export const CARGOS: Record<CargoObra, string> = {
  capataz: "Capataz",
  residente: "Residente",
  jefe_obra: "Jefe de obra",
  oficina_tecnica: "Oficina Técnica",
  fiscal: "Fiscal",
  cliente: "Cliente",
  otro: "Otro",
};

export function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
