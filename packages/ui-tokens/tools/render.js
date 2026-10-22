// node render.js <svgdir> <pngdir> : rasteriza cada SVG con Playwright y arma una hoja de muestra (hoja.png).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
const jobs = [
  ['avance-obra-icono.svg', 'avance-obra-icono-1024.png', 1024, 1024],
  ['icono-cuadrado.svg', 'icono-cuadrado-1024.png', 1024, 1024],
  ['android-primer-plano.svg', 'android-primer-plano-1024.png', 1024, 1024],
  ['android-monocromo.svg', 'android-monocromo-1024.png', 1024, 1024],
  ['icono-cuadrado.svg', 'splash-icono-512.png', 512, 512],
  ['favicon.svg', 'favicon-32.png', 32, 32],
  ['favicon.svg', 'favicon-192.png', 192, 192],
  ['favicon.svg', 'favicon-512.png', 512, 512],
  ['logotipo-positivo.svg', 'logotipo-positivo.png', 0, 400],
  ['logotipo-negativo.svg', 'logotipo-negativo.png', 0, 400],
  ['logotipo-negro.svg', 'logotipo-negro.png', 0, 400],
  ['logotipo-blanco.svg', 'logotipo-blanco.png', 0, 400],
  ['marca-negativo.svg', 'marca-negativo.png', 0, 600],
  ['marca-negro.svg', 'marca-negro.png', 0, 600],
  ['marca-blanco.svg', 'marca-blanco.png', 0, 600],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const p = await b.newPage();
  for (const [s, o, w0, h] of jobs) {
    const txt = fs.readFileSync(path.join(src, s), 'utf8');
    const vb = txt.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const w = w0 || Math.round(h * vb[1] / vb[2]);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:transparent">${txt.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`)}</body></html>`);
    await p.screenshot({ path: path.join(out, o), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  }
  const files = fs.readdirSync(src).filter(f => f.endsWith('.svg'));
  const cells = files.map(f => {
    const dark = /negativo|blanco|primer|monocromo/.test(f);
    return `<div style="background:${dark ? '#112037' : '#fff'};padding:16px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;border:1px solid #ccc"><img src="file://${path.resolve(src, f)}" style="max-width:360px;max-height:160px"><span style="font:12px sans-serif;color:${dark ? '#fff' : '#000'}">${f}</span></div>`;
  }).join('');
  await p.setViewportSize({ width: 1200, height: 900 });
  fs.writeFileSync(path.resolve(out, '..', 'hoja.html'), `<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);background:#eee">${cells}</body>`);
  await p.goto('file://' + path.resolve(out, '..', 'hoja.html'));
  await p.screenshot({ path: path.resolve(out, '..', 'hoja.png'), fullPage: true });
  await b.close();
})();
