import { chromium } from "playwright-core";
import type { ContenidoInforme } from "../tipos.ts";
import { informeHtml, pieDePagina } from "./html.ts";
import type { Referencias } from "./referencias.ts";

/** PDF A4 con Chromium headless: lo mismo que se ve en la vista previa del panel. */
export async function informePdf(c: ContenidoInforme, ref: Referencias): Promise<Buffer> {
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(informeHtml(c, ref), { waitUntil: "load" });
    const pdf = await pagina.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: pieDePagina(ref),
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await navegador.close();
  }
}
