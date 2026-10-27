# Omnica English — introduction carousel, Russian v1

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
