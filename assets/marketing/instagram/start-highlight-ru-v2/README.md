# Начать / Start — direction A

Nine Russian Instagram Stories and one cover, designed around a first visit to Omnica English. Reference palette, circular arrow cover and curved footer retained; purple opening/closing, cream explanations and yellow trial invitation create variation.

- `exports/`: ten publishable 1080 × 1920 PNGs. 00 is the cover; 01–09 are the posting order.
- `editable/`: individual editable SVGs with live Arial text, named groups, vector shapes and embedded pre-cropped screenshot PNGs; `components.svg` is an additional reusable source sheet.
- `index.html`: visual review gallery with Russian copy and complete English translation.
- `review/english-and-russian.md`: full copy, screenshot-label translations and posting notes.
- `review/`: 360 × 640 previews for inspection.
- `originals/`: untouched original logo and real fictional-QA screenshots used in these Stories.
- `crops/`: physically cropped screenshots; no SVG clipping masks or remote assets.
- `source/`: reproducible Python build and Sharp render scripts, bilingual manifest and measured text checks.

Native Affinity 3.3.1 import was not verified. No generated imagery, invented photos, reviews or regional prices. Previous asset folders are unchanged. The trial is paid; the slides send viewers to the website for its current price. Ensure the Instagram profile link points to https://omnicaenglish.com before posting. Nothing was posted to Instagram.

Rebuild from the repository root:

```sh
python3 assets/marketing/instagram/start-highlight-ru-v2/source/build.py
node assets/marketing/instagram/start-highlight-ru-v2/source/render.cjs
```

Revision from v1: Story 7 now gives a brief introduction to free reading and points to the Library highlight. The word-lookup screenshot and three-action tutorial were removed. All other posting PNGs and the cover are visually unchanged. The full English translation was updated. v1 is preserved.
