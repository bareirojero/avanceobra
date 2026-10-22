# Marca Avance de Obra

Vectorizado a partir del logo original (casco amarillo, flecha verde de avance y cuadrícula de plano sobre azul marino). Los cortes entre casco, flecha y cuadrícula son máscaras, así que todas las versiones tienen fondo transparente salvo el ícono.

Colores: azul marino `#112037`, amarillo `#FEC502`, verde `#22D071`, líneas `#C4C5C7`. Letra del logotipo: Archivo ExtraBold, convertida a curvas.

| Archivo | Uso |
|---|---|
| `avance-obra-icono.svg` / `-1024.png` | Logo principal: baldosa azul marino con la marca. Encabezado del PDF, perfil, cualquier fondo. |
| `logotipo-positivo.svg` / `.png` | Ícono + "Avance de Obra" en azul marino, sobre fondos claros. Login web. |
| `logotipo-negativo.svg` / `.png` | Marca a color + texto blanco, sobre azul marino. Menú lateral web. |
| `logotipo-negro.svg`, `logotipo-blanco.svg` | Una sola tinta: impresiones, sellos, sobre fotos. |
| `marca-negativo.svg`, `marca-negro.svg`, `marca-blanco.svg` | Solo el símbolo, sin texto. Encabezado de la app de campo (negativo). |
| `icono-cuadrado.svg` / `-1024.png` | `icon` de Expo (cuadrado, sin transparencia). |
| `android-fondo.svg`, `android-primer-plano.svg` / `-1024.png` | Ícono adaptativo de Android: fondo `#112037` y primer plano dentro de la zona segura. |
| `android-monocromo.svg` / `-1024.png` | Ícono temático de Android 13+. |
| `splash-icono-512.png` | Pantalla de inicio de la app sobre `#112037`. |
| `favicon.svg`, `favicon-32/192/512.png` | Pestaña del navegador y PWA (sin cuadrícula, se lee mejor chico). |

Para regenerar: `python3 ../../tools/marca.py Archivo.ttf svg/` y `node ../../tools/render.js svg/ png/` (Playwright con Chromium).

En Expo (`apps/campo/app.json`): `icon` = `icono-cuadrado-1024.png`, `android.adaptiveIcon.foregroundImage` = `android-primer-plano-1024.png`, `backgroundColor` = `#112037`, `monochromeImage` = `android-monocromo-1024.png`, `splash.image` = `splash-icono-512.png` con `backgroundColor` `#112037`.
