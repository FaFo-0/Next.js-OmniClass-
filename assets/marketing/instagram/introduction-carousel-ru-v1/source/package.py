from pathlib import Path
import json, xml.etree.ElementTree as ET, zipfile, shutil, html
import build
p=build.OUT
kit=build.rect(0,0,1080,1680,build.C)+build.logo()+build.text('КОМПОНЕНТЫ ДЛЯ НОВЫХ ПОСТОВ',72,220,34,build.P,700)
kit+=build.text(['Ваш заголовок','на две строки'],72,330,70,build.P,700,84,name='Reusable-heading')
kit+=build.text('Короткое пояснение к публикации.',76,500,30,build.INK,name='Reusable-body-text')
kit+=build.group('Reusable-yellow-label',build.rect(72,560,390,62,build.Y,12)+build.text('БЕСПЛАТНАЯ БИБЛИОТЕКА',96,600,23,build.P,700))
kit+=build.group('Reusable-primary-CTA',build.rect(72,680,936,108,build.P,16)+build.text('Ваш призыв к действию →',110,748,38,build.C,700))
kit+=build.group('Reusable-info-card',build.rect(72,850,450,280,'#FFFFFF',20,build.LINE)+build.text('Заголовок карточки',100,910,31,build.P,700)+build.text(['Описание в две строки.','Замените его своим текстом.'],100,980,26,build.INK,lh=40))
kit+=build.group('Reusable-empty-photo',build.rect(580,850,428,280,build.C,12,build.LINE))
kit+=build.group('Reusable-step',build.rect(72,1200,48,40,build.Y,8)+build.text('01',81,1230,20,build.P,700)+build.text('Название пункта',150,1230,30,build.P,700))
kit+=build.group('Reusable-arrow',build.arrow(800,1220))
for i,c in enumerate([build.P,build.Y,build.C,build.INK,build.MUT]):
    kit+=build.rect(72+i*185,1340,150,80,c,12,build.LINE)+build.text(c,72+i*185,1465,23,build.P)
kit+=build.footer(1)
(p/'editable'/'reusable-components.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1080" height="1680" viewBox="0 0 1080 1680">'+kit+'</svg>')
caption='''Английский — это не только время на занятии. Важно и то, как вы возвращаетесь к материалу после него.

В Omnica English можно заниматься один на один с преподавателем, повторять слова из ваших разговоров в карточках и выполнять домашние задания с обратной связью. Материалы и история уроков остаются в личном кабинете.

Хотите практиковаться самостоятельно? В бесплатной библиотеке можно читать на английском, смотреть перевод незнакомых слов и сохранять их в свой словарь.

Мы создавали Omnica English с участием преподавателей. Хотелось сделать их ежедневную работу удобнее, а студентам дать понятную структуру: занятие, практика и повторение.

Салли — носитель английского, говорит по-русски и преподаёт 7 лет. Мустафа свободно владеет английским и преподаёт 4 года.

Познакомиться с преподавателем и попробовать формат можно на пробном уроке за 1 500 ₸. Запись — по ссылке в профиле.

Библиотека и карточки доступны бесплатно, без покупки уроков.
'''
(p/'caption.ru.txt').write_text(caption)
slides=[]
ns={'s':'http://www.w3.org/2000/svg'}
for i in range(1,8):
    name=f'{i:02d}-slide.svg'; root=ET.parse(p/'editable'/name).getroot()
    assert root.attrib['viewBox']=='0 0 1080 1350'
    texts=[''.join(x.itertext()) for x in root.findall('.//s:text',ns)]
    assert texts
    slides.append({'slide':i,'section':build.sections[i-1],'copy':texts})
(p/'source'/'copy.ru.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2))
shutil.copy2(build.ROOT/'public/brand/tenant/lockup-light.svg',p/'originals'/'omnica-logo-vector.svg')
(p/'README.md').write_text('''# Omnica English — introduction carousel, Russian v1

Seven slides, each 1080 × 1350 px. Created by Codex from vector shapes, editable text and original screenshot inserts. No ImageGen was used. Informal singular address is avoided; Russian copy uses «вы».

## Files

- `exports/01-slide.png` … `07-slide.png`: images for the carousel, in order.
- `editable/01-slide.svg` … `07-slide.svg`: individual editable sources. Open these with File → Open in Affinity; do not use Place to edit the entire slide as an imported object. The headings and body copy remain SVG text, not outlined curves. Rectangles, lines and the original logo are vector objects. Screenshots are embedded JPEGs.
- `editable/all-seven-slides.svg`: all seven designs side by side in one editable workspace, in named groups; these are groups, not native Affinity artboards.
- `editable/reusable-components.svg`: editable headings, body text, labels, cards, CTA, photo placeholder, arrow and palette.
- `originals/`: untouched screenshot inputs and original vector logo.
- `caption.ru.txt`: suggested Russian caption, including the founder's story.
- `source/`: generator, renderer, copy extraction and palette so Codex can extend the design consistently.
- `carousel-preview.png`: overview for review.

## Editing in Affinity

Use the Arial family already installed on this Mac. This is a deliberate compatibility choice so text does not need a new font installation. The original logo's artwork is retained as curves. SVG text is editable, while text INSIDE real screenshots remains part of the screenshot.

Each slide uses named SVG groups for header, footer, headlines, descriptions and screenshot inserts. After opening a source SVG in Affinity, use Save As to create your native .af working copy. The files have not yet been verified by importing into Affinity 3.3.1: the available app session became unavailable during the attempted check. Rendered PNGs were visually reviewed, and text widths checked against the layout.

Slide 2 deliberately has empty photo rectangles. Add the real teacher photos there before publishing. Do not treat those blank spaces as missing generated images.

## Content and provenance

Tutoring/trial is the primary invitation; free self-study is the secondary entrance. Trial price follows the current documented offer. Teacher experience/native-language facts came directly from Mustafa. The founder story is paraphrased from his account of building with input from teacher friends; it does not imply that those friends are co-founders or current staff.

Screenshots were captured on 21 October 2026. Learner screens use the established fictional development account; the production library shot is cropped to actual material cards, excluding staff-only controls. Screenshots are shown as examples, not customer results. Some are cropped within SVG viewports; originals are retained unmodified. They remain raster assets at their original capture resolution; UI text is not redrawn or invented. Example flashcard answers follow the fictional learner's Russian native language, while the original sentence/English definition remain English.

The seven-slide narrative is introduction → teachers → vocabulary → homework → reading → review → trial. No social-media post was published. No app/backend changes or data writes were made for this carousel.

## Rebuilding

From the repository root:

    python3 assets/marketing/instagram/introduction-carousel-ru-v1/source/build.py
    node assets/marketing/instagram/introduction-carousel-ru-v1/source/render.cjs
    python3 assets/marketing/instagram/introduction-carousel-ru-v1/source/package.py

The Python builder uses Pillow for text-width checks; the renderer uses the repository's sharp package. The files can be edited directly in Affinity without running the generator. Rebuilding replaces generated SVGs, so save manually edited versions under new names.
''')
htmlcards=''.join(f'<figure><img src="exports/{i:02d}-slide.png" alt="{html.escape(build.sections[i-1])}"><figcaption>{i:02d} · {html.escape(build.sections[i-1])} · <a href="editable/{i:02d}-slide.svg">SVG</a></figcaption></figure>' for i in range(1,8))
(p/'index.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Omnica English — карусель</title><style>body{background:#e9e1ec;color:#34134d;font:16px Arial;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;box-shadow:0 4px 20px #34134d15}figcaption{padding:12px 0}a{color:#6716a4}</style><h1>Omnica English · Знакомство</h1><p>7 слайдов · 1080 × 1350 · Редактируемые SVG · Фото пока не добавлены</p><main>'+htmlcards+'</main></html>')
archive=p.parent/(p.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for f in p.rglob('*'):
        if f.is_file() and '__pycache__' not in f.parts:z.write(f,p.name+'/'+str(f.relative_to(p)))
print('Validated editable text and packaged',archive)
