# Typography + brand for the holiday SVGs.
# Every holiday gets its own type pairing. Fonts are instanced at the exact weight, subset to the glyphs
# actually used and embedded as WOFF data-URIs, so the slides render identically offline on every screen.
# All fonts are from Google Fonts (SIL Open Font License, see fonts/OFL.txt).
import base64, io, json, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = os.path.dirname(__file__)
FONTS = {
    # key: (file, variable-axis location)
    'frank-900': ('FrankRuhlLibre[wght].ttf', {'wght': 900}),
    'frank-500': ('FrankRuhlLibre[wght].ttf', {'wght': 500}),
    'bellefair': ('Bellefair-Regular.ttf', None),
    'amatic': ('AmaticSC-Bold.ttf', None),
    'suez': ('SuezOne-Regular.ttf', None),
    'karantina-700': ('Karantina-Bold.ttf', None),
    'karantina-400': ('Karantina-Regular.ttf', None),
    'rubik-900': ('Rubik[wght].ttf', {'wght': 900}),
    'rubik-700': ('Rubik[wght].ttf', {'wght': 700}),
    'rubik-500': ('Rubik[wght].ttf', {'wght': 500}),
    'bubbles': ('RubikBubbles-Regular.ttf', None),
    'burned': ('RubikBurned-Regular.ttf', None),
    'david-700': ('DavidLibre-Bold.ttf', None),
    'david-500': ('DavidLibre-Medium.ttf', None),
    'secular': ('SecularOne-Regular.ttf', None),
    'varela': ('VarelaRound-Regular.ttf', None),
    'assistant-300': ('Assistant[wght].ttf', {'wght': 300}),
    'assistant-500': ('Assistant[wght].ttf', {'wght': 500}),
    'assistant-700': ('Assistant[wght].ttf', {'wght': 700}),
    'heebo-500': ('Heebo[wght].ttf', {'wght': 500}),
    'heebo-800': ('Heebo[wght].ttf', {'wght': 800}),
    'noto-900': ('NotoSerifHebrew[wdth,wght].ttf', {'wght': 900, 'wdth': 87.5}),
    'noto-500': ('NotoSerifHebrew[wdth,wght].ttf', {'wght': 500, 'wdth': 100}),
}
_cache = {}

def font(key):
    if key not in _cache:
        f, loc = FONTS[key]
        tt = TTFont(os.path.join(HERE, 'fonts', f))
        if loc: tt = instancer.instantiateVariableFont(tt, loc)
        _cache[key] = tt
    return _cache[key]

def advance(key, s, size, ls=0):
    """Text width in px (advance widths; close enough to fit headlines)."""
    tt = font(key); cmap = tt.getBestCmap(); hm = tt['hmtx']; upm = tt['head'].unitsPerEm
    w = 0
    for ch in s:
        g = cmap.get(ord(ch))
        w += (hm[g][0] if g else upm * .5) * size / upm + ls
    return w

def missing(key, s):
    cmap = font(key).getBestCmap()
    return [ch for ch in s if ch.strip() and ord(ch) not in cmap]

def face(family, key, chars):
    tt = font(key)
    buf = io.BytesIO(); tt.save(buf); buf.seek(0)
    sub = TTFont(buf)
    opts = subset.Options(); opts.layout_features = ['*']; opts.flavor = 'woff'; opts.name_IDs = [1, 2]; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(text=''.join(sorted(set(chars))) + ' '); s.subset(sub)
    out = io.BytesIO(); sub.flavor = 'woff'; sub.save(out)
    data = base64.b64encode(out.getvalue()).decode()
    return f"@font-face{{font-family:'{family}';src:url(data:font/woff;base64,{data}) format('woff');font-weight:normal;font-style:normal}}"

# ------------------------------------------------------------------ brand (vector Eitan Medical logo)
LOGO = json.load(open(os.path.join(HERE, 'logo.json')))

def brand_defs():
    return (f'<linearGradient id="brandG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{LOGO["markX1"]}" y2="0">'
            '<stop offset="0" stop-color="#16955a"/><stop offset="1" stop-color="#86bd26"/></linearGradient>')

def brand(cx, cy, w, word='#ffffff', mark='url(#brandG)', cls='in d6', opacity=1):
    """The logo drawn into the artwork itself, centred on (cx, cy), w px wide."""
    k = w / LOGO['w']; h = LOGO['h'] * k
    return (f'<g class="{cls}" opacity="{opacity}"><g transform="translate({cx - w / 2:.1f} {cy - h / 2:.1f}) scale({k:.5f})">'
            f'<path d="{LOGO["mark"]}" fill="{mark}" fill-rule="evenodd"/><path d="{LOGO["word"]}" fill="{word}" fill-rule="evenodd"/></g></g>')
