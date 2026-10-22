"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorDeApi } from "@/lib/api";
import { useYo } from "@/lib/datos";

export default function Ingresar() {
  const router = useRouter();
  const { mutate } = useYo();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      const r = await api.login(usuario.trim().toLowerCase(), clave);
      await mutate(r.yo, { revalidate: false });
      router.replace("/obras");
    } catch (err) {
      setError(err instanceof ErrorDeApi && err.estado === 401 ? "Usuario o contraseña incorrectos." : "No se pudo conectar. Probá de nuevo.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-marca-fondo px-4">
      <form onSubmit={entrar} className="tarjeta flex w-full max-w-sm flex-col gap-5 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/avance-de-obra-app.png" alt="" className="size-20" />
          <h1 className="titulo text-2xl">Avance de Obra</h1>
        </div>
        <label>
          <span className="etiqueta">Usuario</span>
          <input className="campo h-11" autoFocus autoCapitalize="none" autoComplete="username" required value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>
        <label>
          <span className="etiqueta">Contraseña</span>
          <input className="campo h-11" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {error && <p className="-mt-2 text-sm font-semibold text-peligro-texto">{error}</p>}
        <button className="boton-principal" disabled={entrando}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
