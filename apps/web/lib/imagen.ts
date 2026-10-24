// Fotos para subir: se achican como en la app del teléfono (lado mayor 2048 px, JPEG) y
// se suben a la URL firmada que da la API.
import { api } from "./api";

/** Decodifica la imagen con <img>, que respeta la orientación EXIF (fotos del iPhone de costado). */
function cargar(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo leer la imagen. Probá con otra foto."));
    };
    img.src = url;
  });
}

/** La imagen en JPEG con lado mayor `lado` px. */
function aJpeg(img: HTMLImageElement, lado: number, calidad: number) {
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.naturalWidth * escala);
  lienzo.height = Math.round(img.naturalHeight * escala);
  lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise<{ blob: Blob; ancho: number; alto: number }>((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok({ blob: b, ancho: lienzo.width, alto: lienzo.height }) : mal(new Error("No se pudo comprimir la foto"))), "image/jpeg", calidad),
  );
}

/** La misma imagen en varios tamaños (foto y miniatura), en JPEG. */
export async function comprimir(archivo: Blob, tamanos: { lado: number; calidad: number }[]) {
  const img = await cargar(archivo);
  const salida = [];
  for (const t of tamanos) salida.push(await aJpeg(img, t.lado, t.calidad));
  return salida;
}

export async function subirArchivo(ruta: string, blob: Blob) {
  const s = await api.subida(ruta);
  // Con SharePoint la URL apunta a la API (/api/archivos/datos/…): se usa la ruta
  // relativa para pasar por el mismo origen y evitar CORS.
  const u = new URL(s.url, location.href);
  const destino = u.pathname.startsWith("/api/archivos/datos/") ? u.pathname + u.search : s.url;
  const r = await fetch(destino, { method: s.metodo, headers: { ...s.encabezados, "content-type": "image/jpeg" }, body: blob });
  if (!r.ok) throw new Error(`No se pudo subir la foto (${r.status})`);
}
