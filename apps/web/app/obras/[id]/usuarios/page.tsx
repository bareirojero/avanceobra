"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Copy, KeyRound, UserPlus } from "lucide-react";
import type { CargoObra, RolObra } from "@registro-obra/contrato";
import { api } from "@/lib/api";
import { type Miembro, useEquipo, useObra, useYo } from "@/lib/datos";
import { CARGOS, ROLES } from "@/lib/formato";
import { Avatar, Encabezado, Modal } from "@/components/ui";

const AYUDA_ROL: Record<RolObra, string> = {
  campo: "Saca fotos, comenta y pide materiales desde la app del teléfono.",
  editor: "Carga el itemizado, crea usuarios, sube fotos y publica los informes.",
  lector: "Mira el día de obra y los informes publicados y baja los pedidos de materiales. No edita nada.",
};
const ORDEN: RolObra[] = ["campo", "editor", "lector"];

/** Contraseña fácil de dictar: 3 letras y 4 números, sin letras que se confunden. */
function claveAlAzar() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const r = crypto.getRandomValues(new Uint32Array(7));
  return [...r].map((n, i) => (i < 3 ? letras[n % letras.length] : String(n % 10))).join("");
}

export default function Usuarios() {
  const { id } = useParams<{ id: string }>();
  const { obra } = useObra(id);
  const { yo } = useYo();
  const { equipo, mutate } = useEquipo(id);
  const [agregando, setAgregando] = useState(false);
  const [claveDe, setClaveDe] = useState<Miembro>();
  const [error, setError] = useState<string>();
  const [credenciales, setCredenciales] = useState<{ usuario: string; clave: string }>();

  async function hacer(accion: () => Promise<unknown>) {
    setError(undefined);
    try {
      await accion();
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  if (!obra) return null;
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-4 py-8 md:px-10">
      <Encabezado miga={obra.nombre} titulo="Usuarios">
        <button className="boton-principal" onClick={() => setAgregando(true)}>
          <UserPlus size={18} /> Crear usuario
        </button>
      </Encabezado>
      {error && <p className="rounded-[10px] bg-peligro-suave px-4 py-2.5 text-sm font-semibold text-peligro-texto">{error}</p>}

      {ORDEN.map((rol) => {
        const del = equipo.filter((m) => m.rol === rol);
        if (!del.length) return null;
        return (
          <section key={rol} className="flex flex-col gap-2">
            <h2 className="sobretitulo">{rol === "campo" ? "En campo" : rol === "editor" ? "Editores" : "Solo lectura"}</h2>
            <div className="tarjeta divide-y divide-borde">
              {del.map((m) => {
                const soyYo = m.id === yo?.usuario.id;
                return (
                  <div key={m.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${m.activo ? "" : "opacity-60"}`}>
                    <Avatar nombre={m.nombre} oscuro={m.activo} />
                    <div className="min-w-40 flex-1">
                      <div className="font-semibold">
                        {m.nombre}
                        {!m.activo && <span className="ml-2 text-sm font-normal text-tenue">(desactivado)</span>}
                      </div>
                      <div className="text-sm text-tenue">
                        usuario <span className="font-medium text-tinta-suave">{m.usuario}</span>
                        {m.ultimo_ingreso && ` · entró por última vez el ${new Date(m.ultimo_ingreso).toLocaleDateString("es-PY")}`}
                      </div>
                    </div>
                    <select
                      className="campo h-9 w-auto text-sm"
                      aria-label={`Rol de ${m.nombre}`}
                      value={m.rol}
                      disabled={soyYo}
                      onChange={(e) => hacer(() => api.ponerMiembro(id, m.id, { rol: e.target.value as RolObra, cargo: m.cargo }))}
                    >
                      {ORDEN.map((r) => (
                        <option key={r} value={r}>
                          {ROLES[r]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="campo h-9 w-auto text-sm"
                      aria-label={`Cargo de ${m.nombre}`}
                      value={m.cargo ?? ""}
                      onChange={(e) => hacer(() => api.ponerMiembro(id, m.id, { rol: m.rol, cargo: (e.target.value || null) as CargoObra | null }))}
                    >
                      <option value="">Sin cargo</option>
                      {Object.entries(CARGOS).map(([c, t]) => (
                        <option key={c} value={c}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button className="boton-secundario h-9 text-sm" onClick={() => setClaveDe(m)}>
                      <KeyRound size={15} /> Contraseña
                    </button>
                    {!soyYo && (
                      <button className="h-9 px-2 text-sm font-semibold text-tenue hover:text-tinta" onClick={() => hacer(() => api.cambiarUsuario(m.id, { activo: !m.activo }))}>
                        {m.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="tarjeta grid gap-2 p-5 text-sm sm:grid-cols-3">
        {ORDEN.map((r) => (
          <p key={r}>
            <span className="font-semibold">{ROLES[r]}:</span> <span className="text-tenue">{AYUDA_ROL[r]}</span>
          </p>
        ))}
      </div>

      <NuevoUsuario
        obraId={id}
        abierto={agregando}
        cerrar={() => setAgregando(false)}
        alCrear={(c) => {
          setCredenciales(c);
          mutate();
        }}
      />
      <CambiarClave miembro={claveDe} cerrar={() => setClaveDe(undefined)} alCambiar={setCredenciales} />
      <Modal titulo="Datos para entrar" abierto={!!credenciales} cerrar={() => setCredenciales(undefined)}>
        {credenciales && <Credenciales {...credenciales} cerrar={() => setCredenciales(undefined)} />}
      </Modal>
    </div>
  );
}

function Credenciales({ usuario, clave, cerrar }: { usuario: string; clave: string; cerrar: () => void }) {
  const texto = `Avance de Obra\nUsuario: ${usuario}\nContraseña: ${clave}`;
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-tenue">Pasale estos datos a la persona. La contraseña no se vuelve a mostrar.</p>
      <div className="rounded-[10px] bg-fondo px-4 py-3 font-mono text-[15px] leading-relaxed">
        Usuario: <span className="font-bold">{usuario}</span>
        <br />
        Contraseña: <span className="font-bold">{clave}</span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          className="boton-secundario"
          onClick={async () => {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
          }}
        >
          <Copy size={16} /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <button className="boton-principal" onClick={cerrar}>
          Listo
        </button>
      </div>
    </div>
  );
}

function NuevoUsuario({
  obraId,
  abierto,
  cerrar,
  alCrear,
}: {
  obraId: string;
  abierto: boolean;
  cerrar: () => void;
  alCrear: (c: { usuario: string; clave: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState(claveAlAzar);
  const [rol, setRol] = useState<RolObra>("campo");
  const [cargo, setCargo] = useState<CargoObra | "">("capataz");
  const [error, setError] = useState<string>();
  const [guardando, setGuardando] = useState(false);

  function salir() {
    setNombre("");
    setUsuario("");
    setClave(claveAlAzar());
    setError(undefined);
    cerrar();
  }

  return (
    <Modal titulo="Crear usuario" abierto={abierto} cerrar={salir}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setGuardando(true);
          setError(undefined);
          try {
            const u = usuario.trim().toLowerCase();
            await api.crearUsuario({ usuario: u, nombre: nombre.trim(), clave, rol, obra_id: obraId, cargo: cargo || null });
            alCrear({ usuario: u, clave });
            salir();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
          } finally {
            setGuardando(false);
          }
        }}
      >
        <label>
          <span className="etiqueta">Nombre y apellido</span>
          <input
            className="campo"
            required
            value={nombre}
            onChange={(e) => {
              const v = e.target.value;
              // Propone el usuario a partir del nombre mientras no lo hayan tocado.
              const sugerido = (s: string) =>
                s
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .toLowerCase()
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .join(".")
                  .replace(/[^a-z0-9._-]/g, "");
              if (!usuario || usuario === sugerido(nombre)) setUsuario(sugerido(v));
              setNombre(v);
            }}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="etiqueta">Usuario</span>
            <input className="campo" required pattern="[a-z0-9._\-]{3,40}" title="De 3 a 40 letras minúsculas, números, punto o guion" value={usuario} onChange={(e) => setUsuario(e.target.value.toLowerCase())} autoComplete="off" />
          </label>
          <label>
            <span className="etiqueta">Contraseña</span>
            <div className="flex gap-2">
              <input className="campo font-mono" required minLength={6} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
              <button type="button" className="boton-secundario shrink-0 px-3 text-sm" onClick={() => setClave(claveAlAzar())}>
                Otra
              </button>
            </div>
          </label>
          <label>
            <span className="etiqueta">Rol</span>
            <select className="campo" value={rol} onChange={(e) => setRol(e.target.value as RolObra)}>
              {ORDEN.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="etiqueta">Cargo</span>
            <select className="campo" value={cargo} onChange={(e) => setCargo(e.target.value as CargoObra | "")}>
              <option value="">Sin cargo</option>
              {Object.entries(CARGOS).map(([c, t]) => (
                <option key={c} value={c}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-tenue">{AYUDA_ROL[rol]}</p>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={salir}>
            Cancelar
          </button>
          <button className="boton-principal" disabled={guardando}>
            {guardando ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CambiarClave({ miembro, cerrar, alCambiar }: { miembro?: Miembro; cerrar: () => void; alCambiar: (c: { usuario: string; clave: string }) => void }) {
  const [clave, setClave] = useState(claveAlAzar);
  const [error, setError] = useState<string>();
  return (
    <Modal titulo={`Nueva contraseña para ${miembro?.nombre ?? ""}`} abierto={!!miembro} cerrar={cerrar}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!miembro) return;
          try {
            await api.cambiarUsuario(miembro.id, { clave });
            alCambiar({ usuario: miembro.usuario, clave });
            setClave(claveAlAzar());
            cerrar();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo cambiar.");
          }
        }}
      >
        <label>
          <span className="etiqueta">Contraseña nueva</span>
          <div className="flex gap-2">
            <input className="campo font-mono" required minLength={6} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
            <button type="button" className="boton-secundario shrink-0 px-3 text-sm" onClick={() => setClave(claveAlAzar())}>
              Otra
            </button>
          </div>
        </label>
        <p className="text-sm text-tenue">La sesión abierta en su teléfono se cierra y tiene que entrar de nuevo.</p>
        {error && <p className="text-sm font-semibold text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="boton-secundario" onClick={cerrar}>
            Cancelar
          </button>
          <button className="boton-principal">Cambiar contraseña</button>
        </div>
      </form>
    </Modal>
  );
}
