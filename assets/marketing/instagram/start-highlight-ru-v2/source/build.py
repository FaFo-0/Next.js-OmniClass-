from pathlib import Path
from PIL import Image, ImageFont
import base64, html, json, re, shutil
OUT=Path(__file__).resolve().parents[1]
ROOT=OUT.parents[3]
for d in ['editable','exports','originals','crops','review']:(OUT/d).mkdir(exist_ok=True)
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
 s+=text(f'{n:02} / 09',f'Story {n} of 9',905,1680,24,col,width=100,name='Story-number')
 doc=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Omnica English — Start — {n:02}</title><desc>Russian Instagram Story. Live editable Arial text, named vector groups, original vector logo and pre-cropped embedded real screenshots. English translation supplied separately.</desc>{s}</svg>'
 (OUT/'editable'/f'{n:02}-story.svg').write_text(doc)
def crop(source,name,box):
 src=ROOT/source; shutil.copy2(src,OUT/'originals'/src.name)
 Image.open(src).crop(box).save(OUT/'crops'/name)
def shot(name,x,y,w,h):
 data=base64.b64encode((OUT/'crops'/name).read_bytes()).decode()
 return group('Real-screenshot-'+name,rect(x-9,y-9,w+18,h+18,P,12)+f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="none" xlink:href="data:image/png;base64,{data}"/>')
def pill(ru,en,x,y,w,c=Y):return group('Topic-pill',rect(x,y,w,78,c,20)+text(ru,en,x+25,y+51,32,P,True,width=w-45))
def arrow(x,y,length=180,c=P):return path(f'M{x} {y} h{length} m-40 -35 40 35 -40 35',c,6)
# All raster viewports are physically cropped before embedding: no clipping masks.
crop('assets/marketing/instagram/story-highlights-ru-v1/originals/11-flashcard-answer-ru.jpg','flashcard-answer.png',(10,175,380,515))
crop('assets/marketing/instagram/story-highlights-ru-v1/originals/16-homework-reviewed-ru.jpg','reviewed-homework.png',(10,65,380,375))
# 01 — purple invitation; a strong opening and three distinct promises.
s=base(1,P)
s+=text('Ваш английский.\nС чего начнём?','Your English. Where shall we start?',80,480,88,C,True,102,name='Opening-headline')
s+=text('Индивидуальные онлайн-уроки\nи практика между занятиями —\nв Omnica English.','Individual online lessons and practice between lessons — at Omnica English.',80,755,44,C,lh=59)
for y,num,ru,en in [(1040,'01','Занимайтесь с преподавателем','Learn with a teacher'),(1190,'02','Сохраняйте и повторяйте слова','Save and review words'),(1340,'03','Читайте бесплатно','Read for free')]:
 s+=circle(115,y+18,35,Y)+text(num,num,95,y+29,26,P,True,width=50)
 s+=text(ru,en,180,y+30,39,C,width=820)
s+=text('Листайте — покажем, как всё устроено.','Keep going — we’ll show you how it works.',80,1550,34,Y)
end(1,s,P)
# 02 — goals, generous stacked strips, no quiz-like fake controls.
s=base(2)
s+=text('Для чего вам\nанглийский?','What do you need English for?',80,470,83,P,True,96)
s+=text('Начните с того, что важно именно вам.','Start with what matters to you.',80,700,39,INK)
for y,title,en,body,ben in [(810,'В повседневной жизни','In everyday life','Общаться, знакомиться, путешествовать.','Talk to people, meet new people and travel.'),(1040,'На работе','At work','Участвовать в разговорах и переписке.','Take part in conversations and written communication.'),(1270,'Для себя','For yourself','Вернуться к занятиям после перерыва.','Return to learning after a break.')]:
 s+=rect(80,y,920,194,Y if y==810 else L,24)
 s+=text(title,en,112,y+65,43,P,True,width=855)
 s+=text(body,ben,112,y+127,34,INK,width=855)
s+=text('Расскажите о своей цели преподавателю.','Tell your teacher about your goal.',80,1560,37,P)
end(2,s)
# 03 — spacious two-person diagram and format facts.
s=base(3)
s+=text('Вы и преподаватель.\nОдин на один.','You and your teacher. One to one.',80,465,77,P,True,94)
s+=group('Two-person-lesson',circle(287,840,124,L)+circle(793,840,124,Y)+path('M430 840 H650 M613 807 l37 33 -37 33')+circle(287,805,30,P)+path('M224 897 v-16 c0-69 126-69 126 0 v16',P,8)+circle(793,805,30,P)+path('M730 897 v-16 c0-69 126-69 126 0 v16',P,8))
s+=text('ВЫ','YOU',255,1035,33,P,True,width=200)
s+=text('ПРЕПОДАВАТЕЛЬ','TEACHER',620,1035,31,P,True,width=390)
s+=text('Онлайн в Google Meet.','Online through Google Meet.',80,1200,49,P,True)
s+=text('Обсуждайте, задавайте вопросы\nи разбирайте сложные моменты\nвместе с преподавателем.','Discuss things, ask questions and work through difficult points with your teacher.',80,1300,43,INK,lh=59)
s+=pill('Без группы', 'No group',80,1530,290)
end(3,s)
# 04 — a connected vertical learning sequence.
s=base(4)
s+=text('Урок закончился.\nЧто дальше?','The lesson is over. What comes next?',80,470,80,P,True,96)
s+=text('Продолжайте практику\nв личном кабинете.','Continue practising in your personal account.',80,705,43,INK,lh=58)
s+=path('M119 910 V1440',P,5)
for y,num,ru,en,body,ben in [(900,'1','Материалы урока','Lesson materials','Вернитесь к тому, что вы разбирали.','Return to what you worked through.'),(1120,'2','Слова и карточки','Words and flashcards','Повторите сохранённую лексику.','Review your saved vocabulary.'),(1340,'3','Домашнее задание','Homework','Закрепите материал и получите отзыв.','Practise the material and receive feedback.')]:
 s+=circle(119,y,39,Y)+text(num,num,107,y+13,35,P,True,width=50)
 s+=text(ru,en,195,y+5,44,P,True,width=800)
 s+=text(body,ben,195,y+70,33,INK,width=800)
s+=text('Всё связано с вашей учёбой.','Everything connects to your learning.',80,1560,39,P,True)
end(4,s)
# 05 — one large actual flashcard; supporting copy explains the unified word list.
s=base(5)
s+=text('Слова остаются\nс вами.','The words stay with you.',80,465,86,P,True,100)
s+=text('Лексика из уроков и чтения —\nв одном личном словаре.','Vocabulary from lessons and reading — in one personal word list.',80,700,43,INK,lh=57)
s+=shot('flashcard-answer.png',150,825,780,717)
s+=text('Перевод, контекст и повторение в карточках.','Translation, context and flashcard review.',80,1610,34,P)
end(5,s)
# 06 — homework evidence; yellow accent, full-width screenshot crop.
s=base(6)
s+=text('Вы выполняете.\nПреподаватель\nпроверяет.','You complete the work. Your teacher reviews it.',80,455,77,P,True,90)
s+=text('Задания и обратная связь —\nв вашем личном кабинете.','Assignments and feedback — in your personal account.',80,775,42,INK,lh=56)
s+=shot('reviewed-homework.png',150,900,780,654)
s+=pill('Пример проверенной работы','Example of reviewed work',80,1630-70,690)
end(6,s)
# 07 — a brief free-reading introduction; the walkthrough belongs to Library.
s=base(7)
s+=text('Можно начать\nс чтения.','You can start with reading.',80,470,86,P,True,100)
s+=text('Библиотека и карточки доступны\nбесплатно, без покупки уроков.','The library and flashcards are available for free, without buying lessons.',80,710,43,INK,lh=58)
s+=group('Free-reading-book',circle(540,1090,210,Y)+path('M360 965 Q450 935 540 980 Q630 935 720 965 V1225 Q630 1195 540 1240 Q450 1195 360 1225 Z M540 980 V1240',P,8))
s+=text('Читайте в своём темпе.','Read at your own pace.',80,1430,48,P,True)
s+=text('Подробности — в актуальном\n«Библиотека».','Find the full guide in the “Library” highlight.',80,1530,40,INK,lh=55)
end(7,s)
# 08 — trial invitation as a yellow editorial spread, deliberately no price.
s=base(8,Y)
s+=text('Познакомьтесь\nс преподавателем.','Meet your teacher.',80,470,81,P,True,98)
s+=text('Начните с пробного урока.','Start with a trial lesson.',80,740,54,P,True)
s+=group('Trial-outline',rect(80,870,920,480,C,30))
s+=text('Один на один. Онлайн.','One to one. Online.',120,965,52,P,True,width=840)
s+=text('Попробуйте формат занятий\nи расскажите преподавателю,\nнад чем хотите работать.','Try the lesson format and tell your teacher what you want to work on.',120,1080,44,INK,lh=62,width=840)
s+=text('Стоимость пробного урока — на сайте.','The trial lesson price is on the website.',80,1460,39,P)
s+=text('Ссылка — в профиле.','The link is in our profile.',80,1550,45,P,True)
s+=arrow(790,1535,180)
end(8,s,Y)
# 09 — actual actions, no fake interactive controls or link sticker baked into PNG.
s=base(9,P)
s+=text('Давайте начнём.','Let’s get started.',80,490,88,C,True)
s+=text('Хотите заниматься\nс преподавателем?','Would you like to learn with a teacher?',80,715,54,C,True,70)
s+=rect(80,890,920,260,Y,26)
s+=text('Откройте ссылку в профиле\nи выберите пробный урок.','Open the link in our profile and choose a trial lesson.',120,980,47,P,True,65,width=840)
s+=text('Есть вопросы? Напишите нам в Direct.','Questions? Message us in Direct.',80,1265,40,C)
s+=path('M80 1350 H1000',Y,3)
s+=text('Пока хотите просто почитать?','Would you prefer to start with reading?',80,1450,39,Y,True)
s+=text('Зарегистрируйтесь на сайте —\nбиблиотека и карточки бесплатны.','Register on the website — the library and flashcards are free.',80,1530,40,C,lh=55)
end(9,s,P)
# Cover follows supplied reference: purple canvas, yellow disk, simple forward arrow.
current=0
cover=rect(0,0,1080,1920,P)+group('Circular-safe-cover-icon',circle(540,960,300,Y)+arrow(410,960,260,P))
(OUT/'editable'/'00-cover.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Начать — Start</title>{cover}</svg>')
# Reusable vector shapes, kept separate from publishable Stories.
(OUT/'editable'/'components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">{rect(0,0,1080,1920,C)}{group("Yellow-topic-strip",rect(80,250,920,160,Y,24))}{group("Cream-content-panel",rect(80,500,920,500,L,30))}{group("Sequence-marker",circle(120,1150,40,Y))}{group("Forward-arrow",arrow(360,1150))}{group("Footer-wave",path("M-30 1720 C235 1600 565 1840 1110 1670",Y,7))}</svg>')
(OUT/'source'/'text-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
(OUT/'source'/'manifest.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
review=['# Start / Начать — full Russian copy and English translation','', 'Nine Stories in posting order. The cover has no visible text; name the highlight «Начать» (Start). Original logo reads “Omnica English”. All recurring website and sequence labels are included below. Story 7 is a brief introduction to free reading; the complete walkthrough belongs to the separate Library highlight.','']
for n in range(1,10):
 review += [f'## Story {n:02}', '']
 for entry in copy:
  if entry['story']==n:review += ['**RU:** '+entry['ru'],'','**EN:** '+entry['en'],'']
review += ['## Text inside the real screenshot crops','',
'### Story 5 — flashcard answer',
'- покупать → to buy. (The English definition and lesson excerpt are already in English.)',
'- Исходный урок → Source lesson.',
'- Ещё раз → Again; Трудно → Hard; Хорошо → Good; Легко → Easy. Numbers 1–4 are keyboard shortcuts.', '',
'### Story 6 — reviewed homework',
'- Назад к занятиям → Back to study.',
'- Проверено → Reviewed; Результат 9 / 9 → Score 9 / 9.',
'- Верно → Correct. The exercise title and instructions are already in English.', '',
'## Posting and editing notes','',
'- Exported PNGs are 1080 × 1920. Publish 01–09 in order; 00 is the cover.',
'- Ensure the Instagram profile link points to https://omnicaenglish.com before posting. The final CTA uses the profile link and does not need a separate Story sticker.',
'- Free refers to the library and flashcards. The trial is paid; this set directs viewers to the website for its current price.',
'- All essential content fits inside x=70–1010 and y=208–1700. The curved footer is decorative. Check the final placement in Instagram; interface overlays can vary.',
'- Live text uses Arial. Screenshots are real fictional-QA captures, not reviews or teacher photos. Crops are physically prepared and embedded; original captures are preserved.',
'- Native Affinity import/editing was not tested. SVGs use live text, named groups, vector shapes, an original nested vector logo and embedded PNG crops.',
'- Existing marketing assets are preserved. No generated imagery was used.']
(OUT/'review'/'english-and-russian.md').write_text('\n'.join(review)+'\n')
print(f'Built 9 Stories, cover and components; checked {len(checks)} text lines.')
