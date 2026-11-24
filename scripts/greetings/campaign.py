"""Build self-contained campaign artwork; usage: python campaign.py sources.json.
Sources maps holiday keys to generated PNG files. Existing fonts remain embedded offline.
"""
import sys, json, base64
from pathlib import Path
from html import escape
from typo import face, advance, brand, brand_defs

DESIGNS = {
 'rosh_hashana': ('שנה טובה', 'ומתוקה', 'SHANA TOVA', 'frank-900', '#641f29', '#f9ecd9'),
 'yom_kippur': ('גמר חתימה', 'טובה', 'A MOMENT OF REFLECTION', 'bellefair', '#384e56', '#faf7ee'),
 'sukkot': ('חג סוכות', 'שמח', 'HAPPY SUKKOT', 'suez', '#174738', '#f1eddb'),
 'simchat_torah': ('שמחת תורה', 'שמחה', 'HAPPY SIMCHAT TORAH', 'david-700', '#f9e3af', '#102648'),
 'hanukkah': ('חנוכה', 'שמח ומלא אור', 'HAPPY HANUKKAH', 'noto-900', '#ffe2a2', '#091a35'),
 'tu_bishvat': ('ט״ו בשבט', 'שמח', 'HAPPY TU BISHVAT', 'amatic', '#285036', '#eef0db'),
 'purim': ('פורים', 'שמח!', 'HAPPY PURIM', 'bubbles', '#fff1c7', '#47203d'),
 'pesach': ('חג פסח', 'כשר ושמח', 'HAPPY PASSOVER', 'bellefair', '#355e54', '#f5eddb'),
 'yom_haatzmaut': ('יום עצמאות', 'שמח', 'HAPPY INDEPENDENCE DAY', 'secular', '#0b3c82', '#eaf3fc'),
 'lag_baomer': ('ל״ג בעומר', 'שמח', 'HAPPY LAG BAOMER', 'karantina-700', '#ffcf8c', '#101b2a'),
 'yom_yerushalayim': ('יום ירושלים', 'שמח', 'HAPPY JERUSALEM DAY', 'frank-500', '#694527', '#f7ebd4'),
 'shavuot': ('חג שבועות', 'שמח', 'HAPPY SHAVUOT', 'david-500', '#36523c', '#f8f6e9'),
}
root=Path(__file__).resolve().parents[2]
sources=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
for key,(line1,line2,en,font,ink,paper) in DESIGNS.items():
 data=base64.b64encode(Path(sources[key]).read_bytes()).decode()
 size=min(150, 710 / max(advance(font,line1,1),advance(font,line2,1)))
 faces=face('Headline',font,line1+line2)+face('Sub','assistant-500',en+'מאיתנו, משפחת איתן מדיקל')
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
 <defs>{brand_defs()}<linearGradient id="veil"><stop offset=".42" stop-color="{paper}" stop-opacity="0"/><stop offset=".73" stop-color="{paper}" stop-opacity=".87"/><stop offset="1" stop-color="{paper}" stop-opacity=".96"/></linearGradient></defs>
 <style>{faces}</style>
 <image width="1920" height="1080" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,{data}"/>
 <path fill="url(#veil)" d="M0 0h1920v1080H0z"/>
 <g fill="{ink}" text-anchor="middle">
 {brand(1440,270,340,word=ink,cls='')}
 <path d="M1395 340h90" stroke="{ink}" stroke-width="2" opacity=".5"/>
 <text x="1440" y="510" direction="rtl" font-family="Headline" font-size="{size}">{escape(line1)}</text>
 <text x="1440" y="680" direction="rtl" font-family="Headline" font-size="{size}">{escape(line2)}</text>
 <text x="1440" y="765" font-family="Sub" font-size="26" letter-spacing="3">{en}</text>
 <text x="1440" y="925" direction="rtl" font-family="Sub" font-size="34">מאיתנו, משפחת איתן מדיקל</text>
 </g>
 </svg>'''
 (root/'public/shared/greetings'/f'{key}.svg').write_text(svg,encoding='utf-8')
 print(key, round(len(svg)/1024), 'KB')
