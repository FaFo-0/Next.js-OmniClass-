from pathlib import Path
from html import escape
import base64,json,shutil
from PIL import ImageFont
O=Path(__file__).resolve().parents[1]
for d in ['covers','stories','templates','exports/covers','exports/stories','exports/templates']:(O/d).mkdir(parents=True,exist_ok=True)
P='#6716A4';Y='#FFCA00';C='#FFF9ED';D='#391052'
checks=[]
def rect(x,y,w,h,c,rx=0):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{c}"/>'
def text(lines,x,y,size=48,color=P,bold=False,serif=False):
 if isinstance(lines,str):lines=[lines]
 font=ImageFont.truetype('/System/Library/Fonts/Supplemental/'+('Georgia Italic.ttf' if serif else 'Arial Bold.ttf' if bold else 'Arial.ttf'),size)
 for s in lines:
  width=font.getlength(s); assert width<=920,(s,width); checks.append([s,round(width)])
 return f'<text font-family="{"Georgia" if serif else "Arial"}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}"'+(' font-style="italic"' if serif else '')+'>'+''.join(f'<tspan x="{x}" y="{y+i*size*1.25}">{escape(s)}</tspan>' for i,s in enumerate(lines))+'</text>'
def path(d,col=P,sw=7):return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
icons=[ 'M35 100 H165 M120 55 L165 100 L120 145', 'M65 75 a30 30 0 1 0 0 -60 a30 30 0 1 0 0 60 M15 160 Q15 100 65 100 Q115 100 115 160 M130 45 H190 V110 H155 L130 130 Z', 'M20 35 H110 V105 H20 Z M90 95 H180 V165 H90 Z M45 140 H65 M135 60 H155', 'M100 55 Q60 25 15 40 V150 Q60 135 100 165 Q140 135 185 150 V40 Q140 25 100 55 V165', 'M20 30 H110 L185 105 L105 185 L20 100 Z M55 60 h1', 'M15 30 H135 V110 H65 L35 140 V110 H15 Z M85 140 H145 L175 170 V80', 'M60 65 C60 5 150 5 150 65 C150 105 100 95 100 130 M100 165 h1', 'M20 70 Q20 30 75 30 V85 H45 V140 H20 Z M115 70 Q115 30 170 30 V85 H140 V140 H115 Z']
cats=[('01-start','Начать','Start here'),('02-teachers','Преподаватели','Teachers'),('03-learning','Как учимся','How we learn'),('04-library','Библиотека','Free library'),('05-prices','Цены','Pricing'),('06-about','О нас','Our story'),('07-faq','Вопросы','FAQ'),('08-reviews','Отзывы','Reviews')]
def svg(s):return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">'+s+'</svg>'
def icon(i,x,y,scale=1):return f'<g id="Editable-icon" transform="translate({x} {y}) scale({scale})">{path(icons[i])}</g>'
def base(i,title,sub,dark=False):
 bg=P if dark else C; fg=C if dark else P
 s=rect(0,0,1080,1920,bg)+path('M-80 1660 C300 1430 490 1850 1160 1510',Y,12)
 s+=text('Omnica English',80,235,30,fg,True)+rect(80,282,250,8,Y)
 s+=text(cats[i][1].upper(),80,365,24,fg,True)+text(title,80,500,76,fg,True)
 if sub:s+=text(sub,80,500+len(title)*95+45,32,fg)
 s+=text('omnicaenglish.com',80,1660,26,fg)
 return s
manifest=[]
def save(i,key,s,en,template=False):
 folder='templates' if template else 'stories'; name=f'{cats[i][0]}-{key}.svg'; (O/folder/name).write_text(svg(s));manifest.append({'file':folder+'/'+name,'english':en,'template':template})
def panel(lines,y=1000):return rect(80,y,920,330,Y,38)+text(lines,120,y+90,42,P,True)
for i,(key,label,en) in enumerate(cats):
 s=rect(0,0,1080,1920,P)+f'<circle cx="540" cy="960" r="300" fill="{Y}"/>'+icon(i,350,770,1.9)
 (O/'covers'/f'{key}.svg').write_text(svg(s))
# Start: concrete next action, no invented trial structure.
s=base(0,['Начнём','с вашего английского.'],['Индивидуальные онлайн-занятия','и практика между уроками.'])+panel(['Попробуйте занятие','с преподавателем.','Ссылка для записи — в профиле.'])
s+=text(['Есть вопросы перед записью?','Напишите нам в Direct.'],80,1460,34)
save(0,'welcome',s,'One-to-one online English; try a lesson via the profile link or ask questions in Direct.')
s=base(0,['Что вы хотите','изменить?'],['Расскажите, где вам нужен английский.'])
for n,t in enumerate(['Свободнее общаться','Увереннее говорить на работе','Вернуться к занятиям']):s+=rect(80,850+n*175,920,130,Y if n==0 else '#EBDDF3',28)+text(t,120,930+n*175,38,P,True)
s+=text(['Обсудите вашу цель','с преподавателем на пробном уроке.'],80,1450,34)
save(0,'goal',s,'Discuss your goal at the trial: everyday conversation, work, or returning to study.')
# Teachers: distinct, useful editable empty photo windows.
for name,exp,detail in [('Sally','7 лет преподавания',['Носитель английского языка.','Говорит по-русски.']),('Mustafa','4 года преподавания',['Свободно говорит по-английски.','Основатель Omnica English.'])]:
 s=base(1,[name],[exp])+rect(80,760,580,650,'#EBDDF3',40)+text(['МЕСТО ДЛЯ ФОТО'],155,1090,24)
 s+=icon(1,760,865,.9)+text(detail,80,1500,34)
 save(1,name.lower(),s,name+' — '+exp+'; '+('native English speaker, speaks Russian.' if name=='Sally' else 'fluent English speaker; founder.'),True)
# Learning: use prepared rectangular cropped PNGs embedded; no import-time clipping.
orig=O.parent/'introduction-carousel-ru-v3/originals'
from PIL import Image
screens=[('15-my-words-ru.jpg',(0,50,390,600)),('16-homework-reviewed-ru.jpg',(0,80,390,650)),('07-student-word-translation-en.jpg',(0,85,390,720))]
def screen(n,x=270,y=800,w=540,h=720):
 f,box=screens[n];im=Image.open(orig/f).crop(box);import io
 b=io.BytesIO();im.save(b,format='PNG');data=base64.b64encode(b.getvalue()).decode()
 return rect(x-12,y-12,w+24,h+24,Y,20)+f'<image id="Real-screenshot-pre-cropped" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,{data}"/>'
s=base(2,['Разобрали на уроке?','Вернитесь к этому.'],['Слова из занятия остаются','в вашем личном словаре.'])+screen(0)
save(2,'vocabulary',s,'Lesson vocabulary stays in your personal collection. Real fictional QA screenshot.')
s=base(2,['Практика','с обратной связью.'],['Выполните домашнее задание.','Преподаватель проверит ваши ответы.'])+screen(1)
save(2,'homework',s,'Do your homework and receive teacher feedback. Real example, not a testimonial.')
s=base(3,['Одно слово —','новая карточка.'],['Нажмите на слово в тексте,','посмотрите перевод и сохраните.'])+screen(2)
save(3,'demo',s,'Tap a word, view its translation and save it. Real reading screenshot.')
s=base(3,['Можно начать','бесплатно.'],['Библиотека и карточки доступны','без покупки уроков.'])+panel(['Читайте в своём темпе.','Собирайте новые слова.','Повторяйте их в карточках.'])
save(3,'free',s,'Free library and flashcards, without purchasing lessons.')
# Pricing: unmistakably unfinished, no fabricated offers.
s=base(4,['Ваш формат','занятий.'],['Замените поля актуальными данными.'])
for j,(a,b) in enumerate([('Пробный урок','[цена] [валюта]'),('Пакет: [число] уроков','[цена] [валюта]')]):s+=rect(80,820+j*300,920,250,Y if j==0 else '#EBDDF3',38)+text(a,120,895+j*300,34,P,True)+text(b,120,1000+j*300,58,P,True)
s+=text('Условия и запись — по ссылке в профиле.',80,1480,30)
save(4,'offer',s,'REPLACE price, currency and lesson count; remove editing instruction before publishing.',True)
s=base(5,['Создано рядом','с преподавателями.'],['Я начал Omnica English, опираясь','на опыт друзей — учителей английского.'])+panel(['Чтобы преподавателю было','проще вести занятия,','а вам — понимать, что дальше.'])
s+=text('Mustafa, основатель Omnica English',80,1470,31)
save(5,'origin',s,'Mustafa started Omnica English with input from teacher friends, making teaching easier and learning more structured.')
s=base(5,['Урок — это','часть системы.'],['Разговор с преподавателем,','новые слова и самостоятельная практика.'])+panel(['Всё связано:','занятие → слова → повторение','→ домашнее задание.'])
save(5,'purpose',s,'Lessons connect with vocabulary, review and homework.')
for key,q,a,en in [('online',['Где проходят','занятия?'],['Онлайн, один на один','с преподавателем в Google Meet.'],'Lessons take place online, one-to-one in Google Meet.'),('free',['Нужно покупать уроки,','чтобы читать?'],['Нет. Библиотека и карточки','доступны бесплатно.'],'No lesson purchase needed for the library and flashcards.')]:
 s=base(6,q,[])+panel(a);save(6,key,s,en)
s=base(6,['[Ваш вопрос]'],[])+rect(80,830,920,570,Y,38)+text(['[Короткий ответ]','[Одна полезная деталь]'],120,960,40)
save(6,'answer',s,'Reusable FAQ: replace question and short answer.',True)
s=base(7,['Ваш опыт','в Omnica English.'],[])+rect(80,820,920,600,Y,40)+text(['«[Точный текст отзыва]»'],120,970,42)+text(['[Имя, с разрешения]'],120,1300,30)
save(7,'quote',s,'UNPUBLISHED template: only genuine feedback, with permission. No invented review.',True)
s=base(1,['[Имя]'],['[Опыт преподавания]'])+rect(80,790,550,650,'#EBDDF3',32)+text('[Фото преподавателя]',125,1110,26)+text(['[Языки]','[Подход к занятиям]'],80,1510,32)
save(1,'new-teacher',s,'Reusable teacher introduction: photo, name, experience, languages and teaching approach.',True)
(O/'source/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(O/'source/text-checks.json').write_text(json.dumps(checks,ensure_ascii=False))
(O/'README.md').write_text('''# Omnica English — distinct Instagram highlights\n\nEight icon covers; 10 ready-content Stories and 6 editable templates. Original carousel and earlier assets preserved.\n\nOpen individual SVGs in Affinity and save as a native Affinity document. Text, icons and shapes remain editable. Screenshot inserts are real pre-cropped embedded PNGs: their crop no longer depends on SVG clipping interpretation. Native Affinity import has not been verified. Fonts: Arial, Georgia Italic. Stories 1080×1920; content between y=235 and 1660. Covers keep icons inside a central circle. Instagram may crop the cover to a circle.\n\n`exports/` contains PNGs. `covers/`, `stories/`, `templates/` contain editable SVGs. `source/manifest.json` explains every card in English.\n\nBefore publishing templates: replace bracketed fields, remove editing instructions, insert actual teacher photos, confirm current prices and currency. Reviews are placeholders only: publish genuine permissioned feedback. Add booking/link stickers in Instagram. Photos deliberately left empty. Do not publish placeholders.\n\nSuggested highlights: Начать (Start here), Преподаватели (Teachers), Как учимся (How we learn), Библиотека (Library), Цены (Pricing), О нас (About us), Вопросы (FAQ), Отзывы (Reviews—later). Teacher cover title can be shortened to Учителя if Instagram truncates it. Pricing/business rules remain governed by repository POLICY.md; no policy terms invented here.\n\nRebuild: python3 source/build.py; node source/render.cjs. No image generation.\n''')
print(len(manifest),'Stories/templates;',len(checks),'text lines checked')
