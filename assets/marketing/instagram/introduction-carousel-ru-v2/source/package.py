import build as b
from pathlib import Path
import shutil,json,html,xml.etree.ElementTree as ET,zipfile
from PIL import Image
p=b.OUT
kit=b.r(0,0,1080,1620,b.C)+b.logo()+b.tx('Новая история.',66,260,92,b.P,True)+b.tx('Ваш акцент.',305,370,95,b.P,serif=True,maxw=710)
kit+=b.label('ЗАМЕНИТЕ ЭТОТ ТЕКСТ',70,450,365,-5)
kit+=b.curve('M15 600 C205 400 357 835 586 610 S971 507 1100 770',b.P,6)
kit+=b.rot(b.r(75,750,430,350,b.L,20,stroke=b.P)+b.path('M95 785 h40 M95 785 v40',b.P,2),-5,290,925,'Empty-portrait-reusable')
kit+=b.rot(b.r(610,785,360,185,b.Y,22)+b.tx(['Короткая мысль.','Живой разговор.'],635,858,31,b.P,True,45,maxw=320),5,790,870,'Speech-note-reusable')
kit+=b.r(-20,1170,1120,225,b.P)+b.tx('Ваш призыв к действию →',66,1315,55,b.C,True)
kit+=b.path('M70 1450 C270 1480 505 1434 730 1459',b.Y,16)
kit+=b.tx('Текст и векторные элементы можно редактировать.',70,1550,29,b.INK)
(p/'editable'/'reusable-components.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1620" viewBox="0 0 1080 1620">{kit}</svg>')
shutil.copy2(p.parent/'introduction-carousel-ru-v1'/'caption.ru.txt',p/'caption.ru.txt')
(p/'design-notes.md').write_text('''# Editorial redesign: tool research and direction

The first version repeated a header/body/screenshots pattern. This version uses seven distinct compositions: a conversation-led cover, an asymmetrical teacher spread, vocabulary-card collage, yellow feedback poster, reading spread, vocabulary collection and trial-price poster. Flowing lines connect ideas; Arial bold contrasts with Georgia italic, both available on this Mac. Purple/yellow/cream retain the established brand. Original vector logo and actual screenshots are unchanged; screenshots are cropped and rotated as editorial inserts.

No DALL·E, ImageGen or other image-generation service was used. The editable artwork is authored programmatically with SVG; Pillow measures type and sharp renders PNG exports. Screenshots are real raster inputs and are not AI reconstructed. Dialogue on the cover is an illustrative English learning example, not an attributed quotation or a captured lesson.

Current tools reviewed via official sources:

- [Recraft editable vector generation](https://www.recraft.ai/ai-vector-generator): relevant for optional future illustration assets. Not invoked for this job.
- [Figma Buzz](https://www.figma.com/buzz/): brand templates and editable social assets. Not used for this job.
- [Affinity/Canva editable exchange](https://www.canva.com/help/sharing-export-to-canva/): SVG is an editable vector exchange format.

The priority here was a new art direction and controllable, editable layout. No account connection, paid generation or third-party upload was required. The designs are original rather than copies of searched references.
''')
(p/'README.md').write_text('''# Omnica English — Russian introduction carousel v2

Seven 1080 × 1350 slides, redesigned as an editorial story with varied compositions, curved connections, contrasting type and actual screenshot collage. Russian copy uses «вы». Teacher photo spaces remain empty by request.

## Open and edit

- Open an individual file from `editable/` in Affinity using File → Open. Headings, body text, shapes, curves and the original logo are editable objects; UI text inside screenshots remains raster.
- `editable/all-seven-slides.svg` contains the complete set side by side in named groups, not native Affinity artboards.
- `editable/reusable-components.svg` contains reusable type treatments, label, curve, photo frame, note and CTA.
- Fonts: Arial (regular/bold) and Georgia italic, already present on this Mac. No fonts need to be downloaded for this machine.
- After opening in Affinity, save a native .af working copy. Native Affinity 3.3.1 import/editability verification has not been completed; these are live-text SVG sources, not pre-verified native .af documents.

## Posting and reuse

`exports/01-slide.png` through `07-slide.png` are the posting images, in sequence. Add teacher photos to slide 2 before publishing. `carousel-preview.png` is a review contact sheet. `index.html` is a full-size gallery. `caption.ru.txt` carries suggested caption and the founder story. The original v1 is preserved separately.

Original screenshots and vector logo are in `originals/`. Source captures are from 21 October 2026: development learner examples, plus production library material cards with staff-specific controls cropped out. Example scores/cards are fictional QA data, not testimonials. Screenshot inserts retain original text and are cropped/rotated, not regenerated or retouched. The screenshots have their original limited capture resolution; PNG rendering does not invent extra UI detail.

No DALL·E, ImageGen or external generation API was used. Research and rationale are in `design-notes.md`. No Instagram publication, product change or business-policy change was made.

## Rebuild from repository root

    python3 assets/marketing/instagram/introduction-carousel-ru-v2/source/build.py
    node assets/marketing/instagram/introduction-carousel-ru-v2/source/render.cjs
    python3 assets/marketing/instagram/introduction-carousel-ru-v2/source/package.py

The code uses Pillow for text measurement and the repository's sharp for SVG rasterization. Rebuilding overwrites generated SVG files, so save manual Affinity edits under new names. All referenced images are also embedded in the SVG files.
''')
sections=['Урок и практика','Преподаватели','Слова с урока','Обратная связь','Бесплатное чтение','Ваш словарь','Пробный урок']
cards=''.join(f'<figure><img src="exports/{i:02d}-slide.png" alt="{html.escape(sections[i-1])}"><figcaption>{i} · {sections[i-1]} · <a href="editable/{i:02d}-slide.svg">SVG</a></figcaption></figure>' for i in range(1,8))
(p/'index.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Omnica English · Редизайн карусели</title><style>body{font:16px Arial;background:#e8dfed;color:#391052;margin:32px}h1{font-size:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:26px}figure{margin:0}img{width:100%;box-shadow:0 8px 30px #39105218}figcaption{padding:12px 0}a{color:#6716a4}</style><h1>Omnica English · Новая версия</h1><p>7 слайдов · 1080 × 1350 · Редактируемые SVG</p><main>'+cards+'</main></html>')
copy=[]
ns={'s':'http://www.w3.org/2000/svg'}
for i in range(1,8):
 f=p/'editable'/f'{i:02d}-slide.svg';root=ET.parse(f).getroot()
 assert root.attrib['viewBox']=='0 0 1080 1350'
 texts=[''.join(t.itertext()) for t in root.findall('.//s:text',ns)];assert texts
 with Image.open(p/'exports'/f'{i:02d}-slide.png') as im:assert im.size==(1080,1350)
 copy.append({'slide':i,'section':sections[i-1],'copy':texts})
(p/'source'/'copy.ru.json').write_text(json.dumps(copy,ensure_ascii=False,indent=2))
archive=p.parent/(p.name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for f in p.rglob('*'):
  if f.is_file() and '__pycache__' not in f.parts:z.write(f,p.name+'/'+str(f.relative_to(p)))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
print('Validated seven SVG/PNG pairs and packaged',archive)
