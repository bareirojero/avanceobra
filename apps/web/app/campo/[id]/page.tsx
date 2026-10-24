"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import type { Foto } from "@registro-obra/contrato";
import { escucharEnviados, useCola, type EnvioFoto } from "@/lib/cola-campo";
import { useDia, useItems, useUrls, useYo } from "@/lib/datos";
import { fechaLarga, hoy, hora } from "@/lib/formato";
import { Miniatura, MiniaturaEnvio } from "@/components/campo/base";
import { NuevaFoto, type Ubicacion } from "@/components/campo/nueva-foto";
import { VerFoto } from "@/components/campo/ver-foto";

/** Hoy: mis fotos del día, "Sacar foto" (cámara) y "Subir archivo" (fotos de la galería o de Archivos). */
export default function Hoy() {
  const { id: obraId } = useParams<{ id: string }>();
  const { yo } = useYo();
  const fecha = hoy();
  const dia = useDia(obraId, fecha);
  const { items } = useItems(obraId);
  const cola = useCola();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const ubicacion = useRef<Promise<Ubicacion>>(Promise.resolve(null));
  const [nuevas, setNuevas] = useState<{ archivos: File[]; deCamara: boolean } | null>(null);
  const [abierta, setAbierta] = useState<{ foto: Foto } | { envio: EnvioFoto } | null>(null);
  const yoId = yo?.usuario.id;

  const { mutate } = dia;
  useEffect(() => escucharEnviados(() => void mutate()), [mutate]);

  const mias = dia.fotos.filter((f) => f.autor_id === yoId);
  const esperando = cola.envios.filter((e): e is EnvioFoto => e.tipo === "foto" && e.obraId === obraId && e.fecha === fecha);
  const urls = useUrls(mias.map((f) => f.miniatura_path));
  const total = mias.length + esperando.length;

  /** La ubicación se pide al tocar el botón, mientras se saca la foto. */
  function pedirUbicacion() {
    ubicacion.current = new Promise((ok) => {
      if (!("geolocation" in navigator)) return ok(null);
      navigator.geolocation.getCurrentPosition(
        (p) => ok({ latitud: p.coords.latitude, longitud: p.coords.longitude }),
        () => ok(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }

  function elegidas(e: React.ChangeEvent<HTMLInputElement>, deCamara: boolean) {
    const archivos = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    e.target.value = "";
    if (archivos.length) setNuevas({ archivos, deCamara });
  }

  const fotoAbierta = abierta && "foto" in abierta ? dia.fotos.find((f) => f.id === abierta.foto.id) : undefined;
  const envioAbierto = abierta && "envio" in abierta ? esperando.find((e) => e.id === abierta.envio.id) : undefined;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-4 font-medium text-tinta-suave first-letter:uppercase">{fechaLarga(fecha)}</p>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="titulo text-lg">Mis fotos de hoy</h2>
          {total > 0 && (
            <Link href={`/campo/${obraId}/envios`} className="text-[15px] font-semibold text-plano">
              Ver todas
            </Link>
          )}
        </div>
        {total === 0 ? (
          <p className="text-tenue">{dia.cargando ? "Cargando…" : "Todavía no sacaste fotos hoy. Tocá “Sacar foto” para empezar."}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[...esperando].reverse().map((e) => (
              <MiniaturaEnvio key={e.id} envio={e} alTocar={() => setAbierta({ envio: e })} />
            ))}
            {[...mias].reverse().map((f) => (
              <Miniatura key={f.id} src={urls[f.miniatura_path]} estado="enviada" etiqueta={`Foto de las ${hora(f.tomada_en)}`} alTocar={() => setAbierta({ foto: f })} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 px-4 pt-2 pb-3">
        <button type="button" className="boton h-11 bg-pista text-tinta-suave active:bg-borde" onClick={() => galeria.current?.click()}>
          <Upload size={18} /> Subir archivo
        </button>
        <button
          type="button"
          className="boton-principal h-16 text-[19px]"
          onClick={() => {
            pedirUbicacion();
            camara.current?.click();
          }}
        >
          <Camera size={26} strokeWidth={2.3} /> Sacar foto
        </button>
        {/* En el iPhone, capture abre directo la cámara trasera. */}
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => elegidas(e, true)} />
        <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(e) => elegidas(e, false)} />
      </div>

      {nuevas && yoId && (
        <NuevaFoto
          obraId={obraId}
          autorId={yoId}
          archivos={nuevas.archivos}
          deCamara={nuevas.deCamara}
          ubicacion={nuevas.deCamara ? ubicacion.current : Promise.resolve(null)}
          items={items}
          cerrar={() => setNuevas(null)}
        />
      )}
      {fotoAbierta && (
        <VerFoto
          foto={fotoAbierta}
          fecha={fecha}
          anotaciones={dia.anotaciones.filter((a) => a.foto_id === fotoAbierta.id)}
          editable
          alCambiar={() => void mutate()}
          items={items}
          cerrar={() => setAbierta(null)}
        />
      )}
      {envioAbierto && <VerFoto envio={envioAbierto} items={items} cerrar={() => setAbierta(null)} />}
    </>
  );
}
