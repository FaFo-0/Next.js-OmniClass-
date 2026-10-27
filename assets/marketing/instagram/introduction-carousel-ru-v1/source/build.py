from pathlib import Path
import base64, json, re, shutil, html
from PIL import ImageFont
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parents[1]
SCREENS=ROOT/'assets/marketing/screenshots/2026-10-21/phone'
if not SCREENS.exists():SCREENS=OUT/'originals'
for d in ['editable','exports','originals']:(OUT/d).mkdir(exist_ok=True)
P='#6716A4'; D='#34134D'; Y='#FFCA00'; C='#FFF9ED'; L='#F0E7F5'; INK='#2E2436'; MUT='#6F6374'; LINE='#DED1E5'
FONT='Arial'
fontfiles={400:'/System/Library/Fonts/Supplemental/Arial.ttf',700:'/System/Library/Fonts/Supplemental/Arial Bold.ttf'}
checks=[]
def e(s):return html.escape(str(s),quote=True)
def group(name,body):return f'<g id="{e(name)}" inkscape:label="{e(name)}">{body}</g>'
def rect(x,y,w,h,fill,rx=0,stroke=None):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="2"' if stroke else '')+'/>'
def text(lines,x,y,size=30,color=INK,weight=400,lh=None,maxw=None,name='text'):
    if isinstance(lines,str):lines=[lines]
    lh=lh or size*1.28
    f=ImageFont.truetype(fontfiles[weight],size)
    for line in lines:
        width=f.getlength(line)
        checks.append({'text':line,'width':round(width,1),'limit':maxw or 936,'fits':width<=(maxw or 936)+1})
        if maxw and width>maxw+1:raise ValueError(f'Text too wide: {line} ({width}/{maxw})')
    t=''.join(f'<tspan x="{x}" y="{y+i*lh:g}">{e(line)}</tspan>' for i,line in enumerate(lines))
    return group(name,f'<text font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}">{t}</text>')
def line(x1,y1,x2,y2,color=LINE,width=2):return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}"/>'
logo_src=(ROOT/'public/brand/tenant/lockup-light.svg').read_text()
logo_inner=logo_src[logo_src.index('>',logo_src.index('<svg'))+1:logo_src.rindex('</svg>')]
def logo(x=72,y=60,w=240):return group('Brand-logo-vector',f'<svg x="{x}" y="{y}" width="{w}" height="{w*814/2399:g}" viewBox="0 0 2399 814">{logo_inner}</svg>')
def screen(file,x,y,w,h,sy=0,sh=845,label='Real-screenshot'):
    src=SCREENS/file
    
    if src.resolve()!=(OUT/'originals'/file).resolve():shutil.copy2(src,OUT/'originals'/file)
    data=base64.b64encode(src.read_bytes()).decode()
    inner=f'<image width="390" height="{844 if file.startswith(("01-","02-","03-","04-","06-","09-")) else 845}" xlink:href="data:image/jpeg;base64,{data}"/>'
    return group(label,rect(x-3,y-3,w+6,h+6,'#FFFFFF',16,LINE)+f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="0 {sy} 390 {sh}" preserveAspectRatio="xMidYMin meet" overflow="hidden">{inner}</svg>')
def arrow(x,y):return f'<path d="M{x} {y} h48 m-14 -14 14 14 -14 14" stroke="{P}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
def header(n,section,dark=False):
    b=logo()
    if dark:b=rect(56,43,272,116,C,16)+b
    b+=text(section.upper(),1008,91,18,Y if dark else P,700,maxw=340,name='Section-label') if False else ''
    b+=text(f'{n:02d} / 07',918,91,24,C if dark else P,700,maxw=100,name='Slide-number')
    b+=line(72,166,1008,166,'#9254BE' if dark else LINE)
    return b
sections=['Знакомство','Преподаватели','Слова с урока','Домашние задания','Бесплатное чтение','Ваш словарь','Пробный урок']
def footer(n,dark=False):return line(72,1267,1008,1267,'#9254BE' if dark else LINE)+text('omnicaenglish.com',72,1310,23,C if dark else P,name='Website')+text('ЛИСТАЙТЕ →' if n<7 else 'OMNICA ENGLISH',790,1310,19,C if dark else P,700,maxw=218,name='Footer-label')
def doc(n,body,dark=False):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1080" height="1350" viewBox="0 0 1080 1350"><title>Omnica English — {e(sections[n-1])}</title><desc>Editable vector artwork. Live Arial text, original vector logo, embedded real screenshots. Blank photo placeholders on slide 2.</desc>{group('Background',rect(0,0,1080,1350,P if dark else C))}{group('Header',header(n,sections[n-1],dark))}{body}{group('Footer',footer(n,dark))}</svg>'''
slides=[]
# 01: editorial cover and the central learning connection
b=text(['Английский','один на один.'],72,280,94,P,700,106,maxw=936,name='Cover-headline')
b+=text(['Занятия с преподавателем,','слова и задания — в одном кабинете.'],76,465,32,INK,lh=45,name='Cover-description')
b+=rect(72,594,936,440,L,22)
b+=text('УРОК → ПРАКТИКА → ПОВТОРЕНИЕ',104,644,20,P,700,maxw=510,name='Learning-cycle-label')
b+=text(['Общайтесь.','Разбирайтесь.','Закрепляйте.'],104,730,48,P,700,80,maxw=500,name='Learning-cycle')
b+=text(['Слова из ваших разговоров','становятся материалом','для самостоятельной практики.'],104,952,25,MUT,lh=34,maxw=500,name='Learning-cycle-description')
b+=screen('11-flashcard-answer-ru.jpg',670,620,306,388,60,495,'Screenshot-flashcard-cropped')
b+=text(['Создано с участием преподавателей —','чтобы учить и учиться было удобнее.'],76,1122,30,INK,lh=43,name='Founding-story')
slides.append(doc(1,b))
# 02: genuinely empty portraits, no AI faces or fake photos
b=text(['Познакомьтесь','с преподавателями'],72,267,72,P,700,86,maxw=936,name='Teachers-headline')
for x,name,detail in [(72,'Салли',['Носитель английского','Говорит по-русски','7 лет преподавания']),(552,'Мустафа',['Свободно владеет английским','4 года преподавания'])]:
    b+=group(name+'-card',rect(x,410,456,640,'#FFFFFF',20,LINE)+rect(x+24,434,408,290,C,12,LINE)+text(name,x+28,790,44,P,700,maxw=400,name=name+'-name')+text(detail,x+28,852,27,INK,lh=47,maxw=400,name=name+'-experience'))
b+=text(['Занимайтесь один на один: общайтесь, задавайте вопросы','и разбирайте то, что важно для вашего английского.'],76,1134,29,INK,lh=43,name='Individual-lessons')
slides.append(doc(2,b))
# 03: vocabulary from the real lesson on both sides of the same card
b=text(['Новые слова —','из ваших разговоров'],72,261,70,P,700,84,maxw=936,name='Vocabulary-headline')
b+=text(['После урока преподаватель проверяет материалы.','Слова с занятия попадают в ваши карточки.'],76,401,29,INK,lh=42,name='Vocabulary-description')
b+=text('ВСПОМНИТЕ ЗНАЧЕНИЕ',82,518,22,P,700,maxw=390,name='Front-label')+text('ПРОВЕРЬТЕ СЕБЯ',588,518,22,P,700,maxw=390,name='Back-label')
b+=screen('10-flashcard-front-ru.jpg',80,550,382,630,60,570,'Screenshot-card-front')+screen('11-flashcard-answer-ru.jpg',588,550,382,630,60,570,'Screenshot-card-back')+arrow(490,850)
b+=text('Перевод и пример помогают вернуться к контексту урока.',76,1220,27,MUT,name='Vocabulary-context')
slides.append(doc(3,b))
# 04: real homework, teacher feedback and a retained lesson history
b=text(['Домашняя работа','с обратной связью'],72,261,72,P,700,86,maxw=936,name='Homework-headline')
b+=screen('16-homework-reviewed-ru.jpg',76,420,400,806,48,785,'Screenshot-reviewed-homework')
for num,y,title,body in [('01',474,['Выполняйте задания'],['Практикуйте материал','между занятиями.']),('02',716,['Смотрите исправления'],['Преподаватель проверяет','работу и даёт обратную связь.']),('03',958,['Возвращайтесь','к материалам'],['История уроков, слова и задания','сохраняются в вашем кабинете.'])]:
    b+=rect(540,y-30,48,40,Y,8)+text(num,549,y,20,P,700,maxw=40,name='Homework-step-'+num)
    b+=text(title,540,y+67,31,P,700,40,maxw=460,name='Homework-benefit-'+num)+text(body,540,y+67+len(title)*40+18,25,INK,lh=35,maxw=460,name='Homework-detail-'+num)
slides.append(doc(4,b))
# 05: honest cropped library screenshot: staff-specific selection control not shown
b=text(['Читайте на английском.','Библиотека — бесплатно.'],72,259,64,P,700,82,maxw=936,name='Reading-headline')
b+=text(['Выберите текст по уровню и интересам.','Нажмите на незнакомое слово и посмотрите перевод.'],76,397,29,INK,lh=42,name='Reading-description')
b+=text('ВЫБЕРИТЕ ТЕКСТ',80,514,22,P,700,maxw=425,name='Library-label')+text('УЗНАЙТЕ ЗНАЧЕНИЕ СЛОВА',575,514,22,P,700,maxw=435,name='Lookup-label')
b+=screen('03-live-library-ru.jpg',80,550,425,600,351,551,'Screenshot-library-cards-cropped')+screen('07-student-word-translation-en.jpg',575,550,425,600,88,551,'Screenshot-reading-translation-cropped')
b+=rect(76,1182,928,52,Y,12)+text('Доступно без покупки уроков.',100,1218,27,P,700,name='Free-access')
slides.append(doc(5,b))
# 06: the one vocabulary collection and spaced review
b=text(['Собирайте слова.','Возвращайтесь к ним.'],72,261,70,P,700,84,maxw=936,name='Review-headline')
b+=text(['Слова из чтения и уроков — в одном списке.','Повторяйте их в карточках в своём кабинете.'],76,397,29,INK,lh=42,name='Review-description')
b+=screen('15-my-words-ru.jpg',76,485,425,704,60,645,'Screenshot-personal-vocabulary')
b+=text('ВАШИ СЛОВА',560,529,21,P,700,name='Word-list-label')
b+=text(['Личный словарь'],560,584,37,P,700,maxw=440,name='Word-list-title')+text(['Сохраняйте то, что встретили','в тексте или на занятии.'],560,640,27,INK,lh=38,maxw=440,name='Word-list-description')
b+=line(560,739,1000,739)
b+=text(['Повторение','с интервалами'],560,814,37,P,700,47,maxw=440,name='Spaced-review-title')+text(['Система назначает следующее','повторение после вашей','оценки карточки.'],560,934,27,INK,lh=38,maxw=440,name='Spaced-review-description')
b+=text(['Интерфейс на русском, английском,','арабском и казахском.'],560,1124,25,MUT,lh=35,maxw=440,name='Languages')
slides.append(doc(6,b))
# 07: paid trial is the main action, free independent study the secondary entry
b=text(['Начните','с пробного урока.'],72,282,88,C,700,104,maxw=936,name='Trial-headline')
b+=text('1 500 ₸',72,624,148,Y,700,maxw=936,name='Trial-price')
b+=text(['Познакомьтесь с преподавателем','и попробуйте формат занятий.'],78,738,35,C,lh=49,name='Trial-description')
b+=rect(72,886,936,110,Y,16)+text('Запишитесь по ссылке в профиле →',108,955,39,P,700,maxw=864,name='Main-call-to-action')
b+=rect(72,1048,936,160,C,18)+text('Хотите начать самостоятельно?',104,1104,32,P,700,name='Free-option-heading')+text('Библиотека и карточки доступны бесплатно.',104,1162,29,INK,maxw=872,name='Free-option-description')
slides.append(doc(7,b,True))
for i,svg in enumerate(slides,1):(OUT/'editable'/f'{i:02d}-slide.svg').write_text(svg)
# One editable workspace, seven named groups placed side by side.
master=''.join(f'<g id="Slide-{i+1:02d}" inkscape:label="{i+1:02d} {e(sections[i])}" transform="translate({i*1120} 0)">{s[s.index(">",s.index("<svg"))+1:s.rindex("</svg>")]}</g>' for i,s in enumerate(slides))
(OUT/'editable'/'all-seven-slides.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="7800" height="1350" viewBox="0 0 7800 1350">{master}</svg>')
(OUT/'source'/'text-width-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
(OUT/'source'/'palette.json').write_text(json.dumps({'purple':P,'yellow':Y,'cream':C,'ink':INK,'muted':MUT,'font':'Arial','canvas':[1080,1350],'safe_margin':72},indent=2))
print(f'Built {len(slides)} editable SVG slides; {len(checks)} text-width checks pass.')
