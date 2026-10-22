import sharp from "sharp";
import type { Anotacion } from "./tipos.ts";

// Acento y tinta del sistema de diseño (Diseño visual y experiencia).
export const COLOR_MARCA = "#FFC20E";
const TINTA = "#15181C";

/**
 * Dibuja las marcas numeradas sobre la foto, igual que las ve el usuario en el
 * teléfono. La misma imagen va a la IA (para que "marca 2" signifique algo) y al PDF.
 */
export async function fotoAnotada(
  original: Buffer,
  anotaciones: Anotacion[],
  ladoMax = 1568,
): Promise<Buffer> {
  const base = sharp(original).rotate().resize({ width: ladoMax, height: ladoMax, fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const trazo = Math.max(3, Math.round(W / 300));
  const radioEtiqueta = Math.max(14, Math.round(W / 45));

  const formas = anotaciones.map((a) => {
    const g = a.geometria as Record<string, any>;
    const COLOR = a.color ?? COLOR_MARCA;
    let figura = "";
    let ex: number;
    let ey: number;
    if ("r" in g) {
      const [x, y, r] = [g.cx * W, g.cy * H, g.r * W];
      figura = `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${COLOR}" stroke-width="${trazo}"/>`;
      [ex, ey] = [x + r * 0.71, y - r * 0.71];
    } else if ("w" in g) {
      const [x, y, w, h] = [g.x * W, g.y * H, g.w * W, g.h * H];
      figura = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${COLOR}" stroke-width="${trazo}" rx="${trazo * 2}"/>`;
      [ex, ey] = [x + w, y];
    } else if ("x1" in g) {
      const [x1, y1, x2, y2] = [g.x1 * W, g.y1 * H, g.x2 * W, g.y2 * H];
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const p = trazo * 4;
      const p1 = `${x2 - p * Math.cos(ang - 0.45)},${y2 - p * Math.sin(ang - 0.45)}`;
      const p2 = `${x2 - p * Math.cos(ang + 0.45)},${y2 - p * Math.sin(ang + 0.45)}`;
      figura = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLOR}" stroke-width="${trazo}" stroke-linecap="round"/>
        <polygon points="${x2},${y2} ${p1} ${p2}" fill="${COLOR}"/>`;
      [ex, ey] = [x1, y1]; // el número va en la cola, la punta queda libre
    } else if ("puntos" in g) {
      const pts = (g.puntos as [number, number][]).map(([x, y]) => `${x * W},${y * H}`).join(" ");
      figura = `<polyline points="${pts}" fill="none" stroke="${COLOR}" stroke-width="${trazo}" stroke-linecap="round" stroke-linejoin="round"/>`;
      [ex, ey] = [g.puntos[0][0] * W, g.puntos[0][1] * H];
    } else {
      [ex, ey] = [g.x * W, g.y * H];
    }
    // La etiqueta numerada siempre entra completa en la foto.
    ex = Math.min(Math.max(ex, radioEtiqueta + 2), W - radioEtiqueta - 2);
    ey = Math.min(Math.max(ey, radioEtiqueta + 2), H - radioEtiqueta - 2);
    const etiqueta = `<circle cx="${ex}" cy="${ey}" r="${radioEtiqueta}" fill="${COLOR}" stroke="${TINTA}" stroke-width="2"/>
      <text x="${ex}" y="${ey}" dy="0.36em" text-anchor="middle" font-family="Archivo, Arial, Helvetica, sans-serif" font-weight="800" font-size="${radioEtiqueta * 1.2}" fill="${TINTA}">${a.numero}</text>`;
    return figura + etiqueta;
  });

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${formas.join("")}</svg>`);
  return sharp(data).composite([{ input: svg }]).jpeg({ quality: 82 }).toBuffer();
}
