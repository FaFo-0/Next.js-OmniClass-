# Как учимся / How we learn — direction A

Ten Russian Instagram Stories and a cover, following an illustrative shopping lesson through conversation, notes, vocabulary, flashcards, homework and feedback. A separate reading example connects back to the same word list.

The real fictional-QA screenshots come from related shopping exercises on different capture dates, not a single documented student session. The headline and example labels make the illustrative nature clear. No learning outcome is promised, and the demonstration score is not a testimonial.

- `exports/`: eleven 1080 × 1920 PNGs. 00 is the cover; publish 01–10 in order.
- `editable/`: live-text SVGs with named groups and physically pre-cropped embedded screenshots; `components.svg` contains reusable shapes.
- `index.html`: visual Russian/English review gallery.
- `review/english-and-russian.md`: complete translations, including Russian labels inside screenshots, and posting notes.
- `review/`: individual 360 × 640 PNG previews and review strips.
- `originals/`: original vector logo and complete real screenshot captures.
- `crops/`: screenshot crops prepared before embedding; no clipping masks.
- `source/`: Python build, Sharp rendering, bilingual manifest and measured text-width checks.

Live text uses Arial. Native Affinity 3.3.1 import/editing remains unverified. Previous assets are preserved. No generated imagery or browser QA was used. Nothing was posted to Instagram.

Ensure the Instagram profile link points to https://omnicaenglish.com before posting. The trial is paid; current pricing stays on the website. Free reading and flashcards do not require a lesson purchase.

Rebuild from the repository root:

```sh
python3 assets/marketing/instagram/how-we-learn-ru-v1/source/build.py
node assets/marketing/instagram/how-we-learn-ru-v1/source/render.cjs
```
