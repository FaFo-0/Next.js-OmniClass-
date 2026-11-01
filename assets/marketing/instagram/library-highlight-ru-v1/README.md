# Библиотека / Library

Eleven Russian Instagram Stories plus a cover, with the dedicated walkthrough of free reading and vocabulary tools. This follows the agreed separation: Start introduces free reading briefly; How we learn explains teacher-led lessons; Library owns the independent reading, word saving and flashcard experience.

Posting sequence:

1. Free reading and vocabulary access.
2. Choosing materials in the catalogue.
3. Level labels and estimated reading time.
4. Reading for overall meaning, using an actual demo-text excerpt.
5. Tapping for a word’s translation and English explanation.
6. Saving and understanding green highlighting.
7. Finding and managing saved words.
8. Recalling a flashcard answer.
9. Revealing the answer and rating recall.
10. Returning to recent materials and the last opened chapter.
11. Registering and opening the library.

The kitchen reading/save sequence uses real fictional-QA captures. The separate buy flashcard is explicitly labelled as another example. The catalogue cards are demonstration materials, not a promise of a current inventory count. The chapter diagram is labelled as an illustration, not a screenshot.

- `exports/`: twelve 1080 × 1920 PNGs. 00 is the cover; publish 01–11 in order.
- `editable/`: individual SVGs with live Arial text, named groups, original vector logo and embedded pre-cropped screenshot PNGs; `components.svg` holds reusable shapes.
- `index.html`: visual Russian/English review gallery.
- `review/english-and-russian.md`: complete translations, including Russian labels in screenshots, and posting notes.
- `review/`: 360 × 640 previews and four review strips.
- `originals/`: complete untouched source captures and original vector logo.
- `crops/`: physically prepared screenshot crops; no clipping masks or remote image URLs.
- `source/`: reproducible Python build and Sharp rendering, bilingual manifest and text-width checks.

Native Affinity 3.3.1 import/editing remains unverified. No generated imagery, invented customer results, reviews, photos or prices. Previous assets are preserved. Nothing was posted to Instagram; no browser QA was performed.

Before posting, ensure the Instagram profile website link points to https://omnicaenglish.com. The library and flashcards are free without purchasing lessons; registration is needed for personal saved vocabulary and reading progress.

Rebuild from the repository root:

```sh
python3 assets/marketing/instagram/library-highlight-ru-v1/source/build.py
node assets/marketing/instagram/library-highlight-ru-v1/source/render.cjs
```
