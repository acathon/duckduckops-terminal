# The duck as the chat pet: sprite specs

The chat pet is the little animated character next to the chat input. In VS Code it is "Buddy";
DuckDuckOps replaces it with the duck. This page says exactly what to draw, so the frames fit the
pet's code (`src/vs/workbench/contrib/chat/browser/widget/chatPetWidget.ts`) without changes.

## The short version

- Draw at **small size: 12 × 12 pixels** for a normal frame. Each pixel becomes an 8 × 8 block in the
  app (96 × 96), so **draw pixel by pixel, never scale or blur**.
- **One colour per pixel, from the palette below**, on a **transparent background** (fully
  transparent or fully opaque, nothing in between).
- The duck **faces right**. The app mirrors it to face left.
- **Draw the eyes in.** (Buddy's eyes follow the mouse; the duck's don't, to start with.)
- Send each frame as its own PNG, named `duck-<state>-<number>.png` (for example `duck-idle-1.png`,
  `duck-idle-2.png`). I put the frames together into the sheets the app needs.

A pixel editor makes this easy: [Aseprite](https://www.aseprite.org/), [LibreSprite](https://libresprite.github.io/)
or [Piskel](https://www.piskelapp.com/) (free, in the browser). AI image generators don't keep to a
12 × 12 grid; if you use one, redraw its result pixel by pixel.

## Canvas

| Frame size (draw at) | In the app | Used by |
|---|---|---|
| 12 × 12 | 96 × 96 | most states |
| 15 × 12 | 120 × 96 | sleep, waking (room for the "Z"s) |
| 21 × 12 | 168 × 96 | typing (room for a keyboard) |
| 20 × 12 | 160 × 96 | press-button (room for a button) |
| 24 × 12 | 192 × 96 | painting (room for an easel) |
| 12 × 16 | 96 × 128 | dizzy (room for stars above the head) |

- In wider frames the duck stays in the **left-hand 12 × 12** square, in the same place as in a
  normal frame; the extra columns on the right are for the prop (keyboard, button, easel, "Z"s).
- In the taller dizzy frame the duck stays in the **bottom 12 × 12**; the extra rows above are for
  the stars.
- The duck **stands on the bottom row** (row 12) in every frame, so it doesn't jump between states.
- Every frame of one state has the same size. No margins or padding per frame.

## Palette

Use only these colours, exactly (hex). Fewer is fine.

| Colour | Hex | For |
|---|---|---|
| Yellow | `#FFD23F` | head and body |
| Yellow shade | `#E0A800` | the shaded side, under the beak |
| Orange | `#FF8C1A` | beak, feet |
| Orange shade | `#D96A00` | beak opening, shaded feet |
| Navy | `#1B2A5C` | headset, hoodie |
| Navy shade | `#121C3D` | hoodie folds, headset ear cups |
| Green | `#3DDC84` | the `>_` on the hoodie (2 pixels) |
| Dark | `#191A1B` | eyes, outlines where needed |
| White | `#FFFFFF` | eye highlight, "Z"s, stars, speech |
| Red | `#E6536F` | hearts (love) only |

Keep the duck readable at 12 × 12: head about 6–7 pixels wide on top, beak 2–3 pixels pointing
right, the headset band 1 pixel over the head, the hoodie as the bottom 3–4 rows.

## States

"Frames" is how many different pictures the state has; "timing" is how long each one stays on screen,
in milliseconds. You may draw fewer different frames and repeat them: tell me which frame goes where.

### First version (6 states)

These are enough for the duck to work. The other states fall back to these until they are drawn.

| State | When it plays | Size | Frames | Timing (ms) | Plays |
|---|---|---|---|---|---|
| idle | nothing happening | 12 × 12 | 2: standing, then 1 pixel lower (breathing) | 800, 1200 | loop |
| rendering | Copilot is working on an answer | 12 × 12 | 2: like idle, but busy (looking down, the headset's microphone on) | 800, 1200 | loop |
| typing | you are typing in the chat | 21 × 12 | 2 | 320, 480 | loop |
| sleep | 20 s without activity | 15 × 12 | 8 (eyes closed, "Z"s rising) | 300 each | loop |
| waking | woken by a click or a message | 15 × 12 | 8 (from asleep to awake) | 160, 100, 80, 90, 90, 90, 100, 170 | once |
| worry | something went wrong | 12 × 12 | 2 | 600, 600 | loop |

### Later (the other 16)

| State | When it plays | Size | Frames | Timing (ms) | Plays |
|---|---|---|---|---|---|
| clapping | an action waits for your approval | 12 × 12 | 13 | 80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80 | loop, about 2 s |
| love | you pet it (click) | 12 × 12 | 6 | 200, 200, 380, 100, 80, 1980 | loop |
| press-button | it confirms something | 20 × 12 | 6 | 500, 300, 350, 250, 450, 1000 | once |
| painting | an image is being made | 24 × 12 | 8 | 240, 160, 180, 220, 180, 160, 240, 320 | loop |
| search | it searches | 12 × 12 | 4 | 500 each | once |
| speech | it says something (with a bubble) | 12 × 12 | 6 | 220, 220, 220, 100, 160, 180 | loop |
| speechless | rare reaction | 12 × 12 | 5 | 400, 120, 1000, 120, 1080 | loop |
| yapping | rare reaction (beak open) | 12 × 12 | 5 | still frames | — |
| cool | rare transformation (sunglasses) | 12 × 12 | 9 | 600, 120, 120, 120, 160, 80, 80, 80, 1640 | once |
| sing | rare reaction | 20.5 × 15.5* | 4 | 180 each | loop |
| dizzy | turned around too fast | 12 × 16 | 8 | 120 each | loop |
| jump | thrown upwards | 12 × 12 | 6 | 70, 80, 90, 160, 100, 100 | once |
| falling | falling after a throw | 12 × 12 | 6 | 120, 80, 80, 120, 80, 80 | loop |
| splat | lands on the floor | 12 × 12 | 4 | 120, 100, 100, 200 | once |
| wall-impact | hits the side | 12 × 12 | 1 | — | still |
| respawn | disappears and comes back | 12 × 12 | 6 | 120, 100, 120, 240, 100, 120 | once, also played backwards |

\* Buddy's sing frames are 164 × 124 in the app, not a multiple of 8. For the duck we'll make them
21 × 16 (168 × 128) and adjust the code.

## For each state, also

- **Which frame is the still picture**, shown to people who turn animations off (Windows "Show
  animations" off). It should show the state on its own: for typing, the duck at the keyboard.
- **Nothing outside the frame.** Sparkles, hearts, "Z"s and stars must fit in the frame size above.

## What stays from Buddy

Buddy can wear hats (accessories) and change colour. Hats are placed by points on Buddy's head, so
they won't fit the duck: the duck has no hats in the first version. The colour change swaps Buddy's
blue and green; the duck keeps its own colours.
