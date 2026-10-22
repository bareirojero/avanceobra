# Genera las versiones SVG del logo "Avance de Obra".
# Uso: python3 marca.py <Archivo[wdth,wght].ttf> <carpeta de salida>  (requiere fonttools)
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

NAVY, YELLOW, GREEN, GRID = '#112037', '#FEC502', '#22D071', '#C4C5C7'

# Geometría en coordenadas del logo original (caja de la marca aprox. 555..1440 x 525..1312).
DOME = 'M605,1228 C605,1020 760,880 955,878 C1150,880 1300,1020 1305,1228 Z'
BRIM = 'M593,1225 H1319 A38,38 0 0 1 1357,1263 V1274 A38,38 0 0 1 1319,1312 H593 A38,38 0 0 1 555,1274 V1263 A38,38 0 0 1 593,1225 Z'
CREST = 'M862,1080 L848,880 Q848,833 900,833 L1010,833 Q1062,833 1062,880 L1048,1080 Q1046,1100 1030,1100 L880,1100 Q864,1100 862,1080 Z'
SLOTS = ['M836,880 L852,1078', 'M1074,880 L1058,1078']
ARROW = 'M875,1312 C1060,1290 1200,1160 1280,912 L1210,890 L1415,760 L1440,1005 L1375,965 C1290,1150 1170,1280 1045,1312 Z'
GRIDL = ['M645,765 V1010', 'M885,525 V800', 'M1097,585 V870', 'M1338,585 V1195', 'M583,880 H1185', 'M823,705 H1400']

def mark(uid, helmet, arrow, grid, grid_opacity=1):
    """Devuelve (defs, cuerpo) de la marca, con los cortes como máscaras (fondo transparente)."""
    helmet_d = f'<path d="{DOME}"/><path d="{BRIM}"/><path d="{CREST}"/>'
    defs = f'''<mask id="h{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="2048" height="2048">
<rect width="2048" height="2048" fill="#fff"/>
<g stroke="#000" stroke-width="26" stroke-linecap="round">{''.join(f'<path d="{s}"/>' for s in SLOTS)}</g>
<path d="{ARROW}" fill="#000" stroke="#000" stroke-width="36" stroke-linejoin="round"/>
</mask>
<mask id="g{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="2048" height="2048">
<rect width="2048" height="2048" fill="#fff"/>
<g fill="#000" stroke="#000" stroke-width="44" stroke-linejoin="round">{helmet_d}<path d="{ARROW}"/></g>
</mask>'''
    body = f'''<g mask="url(#g{uid})" stroke="{grid}" stroke-opacity="{grid_opacity}" stroke-width="6" stroke-linecap="round" fill="none">{''.join(f'<path d="{l}"/>' for l in GRIDL)}</g>
<g mask="url(#h{uid})" fill="{helmet}">{helmet_d}</g>
<path d="{ARROW}" fill="{arrow}"/>'''
    return defs, body

MARK_BOX = (555, 525, 1440, 1312)  # x0 y0 x1 y1

def place(size, cx, cy, scale):
    mx = (MARK_BOX[0] + MARK_BOX[2]) / 2
    my = (MARK_BOX[1] + MARK_BOX[3]) / 2
    return f'translate({cx},{cy}) scale({scale}) translate({-mx},{-my})'

def svg(w, h, inner, defs='', title='Avance de Obra'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}"><title>{title}</title><defs>{defs}</defs>{inner}</svg>\n'

def write(name, content):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(content)

# Texto convertido a curvas (Archivo ExtraBold) para que el logo no dependa de la fuente.
font = TTFont(FONT)
inst = instantiateVariableFont(font, {'wght': 800, 'wdth': 100})
gs = inst.getGlyphSet(); cmap = inst.getBestCmap(); upm = inst['head'].unitsPerEm
def text_path(txt, size, x, baseline):
    s = size / upm; parts = []; pen_x = 0
    for ch in txt:
        g = cmap[ord(ch)]
        p = SVGPathPen(gs)
        gs[g].draw(TransformPen(p, (s, 0, 0, -s, x + pen_x * s, baseline)))
        parts.append(p.getCommands()); pen_x += inst['hmtx'][g][0]
    return ' '.join(parts), pen_x * s

def tile(uid, x, y, size, mark_scale=0.62):
    d, b = mark(uid, YELLOW, GREEN, GRID)
    r = size * 0.22
    sc = size * mark_scale / (MARK_BOX[2] - MARK_BOX[0])
    return d, f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r}" fill="{NAVY}"/><g transform="{place(size, x + size/2, y + size/2, sc)}">{b}</g>'

# 1. Ícono (logo principal): baldosa azul marino.
d, b = tile('i', 0, 0, 1024)
write('avance-obra-icono.svg', svg(1024, 1024, b, d))

# 2. Marca sola, en color para fondo oscuro (negativo), en negro y en blanco.
MW, MH = MARK_BOX[2] - MARK_BOX[0] + 40, MARK_BOX[3] - MARK_BOX[1] + 40
for name, cols in [('marca-negativo.svg', (YELLOW, GREEN, GRID)), ('marca-negro.svg', ('#000', '#000', '#000')), ('marca-blanco.svg', ('#fff', '#fff', '#fff'))]:
    d, b = mark(name[6:9], *cols)
    write(name, svg(MW, MH, f'<g transform="translate({20 - MARK_BOX[0]},{20 - MARK_BOX[1]})">{b}</g>', d))

# 3. Logotipos horizontales: marca + "Avance de Obra".
H = 200; TS = 92
txt_d, txt_w = text_path('Avance de Obra', TS, 0, 0)
def lockup(name, kind):
    gap = 44; total_w = int(H + gap + txt_w + 8)
    baseline = H / 2 + TS * 0.36
    if kind == 'positivo':
        d, b = tile('lp', 0, 0, H); color = NAVY
    else:
        c = {'negativo': '#fff', 'negro': '#000', 'blanco': '#fff'}[kind]
        cols = (YELLOW, GREEN, GRID) if kind == 'negativo' else (c, c, c)
        d, b0 = mark('l' + kind, *cols)
        sc = H * 0.9 / (MARK_BOX[2] - MARK_BOX[0])
        b = f'<g transform="{place(H, H/2, H/2, sc)}">{b0}</g>'; color = c
    t = f'<path transform="translate({H + gap},{baseline})" d="{txt_d}" fill="{color}"/>'
    write(name, svg(total_w, H, b + t, d))
for k in ['positivo', 'negativo', 'negro', 'blanco']:
    lockup(f'logotipo-{k}.svg', k)

# 4. Android: fondo, primer plano y monocromo del ícono adaptativo (zona segura 66 %).
write('android-fondo.svg', svg(1024, 1024, f'<rect width="1024" height="1024" fill="{NAVY}"/>'))
sc = 1024 * 0.50 / (MARK_BOX[2] - MARK_BOX[0])
d, b = mark('af', YELLOW, GREEN, GRID)
write('android-primer-plano.svg', svg(1024, 1024, f'<g transform="{place(1024, 512, 512, sc)}">{b}</g>', d))
d, b = mark('am', '#fff', '#fff', '#fff')
write('android-monocromo.svg', svg(1024, 1024, f'<g transform="{place(1024, 512, 512, sc)}">{b}</g>', d))
# Ícono cuadrado completo (Expo "icon") y pantalla de inicio.
sc2 = 1024 * 0.62 / (MARK_BOX[2] - MARK_BOX[0])
d, b = mark('ic', YELLOW, GREEN, GRID)
write('icono-cuadrado.svg', svg(1024, 1024, f'<rect width="1024" height="1024" fill="{NAVY}"/><g transform="{place(1024, 512, 512, sc2)}">{b}</g>', d))
# Favicon: sin cuadrícula, se ve mejor chico.
d, b = mark('fv', YELLOW, GREEN, GRID, grid_opacity=0)
write('favicon.svg', svg(64, 64, f'<rect width="64" height="64" rx="14" fill="{NAVY}"/><g transform="{place(64, 32, 33, 64 * 0.74 / (MARK_BOX[2] - MARK_BOX[0]))}">{b}</g>', d))
print('ok', sorted(os.listdir(OUT)))
