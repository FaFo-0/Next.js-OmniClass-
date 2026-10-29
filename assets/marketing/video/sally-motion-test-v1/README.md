# Omnica English — Sally motion test v1

Created 29 October 2026. This is a working motion-design proof, not the finished Sally advertisement. No presenter or synthetic voice is included. The approved spoken script is retained separately, unchanged.

## Watch

- `exports/omnica-motion-test.mp4`: 18-second vertical H.264/AAC preview, 1080 × 1920, 30 fps.
- `exports/flashcard-overlay.mov`: 6-second ProRes 4444 animation with verified transparency, suitable for compositing over future presenter footage. A player may display its transparent area as black; the video contains an actual alpha channel.
- `exports/storyboard.jpg`: representative frames from the rendered MP4.
- `index.html`: local video preview page.

## What is tested

- Animated vector brand graphics and Russian feature labels.
- A real vocabulary-list screenshot entering and settling into a readable hold.
- A real flashcard's front/back applied to a thin Three.js object and flipped in 3D.
- A real reviewed-homework screenshot with an animated check accent.
- A trial invitation without a price or country restriction.
- Separate transparent overlay export.

The screenshot inserts are cropped from the earlier real mobile captures; UI text is not regenerated. Learner examples use fictional development data. The small source screenshots limit fine-detail quality when enlarged; higher-resolution footage is appropriate for the final ad. Original logo, screenshot crops, original synthesized motion cues and all source code are included. No image generation, stock footage, licensed music or voice cloning was used. The synthetic sound cues are quiet accents, not narration.

## Run and edit

This is an isolated project. It does not change the platform's package.json, lockfile, runtime or backend.

    cd assets/marketing/video/sally-motion-test-v1
    npm ci
    npm run studio
    npm run render
    npm run render:overlay

The current Mac render used the installed Chrome executable by appending:

    -- --browser-executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

`src/index.jsx` is the runnable, editable React source. It uses Remotion 4.0.539 and @remotion/three. The original typed authoring copy is retained in `source/index.tsx.txt`, outside the platform's TypeScript compilation. To change words, timing, layout or screenshots, edit the JSX and files in `public/`. Animation is frame-driven, so no wall-clock timing or random runtime motion is involved. `sound.py` reproduces the original sound cues; `prepare.cjs` reproduces the crops from the existing screenshot collection using the repository's sharp package. Prepared public assets are included, so renders do not need that preparation step.

Current sequence (30 fps): intro 0–74; vocabulary 63–173; cards 162–341; homework 330–461; outro 450–539. Overlaps are intentional crossfades. OverlayTest is 180 frames. Card animation uses the same component in both exports. Resource loading is allowed to reach ThreeCanvas's suspense handler, so textures are present before rendered frames are captured.

## Verification

The MP4 decoded completely with FFmpeg without decode errors. ffprobe confirmed 1080 × 1920 H.264 at 30 fps plus AAC, with an 18.005-second container duration. Key scenes and a mid-flip frame were visually reviewed. A still rendered successfully from the final JSX entry. The overlay is ProRes 4444 at 1080 × 1920/30 fps, 6.0 seconds, decoded as yuva444p12le; an extracted 16-bit alpha frame contains both 0 (transparent) and 65535 (opaque). This establishes that the card can be composited, not only rendered on a solid background.

The preview does not demonstrate compositing with Sally's actual footage or synchronize to her speech; those checks require the future recording. The full approved script remains in approved-script.ru.txt and approved-script.en.txt.

## Filming later

Film vertically at eye level in 1080p or 4K, with clear sound and some space around Sally's face and shoulders. Keep a clean original without baked-in captions, filters or music. Speak naturally and leave a short pause before and after the take; final graphics and subtitles can be timed to her actual delivery.

## References

- https://www.remotion.dev/docs/three
- https://www.remotion.dev/docs/three-canvas
- https://www.remotion.dev/docs/transparent-videos
