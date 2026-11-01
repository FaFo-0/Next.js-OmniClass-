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
 s+=text(f'{n:02} / 11',f'Story {n} of 11',905,1680,24,col,width=100,name='Story-number')
 doc=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Omnica English — Library — {n:02}</title><desc>Russian Instagram Story. Live editable Arial text, named vector groups, original vector logo and pre-cropped embedded real screenshots. English translation supplied separately.</desc>{s}</svg>'
 (OUT/'editable'/f'{n:02}-story.svg').write_text(doc)
def crop(source,name,box):
 src=ROOT/source; shutil.copy2(src,OUT/'originals'/src.name)
 Image.open(src).crop(box).save(OUT/'crops'/name)
def shot(name,x,y,w,h):
 data=base64.b64encode((OUT/'crops'/name).read_bytes()).decode()
 return group('Real-screenshot-'+name,rect(x-9,y-9,w+18,h+18,P,12)+f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="none" xlink:href="data:image/png;base64,{data}"/>')
def pill(ru,en,x,y,w,c=Y):return group('Topic-pill',rect(x,y,w,78,c,20)+text(ru,en,x+25,y+51,32,P,True,width=w-45))
def arrow(x,y,length=180,c=P):return path(f'M{x} {y} h{length} m-40 -35 40 35 -40 35',c,6)
# Physical crops keep all raster bounds independent of SVG clipping support.
NEW='assets/marketing/screenshots/2026-10-30-homework/'
OLD='assets/marketing/instagram/story-highlights-ru-v1/originals/'
PHONE='assets/marketing/screenshots/2026-10-21/phone/'
crop(NEW+'05-student-library-ru.jpg','catalogue-story.png',(244,304,438,599))
crop(NEW+'05-student-library-ru.jpg','catalogue-book.png',(878,304,1072,599))
crop(NEW+'07-word-translation-ru.jpg','word-meaning.png',(510,270,800,378))
crop(NEW+'07-word-translation-ru.jpg','save-word-button.png',(521,387,789,420))
crop(NEW+'06-reading-before-save-ru.jpg','word-before.png',(662,242,817,269))
crop(NEW+'08-word-saved-confirmation-ru.jpg','word-after.png',(662,242,817,269))
crop(NEW+'16-my-words-ru.jpg','saved-word-row.png',(243,200,590,284))
crop(PHONE+'10-flashcard-front-ru.jpg','flashcard-front.png',(10,175,380,495))
crop(OLD+'11-flashcard-answer-ru.jpg','flashcard-answer.png',(10,175,380,515))

def book(cx,cy,scale=1,c=P):
 return group('Open-book',f'<g transform="translate({cx} {cy}) scale({scale})">'+path('M-180 -115 Q-90 -145 0 -100 Q90 -145 180 -115 V145 Q90 115 0 160 Q-90 115 -180 145 Z M0 -100 V160',c,7)+'</g>')
def example(ru='ПРИМЕР ИЗ БИБЛИОТЕКИ',en='LIBRARY EXAMPLE',dark=False):
 return text(ru,en,80,365,26,Y if dark else P,True,name='Example-label')
# 01 — independent learning, with the free boundary stated immediately.
s=base(1,P)
s+=text('Читайте\nпо-английски.','Read in English.',80,490,94,C,True,110)
s+=text('Бесплатно.','For free.',80,755,83,Y,True)
s+=group('Library-opening-book',circle(540,1115,205,Y)+book(540,1085,0.8))
s+=text('Библиотека, личный словарь\nи карточки — без покупки уроков.','The library, personal word list and flashcards — without buying lessons.',80,1460,44,C,lh=61)
s+=text('Выбирайте текст и занимайтесь сами.','Choose a text and practise independently.',80,1600,36,Y)
end(1,s,P)
# 02 — original catalogue cards, isolated before embedding, not fabricated UI.
s=base(2)
s+=text('Что вам\nинтересно читать?','What would you enjoy reading?',80,480,86,P,True,101)
s+=text('Ищите материалы в каталоге.\nФильтры помогут выбрать тему\nи тип: например, рассказ или книгу.','Search for materials in the catalogue. Filters help you choose a topic and a type, such as a story or book.',80,735,41,INK,lh=56)
s+=shot('catalogue-story.png',80,930,395,601)
s+=shot('catalogue-book.png',605,930,395,601)
s+=text('Примеры материалов','Example materials',80,1605,31,P)
end(2,s)
# 03 — level and estimated duration, presented as guidance rather than stock claims.
s=base(3)
s+=text('Подберите\nподходящий текст.','Find a suitable text.',80,480,83,P,True,98)
s+=text('Если уровень указан, используйте\nего как ориентир. Например:','If a level is shown, use it as a guide. For example:',80,730,41,INK,lh=56)
for y,code,ru,en in [(880,'A1','Начальный','Beginner'),(1050,'A2','Элементарный','Elementary'),(1220,'B1','Средний','Intermediate')]:
 s+=rect(80,y,170,120,Y,22)+text(code,code,112,y+82,60,P,True,width=110)
 s+=text(ru,en,295,y+79,46,P,True,width=700)
s+=text('Время чтения — примерная оценка.\nЕсть несколько минут? Выберите\n«Сначала короткие».','Reading time is an estimate. Have a few minutes? Choose “Shortest first”.',80,1480,39,INK,lh=54)
end(3,s)
# 04 — editorial excerpt from a real demonstration text, not a reconstructed screenshot.
s=base(4,Y);s+=example('ФРАГМЕНТ: THE BLUE LUNCH BOX','EXCERPT: THE BLUE LUNCH BOX')
s+=text('Начните\nс общего смысла.','Start with the overall meaning.',80,500,84,P,True,100)
s+=rect(80,800,920,490,C,30)
s+=text('“It is twelve o’clock.\nLina is in the kitchen\nat work.”','“It is twelve o’clock. Lina is in the kitchen at work.”',120,930,62,P,True,85,width=840)
s+=text('Попробуйте понять, что происходит.\nНезнакомые слова можно разобрать\nпрямо во время чтения.','Try to understand what is happening. You can look up unfamiliar words as you read.',80,1420,42,P,lh=59)
end(4,s,Y)
# 05 — zoom into the genuine dictionary result, retaining live explanatory copy outside it.
s=base(5);s+=example()
s+=text('Не знаете слово?\nНажмите на него.','Don’t know a word? Tap it.',80,490,78,P,True,96)
s+=text('Откроется значение:\nперевод на русский и пояснение\nна английском.','Its meaning opens: a Russian translation and an English explanation.',80,750,42,INK,lh=58)
s+=shot('word-meaning.png',120,1050,840,313)
s+=text('В нашем примере:\nkitchen — кухня.','In our example: kitchen means кухня (“kitchen”).',80,1490,45,P,True,61)
end(5,s)
# 06 — save action and actual before/after tint; green means saved, never mastered.
s=base(6);s+=example()
s+=text('Хотите запомнить?\nСохраните слово.','Want to remember it? Save the word.',80,490,77,P,True,95)
s+=shot('save-word-button.png',120,750,840,103)
s+=text('ДО СОХРАНЕНИЯ','BEFORE SAVING',80,990,27,P,True)
s+=shot('word-before.png',160,1040,760,132)
s+=text('ПОСЛЕ СОХРАНЕНИЯ','AFTER SAVING',80,1280,27,P,True)
s+=shot('word-after.png',160,1330,760,132)
s+=text('Зелёным отмечены слова из вашего\nсписка. Это не оценка знания слова.','Green marks words on your list. It does not measure how well you know them.',80,1550,38,INK,lh=53)
end(6,s)
# 07 — the exact saved kitchen row, followed by useful supported management actions.
s=base(7);s+=example()
s+=text('Сохранённое —\nв «Моих словах».','Everything you save is in “My Words”.',80,490,80,P,True,98)
s+=text('Откройте свой список:\nслово из чтения уже здесь.','Open your word list: the word from your reading is already here.',80,750,44,INK,lh=61)
s+=shot('saved-word-row.png',120,1000,840,203)
for y,num,ru,en in [(1320,'1','Найдите слово через поиск.','Find a word using search.'),(1420,'2','При необходимости измените перевод.','Edit its translation if needed.'),(1520,'3','Удалите то, что больше не нужно.','Remove what you no longer need.')]:
 s+=circle(107,y,28,Y)+text(num,num,98,y+11,27,P,True,width=40)
 s+=text(ru,en,160,y+13,37,P,width=835)
end(7,s)
# 08 — a separate, explicitly labelled actual flashcard example, not a claim about kitchen.
s=base(8,P);s+=example('ДРУГОЙ ПРИМЕР: КАРТОЧКА BUY','ANOTHER EXAMPLE: THE BUY FLASHCARD',True)
s+=text('Проверьте,\nчто запомнили.','Check what you remember.',80,490,84,C,True,100)
s+=text('Сначала посмотрите на слово\nи попробуйте вспомнить перевод.','First look at the word and try to recall its translation.',80,750,42,C,lh=58)
s+=shot('flashcard-front.png',175,900,730,631)
s+=text('Затем нажмите «Показать ответ».','Then tap “Show answer”.',80,1610,38,Y)
end(8,s,P)
# 09 — same real flashcard's answer and rating controls.
s=base(9);s+=example('ПОВТОРЕНИЕ: КАРТОЧКА BUY','REVIEW: THE BUY FLASHCARD')
s+=text('Откройте ответ.\nОцените себя.','Reveal the answer. Rate your recall.',80,490,82,P,True,99)
s+=text('Проверьте перевод и пример.\nВыберите, насколько легко\nвспомнили значение.','Check the translation and example. Choose how easily you recalled the meaning.',80,750,41,INK,lh=56)
s+=shot('flashcard-answer.png',175,960,730,671)
end(9,s)
# 10 — accurate chapter-level continuation; no promise of exact scroll restoration.
s=base(10)
s+=text('Вернитесь\nк чтению позже.','Return to your reading later.',80,490,85,P,True,101)
s+=text('Открытые материалы — во вкладке\n«Недавнее». Для книги можно\nпродолжить последнюю открытую главу.','Opened materials appear under “Recent”. For a book, you can continue the last chapter you opened.',80,750,39,INK,lh=55)
s+=text('КНИГА С ГЛАВАМИ: ПРИМЕР','A BOOK WITH CHAPTERS: ILLUSTRATION',80,1020,26,P,True)
for x,i,ru,en in [(80,1,'Глава 1','Chapter 1'),(405,2,'Глава 2','Chapter 2'),(730,3,'Глава 3','Chapter 3')]:
 s+=rect(x,1100,270,240,Y if i==2 else L,24)
 s+=text(str(i),str(i),x+92,1210,74,P,True,width=100)
 s+=text(ru,en,x+49,1290,35,P,True,width=220)
s+=text('Прочитали до конца? Отметьте\nматериал как прочитанный.','Finished reading? Mark the material as read.',80,1480,44,P,True,61)
end(10,s)
# 11 — free-library invitation with an exact, straightforward route into it.
s=base(11,P)
s+=text('Ваш первый текст\nуже ждёт.','Your first text is waiting.',80,490,82,C,True,100)
for y,num,ru,en in [(820,'01','Перейдите по ссылке в профиле.','Follow the link in our profile.'),(1040,'02','Зарегистрируйтесь на сайте.','Register on the website.'),(1260,'03','Откройте «Библиотеку»\nи выберите текст.','Open “Library” and choose a text.')]:
 s+=circle(115,y,35,Y)+text(num,num,95,y+12,26,P,True,width=45)
 s+=text(ru,en,185,y+15,40,C,True,56,width=815)
s+=rect(80,1480,920,125,Y,24)
s+=text('Библиотека и карточки — бесплатно.','The library and flashcards are free.',115,1560,43,P,True,width=850)
end(11,s,P)
# Cover is matched to the reference: yellow disk, purple field, open-book outline.
current=0
cover=rect(0,0,1080,1920,P)+circle(540,960,300,Y)+book(540,930,0.9)
(OUT/'editable'/'00-cover.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Библиотека — Library</title>{cover}</svg>')
components=rect(0,0,1080,1920,C)+group('Book-symbol',circle(540,500,220,Y)+book(540,470,0.8))+group('Excerpt-panel',rect(80,900,920,490,L,30))+group('Footer-wave',path('M-30 1720 C235 1600 565 1840 1110 1670',Y,7))
(OUT/'editable'/'components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">{components}</svg>')
(OUT/'source'/'manifest.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
(OUT/'source'/'text-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
review=['# Библиотека / Library — complete Russian copy and English translation','', 'Eleven Stories in posting order. Highlight name: «Библиотека» = “Library”. The cover has no visible text. The original logo reads “Omnica English”.','', 'This is the dedicated free reading and vocabulary walkthrough. Start only introduces free reading; How we learn focuses on teacher-led lessons. Real captures are fictional QA demonstrations, not customer results. The kitchen save sequence uses one actual reading example; the buy flashcard is explicitly labelled as a different example.','']
for n in range(1,12):
 review += [f'## Story {n:02}', '']
 for entry in copy:
  if entry['story']==n:review+=['**RU:** '+entry['ru'],'','**EN:** '+entry['en'],'']
review += ['## Russian text inside real screenshots','',
'### Story 2 — catalogue cards','- Рассказ / РАССКАЗ → Story.','- Книга / КНИГА → Book.','- Читать здесь → Read here.','- A2 is the level label on the story card. The titles and descriptions are already English. These are demo catalogue items, not a promise about the current inventory.','',
'### Story 5 — word meaning','- кухня → kitchen.','- “kitchen” and “a room where food is prepared” are already English.','',
'### Story 6 — save and green highlighting','- Добавить в мой словарь → Add to my word list.','- The before-and-after excerpt (“the kitchen at work.”) is already English. Its green tint means saved to your list, not learned.','',
'### Story 7 — saved-word row','- СЛОВО → WORD; ЗНАЧЕНИЕ → MEANING.','- кухня → kitchen. The saved English word is “kitchen”.','',
'### Story 8 — flashcard front','- Нажмите, чтобы увидеть значение → Tap to see the meaning.','- Показать ответ → Show answer.','- The English word shown is “buy”. This is a separate card example, not a claim that the kitchen card changes into buy.','',
'### Story 9 — flashcard answer','- покупать → to buy.','- Исходный урок → Source lesson.','- Ещё раз → Again; Трудно → Hard; Хорошо → Good; Легко → Easy. Numbers 1–4 are keyboard shortcuts.','- The definition and lesson excerpt are already English. Cards use one shared word list, so this demonstration card happens to show a lesson source. Reading words use the same review flow.','',
'## Posting and editing notes','',
'- Publish 01–11 in order; 00 is the cover. PNGs are 1080 × 1920. SVGs retain live Arial text and named vector groups.',
'- Ensure the profile website link points to https://omnicaenglish.com. The copy uses this link rather than a baked-in Story sticker.',
'- The library, personal word list and flashcards do not require buying lessons. Signup is still needed to keep personal vocabulary and reading progress.',
'- Story 3 gives A1/A2/B1 as examples of level labels, not a claim that every current item has a level or every level is stocked. Reading duration is approximate.',
'- Story 4 is an editorial excerpt from the actual demonstration text, not a reconstructed screenshot. Story 10 uses a labelled chapter diagram and promises chapter-level continuation only.',
'- Screenshots were physically cropped before embedding. Original logo and captures are preserved. No clipping masks, remote image URLs or generated imagery.',
'- Native Affinity 3.3.1 import/editing remains unverified. Phone-size exports, text widths and dimensions are checked. No browser QA or Instagram publication.',
'- Previous highlight folders are preserved.']
(OUT/'review'/'english-and-russian.md').write_text('\n'.join(review)+'\n')
print('Built eleven Stories, cover and reusable vector components; checked',len(checks),'text lines.')
