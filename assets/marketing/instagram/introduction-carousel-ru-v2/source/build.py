from pathlib import Path
from PIL import ImageFont
import base64, html, json, shutil, math, re
OUT=Path(__file__).resolve().parents[1]; ROOT=OUT.parents[3]
INPUT=ROOT/'assets/marketing/instagram/introduction-carousel-ru-v1/originals'
if not INPUT.exists():INPUT=OUT/'originals'
for d in ['editable','exports','originals']:(OUT/d).mkdir(exist_ok=True)
P='#6716A4'; DARK='#391052'; Y='#FFCA00'; C='#FFF9ED'; L='#EBDDF3'; W='#FFFFFF'; INK='#33253C'; MUT='#78667F'
CHECKS=[]
def esc(t):return html.escape(str(t),quote=True)
def g(name,s,transform=''):return f'<g id="{esc(name)}"'+(f' transform="{transform}"' if transform else '')+f'>{s}</g>'
def r(x,y,w,h,c,rad=0,stroke=None,sw=2):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rad}" fill="{c}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def circle(x,y,rad,c,stroke=None,sw=2):return f'<circle cx="{x}" cy="{y}" r="{rad}" fill="{c}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def path(d,c=P,sw=5,fill='none',extra=''):return f'<path d="{d}" stroke="{c}" stroke-width="{sw}" fill="{fill}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'
def tx(lines,x,y,size=32,color=P,bold=False,lh=None,serif=False,maxw=944,name='copy'):
 if isinstance(lines,str):lines=[lines]
 family='Georgia' if serif else 'Arial'; weight=700 if bold else 400
 fpath='/System/Library/Fonts/Supplemental/Georgia Italic.ttf' if serif else '/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf'
 font=ImageFont.truetype(fpath,size); lh=lh or size*1.12
 for s in lines:
  width=font.getlength(s); CHECKS.append([s,round(width,2),maxw]);
  if width>maxw:raise ValueError(f'{name}: {s}: {width:.1f} > {maxw}')
 text=''.join(f'<tspan x="{x}" y="{y+i*lh:g}">{esc(s)}</tspan>' for i,s in enumerate(lines))
 return g(name,f'<text font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}"'+(' font-style="italic"' if serif else '')+f'>{text}</text>')
def rot(s,a,x,y,name='tilted-object'):return g(name,s,f'rotate({a} {x} {y})')
logosrc=(INPUT/'omnica-logo-vector.svg').read_text(); inner=logosrc[logosrc.index('>',logosrc.index('<svg'))+1:logosrc.rindex('</svg>')]
def logo(x=66,y=52,w=228,dark=False):
 b=r(x-14,y-10,w+28,w*814/2399+20,C,12) if dark else ''
 return g('Original-vector-brand',b+f'<svg x="{x}" y="{y}" width="{w}" height="{w*814/2399}" viewBox="0 0 2399 814">{inner}</svg>')
def frame(file,x,y,w,h,box=(0,0,390,845),angle=0,name='Real-screen'):
 src=INPUT/file
 if src.resolve()!=(OUT/'originals'/file).resolve():shutil.copy2(src,OUT/'originals'/file)
 data=base64.b64encode(src.read_bytes()).decode(); sx,sy,bw,bh=box
 hraw=844 if file.startswith('03-') else 845
 s=r(x+10,y+14,w,h,DARK,15)+r(x-5,y-5,w+10,h+10,W,15)
 s+=f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{sx} {sy} {bw} {bh}" preserveAspectRatio="xMidYMin slice" overflow="hidden"><image x="0" y="0" width="390" height="{hraw}" xlink:href="data:image/jpeg;base64,{data}"/></svg>'
 return rot(g(name,s),angle,x+w/2,y+h/2,name+'-rotation') if angle else g(name,s)
def label(s,x,y,w,angle=0,c=Y,color=P):
 size=min(22,int((w-34)/ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',22).getlength(s)*22))
 b=r(x,y,w,49,c,7)+tx(s,x+17,y+33,size,color,True,maxw=w-30,name='Label-'+s)
 return rot(b,angle,x+w/2,y+24)
def curve(d,c=P,sw=5):return g('Flowing-connector',path(d,c,sw))
def footer(n,dark=False):
 col=C if dark else P
 return tx('omnicaenglish.com',66,1300,22,col,name='Website')+tx(f'{n} / 7',940,1300,23,P if n==6 else col,True,maxw=90,name='Sequence')
def doc(n,s,bg=C,dark=False):
 return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350"><title>Omnica English — {n:02d}</title><desc>Editable editorial carousel, Russian. Original logo and screenshot inserts; live Arial and Georgia text; empty photo frames on slide 2. No image generation.</desc>{g("Background",r(0,0,1080,1350,bg))}{logo(dark=dark)}{s}{footer(n,dark)}</svg>'
SLIDES=[]
# 1 — a bold editorial opening, with an unfinished conversation continuing off the page
s=label('АНГЛИЙСКИЙ ОДИН НА ОДИН',650,71,359,-3,C,P)
s+=tx(['Урок','закончился.'],66,290,116,C,True,121,name='Cover-hook')
s+=tx('Практика —',70,565,86,C,True,name='Cover-link')
s+=tx('продолжается.',66,678,108,Y,serif=True,name='Cover-emphasis')
s+=curve('M-40 855 C190 675 257 1100 510 895 S850 760 1155 1040',Y,8)
s+=rot(r(83,836,390,218,C,22)+tx('УРОК',109,881,20,P,True)+tx(['“Can I say it','another way?”'],109,943,38,P,lh=46,maxw=340),-7,278,945,'Conversation-bubble')
s+=rot(r(665,941,325,170,Y,22)+tx(['Слова. Практика.','Обратная связь.'],691,1010,29,P,True,42,maxw=283),6,828,1026,'Learning-bubble')
s+=tx(['Занятия с преподавателем и понятная','практика между встречами — в одном кабинете.'],70,1164,31,C,lh=43,name='Cover-description')
SLIDES.append(doc(1,s,P,True))
# 2 — asymmetrical empty portrait spaces and human teacher introductions
s=tx('Сначала —',66,238,90,P,True,name='Teachers-intro')+tx('живой разговор.',66,339,100,P,serif=True,name='Teachers-title')
s+=curve('M1085 420 C840 349 856 652 690 662 C593 669 594 545 643 515',P,4)
s+=rot(r(83,415,445,440,L,20,stroke=P,sw=2)+path('M110 453 h44 M110 453 v44 M499 817 h-44 M499 817 v-44',P,2),-4,305,635,'Sally-empty-photo')
s+=rot(r(626,512,352,360,Y,20)+path('M651 540 h38 M651 540 v38 M950 843 h-38 M950 843 v-38',P,2),5,802,692,'Mustafa-empty-photo')
s+=label('МОЖНО СПРОСИТЬ ПО-РУССКИ',102,792,411,-5,C,P)
s+=tx('Салли',80,948,57,P,True,name='Sally-name')+tx(['Носитель английского.','Говорит по-русски.'],82,997,29,INK,lh=39,maxw=460,name='Sally-profile')
s+=tx('7 лет',79,1154,68,P,serif=True,name='Sally-experience')+tx('преподавания',271,1153,25,INK,maxw=250)
s+=tx('Мустафа',616,959,49,P,True,maxw=410,name='Mustafa-name')+tx(['Свободно владеет','английским.'],618,1007,29,INK,lh=39,maxw=410,name='Mustafa-profile')
s+=tx('4 года',616,1154,66,P,serif=True,maxw=410,name='Mustafa-experience')+tx('преподавания',620,1194,25,INK,maxw=410)
SLIDES.append(doc(2,s))
# 3 — real cards, closer crops, contrasting scale, a curved transition
s=tx('Из разговора —',66,245,87,P,True,name='Words-title')+tx('в память.',306,350,114,P,serif=True,maxw=710,name='Words-emphasis')
s+=tx(['Преподаватель проверяет слова с урока.','Вы повторяете их в карточках.'],70,437,32,INK,lh=44,name='Words-description')
s+=curve('M-30 632 C113 533 137 771 371 744 S622 510 724 577',P,5)
s+=frame('10-flashcard-front-ru.jpg',80,583,410,450,(0,153,390,427),-7,'Word-card-front')
s+=frame('11-flashcard-answer-ru.jpg',520,704,470,465,(0,153,390,387),6,'Word-card-answer')
s+=label('СЛОВО С ВАШЕГО УРОКА',110,1083,353,-5)
s+=path('M429 597 Q572 570 640 655 M622 627 L640 655 L607 655',P,5)
s+=tx(['Перевод и пример сохраняют связь','с тем, что вы обсуждали на занятии.'],70,1194,29,INK,lh=40,name='Words-context')
SLIDES.append(doc(3,s))
# 4 — yellow poster, teacher feedback as the focal point
s=tx(['Вы пробуете.','Преподаватель'],66,250,82,P,True,94,name='Homework-title')+tx('помогает.',66,444,104,P,serif=True,name='Homework-emphasis')
s+=frame('16-homework-reviewed-ru.jpg',517,545,470,642,(0,50,390,533),5,'Reviewed-homework-screen')
s+=tx(['Задания,','исправления,','обратная связь.'],70,656,41,P,True,58,maxw=436,name='Feedback-detail')
s+=tx(['Материалы остаются','в личном кабинете.','К ним можно вернуться','после занятия.'],72,914,31,P,lh=44,maxw=420,name='Homework-history')
s+=path('M90 1099 l28 28 57 -77 M220 1087 C292 1060 348 1085 426 1074 M401 1060 L426 1074 L406 1095',P,6)
s+=label('ПРИМЕР ПРОВЕРЕННОЙ РАБОТЫ',524,1161,444,5,C,P)
SLIDES.append(doc(4,s,Y))
# 5 — reading spread, one display word, real library and lookup screenshots
s=tx('А ещё —',66,229,82,P,True,name='Reading-intro')+tx('можно читать.',66,327,88,P,True,name='Reading-title')
s+=tx('Бесплатно.',554,442,77,P,serif=True,maxw=475,name='Reading-emphasis')
s+=path('M558 464 C695 481 885 446 1012 470',Y,15)
s+=frame('03-live-library-ru.jpg',69,529,421,587,(0,351,390,543),-4,'Real-library-cards')
s+=frame('07-student-word-translation-en.jpg',557,529,447,587,(0,85,390,512),5,'Real-reading-lookup')
s+=label('БЕЗ ПОКУПКИ УРОКОВ',87,1088,355,-4)
s+=tx(['Незнакомое слово? Нажмите, посмотрите перевод','и сохраните его для повторения.'],70,1191,30,INK,lh=42,name='Reading-description')
SLIDES.append(doc(5,s))
# 6 — the collection connects independent reading with teacher-led learning
s=tx(['Всё, что вы','собрали, —'],66,243,88,C,True,103,name='Collection-title')+tx('остаётся с вами.',66,454,90,Y,serif=True,name='Collection-emphasis')
s+=tx(['Слова из занятий и чтения — в одном словаре.','Система назначает повторения в карточках.'],70,544,31,C,lh=43,name='Collection-description')
s+=frame('15-my-words-ru.jpg',82,676,469,527,(0,55,390,438),-5,'Personal-vocabulary-screen')
s+=circle(835,1110,300,Y)
s+=curve('M598 812 C802 628 1098 782 951 946 C817 1099 645 1005 695 934',Y,5)
s+=path('M677 951 L695 934 L714 957',Y,5)
s+=tx(['Повторить','вовремя.'],586,1071,67,P,serif=True,lh=80,maxw=460,name='Review-emphasis')
SLIDES.append(doc(6,s,P,True))
# 7 — strong price poster with a single booking invitation
s=tx(['Давайте'],66,254,112,P,True,name='Trial-intro')+tx('познакомимся.',66,364,100,P,serif=True,name='Trial-emphasis')
s+=tx(['Попробуйте занятие один на один','с преподавателем Omnica English.'],72,462,33,INK,lh=45,name='Trial-description')
s+=rot(r(-30,579,1140,284,Y),-4,540,721,'Price-banner')
s+=tx('ПРОБНЫЙ УРОК',72,644,29,P,True,name='Trial-label')+tx('1 500 ₸',63,823,170,P,True,name='Trial-price')
s+=path('M1012 937 C931 939 934 1012 850 1023 M870 1005 L850 1023 L878 1037',P,5)
s+=tx(['Запишитесь по ссылке','в профиле →'],72,977,48,P,True,62,name='Trial-action')
s+=tx(['Пока не готовы к занятиям?','Начните с бесплатной библиотеки.'],76,1165,30,INK,lh=44,name='Independent-option')
SLIDES.append(doc(7,s))
for i,svg in enumerate(SLIDES,1):(OUT/'editable'/f'{i:02d}-slide.svg').write_text(svg)
master=''.join(f'<g id="Slide-{i+1:02d}" transform="translate({i*1120} 0)">{s[s.index(">",s.index("<svg"))+1:s.rindex("</svg>")]}</g>' for i,s in enumerate(SLIDES))
(OUT/'editable'/'all-seven-slides.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="7800" height="1350" viewBox="0 0 7800 1350">{master}</svg>')
if (INPUT/'omnica-logo-vector.svg').resolve()!=(OUT/'originals'/'omnica-logo-vector.svg').resolve():shutil.copy2(INPUT/'omnica-logo-vector.svg',OUT/'originals'/'omnica-logo-vector.svg')
(OUT/'source'/'text-checks.json').write_text(json.dumps(CHECKS,ensure_ascii=False,indent=2))
print(f'Built {len(SLIDES)} new compositions; {len(CHECKS)} text width checks passed.')
