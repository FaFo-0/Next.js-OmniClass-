from pathlib import Path
from PIL import ImageFont
import html, json, re, shutil
OUT=Path(__file__).resolve().parents[1]
ROOT=OUT.parents[3]
for d in ['editable','exports','originals','review']:(OUT/d).mkdir(exist_ok=True)
P='#6716A4'; Y='#FFCA00'; C='#FFF9ED'; L='#EBDDF3'; INK='#35223E'
FONT='/System/Library/Fonts/Supplemental/Arial'
checks=[]; copy=[]; current=0; serial=0
esc=lambda s:html.escape(str(s),quote=True)
def group(name,s):
 global serial
 serial+=1
 return f'<g id="{re.sub("[^a-zA-Z0-9_-]","-",name)}-{serial}">{s}</g>'
def rect(x,y,w,h,c,rad=0):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rad}" fill="{c}"/>'
def path(d,c=P,sw=5):return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
def circle(x,y,r,c):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>'
def text(ru,en,x,y,size=40,color=P,bold=False,lh=None,width=920,name='Copy'):
 lines=ru.split('\n'); lh=lh or size*1.22
 font=ImageFont.truetype(FONT+(' Bold' if bold else '')+'.ttf',size)
 for i,line in enumerate(lines):
  measured=font.getlength(line)
  assert measured<=width, (current,line,measured,width)
  assert x+measured<=1005, (current,line,'outside right margin')
  assert y+i*lh<=1700, (current,line,'outside vertical safe area')
  checks.append({'story':current,'text':line,'width':round(measured,2),'allowed':width,'baseline':y+i*lh})
 copy.append({'story':current,'ru':ru.replace('\n',' '),'en':en})
 return group(name,f'<text font-family="Arial" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">'+''.join(f'<tspan x="{x}" y="{y+i*lh:g}">{esc(t)}</tspan>' for i,t in enumerate(lines))+'</text>')
logosrc=ROOT/'assets/marketing/instagram/introduction-carousel-ru-v3/originals/omnica-logo-vector.svg'
shutil.copy2(logosrc,OUT/'originals'/logosrc.name)
raw=logosrc.read_text(); logo_inner=raw[raw.index('>',raw.index('<svg'))+1:raw.rindex('</svg>')]
def logo(dark=False):
 return group('Original-vector-logo',(rect(70,208,298,113,C,12) if dark else '')+f'<svg x="84" y="222" width="270" height="92" viewBox="0 0 2399 814">{logo_inner}</svg>')
def base(n,bg=C):
 global current
 current=n
 return group('Background',rect(0,0,1080,1920,bg))+logo(bg==P)
def end(n,s,bg=C):
 col=Y if bg==P else P
 s+=group('Reference-footer-wave',path('M-30 1720 C235 1600 565 1840 1110 1670',Y,7))
 s+=text('omnicaenglish.com','omnicaenglish.com',80,1680,25,col,name='Website')
 s+=text(f'{n:02} / 03',f'Story {n} of 3',905,1680,24,col,width=100,name='Story-number')
 doc=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Omnica English — Pricing — {n:02}</title><desc>Russian Instagram Story. Live editable Arial text, named vector groups, original vector logo. English translation supplied separately.</desc>{s}</svg>'
 (OUT/'editable'/f'{n:02}-story.svg').write_text(doc)
def arrow(x,y,length=180,c=P):return path(f'M{x} {y} h{length} m-40 -35 40 35 -40 35',c,6)
PRICES_URL='https://omnicaenglish.com/prices?lang=ru'
# 01 — one destination for current prices, with room for Instagram's actual link sticker.
s=base(1,P)
s+=text('Все цены —\nв одном месте.','All prices in one place.',80,490,88,C,True,104)
s+=text('Пробный урок, пакеты занятий\nи доступные валюты — на сайте.','The trial lesson, lesson packs and available currencies are on the website.',80,790,43,C,lh=60)
s+=text('omnicaenglish.com/prices','omnicaenglish.com/prices',80,1040,52,Y,True,name='Pricing-page-address')
s+=text('Нажмите на ссылку ниже.','Tap the link below.',80,1210,43,C)
s+=group('Arrow-to-native-link-sticker',path('M540 1260 V1340 M510 1310 L540 1340 L570 1310',Y,7))
# Leave x=200..880, y=1380..1510 empty for the native tappable Link sticker.
end(1,s,P)
# 02 — the few details to check before requesting; no duplicated learning walkthrough.
s=base(2)
s+=text('Перед записью.','Before you book.',80,490,88,P,True)
s+=rect(80,715,920,180,Y,28)
s+=text('Пробный урок — платный.','The trial lesson is paid.',115,825,54,P,True,width=850)
s+=text('В карточке пакета указаны:','Each pack card shows:',80,1060,44,INK)
for y,ru,en in [(1190,'Количество уроков','Number of lessons'),(1320,'Срок действия','Validity period'),(1450,'Что входит в стоимость','What’s included in the price')]:
 s+=circle(105,y-15,12,Y)
 s+=text(ru,en,150,y,47,P,True,width=850)
s+=text('Сравните условия на странице цен.','Compare the terms on the pricing page.',80,1600,38,INK)
end(2,s)
# 03 — the real academy-assisted payment flow, stated in two short actions.
s=base(3)
s+=text('Как оплатить?','How do you pay?',80,490,88,P,True)
for y,num,ru,en in [(820,'01','Выберите пакет на сайте\nи оставьте заявку.','Choose a pack on the website and submit a request.'),(1160,'02','Мы свяжемся с вами в WhatsApp\nи согласуем оплату.','We’ll contact you on WhatsApp to arrange payment.')]:
 s+=circle(115,y,35,Y)+text(num,num,95,y+12,26,P,True,width=45)
 s+=text(ru,en,185,y+15,43,P,True,62,width=815)
s+=path('M80 1440 H1000',Y,6)
s+=text('Есть вопросы?\nНапишите нам в Direct.','Questions? Message us in Direct.',80,1540,43,INK,lh=58)
end(3,s)
# Reference-style price-tag cover: all of the mark fits within the yellow disk.
current=0
mark=path('M390 810 H550 L730 990 L550 1170 L390 1010 Z',P,7)
mark+='<circle cx="435" cy="860" r="13" fill="none" stroke="'+P+'" stroke-width="6"/>'
cover=rect(0,0,1080,1920,P)+group('Circular-safe-price-tag',circle(540,960,300,Y)+mark)
(OUT/'editable'/'00-cover.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Цены — Pricing</title>{cover}</svg>')
components=rect(0,0,1080,1920,C)+group('Important-detail-panel',rect(80,350,920,180,Y,28))+group('Action-marker',circle(115,820,35,Y))+group('Link-pointer',path('M540 1100 V1180 M510 1150 L540 1180 L570 1150',P,7))+group('Footer-wave',path('M-30 1720 C235 1600 565 1840 1110 1670',Y,7))
(OUT/'editable'/'components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">{components}</svg>')
(OUT/'source'/'manifest.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
(OUT/'source'/'text-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
posting={
 'highlight_name_ru':'Цены',
 'highlight_name_en':'Pricing',
 'story':1,
 'sticker_type':'Instagram Link',
 'url':PRICES_URL,
 'suggested_label_ru':'Смотреть цены',
 'suggested_label_en':'View prices',
 'recommended_bounds':{'x':200,'y':1380,'width':680,'height':130},
 'note':'The PNG/SVG cannot create a native tappable Instagram sticker. Add it in Instagram before publishing Story 1.'
}
(OUT/'source'/'posting.json').write_text(json.dumps(posting,ensure_ascii=False,indent=2))
review=['# Цены / Pricing — Russian copy and complete English translation','', 'Three Stories in posting order. Name the highlight «Цены» (“Pricing”). The original logo reads “Omnica English”; the cover has no visible text.','']
for n in range(1,4):
 review += [f'## Story {n:02}', '']
 for entry in copy:
  if entry['story']==n:review+=['**RU:** '+entry['ru'],'','**EN:** '+entry['en'],'']
review+=['## Add the actual Link sticker before posting Story 1','',
'- URL: '+PRICES_URL,
'- Suggested visible Russian label: **Смотреть цены**.',
'- English meaning: **View prices**.',
'- Place the native Instagram Link sticker in the reserved blank area beneath the arrow: approximately x=200–880, y=1380–1510 on the 1080 × 1920 canvas.',
'- The printed URL is not a tappable sticker. Add the real sticker in Instagram before publishing, then save the posted Story to the Pricing highlight. The art and posting.json contain the destination, not an active Instagram link.',
'', '## Editing and posting notes','',
'- PNGs 01–03 are the posting order; 00 is the cover. All are 1080 × 1920. Editable SVGs retain live Arial text, named vector groups and the original vector logo.',
'- Current prices, currencies, quantities, validity and package benefits stay on the pricing page. No fixed amounts, discounts, expiry numbers or payment-method details are baked into the artwork.',
'- Payment wording follows the existing academy-assisted request flow. Full business terms remain in [POLICY.md](../../../../../POLICY.md); no policy was changed.',
'- Complete English translations include the printed URL, recurring footer and numbering, plus the suggested sticker label above.',
'- Native Affinity 3.3.1 import/editing remains unverified. Phone-size renders, text widths, SVG structure and output dimensions are checked. No browser QA or Instagram posting.',
'- Previous asset folders are preserved. No generated imagery, photos or screenshots are used.']
(OUT/'review'/'english-and-russian.md').write_text('\n'.join(review)+'\n')
print('Built three Stories, cover and reusable components; checked',len(checks),'text lines.')
