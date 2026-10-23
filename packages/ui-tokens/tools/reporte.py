# Genera los íconos y logos de ReporTE a partir del PNG original (fondo blanco).
# Uso: python3 reporte.py <ReporTE.png> <Archivo[wdth,wght].ttf> <raíz del repo>  (requiere Pillow)
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageChops
src, font_path, repo = sys.argv[1:4]
im = Image.open(src).convert('RGB')
# Transparencia: lo casi blanco es fondo; rampa suave en el borde para el antialias.
px = im.load(); w, h = im.size
a = Image.new('L', im.size)
ap = a.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        d = 255 - min(r, g, b)
        ap[x, y] = 0 if d < 10 else 255 if d > 40 else int((d - 10) * 255 / 30)
logo = im.convert('RGBA'); logo.putalpha(a)
logo = logo.crop(a.getbbox())
lw, lh = logo.size

def cuadrado(size, frac, fondo=None, radio=0):
    """Logo centrado en un cuadrado, ocupando `frac` del lado."""
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if fondo:
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radio, fill=255)
        c.paste(Image.new('RGBA', (size, size), fondo), (0, 0), m)
    s = size * frac / max(lw, lh)
    l = logo.resize((round(lw * s), round(lh * s)), Image.LANCZOS)
    c.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
    return c

def silueta(img, rgb):
    out = Image.new('RGBA', img.size, rgb + (0,))
    out.putalpha(img.getchannel('A'))
    return out

def guardar(img, ruta, rgb=False):
    ruta = os.path.join(repo, ruta)
    (img.convert('RGB') if rgb else img).save(ruta, optimize=True)
    print(ruta, img.size, os.path.getsize(ruta))

W = (255, 255, 255, 255)
# App de campo
guardar(cuadrado(1024, 0.78, W), 'apps/campo/assets/images/icon.png', rgb=True)
guardar(cuadrado(1024, 0.56), 'apps/campo/assets/images/android-icon-foreground.png')
guardar(silueta(cuadrado(1024, 0.56), (255, 255, 255)), 'apps/campo/assets/images/android-icon-monochrome.png')
guardar(cuadrado(192, 0.84, W, 40), 'apps/campo/assets/images/favicon.png')
guardar(cuadrado(512, 0.80, W, 112), 'apps/campo/assets/images/splash-icon.png')
# Logotipo: ícono + "ReporTE" en Archivo ExtraBold azul marino (el mismo color de texto que antes).
f = ImageFont.truetype(font_path, 260); f.set_variation_by_axes([800, 100])
H = 400; ic = cuadrado(H, 0.92)
txt = 'ReporTE'; bb = f.getbbox(txt)
lt = Image.new('RGBA', (H + 60 + bb[2] + 10, H), (0, 0, 0, 0))
lt.alpha_composite(ic, (0, 0))
ImageDraw.Draw(lt).text((H + 60, (H - (bb[3] - bb[1])) // 2 - bb[1]), txt, font=f, fill=(0x11, 0x20, 0x37, 255))
guardar(lt, 'apps/campo/assets/images/logotipo.png')
# Web
guardar(cuadrado(256, 0.82, W, 56), 'apps/web/public/marca/reporte-app.png')
guardar(cuadrado(180, 0.82, W, 0), 'apps/web/public/marca/apple-touch-icon.png', rgb=True)
guardar(cuadrado(64, 0.88, W, 14), 'apps/web/app/icon.png')
iso = logo.resize((600, round(lh * 600 / lw)), Image.LANCZOS)
guardar(iso, 'apps/web/public/marca/isotipo-color.png')
guardar(silueta(iso, (255, 255, 255)), 'apps/web/public/marca/isotipo-blanco.png')
guardar(silueta(iso, (0, 0, 0)), 'apps/web/public/marca/isotipo-negro.png')
# PDF de informes
guardar(cuadrado(512, 0.92), 'services/informes/activos/logo.png')
