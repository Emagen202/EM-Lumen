import math, random, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

EYEBROW = 'איתן מדיקל מאחלת לכם'

def drop(x, ybot, h, w, fill):
    return f'M{x},{ybot-h} C{x+w},{ybot-h*.42} {x+w*.75},{ybot} {x},{ybot} C{x-w*.75},{ybot} {x-w},{ybot-h*.42} {x},{ybot-h}Z'

# ------------------------------------------------------------------ Hanukkah
def hanukkah():
    defs = rg('bg', [(0,'#16337a'),(.55,'#0a1a47'),(1,'#040a22')], cy=.35, r=.9) + rg('halo', [(0,'#ffcf6b',.5),(.7,'#ffcf6b',.12),(1,'#ffcf6b',0)], r=.5) + \
        lg('cand', [(0,'#ffffff'),(1,'#b9cdf5')], 0,0,1,0) + rg('flameO', [(0,'#fff6c2'),(.45,'#ffc23d'),(1,'#ff6a00')], cy=.7, r=.7)
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>',
         bokeh(3, 70, 0, 0, 1920, 700, '#ffffff', 1.5, 4, (.3,.9)),
         bokeh(4, 14, 0, 0, 1920, 1080, '#ffcf6b', 30, 110, (.04,.12), 'flo'),
         '<ellipse cx="960" cy="430" rx="620" ry="330" fill="url(#halo)" class="in"/>']
    cx, armY = 960, 560
    g = ['<g class="up d1" filter="url(#shadow)">']
    for i in range(1, 5):
        r = i * 88
        g.append(f'<path d="M{cx-r},{armY-210} L{cx-r},{armY-130} A{r},{r*.6} 0 0 0 {cx+r},{armY-130} L{cx+r},{armY-210}" fill="none" stroke="url(#goldH)" stroke-width="16" stroke-linecap="round"/>')
    g.append(f'<rect x="{cx-11}" y="{armY-260}" width="22" height="330" rx="8" fill="url(#gold)"/>')
    g.append(f'<path d="M{cx-150},{armY+110} Q{cx},{armY+40} {cx+150},{armY+110} Z" fill="url(#gold)"/><rect x="{cx-190}" y="{armY+104}" width="380" height="22" rx="11" fill="url(#gold)"/>')
    for i in range(9):
        x = cx + (i - 4) * 88
        top = armY - (300 if i == 4 else 250)
        g.append(f'<rect x="{x-16}" y="{top-6}" width="32" height="14" rx="5" fill="url(#gold)"/>')
        g.append(f'<rect x="{x-11}" y="{top-120}" width="22" height="118" rx="5" fill="url(#cand)"/>')
        fy = top - 122
        d = (i * .17) % .9
        g.append(f'<circle cx="{x}" cy="{fy-30}" r="46" fill="#ffb84d" opacity=".28" filter="url(#blur8)" class="tw" style="animation-delay:{d}s"/>')
        g.append(f'<path d="{drop(x, fy, 72, 22, 0)}" fill="url(#flameO)" class="fl" style="animation-delay:{d}s"/>')
        g.append(f'<path d="{drop(x, fy-4, 36, 10, 0)}" fill="#fffbe6" class="fl" style="animation-delay:{d+.1}s"/>')
    g.append('</g>')
    b += g
    b += [text(EYEBROW, 960, 752, 44, '#ffd77a', 400, cls='in d3', ls=2),
          text('חנוכה שמח', 960, 930, 150, 'url(#gold)', 900, cls='up d4', extra='filter="url(#tshadow)"'),
          etext('HAPPY HANUKKAH  ·  שהאור ימשיך להאיר', 960, 1000, 34, '#c9d7ff', 300, cls='in d6', ls=4)]
    for i, (x, y, s) in enumerate([(260, 200, 26), (1650, 260, 32), (1500, 120, 18), (380, 420, 16), (1760, 520, 20)]):
        b.append(sparkle(x, y, s, '#ffe9a8', i * .5))
    return defs, ''.join(b), {'logo': [1530, 950, 340, 100]}

# ------------------------------------------------------------------ Rosh Hashana
def rosh_hashana():
    defs = rg('bg', [(0,'#a3152a'),(.6,'#5e0a19'),(1,'#2a040b')], cx=.3, cy=.45, r=1) + \
        rg('pom', [(0,'#ff6b6b'),(.45,'#d1122e'),(1,'#6d0616')], cx=.38, cy=.35, r=.75) + \
        rg('apple', [(0,'#ff8a7a'),(.5,'#e3262f'),(1,'#7d0b12')], cx=.35, cy=.3, r=.8) + \
        lg('honey', [(0,'#ffd36b'),(.5,'#f2a516'),(1,'#c26a05')]) + lg('wood', [(0,'#c98a4b'),(1,'#7a4b22')], 0,0,1,0) + \
        lg('leaf', [(0,'#8bd35b'),(1,'#2f7d2a')])
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>',
         # honey dripping from the top edge
         '<path class="in" d="M0,0 H1920 V70 C1840,70 1830,150 1790,150 C1750,150 1752,80 1700,80 C1640,80 1650,210 1600,210 C1550,210 1560,90 1500,90 C1420,90 1440,130 1380,130 C1330,130 1330,80 1270,80 C1200,80 1220,170 1160,170 C1110,170 1120,70 1040,70 H0Z" fill="url(#honey)" opacity=".95"/>',
         '<ellipse cx="1600" cy="232" rx="18" ry="24" fill="url(#honey)" class="flo"/>',
         bokeh(11, 22, 0, 200, 1920, 1080, '#ffc76b', 6, 30, (.08,.3)),
         '<circle cx="520" cy="560" r="420" fill="#ff9a6b" opacity=".12" filter="url(#soft)"/>']
    # pomegranate
    b.append('<g class="pop d1" filter="url(#shadow)">'
             '<path d="M520,330 l-38,-70 l30,22 l8,-42 l18,40 l18,-40 l8,42 l30,-22 l-38,70Z" fill="#8f0c20"/>'
             '<circle cx="520" cy="560" r="250" fill="url(#pom)"/>'
             '<ellipse cx="430" cy="460" rx="70" ry="40" fill="#fff" opacity=".22" transform="rotate(-30 430 460)"/>'
             '</g>')
    # apple
    b.append('<g class="pop d2" filter="url(#shadow)">'
             '<path d="M300,760 C220,700 160,780 175,870 C190,960 250,1020 300,1000 C350,1020 410,960 425,870 C440,780 380,700 300,760Z" fill="url(#apple)"/>'
             '<path d="M300,765 C298,735 304,712 316,698" stroke="#5b3a1d" stroke-width="9" fill="none" stroke-linecap="round"/>'
             '<path d="M318,705 C350,668 400,672 420,690 C392,722 350,724 318,705Z" fill="url(#leaf)"/>'
             '<ellipse cx="250" cy="820" rx="26" ry="44" fill="#fff" opacity=".25" transform="rotate(20 250 820)"/></g>')
    # honey dipper
    b.append('<g class="up d3" filter="url(#shadow)" transform="rotate(-28 820 830)">'
             '<rect x="700" y="815" width="330" height="22" rx="11" fill="url(#wood)"/>'
             + ''.join(f'<rect x="{620+i*20}" y="{790-(8 if i%2 else 0)}" width="16" height="{72+(16 if i%2 else 0)}" rx="8" fill="url(#honey)"/>' for i in range(5)) +
             '</g>')
    b += [text(EYEBROW, 1780, 360, 46, '#ffd9a0', 400, anchor='start', cls='in d2', ls=2),
          text('שנה טובה', 1780, 540, 190, 'url(#gold)', 900, anchor='start', cls='up d3', extra='filter="url(#tshadow)"'),
          text('ומתוקה', 1780, 720, 190, '#ffffff', 900, anchor='start', cls='up d4', extra='filter="url(#tshadow)"'),
          ornament(1500, 790, 560, cls='in d5'),
          text('שנה של בריאות, שמחה והצלחה', 1780, 870, 52, '#ffe6c7', 400, anchor='start', cls='in d5'),
          etext('SHANA TOVA', 1780, 930, 36, '#f3cf6b', 300, anchor='end', cls='in d6', ls=12)]
    b += [sparkle(860, 300, 22, '#ffe7a3', .3), sparkle(1080, 480, 16, '#ffe7a3', 1.1), sparkle(700, 180, 14, '#ffe7a3', .7)]
    return defs, ''.join(b), {'logo': [1440, 960, 340, 96]}

# ------------------------------------------------------------------ Yom Kippur
def yom_kippur():
    defs = rg('bg', [(0,'#31508f'),(.55,'#14254f'),(1,'#070f26')], cy=.15, r=1) + lg('ray', [(0,'#ffffff',.35),(1,'#ffffff',0)])
    rays = ''.join(f'<path d="M960,-40 L{960+math.tan(math.radians(a-4))*1200:.0f},1100 L{960+math.tan(math.radians(a+4))*1200:.0f},1100Z" fill="url(#ray)" opacity=".5"/>' for a in range(-40, 41, 16))
    dove = ('M0,0 C40,-30 95,-35 130,-10 C150,-55 210,-95 280,-100 C240,-70 225,-40 220,-10 C260,-30 310,-25 340,-5 '
            'C300,5 270,20 240,45 C200,80 140,90 90,70 C60,85 25,90 -10,80 C10,65 25,50 30,35 C15,25 5,12 0,0Z')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', f'<g class="in">{rays}</g>',
         bokeh(21, 60, 0, 0, 1920, 1080, '#ffffff', 1.5, 3.5, (.2,.8)),
         f'<g class="flo" style="animation-duration:7s"><path d="{dove}" fill="#f5f8ff" transform="translate(800 230) scale(1.05)" filter="url(#glow)" class="pop d1"/>'
         '<path d="M1105,262 C1140,250 1165,262 1180,278" stroke="#9ac46a" stroke-width="7" fill="none" stroke-linecap="round" class="in d2"/>'
         '<ellipse cx="1190" cy="268" rx="20" ry="9" fill="#9ac46a" transform="rotate(-25 1190 268)" class="in d2"/></g>',
         '<rect x="90" y="80" width="1740" height="920" rx="10" fill="none" stroke="url(#goldH)" stroke-width="3" opacity=".7" class="in"/>',
         text(EYEBROW, 960, 500, 44, '#e9d29a', 300, cls='in d2', ls=6),
         text('גמר חתימה טובה', 960, 680, 168, '#ffffff', 300, cls='up d3', extra='filter="url(#glow)"'),
         ornament(960, 750, 520, cls='in d4'),
         text('שתיחתמו לשנה טובה של בריאות ושלום', 960, 830, 48, '#d6e0f5', 300, cls='in d5'),
         etext("G'MAR CHATIMA TOVA", 960, 885, 32, '#e9d29a', 300, cls='in d6', ls=14)]
    return defs, ''.join(b), {'logo': [790, 925, 340, 90]}

# ------------------------------------------------------------------ Sukkot
def frond(x, y, length, angle, color, n=14, flip=1):
    out = []; a = math.radians(angle)
    ex, ey = x + math.cos(a) * length, y + math.sin(a) * length
    cx, cy = (x + ex) / 2 + math.sin(a) * 40 * flip, (y + ey) / 2 - math.cos(a) * 40 * flip
    out.append(f'<path d="M{x:.0f},{y:.0f} Q{cx:.0f},{cy:.0f} {ex:.0f},{ey:.0f}" stroke="{color}" stroke-width="7" fill="none" stroke-linecap="round"/>')
    for i in range(1, n):
        t = i / n; px = (1-t)**2*x + 2*(1-t)*t*cx + t*t*ex; py = (1-t)**2*y + 2*(1-t)*t*cy + t*t*ey
        L = 90 * (1 - t * .6)
        for s in (-1, 1):
            b = a + s * math.radians(55)
            out.append(f'<path d="M{px:.0f},{py:.0f} q{math.cos(b)*L*.5+s*8:.0f},{math.sin(b)*L*.5:.0f} {math.cos(b)*L:.0f},{math.sin(b)*L:.0f}" stroke="{color}" stroke-width="6" fill="none" stroke-linecap="round"/>')
    return ''.join(out)

def sukkot():
    defs = lg('sky', [(0,'#ff9a4a'),(.45,'#ffc67a'),(1,'#ffe9bf')]) + rg('sun', [(0,'#fff7d6'),(.6,'#ffd27a',.9),(1,'#ffb347',0)]) + \
        lg('post', [(0,'#a8733f'),(1,'#6b4423')], 0,0,1,0) + lg('panel', [(0,'#fff8e8'),(1,'#f6e6c4')])
    b = ['<rect width="1920" height="1080" fill="url(#sky)"/>', '<circle cx="1500" cy="300" r="260" fill="url(#sun)" class="in"/>',
         '<path d="M0,900 Q480,840 960,880 T1920,860 V1080 H0Z" fill="#c9883f" opacity=".55"/>',
         '<rect x="380" y="250" width="1160" height="660" rx="12" fill="url(#panel)" class="in d1" filter="url(#shadow)"/>',
         '<rect x="350" y="230" width="44" height="720" rx="8" fill="url(#post)" class="up"/><rect x="1526" y="230" width="44" height="720" rx="8" fill="url(#post)" class="up"/>',
         '<rect x="320" y="210" width="1280" height="40" rx="10" fill="url(#post)" class="up d1"/>']
    r = random.Random(5); fr = []
    for i in range(16):
        x = 300 + i * 85; ang = 180 + r.uniform(-25, 25) if i % 2 else r.uniform(-25, 25)
        fr.append(frond(x, 215 + r.uniform(-10, 10), 230, ang + 90 * 0 - (0 if i % 2 else 0), ['#2f7d32', '#3f9a3a', '#256b2a'][i % 3], flip=1 if i % 2 else -1))
    b.append(f'<g class="pop d2" style="transform-origin:960px 215px">{"".join(fr)}</g>')
    # string lights
    pts = [(400 + i * 56, 300 + 46 * math.sin(math.pi * i / 20)) for i in range(21)]
    b.append('<path d="M' + ' L'.join(f'{x:.0f},{y:.0f}' for x, y in pts) + '" stroke="#5a3b1c" stroke-width="3" fill="none" class="in d3"/>')
    cols = ['#ffd84a', '#ff6b6b', '#6be3ff', '#9dff6b']
    for i, (x, y) in enumerate(pts[1:-1]):
        c = cols[i % 4]
        b.append(f'<circle cx="{x:.0f}" cy="{y+18:.0f}" r="22" fill="{c}" opacity=".35" filter="url(#blur8)" class="tw" style="animation-delay:{i*.13:.2f}s"/><circle cx="{x:.0f}" cy="{y+18:.0f}" r="9" fill="{c}" class="in d3"/>')
    # citrus & grapes ornaments
    b.append('<g class="flo"><line x1="560" y1="250" x2="560" y2="420" stroke="#5a3b1c" stroke-width="3"/><ellipse cx="560" cy="455" rx="44" ry="36" fill="#f2c218"/><ellipse cx="545" cy="440" rx="12" ry="7" fill="#fff" opacity=".4"/></g>')
    b.append('<g class="flo" style="animation-delay:1s"><line x1="1360" y1="250" x2="1360" y2="400" stroke="#5a3b1c" stroke-width="3"/>' +
             ''.join(f'<circle cx="{1360+dx}" cy="{420+dy}" r="18" fill="#6b2d8a"/>' for dx, dy in [(-18,0),(18,0),(0,26),(-30,26),(30,26),(-12,52),(14,52),(0,76)]) + '</g>')
    b += [text(EYEBROW, 960, 478, 44, '#8a5a2b', 400, cls='in d3', ls=2),
          text('חג סוכות שמח', 960, 705, 170, '#2f6f2a', 900, cls='up d4'),
          ornament(960, 750, 480, cls='in d5'),
          text('חג של שמחה, אחדות וחיבור', 960, 820, 46, '#6b4423', 400, cls='in d5'),
          etext('HAPPY SUKKOT', 960, 870, 30, '#a8733f', 400, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [790, 950, 340, 100]}

# ------------------------------------------------------------------ Simchat Torah
def simchat_torah():
    defs = rg('bg', [(0,'#2f6fe0'),(.6,'#123a91'),(1,'#081d52')], cy=.4, r=.95) + lg('parch', [(0,'#fff8e1'),(1,'#f0dcae')], 0,0,1,0) + \
        lg('roll', [(0,'#6b3a1a'),(.5,'#b06a33'),(1,'#5a2f14')], 0,0,1,0)
    r = random.Random(9); conf = []
    cols = ['#ffd23f', '#ff5d8f', '#4cc9f0', '#80ed99', '#ffffff', '#f77f00']
    for i in range(90):
        x, y = r.uniform(0, 1920), r.uniform(0, 1080)
        if 280 < x < 1640 and 600 < y: continue
        conf.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{r.uniform(10,22):.0f}" height="{r.uniform(22,40):.0f}" rx="3" fill="{cols[i%6]}" transform="rotate({r.uniform(0,180):.0f} {x:.0f} {y:.0f})" class="{"tw" if i%3 else "flo"}" style="animation-delay:{r.uniform(0,3):.2f}s"/>')
    streamers = ''.join(f'<path d="M{x},-20 C{x+60},120 {x-60},220 {x+30},360" stroke="{c}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".9" class="up d1"/>'
                        for x, c in [(120, '#ffd23f'), (260, '#ff5d8f'), (1660, '#4cc9f0'), (1800, '#80ed99')])
    torah = ('<g class="pop d1" filter="url(#shadow)">'
             '<rect x="760" y="210" width="400" height="300" fill="url(#parch)"/>'
             + ''.join(f'<rect x="{800}" y="{250+i*26}" width="{320 - (i%3)*40}" height="6" rx="3" fill="#8a6a3a" opacity=".45"/>' for i in range(9)) +
             '<rect x="712" y="180" width="56" height="360" rx="26" fill="url(#roll)"/><rect x="1152" y="180" width="56" height="360" rx="26" fill="url(#roll)"/>'
             '<rect x="728" y="130" width="24" height="60" rx="8" fill="url(#gold)"/><rect x="1168" y="130" width="24" height="60" rx="8" fill="url(#gold)"/>'
             '<rect x="728" y="530" width="24" height="60" rx="8" fill="url(#gold)"/><rect x="1168" y="530" width="24" height="60" rx="8" fill="url(#gold)"/>'
             '<circle cx="740" cy="122" r="18" fill="url(#gold)"/><circle cx="1180" cy="122" r="18" fill="url(#gold)"/></g>'
             '<path class="pop d2" d="M880,120 L900,60 L930,100 L960,40 L990,100 L1020,60 L1040,120Z" fill="url(#gold)" filter="url(#glow)"/>')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', '<circle cx="960" cy="360" r="380" fill="#ffffff" opacity=".07"/>', ''.join(conf), streamers, torah,
         text(EYEBROW, 960, 650, 44, '#ffe08a', 400, cls='in d3', ls=2),
         text('שמחת תורה שמחה', 960, 820, 160, 'url(#gold)', 900, cls='up d4', extra='filter="url(#tshadow)"'),
         etext('HAPPY SIMCHAT TORAH', 960, 900, 34, '#d7e6ff', 300, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [790, 950, 340, 96]}

# ------------------------------------------------------------------ Tu BiShvat
def tu_bishvat():
    defs = lg('bg', [(0,'#e9f7d4'),(1,'#bfe39a')]) + rg('sun', [(0,'#fff6c8'),(1,'#ffd66b',0)]) + lg('trunk', [(0,'#8a5a32'),(1,'#5a3820')], 0,0,1,0) + \
        rg('l1', [(0,'#8fd65b'),(1,'#3f8f2a')], cx=.35, cy=.3) + rg('l2', [(0,'#6cc04a'),(1,'#2b6e22')], cx=.35, cy=.3) + rg('l3', [(0,'#b2e36b'),(1,'#5aa636')], cx=.35, cy=.3)
    r = random.Random(17)
    canopy = []
    for i in range(34):
        a = r.uniform(0, math.tau); d = r.uniform(0, 1) ** .6
        x = 470 + math.cos(a) * 250 * d; y = 420 + math.sin(a) * 190 * d; s = r.uniform(70, 130)
        canopy.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{s:.0f}" fill="url(#l{1 + i % 3})"/>')
    fruits = ''.join(f'<circle cx="{470+math.cos(a)*220*d:.0f}" cy="{430+math.sin(a)*180*d:.0f}" r="20" fill="{c}" class="pop" style="animation-delay:{1+i*.08:.2f}s"/>'
                     for i, (a, d, c) in enumerate([(r.uniform(0, math.tau), r.uniform(.3, 1), ['#ff8c1a', '#e8333a', '#ffc21a'][j % 3]) for j in range(14)]))
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', '<circle cx="470" cy="420" r="480" fill="url(#sun)" class="in"/>',
         '<path d="M0,880 Q500,800 1000,860 T1920,840 V1080 H0Z" fill="#6cad3c"/><path d="M0,940 Q600,880 1200,930 T1920,920 V1080 H0Z" fill="#4c8c2b"/>',
         '<path class="up" d="M430,900 C440,760 430,650 380,560 L420,560 C455,620 470,660 475,700 C485,640 510,600 560,560 L590,575 C530,640 510,720 520,900Z" fill="url(#trunk)"/>',
         f'<g class="pop d1" style="transform-origin:470px 560px" filter="url(#shadow)">{"".join(canopy)}</g>', fruits,
         '<rect x="1000" y="0" width="920" height="1080" fill="#fffdf5" opacity=".0"/>',
         text(EYEBROW, 1760, 330, 44, '#5b7a2a', 400, anchor='start', cls='in d2', ls=2),
         text('ט״ו בשבט', 1780, 520, 170, '#2f6b1f', 900, anchor='start', cls='up d3'),
         text('שמח', 1780, 700, 170, '#6aa832', 900, anchor='start', cls='up d4'),
         ornament(1480, 770, 560, cls='in d5'),
         text('חג האילנות — צומחים יחד', 1760, 850, 50, '#3f5f1f', 400, anchor='start', cls='in d5'),
         etext('HAPPY TU BISHVAT', 1760, 905, 32, '#f3fadf', 400, anchor='end', cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [1420, 955, 340, 96]}

# ------------------------------------------------------------------ Purim
def purim():
    defs = lg('bg', [(0,'#3a0a6b'),(.5,'#8e1fa8'),(1,'#e8237f')], 0,0,1,1) + lg('mask', [(0,'#ff3d9a'),(1,'#7b2ff7')], 0,0,1,0) + lg('feather', [(0,'#ffd60a'),(1,'#ff7a00')])
    r = random.Random(23); cols = ['#ffd60a', '#00e0c6', '#ff3d9a', '#ffffff', '#7bff6b']
    conf = ''.join(f'<circle cx="{r.uniform(0,1920):.0f}" cy="{r.uniform(0,1080):.0f}" r="{r.uniform(5,14):.0f}" fill="{cols[i%5]}" class="tw" style="animation-delay:{r.uniform(0,3):.2f}s"/>' for i in range(70))
    stripes = ''.join(f'<rect x="{-500+i*300}" y="-400" width="130" height="1900" fill="#ffffff" opacity=".06" transform="rotate(28 960 540)"/>' for i in range(10))
    mask = ('<g class="pop d1 flo" filter="url(#shadow)" style="transform-origin:470px 360px">'
            '<path d="M220,330 C260,240 380,250 470,300 C560,250 680,240 720,330 C740,400 690,470 610,470 C550,470 510,430 470,410 C430,430 390,470 330,470 C250,470 200,400 220,330Z" fill="url(#mask)" stroke="url(#gold)" stroke-width="10"/>'
            '<path d="M290,350 C320,320 380,320 410,355 C380,390 320,390 290,350Z M530,355 C560,320 620,320 650,350 C620,390 560,390 530,355Z" fill="#2b0a4d"/>'
            '<path d="M720,320 C800,200 860,140 900,70 C880,170 840,240 760,330Z" fill="url(#feather)"/><path d="M730,340 C830,270 900,240 960,200 C910,280 840,320 750,360Z" fill="#00e0c6"/>'
            '<path d="M470,470 L470,640" stroke="url(#gold)" stroke-width="12" stroke-linecap="round"/></g>')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', stripes, conf, mask,
         '<g transform="rotate(-4 1300 560)">',
         text(EYEBROW, 1300, 380, 46, '#ffe066', 400, cls='in d2', ls=2),
         text('פורים', 1300, 590, 230, '#ffffff', 900, cls='pop d3', extra='filter="url(#tshadow)"'),
         text('שמח!', 1300, 790, 230, '#ffd60a', 900, cls='pop d4', extra='filter="url(#tshadow)"'),
         text('ונהפוך הוא — חג של שמחה וצחוק', 1300, 880, 50, '#ffe3f3', 400, cls='in d5'),
         etext('HAPPY PURIM', 1300, 940, 34, '#ffe066', 600, cls='in d6', ls=14), '</g>',
         sparkle(260, 760, 30, '#ffe066', .2), sparkle(1780, 180, 26, '#ffffff', .9), sparkle(860, 140, 20, '#ffe066', 1.4)]
    return defs, ''.join(b), {'logo': [150, 900, 340, 100]}

# ------------------------------------------------------------------ Pesach
def blossom(x, y, s, c='#ffb7d0', center='#ffd166', d=0):
    pet = ''.join(f'<ellipse cx="{x+math.cos(math.radians(a))*s*.55:.0f}" cy="{y+math.sin(math.radians(a))*s*.55:.0f}" rx="{s*.42:.0f}" ry="{s*.3:.0f}" fill="{c}" transform="rotate({a} {x+math.cos(math.radians(a))*s*.55:.0f} {y+math.sin(math.radians(a))*s*.55:.0f})"/>' for a in range(-90, 270, 72))
    return f'<g class="pop" style="animation-delay:{d}s">{pet}<circle cx="{x}" cy="{y}" r="{s*.2:.0f}" fill="{center}"/></g>'

def pesach():
    defs = lg('bg', [(0,'#d9f4f2'),(.6,'#f2fbf3'),(1,'#fff6e3')]) + lg('cup', [(0,'#f7dc8a'),(.5,'#c8962e'),(1,'#f3cf6b')], 0,0,1,0) + lg('wine', [(0,'#a3173b'),(1,'#5e0a22')])
    br = []
    def branch(path, flowers, d0):
        br.append(f'<path d="{path}" stroke="#6b4a32" stroke-width="12" fill="none" stroke-linecap="round" class="in"/>')
        for i, (x, y, s) in enumerate(flowers): br.append(blossom(x, y, s, ['#ffb7d0', '#ff9fc0', '#ffd1e1'][i % 3], d=d0 + i * .12))
    branch('M-20,120 C200,140 320,220 520,180 M180,150 C230,90 280,70 340,60', [(120,120,46),(260,170,40),(380,200,52),(520,180,44),(300,66,36),(440,140,30)], .2)
    branch('M1940,980 C1720,960 1600,890 1420,930 M1700,960 C1660,1020 1600,1040 1540,1050', [(1840,960,48),(1700,930,42),(1560,900,54),(1420,930,44),(1600,1040,36),(1480,980,30)], .6)
    cup = ('<g class="up d2" filter="url(#shadow)">'
           '<path d="M1490,400 L1710,400 C1710,520 1660,590 1600,600 C1540,590 1490,520 1490,400Z" fill="url(#cup)"/>'
           '<path d="M1508,420 L1692,420 C1688,500 1652,560 1600,566 C1548,560 1512,500 1508,420Z" fill="url(#wine)"/>'
           '<ellipse cx="1600" cy="420" rx="92" ry="12" fill="#c12a4e"/>'
           '<rect x="1588" y="596" width="24" height="120" fill="url(#cup)"/><ellipse cx="1600" cy="650" rx="26" ry="12" fill="url(#cup)"/>'
           '<path d="M1600,710 C1640,720 1680,740 1690,770 L1510,770 C1520,740 1560,720 1600,710Z" fill="url(#cup)"/>'
           '<rect x="1500" y="766" width="200" height="16" rx="8" fill="url(#cup)"/>'
           '<path d="M1520,430 C1530,500 1555,545 1585,560" stroke="#fff" stroke-width="8" fill="none" opacity=".35" stroke-linecap="round"/></g>')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', '<circle cx="1600" cy="520" r="300" fill="#ffd166" opacity=".18" filter="url(#soft)"/>', ''.join(br), cup,
         text(EYEBROW, 880, 330, 44, '#2a7f84', 400, cls='in d2', ls=2),
         text('חג פסח', 880, 520, 200, '#135b60', 900, cls='up d3'),
         text('כשר ושמח', 880, 700, 170, '#1f9aa0', 900, cls='up d4'),
         ornament(880, 770, 520, cls='in d5'),
         text('חג החירות והאביב', 880, 850, 52, '#2f6b6e', 400, cls='in d5'),
         etext('HAPPY PASSOVER', 880, 905, 32, '#c8962e', 400, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [710, 950, 340, 96]}

# ------------------------------------------------------------------ Independence Day
def firework(cx, cy, r, color, d):
    rays = ''.join(f'<line x1="{cx+math.cos(math.radians(a))*r*.25:.0f}" y1="{cy+math.sin(math.radians(a))*r*.25:.0f}" x2="{cx+math.cos(math.radians(a))*r:.0f}" y2="{cy+math.sin(math.radians(a))*r:.0f}" stroke="{color}" stroke-width="5" stroke-linecap="round"/>' for a in range(0, 360, 15))
    dots = ''.join(f'<circle cx="{cx+math.cos(math.radians(a+7))*r*1.1:.0f}" cy="{cy+math.sin(math.radians(a+7))*r*1.1:.0f}" r="5" fill="{color}"/>' for a in range(0, 360, 30))
    return f'<g class="tw" style="animation-delay:{d}s;animation-duration:2.8s">{rays}{dots}</g>'

def yom_haatzmaut():
    defs = lg('bg', [(0,'#ffffff'),(1,'#e8f0ff')]) + lg('blue', [(0,'#1f63e0'),(1,'#0038b8')], 0,0,1,0)
    wave = lambda y: f'M-20,{y} C300,{y-60} 640,{y+60} 960,{y} S1620,{y-60} 1940,{y}'
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>',
         f'<path d="{wave(150)} L1940,{150+120} C1620,{150+60} 1280,{150+180} 960,{150+120} S300,{150+60} -20,{150+120}Z" fill="url(#blue)" class="in"/>',
         f'<path d="{wave(810)} L1940,{810+120} C1620,{810+60} 1280,{810+180} 960,{810+120} S300,{810+60} -20,{810+120}Z" fill="url(#blue)" class="in"/>',
         f'<g class="pop d1">{star6(960, 560, 250, "#0038b8", 26, op=.09)}</g>',
         firework(170, 380, 100, '#1f63e0', .2), firework(1750, 380, 105, '#0038b8', .9), firework(150, 690, 70, '#7fb1ff', 1.5), firework(1770, 690, 70, '#7fb1ff', 2.1),
         text(EYEBROW, 960, 400, 46, '#1f63e0', 400, cls='in d2', ls=2),
         text('יום עצמאות שמח', 960, 600, 170, '#0038b8', 900, cls='up d3'),
         ornament(960, 670, 600, color='#0038b8', cls='in d4'),
         text('חג שמח למדינת ישראל', 960, 735, 52, '#1f4fa8', 400, cls='in d5'),
         etext('HAPPY INDEPENDENCE DAY', 960, 780, 28, '#5b7fc7', 400, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [790, 965, 340, 96]}

# ------------------------------------------------------------------ Lag BaOmer
def lag_baomer():
    defs = rg('bg', [(0,'#5a1d06'),(.45,'#250b03'),(1,'#0a0402')], cy=.85, r=.9) + rg('f1', [(0,'#fff3b0'),(.5,'#ffb52e'),(1,'#ff4d00')], cy=.8, r=.8) + \
        rg('f2', [(0,'#ffe066'),(1,'#ff7a00')], cy=.85) + lg('log', [(0,'#7a4520'),(1,'#3d2210')]) + rg('glowF', [(0,'#ff8a2a',.55),(.7,'#ff8a2a',.12),(1,'#ff8a2a',0)], r=.5)
    r = random.Random(31)
    sparks = ''.join(f'<circle cx="{960+r.uniform(-260,260):.0f}" cy="{r.uniform(260,760):.0f}" r="{r.uniform(3,8):.0f}" fill="{["#ffd27a","#ff9a3a","#fff1c4"][i%3]}" class="rise" style="animation-delay:{r.uniform(0,4):.2f}s;animation-duration:{r.uniform(2.5,5):.1f}s"/>' for i in range(50))
    fire = ('<g filter="url(#glow)">'
            f'<path d="{drop(960, 900, 460, 230, 0)}" fill="url(#f1)" class="fl"/>'
            f'<path d="{drop(840, 900, 300, 120, 0)}" fill="url(#f1)" class="fl" style="animation-delay:.3s"/>'
            f'<path d="{drop(1085, 900, 330, 130, 0)}" fill="url(#f1)" class="fl" style="animation-delay:.15s"/>'
            f'<path d="{drop(960, 900, 250, 100, 0)}" fill="#fff4c2" class="fl" style="animation-delay:.45s"/></g>')
    logs = ('<g filter="url(#shadow)"><rect x="700" y="880" width="520" height="56" rx="28" fill="url(#log)" transform="rotate(10 960 908)"/>'
            '<rect x="700" y="880" width="520" height="56" rx="28" fill="url(#log)" transform="rotate(-10 960 908)"/></g>')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', '<ellipse cx="960" cy="780" rx="760" ry="420" fill="url(#glowF)" class="in"/>',
         bokeh(32, 40, 0, 0, 1920, 500, '#ffffff', 1.5, 3, (.2,.7)), sparks, '<g class="up d1">', fire, logs, '</g>',
         text(EYEBROW, 960, 110, 44, '#ffc27a', 400, cls='in d2', ls=2),
         text('ל״ג בעומר שמח', 960, 285, 180, '#ffc95c', 900, cls='up d3', extra='filter="url(#tshadow)"'),
         text('חג של אור, אש ושמחה', 960, 360, 48, '#ffd9b0', 400, cls='in d5'),
         etext('HAPPY LAG BAOMER', 960, 412, 30, '#ff9a3a', 400, cls='in d6', ls=12)]
    css = '.rise{animation:rise 4s linear infinite}@keyframes rise{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-420px)}}'
    return defs, ''.join(b), {'logo': [1530, 960, 330, 92]}, css

# ------------------------------------------------------------------ Jerusalem Day
def yom_yerushalayim():
    defs = lg('sky', [(0,'#ffb35c'),(.5,'#ffd58a'),(1,'#fff0c8')]) + rg('sun', [(0,'#fffbe6'),(.5,'#ffe08a',.9),(1,'#ffc04d',0)]) + \
        lg('dome', [(0,'#fbf1dc'),(.5,'#e3cfa6'),(1,'#b89565')], 0,0,1,0) + lg('wall1', [(0,'#c99a52'),(1,'#a87a3a')]) + lg('wall2', [(0,'#9c6e30'),(1,'#7a5222')])
    def cren(y, x0, x1, h, w, gap, fill):
        return ''.join(f'<rect x="{x}" y="{y-h}" width="{w}" height="{h+2}" fill="{fill}"/>' for x in range(x0, x1, w + gap))
    far = ('<path d="M0,700 L120,690 L160,640 L200,690 L380,680 L420,600 L460,680 L700,690 L760,650 L820,690 L1120,680 L1180,620 L1240,680 L1500,690 L1560,630 L1620,690 L1920,680 V1080 H0Z" fill="#e8b46a" opacity=".7"/>')
    mid = (f'<rect x="0" y="760" width="1920" height="320" fill="url(#wall1)"/>{cren(760, 0, 1920, 34, 46, 30, "#c99a52")}'
           '<rect x="170" y="560" width="150" height="210" fill="url(#wall2)"/>' + cren(560, 170, 320, 26, 30, 20, '#9c6e30') +
           '<rect x="225" y="470" width="40" height="90" fill="url(#wall2)"/><path d="M215,470 Q245,410 275,470Z" fill="#9c6e30"/>'
           '<path d="M820,760 L820,640 L870,600 L1050,600 L1100,640 L1100,760Z" fill="url(#wall2)"/><rect x="900" y="560" width="120" height="44" fill="#8a5f28"/>'
           '<path d="M880,565 C880,440 1040,440 1040,565Z" fill="url(#dome)" />'
           '<rect x="1560" y="600" width="130" height="170" fill="url(#wall2)"/>' + cren(600, 1560, 1690, 24, 26, 18, '#9c6e30') +
           ''.join(f'<path d="M{x},760 C{x-22},700 {x-18},620 {x},560 C{x+18},620 {x+22},700 {x},760Z" fill="#4f6b2a"/>' for x in (520, 560, 1300, 1340, 1780)))
    arches = ''.join(f'<path d="M{x},1080 L{x},960 Q{x+30},920 {x+60},960 L{x+60},1080Z" fill="#8a5f28" opacity=".55"/>' for x in range(40, 1920, 140))
    b = ['<rect width="1920" height="1080" fill="url(#sky)"/>', '<circle cx="960" cy="560" r="330" fill="url(#sun)" class="in"/>',
         bokeh(41, 14, 0, 0, 1920, 500, '#ffffff', 20, 60, (.05,.15), 'flo'),
         f'<g class="up">{far}</g>', f'<g class="up d1">{mid}{arches}</g>',
         text(EYEBROW, 960, 110, 44, '#7a4a12', 400, cls='in d2', ls=2),
         text('יום ירושלים שמח', 960, 290, 190, '#5c3509', 900, cls='up d3'),
         ornament(960, 350, 560, cls='in d4'),
         text('ירושלים של זהב', 960, 420, 54, '#7a4a12', 400, cls='in d5'),
         etext('HAPPY JERUSALEM DAY', 960, 470, 30, '#9c6e30', 400, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [790, 960, 340, 96]}

# ------------------------------------------------------------------ Shavuot
def wheat(x, y, h, angle, color='#e0a62e', d=0):
    a = math.radians(angle); ex, ey = x + math.sin(a) * h, y - math.cos(a) * h
    out = [f'<path d="M{x},{y} Q{(x+ex)/2+math.cos(a)*30:.0f},{(y+ey)/2:.0f} {ex:.0f},{ey:.0f}" stroke="#b8862a" stroke-width="5" fill="none"/>']
    for i in range(9):
        t = .55 + i * .05; px, py = x + (ex - x) * t, y + (ey - y) * t
        for s in (-1, 1):
            out.append(f'<ellipse cx="{px+s*14:.0f}" cy="{py:.0f}" rx="9" ry="20" fill="{color}" transform="rotate({angle+s*28:.0f} {px+s*14:.0f} {py:.0f})"/>')
    out.append(f'<ellipse cx="{ex:.0f}" cy="{ey-8:.0f}" rx="8" ry="18" fill="{color}" transform="rotate({angle} {ex:.0f} {ey-8:.0f})"/>')
    return f'<g class="up" style="animation-delay:{d}s">{"".join(out)}</g>'

def shavuot():
    defs = lg('bg', [(0,'#fffaf0'),(.6,'#fdf1cf'),(1,'#f6dfa0')]) + lg('hill1', [(0,'#c9dd7e'),(1,'#9fc456')]) + lg('hill2', [(0,'#a9c95a'),(1,'#6d9a2c')]) + \
        lg('milk', [(0,'#ffffff'),(1,'#e8eef5')], 0,0,1,0)
    r = random.Random(51)
    fieldL = ''.join(wheat(60 + i * 46, 1000, r.uniform(300, 420), r.uniform(-18, 14), ['#e0a62e', '#d4952a', '#ecb848'][i % 3], .1 * i) for i in range(9))
    fieldR = ''.join(wheat(1460 + i * 46, 1000, r.uniform(300, 420), r.uniform(-14, 18), ['#e0a62e', '#d4952a', '#ecb848'][i % 3], .1 * i) for i in range(10))
    jug = ('<g class="pop d3" filter="url(#shadow)"><path d="M1290,600 L1400,600 L1395,640 C1440,660 1450,720 1420,760 L1410,770 L1400,880 C1398,900 1290,900 1288,880 L1280,700 C1278,660 1285,630 1290,600Z" fill="url(#milk)"/>'
           '<path d="M1420,680 C1470,690 1470,760 1415,770" stroke="#dfe7f0" stroke-width="14" fill="none"/><rect x="1282" y="590" width="126" height="18" rx="9" fill="#cfd8e3"/></g>')
    b = ['<rect width="1920" height="1080" fill="url(#bg)"/>', '<circle cx="960" cy="200" r="380" fill="#fff3c4" opacity=".7" filter="url(#soft)"/>',
         '<path d="M-100,860 Q500,740 1100,840 T2020,800 V1080 H-100Z" fill="url(#hill1)" class="up"/>',
         '<path d="M-100,950 Q700,860 1300,930 T2020,900 V1080 H-100Z" fill="url(#hill2)" class="up d1"/>', fieldL, fieldR, jug,
         text(EYEBROW, 960, 230, 44, '#7a8a2a', 400, cls='in d2', ls=2),
         text('חג שבועות שמח', 960, 420, 190, '#3f5f17', 900, cls='up d3'),
         ornament(960, 485, 560, cls='in d4'),
         text('חג הביכורים — שנה של שפע וברכה', 960, 565, 52, '#5b6b2a', 400, cls='in d5'),
         etext('HAPPY SHAVUOT', 960, 620, 30, '#b8862a', 400, cls='in d6', ls=12)]
    return defs, ''.join(b), {'logo': [790, 680, 340, 96]}

DESIGNS = dict(rosh_hashana=rosh_hashana, yom_kippur=yom_kippur, sukkot=sukkot, simchat_torah=simchat_torah, hanukkah=hanukkah, tu_bishvat=tu_bishvat,
               purim=purim, pesach=pesach, yom_haatzmaut=yom_haatzmaut, lag_baomer=lag_baomer, yom_yerushalayim=yom_yerushalayim, shavuot=shavuot)

# Type pairing per holiday: (headline, secondary, latin line, scales). Chosen to carry each day's mood.
THEMES = dict(
    rosh_hashana=('frank-900', 'frank-500', 'frank-500', 1.0, 1.05, 1.0),          # classic, sweet, festive serif
    yom_kippur=('bellefair', 'bellefair', 'bellefair', 1.05, 1.05, 1.0),            # light, solemn, refined
    sukkot=('amatic', 'amatic', 'amatic', 1.45, 1.6, 1.5),                          # hand-made, like sukkah decorations
    simchat_torah=('suez', 'assistant-500', 'assistant-500', 1.0, 1.0, 1.0),        # scribe-like serif with joy
    hanukkah=('karantina-700', 'assistant-300', 'karantina-400', 1.55, 1.05, 1.5),  # tall letters, like candles
    tu_bishvat=('secular', 'assistant-500', 'assistant-500', 1.0, 1.0, 1.0),       # warm, rounded, alive
    purim=('bubbles', 'rubik-500', 'rubik-700', 1.0, 1.0, 1.0),                     # inflated carnival letters
    pesach=('david-700', 'david-500', 'david-500', 1.1, 1.1, 1.1),                  # Haggadah tradition
    yom_haatzmaut=('rubik-900', 'rubik-500', 'rubik-700', 1.0, 1.0, 1.0),           # bold, modern Israeli poster
    lag_baomer=('burned', 'heebo-500', 'heebo-800', 1.0, 1.0, 1.0),                 # letters scorched by the bonfire
    yom_yerushalayim=('noto-900', 'noto-500', 'noto-500', 1.0, 1.0, 1.0),           # carved Jerusalem-stone serif
    shavuot=('varela', 'varela', 'varela', 1.0, 1.0, 1.0),                          # soft and round, milk and harvest
)

# The Eitan Medical logo, drawn into each artwork: centre x, centre y, width, wordmark colour, mark fill.
BRAND = dict(
    rosh_hashana=(1610, 1000, 290, '#fff4e6', '#fff4e6'),
    yom_kippur=(960, 975, 270, '#ffffff', 'url(#brandG)'),
    sukkot=(960, 985, 270, '#5a3b1c', 'url(#brandG)'),
    simchat_torah=(960, 990, 270, '#ffffff', 'url(#brandG)'),
    hanukkah=(1715, 990, 270, '#ffffff', 'url(#brandG)'),
    tu_bishvat=(1590, 995, 280, '#ffffff', '#ffffff'),
    purim=(310, 960, 300, '#ffffff', '#ffffff'),
    pesach=(880, 985, 270, '#135b60', 'url(#brandG)'),
    yom_haatzmaut=(960, 1015, 230, '#2a292a', 'url(#brandG)'),
    lag_baomer=(1710, 1000, 270, '#ffffff', 'url(#brandG)'),
    yom_yerushalayim=(960, 1012, 250, '#ffffff', '#ffffff'),
    shavuot=(960, 720, 260, '#2a292a', 'url(#brandG)'),
)

def build(k):
    h, s_, e, hs, ss, es = THEMES[k]
    theme(h, s_, e, hs, ss, es)
    res = DESIGNS[k](); defs, body = res[:2]; css = res[3] if len(res) > 3 else ''
    cx, cy, w, word, mark = BRAND[k]
    return svg(defs, body + brand(cx, cy, w, word, mark), css)

if __name__ == '__main__':
    out_dir = sys.argv[1]
    for k in (sys.argv[2:] or DESIGNS):
        s = build(k)
        open(os.path.join(out_dir, f'{k}.svg'), 'w', encoding='utf8').write(s)
        print(k, len(s))
