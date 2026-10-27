# Omnica English — Russian introduction carousel v3

Seven 1080 × 1350 slides, redesigned as an editorial story with varied compositions, curved connections, contrasting type and actual screenshot collage. Russian copy uses «вы». Slide 2 now explains the one-to-one lesson experience. The original teacher slide remains unchanged in saved-templates/teacher-introduction/.

## Open and edit

- Open an individual file from `editable/` in Affinity using File → Open. Headings, body text, shapes, curves and the original logo are editable objects; UI text inside screenshots remains raster.
- `editable/all-seven-slides.svg` contains the complete set side by side in named groups, not native Affinity artboards.
- `editable/reusable-components.svg` contains reusable type treatments, label, curve, photo frame, note and CTA.
- Fonts: Arial (regular/bold) and Georgia italic, already present on this Mac. No fonts need to be downloaded for this machine.
- After opening in Affinity, save a native .af working copy. Native Affinity 3.3.1 import/editability verification has not been completed; these are live-text SVG sources, not pre-verified native .af documents.

## Posting and reuse

`exports/01-slide.png` through `07-slide.png` are the posting images, in sequence. The seven-slide sequence no longer contains empty photo spaces. `carousel-preview.png` is a review contact sheet. `index.html` is a full-size gallery. `caption.ru.txt` carries suggested caption and the founder story. Both v1 and v2 are preserved unchanged. The old slide 2 is also included as saved-templates/teacher-introduction/teacher-introduction.svg and .png for later teacher posts. Only slide 2 changes in the v3 seven-image sequence; the other six PNG exports are byte-identical to v2.

Original screenshots and vector logo are in `originals/`. Source captures are from 21 October 2026: development learner examples, plus production library material cards with staff-specific controls cropped out. Example scores/cards are fictional QA data, not testimonials. Screenshot inserts retain original text and are cropped/rotated, not regenerated or retouched. The screenshots have their original limited capture resolution; PNG rendering does not invent extra UI detail.

No DALL·E, ImageGen or external generation API was used. Research and rationale are in `design-notes.md`. No Instagram publication, product change or business-policy change was made.

## Rebuild from repository root

    python3 assets/marketing/instagram/introduction-carousel-ru-v3/source/build.py
    node assets/marketing/instagram/introduction-carousel-ru-v3/source/render.cjs
    python3 assets/marketing/instagram/introduction-carousel-ru-v3/source/package.py

The code uses Pillow for text measurement and the repository's sharp for SVG rasterization. Rebuilding overwrites generated SVG files, so save manual Affinity edits under new names. All referenced images are also embedded in the SVG files.
