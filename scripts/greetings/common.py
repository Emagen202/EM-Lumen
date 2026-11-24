# Shared building blocks for the holiday SVGs (1920x1080).
import math, random
from typo import FONTS, advance, missing, face, brand, brand_defs

FALLBACK = "'Segoe UI', 'Heebo', Arial, sans-serif"

# Per-slide type pairing: role -> (font key, size scale). Set by each design via theme().
THEME = {}
USED = {}   # role -> set of chars, collected while the slide is drawn

def theme(head, sub, en, head_scale=1.0, sub_scale=1.0, en_scale=1.0):
    THEME.clear(); USED.clear()
    THEME.update(head=(head, head_scale), sub=(sub, sub_scale), en=(en, en_scale))

def _fit(role, t, size, ls, maxw):
    key, sc = THEME[role]
    assert not missing(key, t), (key, missing(key, t))
    size = size * sc
    if maxw:
        w = advance(key, t, size, ls)
        if w > maxw: size *= maxw / w
    USED.setdefault(role, set()).update(t)
    return round(size)

def svg(defs, body, css=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
<defs>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".35"/></filter>
<filter id="tshadow" x="-10%" y="-30%" width="120%" height="170%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".35"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0"/></filter>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#f3cf6b"/><stop offset=".55" stop-color="#c8962e"/><stop offset=".75" stop-color="#f7dc8a"/><stop offset="1" stop-color="#a87422"/></linearGradient>
<linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a87422"/><stop offset=".3" stop-color="#f7dc8a"/><stop offset=".5" stop-color="#fff3c4"/><stop offset=".7" stop-color="#e2b04a"/><stop offset="1" stop-color="#a87422"/></linearGradient>
{brand_defs()}
{defs}
</defs>
<style>
{faces()}
text{{font-family:{FALLBACK};font-weight:normal}}
.fH{{font-family:'H',{FALLBACK}}}.fS{{font-family:'S',{FALLBACK}}}.fE{{font-family:'E',{FALLBACK}}}
.in{{animation:in 1.1s cubic-bezier(.2,.7,.2,1) both}}
.up{{animation:up 1.2s cubic-bezier(.2,.7,.2,1) both}}
.pop{{animation:pop 1s cubic-bezier(.3,1.5,.5,1) both;transform-box:fill-box;transform-origin:center}}
.flo{{animation:flo 5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}}
.tw{{animation:tw 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}}
.fl{{animation:fl .9s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}}
.d1{{animation-delay:.2s}}.d2{{animation-delay:.45s}}.d3{{animation-delay:.7s}}.d4{{animation-delay:.95s}}.d5{{animation-delay:1.2s}}.d6{{animation-delay:1.5s}}
@keyframes in{{from{{opacity:0}}}}
@keyframes up{{from{{opacity:0;transform:translateY(60px)}}}}
@keyframes pop{{from{{opacity:0;transform:scale(.4)}}}}
@keyframes flo{{to{{transform:translateY(-26px)}}}}
@keyframes tw{{0%,100%{{opacity:.25;transform:scale(.7)}}50%{{opacity:1;transform:scale(1.15)}}}}
@keyframes fl{{0%{{transform:scaleY(1) scaleX(1)}}100%{{transform:scaleY(1.12) scaleX(.9) skewX(3deg)}}}}
{css}
</style>
{body}
<rect width="1920" height="1080" filter="url(#grain)" opacity=".9"/>
</svg>'''

def faces():
    return ''.join(face(r[0].upper(), THEME[r][0], USED[r]) for r in ('head', 'sub', 'en') if USED.get(r))

def rg(id, stops, cx=.5, cy=.5, r=.75, fx=None, fy=None):
    s=''.join(f'<stop offset="{x[0]}" stop-color="{x[1]}"' + (f' stop-opacity="{x[2]}"' if len(x) > 2 else '') + '/>' for x in stops)
    f=f' fx="{fx}" fy="{fy}"' if fx is not None else ''
    return f'<radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}"{f}>{s}</radialGradient>'

def lg(id, stops, x1=0, y1=0, x2=0, y2=1):
    s=''.join(f'<stop offset="{x[0]}" stop-color="{x[1]}"{"" if len(x)<3 else f" stop-opacity=\"{x[2]}\""}/>' for x in stops)
    return f'<linearGradient id="{id}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'

def text(t, x, y, size, fill='#fff', weight=None, anchor='middle', cls='', extra='', ls=0, role=None, maxw=None):
    role = role or ('head' if size >= 110 else 'sub')
    if maxw is None: maxw = 1680 if anchor == 'middle' else 900
    size = _fit(role, t, size, ls, maxw)
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" direction="rtl" letter-spacing="{ls}" class="f{role[0].upper()} {cls}" {extra}>{t}</text>'

def etext(t, x, y, size, fill='#fff', weight=None, anchor='middle', cls='', ls=8, maxw=1500):
    size = _fit('en', t, size, ls, maxw)
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" direction="ltr" letter-spacing="{ls}" class="fE {cls}">{t}</text>'

def bokeh(seed, n, x0, y0, x1, y1, color, rmin=10, rmax=60, op=(.08,.35), cls='tw'):
    r=random.Random(seed); out=[]
    for i in range(n):
        x=r.uniform(x0,x1); y=r.uniform(y0,y1); rr=r.uniform(rmin,rmax); o=r.uniform(*op)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rr:.0f}" fill="{color}" opacity="{o:.2f}" class="{cls}" style="animation-delay:{r.uniform(0,3):.2f}s;animation-duration:{r.uniform(2,5):.1f}s"/>')
    return ''.join(out)

def sparkle(x, y, s, fill='#fff', delay=0):
    p=f'M{x},{y-s} Q{x+s*.12},{y-s*.12} {x+s},{y} Q{x+s*.12},{y+s*.12} {x},{y+s} Q{x-s*.12},{y+s*.12} {x-s},{y} Q{x-s*.12},{y-s*.12} {x},{y-s}Z'
    return f'<path d="{p}" fill="{fill}" class="tw" style="animation-delay:{delay}s"/>'

def star6(cx, cy, r, stroke, sw, fill='none', op=1):
    def tri(rot):
        pts=[(cx+r*math.cos(math.radians(rot+120*i-90)), cy+r*math.sin(math.radians(rot+120*i-90))) for i in range(3)]
        return 'M'+' L'.join(f'{a:.1f},{b:.1f}' for a,b in pts)+'Z'
    return f'<g opacity="{op}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"><path d="{tri(0)}"/><path d="{tri(60)}"/></g>'

def ornament(cx, y, w, color='url(#goldH)', cls='in d4'):
    return f'<g class="{cls}"><rect x="{cx-w/2}" y="{y-1.5}" width="{w}" height="3" rx="1.5" fill="{color}"/><path d="M{cx},{y-12} L{cx+12},{y} L{cx},{y+12} L{cx-12},{y}Z" fill="{color}"/></g>'
