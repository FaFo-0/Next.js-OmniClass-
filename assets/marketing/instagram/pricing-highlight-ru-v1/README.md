# Цены / Pricing — concise link-led highlight

Three Russian Instagram Stories plus a cover. Prices and offer details stay on the pricing page; these Stories provide the destination and essential booking/payment information. The supplied palette, original logo, simple cover icon and curved footer match the previous highlights.

## Before posting Story 1

Add a native Instagram **Link** sticker underneath the arrow:

- URL: https://omnicaenglish.com/prices?lang=ru
- Suggested label: **Смотреть цены** — **View prices**.
- Reserved space: approximately x=200–880, y=1380–1510 on the 1080 × 1920 canvas.

The printed URL in a PNG is not tappable. The native sticker must be added in Instagram before posting and saving the Story to the Pricing highlight. `source/posting.json` contains the same URL, label and coordinates.

## Files

- `exports/`: four 1080 × 1920 PNGs. 00 is the cover; post 01–03 in order.
- `editable/`: individual SVGs with live Arial text, named vector groups and the exact original vector logo. `components.svg` holds reusable shapes.
- `index.html`: visual Russian/English review gallery and direct pricing-page link.
- `review/english-and-russian.md`: full translations, including the proposed sticker label, and posting notes.
- `review/`: 360 × 640 phone previews and the three-Story review strip.
- `originals/`: preserved original vector logo.
- `source/`: reproducible Python build, Sharp rendering, text-width checks, bilingual manifest and posting metadata.

Business wording is grounded in [POLICY.md](../../../../POLICY.md) and the existing pricing page. No policy, product behavior or prices were changed. No fixed prices, discounts, package sizes, validity numbers, photos, screenshots or generated imagery are included.

Previous highlight assets are preserved. Phone-size renders, wrapping, SVG structure and export dimensions are checked. Native Affinity 3.3.1 import/editing remains unverified. Nothing was posted to Instagram; no browser QA was performed.

Rebuild from the repository root:

```sh
python3 assets/marketing/instagram/pricing-highlight-ru-v1/source/build.py
node assets/marketing/instagram/pricing-highlight-ru-v1/source/render.cjs
```
