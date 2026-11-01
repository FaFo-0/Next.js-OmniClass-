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
 s+=text(f'{n:02} / 10',f'Story {n} of 10',905,1680,24,col,width=100,name='Story-number')
 doc=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Omnica English — How we learn — {n:02}</title><desc>Russian Instagram Story. Live editable Arial text, named vector groups, original vector logo and pre-cropped embedded real screenshots. English translation supplied separately.</desc>{s}</svg>'
 (OUT/'editable'/f'{n:02}-story.svg').write_text(doc)
def crop(source,name,box):
 src=ROOT/source; shutil.copy2(src,OUT/'originals'/src.name)
 Image.open(src).crop(box).save(OUT/'crops'/name)
def shot(name,x,y,w,h):
 data=base64.b64encode((OUT/'crops'/name).read_bytes()).decode()
 return group('Real-screenshot-'+name,rect(x-9,y-9,w+18,h+18,P,12)+f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="none" xlink:href="data:image/png;base64,{data}"/>')
def pill(ru,en,x,y,w,c=Y):return group('Topic-pill',rect(x,y,w,78,c,20)+text(ru,en,x+25,y+51,32,P,True,width=w-45))
def arrow(x,y,length=180,c=P):return path(f'M{x} {y} h{length} m-40 -35 40 35 -40 35',c,6)
# Only physical crops are embedded; original full captures are preserved.
OLD='assets/marketing/instagram/story-highlights-ru-v1/originals/'
NEW='assets/marketing/screenshots/2026-10-30-homework/'
PHONE='assets/marketing/screenshots/2026-10-21/phone/'
crop(OLD+'11-flashcard-answer-ru.jpg','card-answer.png',(10,175,380,515))
crop(OLD+'15-my-words-ru.jpg','word-list.png',(10,415,380,667))
crop(OLD+'16-homework-reviewed-ru.jpg','reviewed-work.png',(10,65,380,375))
crop(NEW+'10-published-lesson-ru.jpg','lesson-title.png',(258,138,803,207))
crop(NEW+'11-interactive-homework-ru-top.jpg','homework-gaps.png',(452,198,1080,410))
crop(NEW+'03-homework-order-and-writing-en.jpg','homework-order.png',(454,279,1080,495))
crop(NEW+'07-word-translation-ru.jpg','reading-translation.png',(500,235,810,435))

def topic(ru='ПРИМЕР: ПОКУПКИ',en='EXAMPLE: SHOPPING',dark=False):
 return text(ru,en,80,365,26,Y if dark else P,True,name='Demonstration-label')
def route(x=105,y=900,c=Y):
 return group('Learning-connection',path(f'M{x} {y} C{x+180} {y-100} {x+450} {y+120} {x+790} {y}',c,7))
# 01 — learning loop, deliberately different from Start's introductory list.
s=base(1,P)
s+=text('Как проходит\nобучение?','How does learning work?',80,485,88,C,True,102)
s+=text('Проследим путь от разговора\nна уроке до самостоятельной\nпрактики.','Follow the path from a conversation during a lesson to independent practice.',80,775,44,C,lh=59)
s+=route(100,1090)
for x,ru,en in [(80,'Урок','Lesson'),(407,'Практика','Practice'),(755,'Отзыв','Feedback')]:
 s+=circle(x+105,1090,22,Y)
 s+=text(ru,en,x,1210,43,C,True,width=310)
s+=text('Тема примера — покупки.','The example topic is shopping.',80,1400,44,Y,True)
s+=text('Покажем на демонстрационных\nматериалах платформы.','We’ll show you using demonstration materials from the platform.',80,1490,36,C,lh=49)
end(1,s,P)
# 02 — conversation fills the central area; explicitly an illustrative exchange.
s=base(2)
s+=text('На уроке — вы\nи преподаватель.','During the lesson, it’s you and your teacher.',80,480,81,P,True,96)
s+=text('Один на один, онлайн в Google Meet.','One to one, online through Google Meet.',80,730,40,INK)
s+=rect(80,850,700,190,L,30)
s+=text('ВЫ','YOU',115,905,25,P,True,width=620)
s+=text('“How do I say this?”','“How do I say this?”',115,990,53,P,True,width=620)
s+=rect(265,1110,735,190,Y,30)
s+=text('ПРЕПОДАВАТЕЛЬ','TEACHER',300,1165,25,P,True,width=660)
s+=text('“Let’s try it together.”','“Let’s try it together.”',300,1250,51,P,True,width=660)
s+=text('Пример диалога','Illustrative dialogue',80,1395,26,P)
s+=text('Говорите, спрашивайте и разбирайте\nсложные моменты вместе.','Speak, ask questions and work through difficult points together.',80,1490,40,INK,lh=56)
end(2,s)
# 03 — a yellow worked example, with useful English rather than abstract claims.
s=base(3,Y);s+=topic()
s+=text('Английский\nв контексте.','English in context.',80,500,88,P,True,103)
s+=text('Например, рассказываете,\nкак сходили за покупками.','For example, talk about a shopping trip.',80,760,44,P,lh=60)
s+=rect(80,900,920,270,C,28)
s+=text('“Yesterday I bought\nsome bread.”','“Yesterday I bought some bread.”',120,1005,58,P,True,76,width=840)
s+=text('«Вчера я купил(а) хлеб».','“Yesterday I bought some bread.”',80,1270,45,P)
s+=text('Разбираете слова, форму глагола\nи то, как построить свою фразу.','Work through the vocabulary, verb form and how to build your own sentence.',80,1380,43,P,lh=59)
s+=text('buy → bought','buy → bought',80,1580,58,P,True)
end(3,s,Y)
# 04 — real title crop with a clear explanation of publication and lesson notes.
s=base(4);s+=topic()
s+=text('К материалам\nможно вернуться.','You can return to the materials.',80,490,80,P,True,96)
s+=text('Когда преподаватель опубликует\nматериалы, откройте урок\nв разделе «Мои уроки».','When your teacher publishes the materials, open the lesson in “My Lessons”.',80,740,42,INK,lh=57)
s+=shot('lesson-title.png',80,970,920,116)
s+=text('Пример урока в личном кабинете','Example lesson in the personal account',80,1150,29,P)
s+=path('M100 1240 H980',Y,7)
s+=text('Резюме поможет вспомнить,\nчто вы разбирали, и вернуться\nк важным моментам.','The summary helps you recall what you worked through and return to important points.',80,1350,44,INK,lh=61)
s+=pill('Материалы остаются под рукой','Keep the materials at hand',80,1550,750)
end(4,s)
# 05 — actual vocabulary rows, large enough to read; no fabricated interface.
s=base(5);s+=topic()
s+=text('Новые слова —\nв вашем словаре.','New words go into your word list.',80,490,81,P,True,98)
s+=text('Преподаватель проверяет лексику.\nПосле публикации слова из урока\nпопадают в раздел «Мои слова».','Your teacher reviews the vocabulary. After publication, the lesson words appear in “My Words”.',80,750,41,INK,lh=57)
s+=shot('word-list.png',150,1010,780,531)
s+=text('Слова из чтения сохраняются сюда же.','Words from reading are saved here too.',80,1620,35,P)
end(5,s)
# 06 — flip sequence. One genuine answer card carries readable context and controls.
s=base(6,P);s+=topic(dark=True)
s+=text('Не только сохранить.\nПовторить.','Don’t just save it. Review it.',80,490,76,C,True,94)
s+=pill('buy → покупать','buy → to buy',80,740,480)
s+=shot('card-answer.png',215,900,650,597)
s+=text('Вспомните значение, откройте ответ\nи оцените, насколько легко вспомнили.','Recall the meaning, reveal the answer and rate how easily you remembered it.',80,1580,37,C,lh=50)
end(6,s,P)
# 07 — two distinct exercise examples; others explained without pretending to show them.
s=base(7);s+=topic()
s+=text('Примените\nизученное.','Apply what you’ve learned.',80,490,85,P,True,101)
s+=text('В домашней работе могут быть\nпропуски, сопоставление, порядок\nслов и письменные ответы.','Homework can include gap-fills, matching, word ordering and written answers.',80,750,41,INK,lh=57)
s+=shot('homework-gaps.png',80,960,920,311)
s+=shot('homework-order.png',80,1320,920,317)
end(7,s)
# 08 — reviewed-work proof, no outcome claim attached to a fictional QA score.
s=base(8);s+=topic()
s+=text('Посмотрите,\nчто получилось.','See how you did.',80,490,84,P,True,100)
s+=text('После проверки откройте результат\nи комментарии преподавателя.\nВернитесь к тому, что было сложным.','After review, open your result and teacher comments. Return to what you found difficult.',80,750,40,INK,lh=56)
s+=shot('reviewed-work.png',150,1000,780,654)
# Move footer for this image away from overlapping text; top of crop is already labelled as demo.
end(8,s)
# 09 — reading expands the same word list; a separate example is explicitly named.
s=base(9);s+=topic('ДРУГОЙ ПРИМЕР: ЧТЕНИЕ','ANOTHER EXAMPLE: READING')
s+=text('Между уроками\nможно читать.','You can read between lessons.',80,490,82,P,True,98)
s+=text('Откройте текст, нажмите на слово,\nпосмотрите перевод и сохраните\nего в тот же личный словарь.','Open a text, tap a word, view its translation and save it to the same personal word list.',80,750,40,INK,lh=56)
s+=shot('reading-translation.png',230,1000,620,400)
s+=pill('Библиотека и карточки — бесплатно','Library and flashcards — free',80,1490,885)
s+=text('Без покупки уроков.','No lesson purchase required.',80,1620,35,P)
end(9,s)
# 10 — close the loop with a simple invitation.
s=base(10,P)
s+=text('Урок. Практика.\nОбратная связь.','Lesson. Practice. Feedback.',80,490,84,C,True,101)
s+=route(100,820)
s+=text('Всё связано\nс вашей учёбой.','Everything connects to your learning.',80,1040,71,C,True,87)
s+=rect(80,1270,920,225,Y,28)
s+=text('Попробуйте формат\nна пробном уроке.','Try the format at a trial lesson.',120,1360,53,P,True,69,width=840)
s+=text('Запись и стоимость — по ссылке в профиле.','Signup and price — through the link in our profile.',80,1600,36,C)
end(10,s,P)
# Reference-style cover: two connected screens, safe inside a circular crop.
current=0
cover=rect(0,0,1080,1920,P)+circle(540,960,300,Y)
cover+=group('Connected-learning-screens',path('M360 840 H610 V1000 H360 Z M470 950 H720 V1110 H470 Z M440 1035 H485 M600 865 H640 M555 1000 V950',P,8))
(OUT/'editable'/'00-cover.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>Как учимся — How we learn</title>{cover}</svg>')
components=rect(0,0,1080,1920,C)+group('Conversation-bubble',rect(80,250,700,190,L,30))+group('Example-panel',rect(80,550,920,270,Y,28))+route(100,1120)+group('Footer-wave',path('M-30 1720 C235 1600 565 1840 1110 1670',Y,7))
(OUT/'editable'/'components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">{components}</svg>')
(OUT/'source'/'manifest.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
(OUT/'source'/'text-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
review=['# Как учимся / How we learn — Russian copy and English translation','', 'Ten Stories in posting order. Cover name: «Как учимся» = “How we learn”. The original logo reads “Omnica English”.','', 'The shopping narrative is an illustrative learning sequence. Real screenshots come from related fictional QA exercises captured on different dates; they are not a single student’s documented lesson or a claim about learning outcomes.','']
for n in range(1,11):
 review += [f'## Story {n:02}', '']
 for entry in copy:
  if entry['story']==n:review+=['**RU:** '+entry['ru'],'','**EN:** '+entry['en'],'']
review += ['## Screenshot text translations','',
'### Story 4 — lesson title','The displayed title, “A Saturday at the Market”, is already English. The date and duration belong to the fictional QA capture, not a current lesson offer.','',
'### Story 5 — vocabulary rows','- прошедшее время → past tense.','- делать покупки → to shop / go shopping (shopping).','- завтрак → breakfast.','- готовить → to prepare.','- шел пешком → walked.','- заплатил → paid.','',
'### Story 6 — flashcard answer','- покупать → to buy.','- Исходный урок → Source lesson.','- Ещё раз → Again; Трудно → Hard; Хорошо → Good; Легко → Easy. Numbers 1–4 are keyboard shortcuts.','The definition and lesson excerpt are already English.','',
'### Story 7 — homework examples','All visible exercise text is already English: “A trip to the market”, past-simple gap-fill instructions, and “Build a sentence” with word-order controls. These are interactive exercise examples captured in progress.','',
'### Story 8 — reviewed homework','- Назад к занятиям → Back to study.','- Проверено → Reviewed; Результат 9 / 9 → Score 9 / 9.','- Верно → Correct.','The exercise title and instructions are already English. This is a demonstration score, not a testimonial or promised result.','',
'### Story 9 — reading lookup','- кухня → kitchen.','- Добавить в мой словарь → Add to my word list.','The reading excerpt and English definition are already English.','',
'## Posting and editing','',
'- Publish PNGs 01–10 in order; 00 is the highlight cover. Set the highlight name to «Как учимся» (How we learn).',
'- Ensure the Instagram profile website link points to https://omnicaenglish.com before posting. No link sticker is required by the copy.',
'- Free access refers to reading and flashcards. The trial is paid; the final Story sends visitors to the site for its price.',
'- Live text uses Arial. Original vector logo and complete original screenshots are preserved; screenshot crops are physically prepared and embedded without clip masks or remote URLs.',
'- Native Affinity 3.3.1 import/editing remains unverified. Phone-size PNG renders, text widths, image proportions and export dimensions are checked.',
'- No photos, reviews, student results, prices or platform features were invented. The conversation and worked sentence are clearly illustrative.',
'- Previous folders remain unchanged. Nothing has been posted to Instagram.']
(OUT/'review'/'english-and-russian.md').write_text('\n'.join(review)+'\n')
print('Built ten Stories, cover and reusable vector components; checked',len(checks),'text lines.')
