# Omnica English — distinct Instagram highlights

Eight icon covers; 10 ready-content Stories and 6 editable templates. Original carousel and earlier assets preserved.

Open individual SVGs in Affinity and save as a native Affinity document. Text, icons and shapes remain editable. Screenshot inserts are real pre-cropped embedded PNGs: their crop no longer depends on SVG clipping interpretation. Native Affinity import has not been verified. Fonts: Arial, Georgia Italic. Stories 1080×1920; content between y=235 and 1660. Covers keep icons inside a central circle. Instagram may crop the cover to a circle.

`exports/` contains PNGs. `covers/`, `stories/`, `templates/` contain editable SVGs. `source/manifest.json` explains every card in English.

Before publishing templates: replace bracketed fields, remove editing instructions, insert actual teacher photos, confirm current prices and currency. Reviews are placeholders only: publish genuine permissioned feedback. Add booking/link stickers in Instagram. Photos deliberately left empty. Do not publish placeholders.

Suggested highlights: Начать (Start here), Преподаватели (Teachers), Как учимся (How we learn), Библиотека (Library), Цены (Pricing), О нас (About us), Вопросы (FAQ), Отзывы (Reviews—later). Teacher cover title can be shortened to Учителя if Instagram truncates it. Pricing/business rules remain governed by repository POLICY.md; no policy terms invented here.

Rebuild: python3 source/build.py; node source/render.cjs. No image generation.
