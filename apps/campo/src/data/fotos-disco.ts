import { FOTO } from '@registro-obra/contrato';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Fotos guardadas en el teléfono: en documentos, que el sistema no borra solo. */
const carpeta = () => {
  const dir = new Directory(Paths.document, 'fotos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

export interface FotoProcesada {
  archivoLocal: string;
  miniaturaLocal: string;
  ancho: number;
  alto: number;
}

/** Lado mayor limitado a `lado`, sin agrandar fotos chicas. */
function medidaReducida(ancho: number, alto: number, lado: number) {
  if (Math.max(ancho, alto) <= lado) return null;
  return ancho >= alto ? { width: lado } : { height: lado };
}

/**
 * Comprime la foto de la cámara como pide el contrato (lado mayor 2048 px, JPEG 0,8)
 * y genera la miniatura de 400 px. El original de la cámara se borra: no se sube y
 * ocupa mucho.
 */
export async function procesarFoto(uriCamara: string, ancho: number, alto: number, fotoId: string): Promise<FotoProcesada> {
  const dir = carpeta();

  const ctx = ImageManipulator.manipulate(uriCamara);
  const medida = medidaReducida(ancho, alto, FOTO.ladoMayor);
  if (medida) ctx.resize(medida);
  const imagen = await ctx.renderAsync();
  const grande = await imagen.saveAsync({ compress: FOTO.calidad, format: SaveFormat.JPEG });

  const ctxMini = ImageManipulator.manipulate(grande.uri);
  const medidaMini = medidaReducida(grande.width, grande.height, FOTO.miniaturaLadoMayor);
  if (medidaMini) ctxMini.resize(medidaMini);
  const mini = await (await ctxMini.renderAsync()).saveAsync({ compress: FOTO.miniaturaCalidad, format: SaveFormat.JPEG });

  const destino = new File(dir, `${fotoId}.jpg`);
  const destinoMini = new File(dir, `${fotoId}_mini.jpg`);
  new File(grande.uri).moveSync(destino);
  new File(mini.uri).moveSync(destinoMini);
  borrarSilencioso(uriCamara);

  return { archivoLocal: destino.uri, miniaturaLocal: destinoMini.uri, ancho: grande.width, alto: grande.height };
}

export function borrarSilencioso(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Ya no estaba.
  }
}

export function borrarTodasLasFotos() {
  const dir = new Directory(Paths.document, 'fotos');
  if (dir.exists) dir.delete();
}

export async function leerBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
