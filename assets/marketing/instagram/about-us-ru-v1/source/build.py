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
 s+=text(f'{n:02} / 04',f'Story {n} of 4',905,1680,24,col,width=100,name='Story-number')
 doc=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Omnica English — About us — {n:02}</title><desc>Russian Instagram Story. Live editable Arial text, named vector groups, original vector logo. English translation supplied separately.</desc>{s}</svg>'
 (OUT/'editable'/f'{n:02}-story.svg').write_text(doc)
def arrow(x,y,length=180,c=P):return path(f'M{x} {y} h{length} m-40 -35 40 35 -40 35',c,6)
# 01 — a typographic introduction, deliberately no invented portrait or photo placeholder.
s=base(1)
s+=text('ЛИЧНАЯ ЗАМЕТКА','A PERSONAL NOTE',80,370,27,P,True,name='Letter-label')
s+=text('Я Мустафа.','I’m Mustafa.',80,575,108,P,True)
s+=text('Основатель Omnica English.','Founder of Omnica English.',80,740,47,P)
s+=group('Letter-opening-rule',path('M80 865 H450',Y,9))
s+=text('Хочу, чтобы изучение английского\nбыло понятнее, а преподавателям\nбыло проще вести занятия.','I want learning English to feel clearer and teaching lessons to be easier.',80,1030,46,INK,lh=67)
s+=text('Вот с чего всё началось.','Here’s how it started.',80,1440,54,P,True)
s+=group('Letter-continuation-arrow',arrow(80,1540,250,P))
end(1,s)
# 02 — confirmed origin: the founder drew on the experience of teacher friends.
s=base(2)
s+=text('Идея выросла\nиз разговоров.','The idea grew from conversations.',80,490,85,P,True,102)
s+=text('Когда я начинал Omnica English,\nя опирался на опыт друзей —\nпреподавателей английского.','When I started Omnica English, I drew on the experience of friends who teach English.',80,790,45,INK,lh=65)
s+=group('Teacher-conversations',path('M120 1110 H450 V1280 H240 L120 1360 Z',P,6)+path('M540 1190 H950 V1380 H820 L700 1460 V1380 H540 Z',P,6))
s+=text('Опыт','Experience',155,1220,54,P,True,width=270,name='Conversation-experience')
s+=text('Идея','Idea',650,1310,60,P,True,width=280,name='Conversation-idea')
s+=text('Создано с учётом опыта преподавателей.','Built with input from teachers’ experience.',80,1600,38,P)
end(2,s)
# 03 — two complementary aims; aspirations, not guarantees or feature demonstrations.
s=base(3,Y)
s+=text('Две стороны.\nОдна идея.','Two sides. One idea.',80,490,86,P,True,103)
s+=text('Я хотел сделать полезный инструмент\nдля обеих сторон урока.','I wanted to build something useful for both sides of a lesson.',80,755,42,P,lh=59)
s+=rect(80,920,920,250,C,28)
s+=text('ДЛЯ ПРЕПОДАВАТЕЛЯ','FOR THE TEACHER',115,990,28,P,True,width=850)
s+=text('Проще вести занятия.','Easier to run lessons.',115,1100,59,P,True,width=850)
s+=rect(80,1220,920,250,C,28)
s+=text('ДЛЯ ВАС','FOR YOU',115,1290,28,P,True,width=850)
s+=text('Понятнее учиться.','A clearer learning experience.',115,1400,62,P,True,width=850)
s+=text('Так я вижу задачу Omnica English.','That is how I see the purpose of Omnica English.',80,1600,39,P)
end(3,s,Y)
# 04 — a signed letter ending: type-set name, no fabricated handwritten signature.
s=base(4,P)
s+=text('Чтобы вы знали,\nчто дальше.','So you know what comes next.',80,490,84,C,True,101)
s+=group('Founder-letter-paper',rect(80,790,920,720,C,28))
s+=text('Для меня важно, чтобы вы понимали,\nнад чем работаете сейчас\nи что можно сделать дальше.','What matters to me is that you understand what you’re working on now and what you can do next.',120,930,43,INK,lh=62,width=840)
s+=text('С этой идеей я и начал\nOmnica English.','That is the idea I started Omnica English with.',120,1195,46,P,True,65,width=840)
s+=group('Signature-rule',path('M120 1320 H340',Y,6))
s+=text('Мустафа','Mustafa',120,1410,58,P,True,width=840,name='Typographic-founder-signature')
s+=text('Основатель Omnica English','Founder of Omnica English',480,1410,28,P,width=480,name='Signature-role')
s+=text('Рад знакомству.','It’s nice to meet you.',80,1610,40,C)
end(4,s,P)
# Cover continues the supplied icon system: conversations within a circular-safe disk.
current=0
rear=path('M350 820 H620 V1010 H440 L350 1080 Z',P,7)
front=path('M500 950 H735 V1130 H645 L565 1190 V1130 H500 Z',P,7).replace('fill="none"',f'fill="{Y}"')
cover=rect(0,0,1080,1920,P)+group('Circular-safe-conversation-icon',circle(540,960,300,Y)+rear+front)
(OUT/'editable'/'00-cover.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>О нас — About us</title>{cover}</svg>')
components=rect(0,0,1080,1920,C)+group('Letter-paper',rect(80,350,920,720,L,28))+group('Signature-rule',path('M120 1170 H340',Y,6))+group('Conversation-symbol',path('M540 1200 H900 V1390 H760 L650 1460 V1390 H540 Z',P,7))+group('Footer-wave',path('M-30 1720 C235 1600 565 1840 1110 1670',Y,7))
(OUT/'editable'/'components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">{components}</svg>')
(OUT/'source'/'manifest.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
(OUT/'source'/'text-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
review=['# О нас / About us — complete Russian copy and English translation','', 'Four Stories, written as a personal note from Mustafa for his review. Highlight name: «О нас» = “About us”. Original logo reads “Omnica English”. The cover has no visible text.','', 'This is newly drafted first-person marketing copy based on Mustafa’s supplied founder story, not a transcript or an outside testimonial. The two conversation labels on Story 2 are a diagram (“Experience” and “Idea”), not attributed quotes.','']
for n in range(1,5):
 review += [f'## Story {n:02}', '']
 for entry in copy:
  if entry['story']==n:review+=['**RU:** '+entry['ru'],'','**EN:** '+entry['en'],'']
review+=['## Editorial and posting notes','',
'- Confirmed foundation: Mustafa founded Omnica English with input from friends who teach English, aiming to make teaching easier and learning more structured. The first-person copy develops that supplied purpose without adding dates, credentials, personal history or customer results.',
'- The four Stories introduce the founder, the teacher input, the two-sided purpose and a personal closing. They contain no product walkthrough, offer table or repeated teacher biography.',
'- Publish PNGs 01–04 in order; 00 is the cover. All are 1080 × 1920. Editable SVGs retain live Arial text, named vector groups and the original vector logo.',
'- “Мустафа” is the Russian rendering of Mustafa. The closing name is typeset, not an imitation of a handwritten signature.',
'- The letter is intentionally text-led: there is no portrait and no empty photo placeholder to remove before posting.',
'- The supplied cream/purple/yellow palette and curved footer continue the approved visual reference. Previous asset folders are preserved.',
'- Native Affinity 3.3.1 import/editing remains unverified. Phone-size renders, wrapping, SVG structure and dimensions are checked. No generated imagery, browser QA or Instagram publication.',
'- This finishes the selected six-highlight set: Start, Teachers (existing template), How we learn, Library, Pricing and About us. FAQ and Reviews are excluded at Mustafa’s request; their older files remain preserved.']
(OUT/'review'/'english-and-russian.md').write_text('\n'.join(review)+'\n')
print('Built four Stories, cover and reusable components; checked',len(checks),'text lines.')
