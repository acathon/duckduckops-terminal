# The duck as the chat pet: sprite specs

The chat pet is the little animated character next to the chat input. In VS Code it is "Buddy";
DuckDuckOps replaces it with the duck. This page says exactly what to draw, so the frames fit the
pet's code (`src/vs/workbench/contrib/chat/browser/widget/chatPetWidget.ts`) without changes.

## The short version

- Draw at **24 × 24 pixels** for a normal frame. Each pixel becomes a 4 × 4 block in the
  app (96 × 96), so **draw pixel by pixel, never scale or blur**. The reference sheets in
  [`docs/duck-pet/`](duck-pet/) show Buddy, the pet the duck replaces, on this grid, frame by frame.
- **One colour per pixel, from the palette below**, on a **transparent background** (fully
  transparent or fully opaque, nothing in between).
- The duck **faces right**. The app mirrors it to face left.
- **Draw the eyes in.** (Buddy's eyes follow the mouse; the duck's don't, to start with.)
- Send each frame as its own PNG, named `duck-<state>-<number>.png` (for example `duck-idle-1.png`,
  `duck-idle-2.png`). I put the frames together into the sheets the app needs.

A pixel editor makes this easy: [Aseprite](https://www.aseprite.org/), [LibreSprite](https://libresprite.github.io/)
or [Piskel](https://www.piskelapp.com/) (free, in the browser). AI image generators don't keep to a
pixel grid and change the duck from one frame to the next: use their pictures as the design, then
redraw each frame on the 24 × 24 grid, on a transparent background, without glow.

## Canvas

| Frame size (draw at) | In the app | Used by |
|---|---|---|
| 24 × 24 | 96 × 96 | most states |
| 30 × 24 | 120 × 96 | sleep, waking (room for the "Z"s) |
| 42 × 24 | 168 × 96 | typing (room for a keyboard or laptop) |
| 40 × 24 | 160 × 96 | press-button (room for a button) |
| 48 × 24 | 192 × 96 | painting (room for an easel) |
| 24 × 32 | 96 × 128 | dizzy (room for stars above the head) |
| 41 × 31 | 164 × 124 | sing |

- In wider frames the duck stays in the **left-hand 24 × 24** square, in the same place as in a
  normal frame; the extra columns on the right are for the prop (keyboard, button, easel, "Z"s).
- In the taller dizzy frame the duck stays in the **bottom 24 × 24**; the extra rows above are for
  the stars.
- The duck **stands on the bottom row** (row 24) in every frame, so it doesn't jump between states.
- Every frame of one state has the same size. No margins or padding per frame.

## Palette

Use only these colours, exactly (hex). Fewer is fine.

| Colour | Hex | For |
|---|---|---|
| Yellow | `#FFD23F` | head and body |
| Yellow shade | `#E0A800` | the shaded side, under the beak |
| Orange | `#FF8C1A` | beak, feet |
| Orange shade | `#D96A00` | beak opening, shaded feet |
| Navy | `#1B2A5C` | headset band, hoodie |
| Navy shade | `#121C3D` | hoodie folds, headset ear cups |
| Cyan | `#35C8F5` | headset rings, the `>_` on the hoodie |
| Dark | `#191A1B` | eyes, outlines where needed |
| White | `#FFFFFF` | eye highlight, "Z"s, stars, speech |
| Red | `#E6536F` | hearts (love) only |

Keep the duck readable at 24 × 24: head about 12–14 pixels wide on top, beak 4–5 pixels pointing
right, the headset band 1–2 pixels over the head, the hoodie as the bottom 7–8 rows. No logos (no VS Code
logo): `>_` on the hoodie.

## States

"Frames" is how many different pictures the state has; "timing" is how long each one stays on screen,
in milliseconds. You may draw fewer different frames and repeat them: tell me which frame goes where.

### First version (6 states)

These are enough for the duck to work. The other states fall back to these until they are drawn.

| State | When it plays | Size | Frames | Timing (ms) | Plays |
|---|---|---|---|---|---|
| idle | nothing happening | 24 × 24 | 2: standing, then 1–2 pixels lower (breathing) | 800, 1200 | loop |
| rendering | Copilot is working on an answer | 24 × 24 | 2: like idle, but busy (looking down, the headset's microphone on) | 800, 1200 | loop |
| typing | you are typing in the chat | 42 × 24 | 2 | 320, 480 | loop |
| sleep | 20 s without activity | 30 × 24 | 8 (eyes closed, "Z"s rising) | 300 each | loop |
| waking | woken by a click or a message | 30 × 24 | 8 (from asleep to awake) | 160, 100, 80, 90, 90, 90, 100, 170 | once |
| worry | something went wrong | 24 × 24 | 2 | 600, 600 | loop |

### Later (the other 16)

| State | When it plays | Size | Frames | Timing (ms) | Plays |
|---|---|---|---|---|---|
| clapping | an action waits for your approval | 24 × 24 | 13 | 80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80 | loop, about 2 s |
| love | you pet it (click) | 24 × 24 | 6 | 200, 200, 380, 100, 80, 1980 | loop |
| press-button | it confirms something | 40 × 24 | 6 | 500, 300, 350, 250, 450, 1000 | once |
| painting | an image is being made | 48 × 24 | 8 | 240, 160, 180, 220, 180, 160, 240, 320 | loop |
| search | it searches | 24 × 24 | 4 | 500 each | once |
| speech | it says something (with a bubble) | 24 × 24 | 6 | 220, 220, 220, 100, 160, 180 | loop |
| speechless | rare reaction | 24 × 24 | 5 | 400, 120, 1000, 120, 1080 | loop |
| yapping | rare reaction (beak open) | 24 × 24 | 5 | still frames | — |
| cool | rare transformation (sunglasses) | 24 × 24 | 9 | 600, 120, 120, 120, 160, 80, 80, 80, 1640 | once |
| sing | rare reaction | 41 × 31 | 4 | 180 each | loop |
| dizzy | turned around too fast | 24 × 32 | 8 | 120 each | loop |
| jump | thrown upwards | 24 × 24 | 6 | 70, 80, 90, 160, 100, 100 | once |
| falling | falling after a throw | 24 × 24 | 6 | 120, 80, 80, 120, 80, 80 | loop |
| splat | lands on the floor | 24 × 24 | 4 | 120, 100, 100, 200 | once |
| wall-impact | hits the side | 24 × 24 | 1 | — | still |
| respawn | disappears and comes back | 24 × 24 | 6 | 120, 100, 120, 240, 100, 120 | once, also played backwards |

## For each state, also

- **Which frame is the still picture**, shown to people who turn animations off (Windows "Show
  animations" off). It should show the state on its own: for typing, the duck at the keyboard.
- **Nothing outside the frame.** Sparkles, hearts, "Z"s and stars must fit in the frame size above.

## What stays from Buddy

Buddy can wear hats (accessories) and change colour. Hats are placed by points on Buddy's head, so
they won't fit the duck: the duck has no hats in the first version. The colour change swaps Buddy's
blue and green; the duck keeps its own colours.

## Trying a concept sheet

[`build/ddo/duckPetFromSheet.ps1`](../build/ddo/duckPetFromSheet.ps1) cuts the ducks out of a sheet
(ducks on a transparent background) and writes the duck's sheets, with Buddy's names, sizes and
frame counts, to `src/vs/forge/browser/media/duckPet`, which `forge.petSprites` in `product.json`
points the pet to. Its `$frames` table says which duck of the sheet each frame shows. The first
version of the duck comes from an AI concept sheet this way; frames drawn to this page replace it.
