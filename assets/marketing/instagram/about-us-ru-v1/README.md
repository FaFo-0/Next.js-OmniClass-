# О нас / About us — a note from the founder

Four Russian Instagram Stories plus a cover, in the approved personal-note direction:

1. Mustafa introduces himself and the purpose behind Omnica English.
2. The idea draws on the experience of friends who teach English.
3. Two complementary aims: easier teaching and clearer learning.
4. A personal closing about understanding what comes next.

First-person copy is newly drafted for Mustafa’s review from the founder facts he supplied. It is not a transcript or testimonial. No additional personal history, dates, credentials or customer results are invented. The closing name is typeset, not an imitation of a handwritten signature. The text-led design needs no portrait or placeholder removal before posting.

- `exports/`: five 1080 × 1920 PNGs. 00 is the cover; publish 01–04 in order.
- `editable/`: individual SVGs with live Arial text, named vector groups and the exact original vector logo. `components.svg` contains reusable letter/conversation elements.
- `index.html`: visual Russian/English review gallery.
- `review/english-and-russian.md`: complete English translations, editorial context and posting notes.
- `review/`: individual 360 × 640 phone previews and two review strips.
- `originals/`: untouched original vector logo.
- `source/`: reproducible Python build, Sharp rendering, bilingual manifest and measured text checks.

Previous assets are preserved. No generated imagery, photos, screenshots, product walkthroughs or price tables. Native Affinity 3.3.1 import/editing remains unverified. Phone-size renders, wrapping, SVG structure and output dimensions are checked. No browser QA or Instagram publication.

This is the final selected highlight. The selected set is Start, Teachers (existing template), How we learn, Library, Pricing and About us. FAQ and Reviews are excluded at Mustafa’s request; older files remain preserved.

Rebuild from the repository root:

```sh
python3 assets/marketing/instagram/about-us-ru-v1/source/build.py
node assets/marketing/instagram/about-us-ru-v1/source/render.cjs
```
