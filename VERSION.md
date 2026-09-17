# v11 — the exhibition pass, 13 September 2026

**No new features. A read of the whole build against one question: what breaks, or looks
broken, on a floor in front of strangers?** Seven things did. Two were found while working
out how to deploy to the headset — the worse of them was silently deleting the exhibition —
and one was reported from a desktop test: the session would not time out, for a reason that
had been written down as a caveat rather than treated as the bug it was. Four of them are bugs that
were reachable in ordinary use and had never been looked for, because every one of them
needs *a second visitor*, *a full room*, or *a full day* to show itself — and the piece has
only ever been driven a few minutes at a time by someone who already knows what it does.

Nothing about the composition, the flight, the reveal, the generator or the interaction
changed. `wing-gen.js`, `wing-colour.js`, `interact.js`, `hands.js`, `reveal.js`,
`guide.js`, `style.js`, `bfly-model.js` and `name-dna.js` are byte-identical to v10.5.
`tools/reach/` passes unchanged — **229 assertions, five suites, all green.**

**Deployment target: GitHub Pages.** Items 6 and 7 below are what that costs and what makes
it safe. The piece still runs unchanged behind `serve.py`, and that path is still the one
with a server-side backup.

---

## 1. The room was keeping the wrong butterflies

`CFG.maxCollected` is 12, and the room is supposed to show **the newest twelve**. It showed
a mix, and the mix got worse the busier the day got.

`collection.js` replayed the stored collection **newest first** (`.slice(-12).reverse()`),
appended each butterfly to `this.collected` as it was built, and evicted `collected[0]`
when the cap was exceeded. Spawn order **is** eviction order — so replaying newest-first
made `collected[0]` the *newest* butterfly in the room, and every name a visitor spelled
threw that one away while the oldest sat there untouched.

Measured in the running scene, ids 1–13 stored, cap 12:

| | in the room after id 13 arrives | evicted |
|---|---|---|
| v10.5 | 1, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, **13** | **#2** |
| v11 | **2**, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, **13** | #1 |

Drop the `.reverse()` and `collected[0]` is the oldest, which is what the cap has claimed to
remove since v7. The queue drains two per frame, so replaying oldest-first costs about a
tenth of a second of ordering at load and nothing after that.

**The ordering is also what keeps the two texture LRUs safe, and that is not obvious.**
`Wings` (64 records) and `WingColour` (16) both **recycle a record's canvas and texture in
place** when they evict, and a collected butterfly holds those textures *directly* in its
material — so a live butterfly reaching the front of either LRU would have its wings
silently redrawn as somebody else's, mid-flight. What prevents that is exactly that spawn
order is cache order and the cap always retires the butterfly whose textures are furthest
from being recycled. v10.5 had this property by accident; v11 has it on purpose, and says
so in the source.

## 2. A finished name wiped the next one, eleven seconds later

`accept()` arms a 20-second `setTimeout(reset)` as a fallback for the case where no
butterfly ever launches — a throttled tab, a name the seam refuses. The normal path does
not wait for it: the reveal's seven beats run 6.7 s and the caught name's fall another 2.0,
so `reset()` is called at about **8.7 s** and the fallback was left **armed for another
11.3 seconds**.

Anything typed inside that window was silently cleared. That is not an edge case — it is
the second butterfly, which is what a visitor who enjoyed the first one immediately goes
and makes, and what the next person in the queue walks up and starts.

The source justified the timer as "`reset()` is idempotent, so whichever path gets there
first wins". Idempotent it is; harmless it is not, once somebody has started spelling
again. Being *cancelled* is the property it needed. `reset()` now clears the handle,
whoever got there first.

Driven in the running scene with the delay shortened to 400 ms:

```
v10.5   accept "ANA" → reset → type "BO" → …400 ms… → typed = ""
v11     accept "ANA" → reset → type "BO" → …700 ms… → typed = "BO"
```

...and the fallback still fires when nothing ever launches, which is the case it exists for.

## 3. A-Frame was loaded from a CDN and nowhere else

One `<script src="https://aframe.io/...">` and no local copy. On a floor whose wi-fi is
down, behind a captive portal, or merely slow, **this piece is a blank white page** — and a
headset has no address bar to work that out from.

`vendor/aframe-1.6.0.min.js` is the 1.6.0 release, byte-identical
(`sha256 09bb15fb…`), loaded first; the CDN stays as a `document.write` fallback for the
case where a snapshot is missing the file. Verified: the page now loads with **one request
to `vendor/`, none to the network**.

This is the single highest-consequence item in the pass, and the cheapest.

## 4. One texture per visitor, never freed

`ui.js:nameTagTex` caches the little painted name that hangs under each collected butterfly,
keyed on `text|seed` — and unlike `letterTex` (which is bounded at 26 × 24 hue buckets
precisely because `reveal.js` quantises for it), **this key is supplied by the visitor.** One
canvas per distinct name, roughly 300 × 120 px, never disposed. A day on the floor is tens of
megabytes of GPU memory that only ever goes up: on a headset, the shape of a slow crash
rather than a visible bug.

`TAG_MAX` is 64 — several times `CFG.maxCollected`, evicted oldest-first, so an evicted
texture cannot belong to a live sprite (the same invariant fix 1 above restores). Measured
in the running scene, 400 distinct names through the cache:

| | textures held |
|---|---|
| v10.5 | +400 |
| v11 | **+0**, and the newest twelve intact |

## 5. The session never timed out on a desktop

Reported from a desktop test: "the timeout isn't working". It was not the timer values — it
was that **the quiet clock could never advance at all**, and no value would have helped.

`guide.js` derives presence from the hot set: `interact.js` hands every provider the whole
set each frame, so anything hot means the visitor is pointing at something. On a headset that
is exactly right — lower your hands and hand-tracking stops reporting a pointer, so nothing
is hovered and nobody is present.

**A mouse cursor does not go away when you stop using it.** It sits wherever it was left
while twenty-six butterflies keep flying under it, hovering a fresh one every couple of
seconds. Every one of those read as interaction. Measured in the running scene with the
cursor parked at screen centre:

```
34 s of simulated time, cursor untouched
quietT:  4.07 → 0 → 0.80 → 1.74 → 0     never once reached 2 s
state:   live the whole way
```

This had been known and written down as a "desktop-only caveat" with the advice to park the
cursor on the floor. It is not a caveat, it is the pointer model being wrong about one of its
two input devices.

**`CFG.mouseIdleMs` (2000): a motionless cursor is not a pointer.** After two seconds without
movement the mouse branch of `interact.js:tick()` stops picking — no hover, no hot id, no
presence. `readCursor()` is called from **both** `mousemove` and `mousedown`, so any movement
or any click brings it back on the very next frame (without the `mousedown` half, a click on
an idle pointer would latch and never be picked). It also removes a thing that was always
wrong to look at: a highlight sitting under an abandoned cursor, following whichever
butterfly drifted through it.

Must stay well under `guideQuietMs`, or the clock still cannot run.

### ...and the timers are 15 seconds

`guideQuietMs` 10000 + `guideQuietGrace` 5000 — **15 s from the last thing a visitor did to
the room resetting**, which is `toFarewell()` → `clearRoom()`, and the start flower back
about 1.2 s after that (`guideFarewellMin`). v11 had briefly raised these to 20 s / 10 s;
set back as asked.

Both branches driven end to end:

| | |
|---|---|
| cursor parked, nobody there | live → wrapup at 10.5 s → **farewell at 15.5 s** (the typed name cleared) → idle |
| cursor being moved, someone there | never leaves `live` |
| no pointer at all, as on a headset | live → wrapup at 10 s → farewell at 15 s → idle — **unchanged** |

(The half-second is the tail of the welcome sequence, which correctly freezes the clock while
it is still talking.)

## And a guard, since a dead scene is the worst failure there is

`dna_sequences.json` is normally written only by the piece itself, but `hydrate()` and the
localStorage mirror both fed it into the cache **unfiltered**, while `importJSON` has always
filtered. A truncated or hand-edited file therefore reached `collection.js:spawn()` — which
runs *inside the tick loop* — and a short or non-numeric `values` throws there, every frame,
for the rest of the run. `DNA.usable()` is the one test all three ways in now share; a bad
entry is skipped with a warning instead.

---

## 6. GitHub Pages was deleting the exhibition on every reload

Found while answering "is there a more professional way to run this on a Quest 3S?", which
turned out to have a more urgent answer than the question expected.

`Store.hydrate()` fetched `dna_sequences.json` on load and **replaced** the collection with
it. The code's own comment read *"no server file -> keep the mirror"* — true only when the
fetch **fails**. On a static host it does not fail: `dna_sequences.json` is a committed file
and is served perfectly happily, so every load replaced the headset's whole day with
whatever was last pushed to git, **and rewrote the localStorage mirror with it**, leaving
nothing to recover from.

Reproduced against a GitHub Pages simulator (static files, `POST` → 405):

```
made MARGARET + TOMAS   → ANA, KNZ, MARGARET, TOMAS   ✓
reload                  → ANA, KNZ                     ✗   both gone, mirror overwritten
```

A reload is not rare on an exhibition floor: the headset sleeps, the browser is reaped for
memory, somebody reopens the link.

**The served file is now a SEED, and hydrate may only ever ADD.** `mergeIn()` takes the
multiset difference by a content signature — `created | name | values`, deliberately **not
the id**, because every device counts its own ids as `max + 1` and a headset and a committed
file both produce 3, 4, 5 for entirely different visitors. Local entries are never touched,
reordered away or re-identified; only genuinely new ones are appended, only *their* ids move
and only when they clash, and the result is sorted by `created` so `slice(-maxCollected)`
still means "the newest ones".

Matched with **multiplicity rather than as a set**, because `values` is a pure hash of the
name — so the signature is effectively `created | name`, and two visitors of the same name
in the same second would otherwise collapse into one.

Four cases driven in the running scene:

| | result |
|---|---|
| static host, three reloads | 5 kept, 5 kept, 5 kept — ids stable at 1–5 |
| a committed file with **colliding ids** and 2 genuinely new entries | 5 local kept, 2 added as ids 7–8, all ids unique, chronological, 1 malformed entry skipped |
| **export → commit → reload ×3** (the real end-of-day loop) | 4, 4, 4 — no duplication |
| a **real** `serve.py` with its POST endpoint | unchanged: written to disk, read back, one GET |

**And a static host is only told once.** A POST answered `405`/`501` sets `postRefused`, so
ten saves make one failed request instead of ten — and one console line explaining where the
collection actually lives, rather than ten red ones in a console nobody can open in a
headset. Deliberately not set on a network error or a 5xx, which are the shapes a `serve.py`
that is merely restarting takes. Measured: ten saves → **2 requests for the whole page load**
(one hydrate GET, one refused POST).

## 7. `save.html` — getting the day off the device

On a static host the collection lives in the headset's own localStorage and there is no
server-side copy, so there has to be a way to get it out. `save.html` is that, and it is
**standalone on purpose**: no A-Frame, no `config.js`, no `dna-store.js`, no generator — it
reads and writes the one localStorage key directly in about forty lines of inline script,
and makes **zero network requests**. This is the page you open when something has gone
wrong, so it must not be able to go wrong in the same way.

It works because it shares an **origin** with `index.html` — localStorage is per-origin, so
opening it at the same address the headset ran the piece at gives you that headset's
collection.

Download (date-stamped, so a week of days does not overwrite itself), copy to clipboard,
the raw JSON as selectable text for when buttons are awkward in a headset, paste-and-restore,
and a wipe. Restore applies the **same `usable()` test** `dna-store.js` does, so this page can
never write something the scene would then throw on. Verified: 14 entries downloaded as valid
JSON, wipe empties it, restore brings all 14 back and rejects a malformed entry it was fed.

---

## What was measured and left alone

- **Draw calls.** 94 with two collected butterflies in the room; ~180 is the working budget
  and the reveal already sheds ~105 sprites at the moment it needs them most.
- **Spawn cost**, which is the only per-visitor hitch: `WingGen.drawWing` **0.39 ms**,
  `WingColour.render` **6.08 ms** on this Mac. Two per frame at load; one, once, on a free
  frame mid-session — and `charge` is 1.8 s of deliberately nothing, which is where it
  lands.
- **`Wings.MAX_UNIQUE` 64 against 26 keys + 12 collected.** Comfortable, and fix 1 makes the
  margin structural rather than incidental.

## Verified end to end

The whole arc driven in the running scene by pumping the four components' ticks by hand
(the browser throttles `requestAnimationFrame` in a hidden pane, which is the documented
testing trap): **idle → press the flower → welcome → spell ROSALIND → accept → charge,
arrive, settle, greet, still, coil, launch, soar → orbit**, stored, keyboard reset, reveal
released, **zero exceptions**. `?guide=live`, `?vo=0`, `?sfx=0` and `?reset=1` all still do
what they say.

# v10.5 — the controls carry glyphs, and the flowers stopped double-blending, 11 September 2026

Two files changed for behaviour (`js/ui.js`, `js/keyboard.js`), one added (`js/icons.js`),
one script tag (`index.html`). `js/guide.js` is untouched.

## Added

**Accept and delete each carry a glyph.** `icons/svg/enter.svg` and `delete.svg`'s own path
data (`js/icons.js`, new), drawn white onto a canvas at runtime via Canvas2D's `Path2D` —
the same technique `ui.js:letterTex` already uses for every letter, not a fetched or baked
image. Deliberately **not** on the blue start flower.

Each rides as a small square plane inscribed on its flower's hub lobe, added as a child of
the flower's own `THREE.Group` so it inherits drift, breathe and the press spring for free.
Accept's is spun −0.12 rad, delete's +0.15 — small, fixed, and different per control, so each
reads as pinned to its own flower rather than a level decal.

## Fixed

**Two of the three bugs below were found only because the icons made them visible** — the
flower's rendering had never had anything sitting *on* it before, at a fixed offset, for
either bug to discard.

**A baked PNG failed to upload as a WebGL texture — for one icon only.** The first pass
rasterised each SVG once to a 256×256 white-on-transparent PNG and loaded it through
`THREE.TextureLoader`, the way `bfly-model.js` loads `BODY_ALPHA`. `delete.svg`'s bake
threw `WebGL: INVALID_VALUE: texSubImage2D: bad image data` on every load and rendered
nothing; `enter.svg`'s bake, produced the same way in the same script, uploaded and
rendered correctly. Reproduced in complete isolation — a fresh texture, fresh material,
fresh plane, added directly to the running scene by hand, nothing else involved — so it
is not a load-order race against anything this build does. Python's own PNG decoder read
both files without complaint, and a plain `<img>` plus `getImageData` showed both as the
expected opaque white glyph on a transparent field; only the GPU upload path rejected one
of the two identically-produced files. Not something this codebase can fix or needs to
understand further: `js/icons.js` now holds the two SVGs' raw path data instead of any
baked pixels, and `ui.js:drawIcon()` fills a `Path2D` built from it straight onto a
`CanvasTexture` — the upload path every other texture in this codebase already goes
through without incident, sidestepping the PNG/Image decode step (and the bug) entirely.

**The surviving icon (accept's) still didn't explain delete's absence once the PNG was
fixed.** The icon sits at a small fixed offset along the flower's own local +Z, meant to
place it in front of the six lobes' new depth prepass (above). "In front" only means
"nearer the camera" for a *specific* rotation, and accept's tilt/cant (−0.33/0.24) and
delete's (0.50/−0.20) are different enough that the same local offset lands on opposite
sides of the camera-relative depth test for the two controls — accept's icon passed,
delete's was drawn, correctly textured, and discarded by its own flower's depth buffer
every frame. Found by comparing the two controls directly (accept showed an icon, delete
never did, PNG bug notwithstanding) rather than by working out the matrices by hand.
Fixed by turning the icon material's `depthTest` off outright (`renderOrder: 1` alongside
it, so it paints after its own lobes regardless of any transparent-object z-sort) — a
small fixed decal on a control that is always close and near the top of the scene has
nothing to gain from participating in 3D occlusion, and every frame it was tested against
the wrong side of the buffer for one of the two controls was a frame it never had a chance
of showing.

**`UI.blob()`'s six lobes double-blended under any fade.** They are overlapping opaque
circles sharing one material, which reads as a union for free at alpha 1 because the
z-buffer already resolves one lobe per pixel — but the moment `setAlpha()` turns transparency
on, every lobe that reaches a pixel blends over whatever the previous one left there, so a
pixel two lobes cover comes out visibly more opaque than one only a single lobe covers. Every
fade the reveal or the guide has ever driven showed this as a faint darker lattice at the
lobe seams instead of a flower fading as one piece — present since v4, never reported because
nobody was looking for banding in a control that is only ever briefly translucent.

Fixed with a depth-only prepass: each lobe is now two meshes sharing one `BufferGeometry` —
an invisible `depthMat` (`colorWrite: false`, ordinary opaque depth otherwise) and the real
transparent `colorMat`. three.js renders every opaque object before any transparent one with
no manual render call needed, so the prepass claims the z-buffer's nearest surface at every
pixel the union covers before the colour pass runs, and the colour pass's default
`LessEqualDepth` test only lets through the fragment whose z matches what the prepass wrote —
one lobe's colour per pixel, however many overlap there.

**Verified in the running scene**, not just argued: with `Guide.ctlAlpha()` forced to 0.45
and the `<canvas>` CSS-scaled 4–5× for inspection, both the accept and delete flowers
(icon included) render as a single flat-opacity colour with no seam anywhere along a lobe
boundary. At alpha 1 the result is pixel-identical to before, since the z-buffer was already
doing this work — just inside one pass instead of two — so nothing about the flower's rest
appearance changed.

```bash
sh tools/reach/run.sh              # unchanged: no headless coverage of blob() -- it is a
                                    # pure-rendering fix, verified by screenshot instead
```

---

# v10.4 — the room has sound in it, 9 September 2026

Four recordings from `sounds/sfx/` — a music bed, two wingbeats and a select click — plus a
beat of silence between pressing the start flower and the first spoken word. One new module,
`js/sfx.js`, and two lines elsewhere.

```bash
sh tools/reach/run.sh              # 229 assertions, FIVE suites — all pass
```

## What was added

**The bed.** `bg_music` on `loop = true`, running from the page's first gesture to the end of
the day. It is not part of the session: it plays through idle, through a handover and through
`?guide=0`, because it is the room rather than the piece.

**The wingbeats.** `butterfly_wing1` and `butterfly_wing2`, one at a time, picked at random
with **4–14 s** of quiet between and a 0.6 s fade at each end. Nothing triggers them and
nothing waits on them — they are atmosphere.

**The click.** `select`, on **every** activation: the blue start flower, the green accept, the
red delete, a letter butterfly and a collected one. It lives on the **one line** in
`interact.js` every activation already goes through (`activated.owner.activate(...)`), not in
the five providers' `activate()` methods — put it there and it has to be written five times
and will be missed on the sixth. The one other place it is said out loud is `keyboard.js`'s
desktop keydown convenience, which bypasses `interact.js` entirely by design.

**A beat before the first word.** `CFG.voIntroDelay` = **0.90 s**. The press has its own
sound now, and starting the narration on the same frame put the confirmation that the button
worked and the first line of the piece on top of each other, so neither read. Driven in the
running scene: pressed at frame 0, still silent at frame 20, `Voice.play` at **frame 53 =
0.883 s**, with the state held at `welcome` throughout.

## Three things that had to be got right

### The loop seam is a fade, not a crossfade

Measured off the master: `bg_music` starts at **0.116 RMS** in its first quarter-second and
ends at **0.003**. A bare `loop = true` therefore bangs, once every 2:21, for the whole day.

The level is an **envelope read off `currentTime`** — up over `sfxMusicFadeIn` (3.0 s) at the
head, down over `sfxMusicFadeOut` (2.5 s) at the tail. Because `currentTime` resets when the
element loops, that one expression is *both* the fade-in the piece opens with and the seam,
with no second element and no crossfade. It also hides the encoder padding an AAC loop leaves
at the join: the gap lands where the level is already zero. Pinned by
`tools/reach/test-sfx.js`.

### The bed's level cannot ride the render loop — found in the running scene

A-Frame's tick is `requestAnimationFrame`, and **rAF stops dead while the page is hidden**,
which on a headset is every time it comes off the face. The media clock does not stop. Caught
by watching the element's own clock advance 4.3 s with `volume` stuck at **0**: a seam crossed
while hidden would have come back up silent and stayed that way.

So `applyMusic()` is called from the element's own **`timeupdate`** (~4 Hz) as well as from
the tick. The tick still gives the smooth 60 Hz fade whenever anything is rendering; the
media clock guarantees the level is *right* when nothing is. Verified in the browser with the
pane hidden — the bed looped unrendered and came back at full gain — and pinned in the
harness by a `frames(n, render=false)` case that advances the media clock with no tick at all.

### The click is a POOL, not an element

The recording runs **1.85 s** and a visitor spelling a name presses faster than that.
Retriggering one element cuts the previous sound dead, so `CFG.sfxSelectVoices` = 4 elements
round-robin on the same file (fetched once, cache shared).

## The levels are measured, not guessed

|  | RMS | peak |
|---|---|---|
| `bg_music` | −28.5 dB | −3.8 dB |
| `select` | −30.5 dB | −13.8 dB |
| `wing1` | −42.8 dB | −21.1 dB |
| `wing2` | −46.8 dB | −30.7 dB |

The wingbeats are recorded **15–18 dB under the bed**. At matched gains they are simply not
there, so `sfxWingGain` is 1 and the **bed** is the one pulled down (`sfxMusicGain` = 0.50).
**To make the room louder or quieter, move `sfxMusicGain`** — not the wings.

The bed and the wings duck to `sfxDuck` (0.35) while `Voice.playing()`, eased over 0.5 s. That
is the seam `voice.js` left open in v10 and never called; it is called now, from `sfx.js`,
which is why it is a level write rather than a rewrite. Confirmed in the running scene: 0.500
→ 0.175 under the opening, back to 0.500 after.

## The servers now answer Range, and know what an .m4a is

Two changes in `tools/serve.py` and `tools/serve-https.py`, both of which the bed needs and
neither of which the 100 KB voice-over ever exercised.

**Range.** `SimpleHTTPRequestHandler` ignores `Range` and answers 200 with the whole file.
Chromium tolerates that for a small clip but **cannot seek inside one — and `loop = true` IS a
seek**, back to zero, every time the track ends. `_serve_range()` answers 206 for a single
range (multipart/byteranges is in the spec and no browser media element has ever sent it), and
`Accept-Ranges: bytes` goes on every response. This is also the answer to the standing note in
`audio/README.md`: "if a track plays on the desktop but not in the headset, this is the likely
cause." Now it is not. Verified against a real media element: `seekable` 0–141.2 s, a seek to
140.05 s, and the loop back round.

**The mime type.** Python's `mimetypes` calls `.m4a` **`audio/mp4a-latm`** — a raw AAC-LATM
stream, which is *not* what these files are. Chromium refuses the wrong one outright, so the
bed would have 200'd cleanly and never sounded. `extensions_map` says `audio/mp4`.

## The files

Masters stay in `sounds/sfx/` untouched. The build carries AAC copies in `audio/sfx/`, the
same argument `audio/README.md` already makes for the voice-over: **2.3 MB the lot** against
26 MB of wav, fetched over TLS by a headset on the LAN.

```bash
afconvert -f m4af -d aac -b 112000 -s 3 bg_music.wav bg_music.m4a
```

`mp3` would have been equally fine — this machine has no ffmpeg and macOS's own `afconvert`
does AAC, not mp3. The Quest browser is Chromium and plays both.

## Knobs

`CFG.sfx` (the four paths), `sfxWings`, `sfxMusicGain` / `FadeIn` / `FadeOut`, `sfxWingGain` /
`Fade` / `GapMin` / `GapMax` / `FirstGap`, `sfxSelectGain` / `Voices`, `sfxDuck` / `DuckFade`,
and `voIntroDelay`. `?sfx=0` silences the lot and leaves the narration alone, the same
read-once-never-persisted convention as `?vo=0`.

## What changed

`js/sfx.js` (new), `js/config.js`, `js/guide.js`, `js/interact.js` (one line), `js/keyboard.js`
(one line), `index.html`, `tools/serve.py`, `tools/serve-https.py`, `tools/reach/test-sfx.js`
(new), `tools/reach/run.sh`, `tools/reach/test-guide.js`, `tools/reach/stub-scene.js`,
`audio/sfx/` (new). `collection.js`, `reveal.js`, `hands.js`, `voice.js` and the whole wing
generator are byte-identical to v10.3.

# v10.3 — the name below the butterfly, the wings back on the body, and a calmer pitch, 9 September 2026

Three reported faults, each reproduced in the running scene before anything was changed and
re-measured after.

```bash
sh tools/reach/run.sh              # 193 assertions, four suites — all pass, unchanged
```

## 1. The visitor's name was written across their own butterfly

**What it was.** The reveal presented the hero at `camPos + camFwd * presentDist` — the full
**gaze** vector. The name the visitor spelled hangs at a **fixed world point**
(`keyboard.js`'s `nameGroup`, at `CFG.panelPos(nameX, nameY)`) and stays there for the whole
reveal; it only flies apart on `reveal:launch`, at the very end. So the two were never in the
same frame, and *looking at your own name walked the butterfly onto it.*

Driven in the scene, eye at 1.60 m, a 0.30 rad look-down — which is just looking at the name
you have spelled — the present spot falls from **1.660** to **1.424**, and it takes the
butterfly with it.

The name's own top is **1.46** (the world box of `nameGroup`: ANA 1.424, ROSALIND 1.460, a
full-width WMWM… 1.457), so at 1.424 the letters land across the middle of the wings.
ROSALIND came out written straight through the butterfly, which is exactly the screenshot the
fault was reported from.

**The fix, in `collection.js:presentPoint()`** — one place, called by `spawn`, `tickCharge`
and `holdPose`, which had the same three lines copied into each of them.

- **The heading is LEVELLED.** `_camLevel` is `_camFwd` with the pitch taken out and
  renormalised, derived once a frame next to `_camFwd`. Head pitch now moves the presented
  butterfly *not at all*. (Looking straight up or straight down leaves no horizontal
  component; there the camera's own up vector **is** the heading, so it stays continuous
  instead of snapping to −Z.)
- **The height has a FLOOR**, because pitch is not the only way in. It rides the visitor's
  own eye line — that is the framing the beat was built for, and a tall visitor should not
  have their butterfly presented at their chest — but never goes below the **scene's**:
  `max(camPos.y, CFG.eyeY) + presentRise`. Everything else fixed in front of the visitor (the
  name, the two controls, the flower) is hung off `CFG.eyeY`, so that is exactly the height
  already known to clear all of them.

**Pinning it to `CFG.eyeY` outright was tried first and is worse.** It holds the composition
at every height, but a 1.36 m visitor looking down then loses the butterfly off the top of
the view completely — a worse failure than the one being fixed. The floor costs them nothing:
at 1.36 m eyes it sits 21° up at 0.80 m, well inside a headset's field of view, with the name
below it.

Read straight off `presentPoint` against the old expression, on the same frame, across the
grid. Everything at or below the scene's eye line now presents at **1.660** with the name
clear beneath it; the tall visitor keeps their own eye line, because the floor does not bind:

| eye | gaze | before | after |
|---|---|---|---|
| 1.60 | level | 1.660 | 1.660 |
| 1.60 | −0.30 rad | 1.424 — **name across the wings** | 1.660 |
| 1.60 | −0.45 rad | 1.312 | 1.660 |
| 1.36 | level | 1.420 — **overlapping** | 1.660 |
| 1.36 | −0.55 rad | 1.002 | 1.660 |
| 1.85 | level | 1.910 | 1.910 |
| 1.85 | −0.30 rad | 1.674 | 1.910 |

Depth stops wandering with the gaze too — z was −0.800, −0.764, −0.720, −0.682 across those
look-downs and is now −0.800 throughout, so the butterfly no longer creeps toward the visitor
as they look down.

**Yaw is still followed**, and that is the part worth keeping: a visitor who has turned away
from the panel still gets the bloom in front of their face, not behind their shoulder.

**`hoverPoint()` is deliberately NOT changed.** It has the same shape and the same latent
problem — `hoverRise` exists for the same reason `presentRise` does and pitch defeats it the
same way — but nothing was reported against it and the two are not equally exposed: the
reveal *always* runs with a spelled name hanging in front of the visitor, while a butterfly
is usually called over with the keyboard empty. There is a note on it in the source. If it
does cover the name on the floor, it is one line: `_camLevel` and `CFG.eyeY`, copied from
`presentPoint`.

## 2. The wings hinged at the belly, not the back

**What it was.** The wing pivots sat at the model's `y = 0`, and the body plane's `-s*0.63`
shift lands `y = 0` on texture row **41** of `BODY_ALPHA` — which is the body's **underside**,
the line the legs hang from. So every butterfly in the piece, the twenty-six keys included,
hinged its wings under the abdomen: in profile the near wing lay *across* the body instead of
on it and the far wing's edge cut the body in half, which reads as the wings having slipped
down.

The body plane is `s*1.5` tall, shifted `-s*0.63`, so texture row `r` is at
`y = s * (0.12 - 1.5 * r/512)`:

| | row | y |
|---|---|---|
| topmost ink (antenna tips) | 6 | 0.1024 s |
| body's top **contour** | 11 | 0.0878 s |
| **the hinge, `CFG.wingRise`** | **23.5** | **0.051 s** |
| old hinge (the belly) | 41 | 0 |
| lowest ink (the mid leg tips) | 212 | −0.502 s |

### The first pass put it on the top contour, and that was wrong

`wingRise` 0.088 — texture row 11, the body's top outline — was tried first and is **too
high**, for a reason that is not in the body mask at all:

**THE PAINTED WING DOES NOT REACH THE PLANE'S ROOT EDGE.** Measured over the wing textures
live in the scene, the paint touches `u = 0` across only **0–6.6%** of the along-body span,
and the median row's paint starts **11–18 px into the slice's 128** — 9–14% of the wing's
outward extent, and a **different amount on every wing**:

| | A | D | G | J | M | P | S | V | Y |
|---|---|---|---|---|---|---|---|---|---|
| root touched | 2.0% | 6.3% | 0 | 6.3% | 6.6% | 0 | 4.7% | 4.7% | 3.1% |
| median first inked u, of 128 | 17 | 13 | 11 | 18 | 14 | 11 | 15 | 17 | 16 |

With the hinge buried in the body that inset was absorbed by the silhouette and invisible.
With the hinge sitting on the top contour it became a **gap between the wing and the back
that varied from butterfly to butterfly** — the geometric hinge is identical for all of them,
the apparent one was not. Rendered side by side across eight wings, some sat on the body and
some floated clear of it. That is the "hinge points are not consistent" the fault was
reported as, and it is why the number cannot be read off the body mask alone.

### So it is set from where the PAINT lands, and two routes agree

**The inset.** Median first-inked `u` = 14 px of 128 → **0.070 s** outward from the hinge. In
flight the wings are held up — `flap` averages −0.5 and reaches −1.0 on the glide — and a
rotation about the hinge lifts that point by `0.070 × sin(0.5)` = **0.034 s**. The body's top
contour at the thorax is row 12 = 0.0849 s, so the hinge wants to sit at
`0.0849 − 0.034` = **0.051 s**.

**The picture.** 0.051 s is texture row **23.5** — on the body, in its top third, level with
where the **front legs attach**. Which is where a butterfly's wings do attach.

Checked across the flap range (−0.2 through −1.1) and across eight different wing textures:
the wing root stays on the back at every flap, and the join now looks the same on every
butterfly.

### Raise the wings, do not drop the body

The two are identical in profile and completely different everywhere else:

- the body carries the legs a perched butterfly stands on — `perchLegDrop`, and the whole of
  v9.2's nose-up solve, are measured against the body's ink;
- `CFG.tagBodyDrop` is quoted against the silhouette's **bottom**, which is the body's.

Moving the pivots leaves both untouched, and neither number had to be re-derived.

It is also **free in the reveal's flat pose**, which is the one place a wing is looked at
closely. There the model's local **+Y points at the visitor**, so the wings move
`0.051 × 0.28 × presentSize` ≈ 11 mm *toward* them and not one pixel across the view — the
presented butterfly is pixel-identical to v10.2's. The change is only ever visible in
profile, which is where the fault was.

**Not changed, and worth knowing:** the wing plane spans `±s*wingPlane` along the body, which
reaches from a little in **front of the head** to the tail, so the painted wing overhangs the
head at the fore end. That is v2 behaviour, unchanged here, and only became noticeable
because the raised hinge lifted it clear of the body.

## 3. The butterfly rocked fore and aft once per wingbeat

**What it was.** The flight's nose-up/nose-down pitch is derived straight from the frame's own
travel — `-atan2(dy, hSpeed) * 0.25` — and `dy` carries the **per-wingbeat body bob**, which is
added to `pos.y` a few lines earlier and runs at the wingbeat's own 3-4 Hz. So the butterfly
pitched nose-up and nose-down once per flap, at the fastest rate anything on it moves, and
*unsmoothed* where both the yaw and the bank already have a lag on them.

Sampling `model.rotation.z` every frame on five keys, over six seconds of flight:

| | |
|---|---|
| oscillation rate | **3.1-3.8 turns/s** — each key's own `flapSpeed` (2.97-3.76 Hz) to two decimals |
| pitch travel | **18-53 deg/s** |

The rate matching `flapSpeed` to two decimal places is the proof. For scale, the flight's own
tuned wobble rate is **0.35 deg/s** — this term was never in that measurement, because it
arrives through a derivative.

It was also worse on some butterflies than others, which is why it read as untidy rather than
as a wingbeat: `hSpeed` is the denominator, so the **slower** a butterfly flies, the bigger
the pitch swing the same bob produces. Raw peak-to-peak ran 4.4° on one key and 14.5° on
another.

**The bob is not the thing to cut.** It is already down from 0.030 to 0.010 × size (v3's
calming pass), and the shake is not the bob — it is the bob *differentiated*. **`CFG.pitchEase`
(150 ms)** puts a first-order lag on the pitch, the same shape the bank has used all along.
The 3-4 Hz goes; the climb-and-dive pitch does not, because the path noise runs at
0.010-0.045 Hz and a seventh of a second is nothing to it.

Measured on the **same frames** — the raw pitch the code computes against the smoothed one it
now applies, over ten seconds:

| key | raw travel | applied | |
|---|---|---|---|
| A | 55.6 °/s | 16.3 | −71% |
| F | 50.8 | 15.1 | −70% |
| L | 33.0 | 11.3 | −66% |
| R | 42.3 | 11.3 | −73% |
| X | 25.1 | 8.6 | −66% |

Peak-to-peak drops about 40% (14.5° → 8.7° on key A), and what is left is the slow climb-and-
dive, which is the part worth keeping. Across one wingbeat the excursion goes from 2.7° to
0.9°.

`pitchEase` is the knob: raise it toward 420 to take out what remains, drop it to 0 for
v10.2's flight exactly. Both swarms get it, since both share the flight.

**`faceTravel()` is not changed** — the summon, the hover and the departure derive their pitch
the same way, but none of them applies the per-wingbeat bob (`tickSummon` says so in as many
words), so there is nothing there to smooth.

## Files

`js/config.js` — `wingRise` next to `wingPlane`; `pitchEase` next to `wander`.
`js/bfly-model.js` — `wingRise()` alongside `wingPlane()`; the two pivots carry it.
`js/collection.js` — `_camLevel`, `presentPoint()` and the three call sites that used to
inline the gaze arithmetic; a note on `hoverPoint`; `smoothPitch` in `tickOrbit`, reset with
`smoothRoll` on the way back from `leave`.
`js/keyboard.js` — `smoothPitch` in the flight tick. The keys and the collection share the
flight, so they get the same lag.

Nothing else is touched. `guide.js`, `hands.js`, `interact.js`, `reveal.js`, `index.html` and
the whole of `tools/` are byte-identical to v10.2.

# v10.2 — a fifteen-second fuse, 9 September 2026

One number, really. (There is no v10.1; the amended recall recording went into v10 in place.)

```bash
sh tools/reach/run.sh              # 193 assertions, four suites
```

## The cooldown

`guideQuietMs` 30 s → **10 s**, `guideQuietGrace` 15 s → **5 s**. **Fifteen seconds** from the
last thing a visitor did to the room handing over, where v10 took forty-five. An exhibition
floor turns people over fast, and ending is non-destructive — the keyboard resets, anything
with the visitor flies home, the flower comes back, and the collection is never touched — so
the cost of ending early is that they press the flower again.

Driven end to end in the running scene with no pointers, which is a headset sitting with no
hands tracked:

| | |
|---|---|
| live | 0.75 s |
| → wrapup | **10.75 s** |
| → farewell | **15.75 s** |
| → idle, flower back at alpha 1 | 17.0 s |
| the collection across all of it | DNA **2 → 2**, in scene **2 → 2**, both still orbiting |

**The clock is still frozen whenever the visitor cannot act** — through the reveal, through a
butterfly coming over or sitting on a hand, and through a cue that is still teaching them
something. So these ten seconds are ten seconds of a visitor who *could* be acting and is
not.

**The risk window, and the line to move.** Right after the recall cue the visitor is
*searching* the kaleidoscope for their butterfly, and pure looking is not activity — pointing
at them to find theirs is. If the floor reports sessions ending under people, `guideQuietMs`
is the one number.

## A staff hard-reset gesture was built and REMOVED — do not try a fist

v10.2 first added one: two closed fists, held up, for five seconds. It was measured against
the joint model, it separated cleanly from the pinch, the harness proved the latch and the
timing, and **on a headset it did not fire at all.** Hand tracking was up and working the
whole time — letters were catching normally — and the fist alone did nothing.

**A closed fist is the worst possible pose for optical hand tracking**, and that is inherent
rather than a threshold to tune: every fingertip and the thumb are hidden behind the hand, so
the cameras have nothing to infer from. The tracker either drops confidence entirely or
reports partly-extended fingers, and the ball measurement never gets under its threshold. The
geometry was clean and the choice of gesture was wrong.

**It is deleted, not switched off.** `hands.js`, `guide.js`, `interact.js` and
`tools/reach/` are byte-identical to v10 again; `tools/reach/test-fist.js` is gone.

Two things worth carrying forward if a staff reset is ever wanted again:

- **Anything that depends on curled fingers is out.** Pinch is the best-tracked hand signal
  on a Quest — thumb and index tips are the most visible joints, and it is what the system UI
  itself reads — so *two hands pinched and held* is the gesture to try before any other.
- **Or use no hands at all.** The headset's own pose is never occluded and never drops a
  frame: *look straight up and hold* is well clear of anything the piece asks a visitor to
  look at (the letters span −31°…+19°, the kaleidoscope +19°…+42°). A staff page served off
  `serve.py` and polled by the guide avoids the headset entirely.
- **`rig.debug()` is wired to nothing.** It exists in `hands.js` for exactly this kind of
  on-headset diagnosis and there is no console in a headset, so when the fist failed there
  was no way to see *why*. Anything hand-tracked added from here should come with a readout.

## What ends a session now

| | |
|---|---|
| **the quiet clock** | 15 s, above |
| **the headset coming off** | `guideDoffMs` — silent, from any state. Still not verified on a physical Quest |
| **Escape** | the desktop operator override |
| `guideMaxMs` | the 8-minute hard cap |

## Files

| | |
|---|---|
| `js/config.js` | the two timeouts, and the note on why the fist is gone |
| `tools/build-knobs.py` | those two rows retargeted to v10.2 |
| `tools/knobs.html` | regenerated — **277 tunables**, 2 flagged |

Everything else is **byte-identical to v10**.

---

# v10 — the guide, 9 September 2026

Serve this folder and it runs. `tools/` is the two servers, the two dev tuning pages,
`knobs.html` — the reference for every adjustable constant — and `reach/`, the headless
harness, which v10 adds a fourth suite to.

```bash
python3 tools/serve.py 8123        # then http://localhost:8123/
python3 tools/serve-https.py 8443  # for a Quest, over the local network
sh tools/reach/run.sh              # 193 assertions, about a second
```

v9 made the kaleidoscope answer. v10 gives the run a **session**.

## What was actually wrong

The piece had no start, no guidance and no end. A visitor put the headset on and landed in
a room that was **already fully interactive**, with nothing to say what to do — and nothing
to say when they were finished, so the next person inherited whatever the last one left. The
voice-over tracks exist; there was nowhere to put them, because there was no state machine
for them to be the voice of.

## The shape of it

Two new files, and **one new provider**.

| | |
|---|---|
| `js/voice.js` | the narration. One `HTMLAudioElement` per named cue, `.volume` for level, no AudioContext, no library. |
| `js/guide.js` | `session-guide` — the state machine, and the start flower. A provider exactly like `butterfly-collection`. |

```
   idle  --pinch the flower-->  welcome  -->  live
                                              |  ^
                                        quiet |  | any activity
                                              v  |
                                            wrapup
                                              | quiet
                                              v
    idle  <--  farewell  <---------------------
     ^
     |  headset doff / operator key, silently, from ANY state
```

**THE LOCKOUT IS v9'S EXCLUSIVITY, REUSED, and that is the whole trick.**
`interact.js:gather()` already lets a provider claim the room: when one reports itself
exclusive, nothing else is offered, so nothing else highlights and nothing swallows a pinch.
That is exactly "the letters fly but there is no interaction yet" — for free. Measured in the
running scene, idle: **30 pickable things in the room, `gather()` returns 1**, and it is the
flower. `keyboard.js`'s flight, capture and picking did not have to change for any of it.

## The start flower

`UI.blob()` — the same six-lobed cluster accept and delete are — at its own hue (**212**,
neither accept's 142 nor delete's 356), its own place (panel centre, between the name field
and the two controls) and clearly bigger than either (`guideBlobK` 1.60 against 1.26 and
1.02). In idle it is **the only pickable thing in the room**, so pointing anywhere lights up
one shape and nothing else: there is nothing to read and nothing to learn.

It is offered with `panel: true`, so it goes through the tuned, tighter panel pick path the
two controls already use — `panelPickBase`, `panelTouchRadius`, `panelPickShrink`, and "the
controls win" — and the desktop mouse picks it through the identical call.

**And accept and delete go entirely while no session is running.** One more factor on the
`setAlpha` line the reveal already drives: in idle there is nothing to accept or delete and
one flower to press, so two dim shapes hanging next to it are exactly the clutter that line
exists to remove.

## The spoken beats

Four recordings. **The opening is three of them**, played back to back as one cue.

| cue | fires | |
|---|---|---|
| `welcome` | the flower is pressed | *"Welcome to Kalei Identity."* — 1.9 s |
| `spell` | …then | *"Catch butterflies one at a time to spell your name. This will build the genetic code of your own butterfly."* — 6.7 s |
| `pinch` | …then | *"Start by pinching a selected butterfly to attract it towards you."* — 4.1 s |
| `recall` | **`reveal:joined`** | find your butterfly in the kaleidoscope, select it, and hold your hand out for it — 7.1 s. **Re-recorded** after the palm interaction changed (`4.UPDATED`); the first cut said "palm facing down", which was then the one instruction in the piece that did not work |
| `nudge` | 30 s of quiet | **not recorded** — the session runs silent |
| `farewell` | 15 s after that | **not recorded** — the flower coming back is the signal |

**A SEQUENCE IS ONE CUE as far as everything else is concerned.** `Voice.playing()` stays
true across the gaps, so the silence between two recordings is never mistaken for the
narration having finished: the room does not unlock early and the quiet clock does not start
counting mid-sentence. Driven against the real recordings in the browser: `welcome` ends at
**2.02 s**, `spell` at **9.04**, `pinch` at **13.44**, with gaps of exactly `voGap` 0.45 s
and `playing()` true throughout. **The opening runs 13.4 s.**

**The room is pickable from the first second regardless** (`guideUnlockAt` = 0), so a visitor
who already knows what to do never waits out thirteen seconds of narration.

The four tracks are **mono mp3, 395 KB in total**, copied into `audio/` from
`sounds/ai_voiceover/v1/` (which stays the master). mp3 needs no conversion — the Quest
browser is Chromium and plays it and m4a equally well; `.wav` is the only format worth
avoiding, purely on size.

`reveal:joined` is one new line in `collection.js`, the mirror of the `reveal:launch` that
has been there since v8.1: that one fires on the takeoff frame and hands the caught name
over, this one fires the instant the butterfly stops being the hero and becomes one of the
many — which is exactly what "you can call it back" is about. Replayed butterflies spawn
straight into `orbit` and never soar, so it only ever fires for a freshly grown one.

**Only the first of a session speaks.** A visitor who spells a second name has already been
told. Verified: `recall` on the first `reveal:joined`, nothing on the second.

## A missing track is a silent no-op that still finishes

The tracks are being cut separately and none of them exists yet. **The whole of v10 was
built, driven and tested with no audio in the build at all**, and that is a property of the
design, not a coincidence:

- `Voice.play` on a cue with no file returns false and fires `voice:ended` on the next
  tick, exactly as a real track would;
- no `Audio` constructor → the module is a no-op outright, which is what lets the harness
  drive the guide under JavaScriptCore;
- **nothing in the piece ever waits on audio.** The guide advances on state, and every wait
  it does have carries its own timeout.

**The unlock hangs off the Enter-AR click, and it has to.** Browsers refuse programmatic
playback until the page has had a real user gesture, and **a hand-tracked pinch is not
one** — it is our own threshold on a joint distance, invisible to the browser. So the
visitor pressing the start flower cannot authorise anything. What can, and always happens
first, is the click on A-Frame's Enter AR button: you cannot get into the piece without it.

## A hand turned OVER lands a butterfly too

The recall track asks the visitor to hold their hand out flat and palm **DOWN**. v9's offer
required the palm turned **up** — so following the instruction exactly took the
hover-then-leave branch, and **the interaction read as broken to precisely the people doing
as they were told.** That is the worst way for it to fail.

`palmUp` no longer means "facing the sky", it means **horizontal**, and the butterfly lands
on whichever face points up — the back of the hand, when the palm is down, which is where a
butterfly lands on a person anyway.

```js
var upness = palmNormal.dot(WORLD_UP);
palmUp = Math.abs(upness) >= CFG.palmUpDot;     // either way up
faceNormal = (upness < 0) ? -palmNormal : palmNormal;
```

**`rig.faceNormal` is the landing surface and it is what `Hands.offers()` publishes** —
`palmNormal` is now read only inside `hands.js`. Everything downstream is quoted against the
normal it is *handed* (`perchPoint`'s offset, `_restQuat`'s plane, `perchYaw`'s turn about
it, the leg drop), so **none of v9.2's landing arithmetic moved.** Driven end to end with the
palm turned over: it completes the approach, lands, and its leg tips sit **2.0 mm** off the
back of the hand — the same number as the palm-up landing.

It is also strictly more forgiving, which is the argument for it independent of the script.
The pose is still gated by `palmFlat` (fingers extended — a pinching hand never qualifies)
and `palmRaised` (held up near the headset), and **an edge-on hand is still rejected**, which
is the load-bearing half: without it the offer would fire on a flat hand at any angle at all.

`CFG.palmEitherFace = false` restores v9.2's rule exactly, and the harness asserts both
branches. This is the only change v10 makes to `hands.js`.

## The end, and why the timers are short

**Ending is non-destructive**, and that is the whole argument. It resets an empty keyboard,
sends anything with the visitor home the way a lowered palm already does, and re-arms the
flower. **`DNA` and the kaleidoscope are never touched** — verified across a full end in the
running scene: 1 entry before, 1 after, the butterfly still in `orbit`. A visitor ended
early presses start again and loses nothing.

So on an exhibition floor with rapid handovers, 30 s of quiet is a safe default rather than
a hair trigger — and there is no end control, because the visitor keeps playing as long as
they want and museum visitors do not press "done".

| | |
|---|---|
| `guideQuietMs` 30 s | of no interaction → the **nudge** |
| `guideQuietGrace` 15 s | more → the **farewell**. Any activity cancels and puts the session back |
| `guideMaxMs` 8 min | hard cap. The backstop for a session the quiet clock can never end |
| `guideDoffMs` 2 s | of XR visibility `hidden` → end **silently**. There is nobody in there to hear a farewell |

**THE QUIET CLOCK IS FROZEN WHENEVER THE VISITOR CANNOT ACT**, which is the other half of
making 30 s safe: the reveal is ~14 s of watching by design, `perchDwell` alone is 12 s of
deliberately holding still, and a cue that is teaching them something has not finished
teaching it. Frozen, not reset — the clock is at zero going into all three anyway, because
whatever started them counted as activity.

**Presence costs nothing to measure.** `interact.js` hands *every* provider the whole hot
set each frame, so a non-empty set arriving in `setHot()` means the visitor is pointing at
something. No new event, and the only change to `interact.js` in the whole of v10 is adding
`'session-guide'` to its provider list.

### Three things this got wrong first

- **The nudge froze its own clock.** "A cue is playing" freezes the quiet clock, and the
  nudge is a cue — so playing it reset the very timer it was announcing and the grace never
  ran out. `TALKS_OVER` is the fix: the nudge is asking whether anyone is still there, so
  its own playback must not answer the question. The farewell is in the set for the same
  reason.
- **A stalled track could hold a session open for eight minutes.** Found by driving the
  real scene with the tracks missing: a track that stalls mid-fetch never fires `ended` and
  never reports itself paused, so `talking()` stayed true indefinitely and only `guideMaxMs`
  ended the session. `guideTalkMax` (90 s) caps how long any one cue may freeze the clock.
- **The two envelopes were an exponential approach, so they never landed.** `guideCtlFade`
  and `guideFlowerFade` read as "seconds to fade" and behaved as time constants: a second
  into a 0.70 s fade the flower was still at **0.16**. They are now built the way
  `reveal.js` builds its own — a raw parameter travelling **linearly** at 1/duration, read
  out through a smoothstep — so the constant means the seconds it says, both ends are soft,
  and it lands exactly on 0 and 1.

## Tested

`sh tools/reach/run.sh` — **193 assertions** across four suites, about a second.
`test-palm.js` and `test-flight.js` gain the either-face work (both branches of the rule, an
edge-on hand still rejected, and a whole palm-down approach and landing); `test-guide.js` is new and covers the idle lockout
(a full room, one pickable thing), the real pinch on the flower driven the whole way through
`interact.js`'s shoulder ray and pinch edge, the room coming back, both spoken beats, all
three freezes, the nudge, the cancel, the farewell and what it does to the room, the return
to idle, the doff, a blink that is *not* a doff, the operator key, the hard cap, and the
fact that **every transition completes with no `Audio` present at all**.

Driven end to end in the **real engine** too, by pumping `sceneEl.tick` (the documented
trap: a browser tab that is not visible pauses A-Frame's render loop entirely):

| | |
|---|---|
| idle, with 30 pickable things in the room | `gather()` → **1**, and it is `begin` |
| accept, a letter, a collected butterfly, all aimed at squarely | **none of them picks** |
| a real mouse press on the flower | → `welcome`, then `live`; **26 letters offered again** |
| spelled a name, accepted, watched the reveal | `reveal:joined` **×1**, `recall` asked for |
| a second `reveal:joined` | **no repeat** |
| quiet → wrapup → farewell → idle | `nudge`, then `farewell` exactly `guideQuietGrace` later, then the flower back at alpha 1 |
| during the farewell | `gather()` → **0** |
| across the whole end | `DNA` **1 → 1**, the butterfly still in `orbit` |

**One desktop-only caveat**, worth knowing before it looks like a bug: a mouse cursor left
parked over the swarm hovers a butterfly every time one drifts under it, and a hover *is*
presence — so the quiet clock keeps resetting and a desktop session may never time out. On
a headset with no hands tracked there are no pointers and no hot ids, which is the case the
signal is for. Park the cursor on the floor to watch the arc on a desktop, or use `Escape`.

## Files

| | |
|---|---|
| `js/voice.js` | **new** — the narration, and the cue queue the opening needs |
| `js/guide.js` | **new** — the session, and the start flower |
| `audio/` | **new** — where the four tracks go, and a README naming them |
| `js/config.js` | one new block, 21 constants and the cue table |
| `js/interact.js` | **one line**: `'session-guide'` first in the provider list |
| `js/collection.js` | `reveal:joined` at the soar handoff, and `releaseAll()` |
| `js/keyboard.js` | **two lines**: the desktop keydown gate, and one more factor on the controls' alpha |
| `js/hands.js` | either face: `faceNormal`, and `palmUp` meaning horizontal |
| `audio/` | the four tracks, mono mp3, 395 KB — masters in `sounds/ai_voiceover/v1/` |
| `index.html` | two script tags and one entity |
| `tools/reach/` | `test-guide.js`, `run.sh`, and `UI.blob` + a `Reveal` stub + timers in `stub-scene.js` |
| `tools/knobs.html` | regenerated — **277 tunables**, 28 flagged |

`wing-gen.js`, `wing-colour.js`, `wing-tex.js`, `name-dna.js`, `dna-store.js`,
`bfly-model.js`, `style.js`, `reveal.js`, `ui.js` and `app.js` are **byte-identical to
v9.2**. Parity with TouchDesigner is untouched.

## What is not here

- **`nudge` and `farewell` are not recorded**, and the session runs without them: the end is
  silent and the start flower coming back is the whole signal. A short *"thank you, please
  pass the headset on"* is the one line an exhibition floor would most want next — drop it in
  as `audio/farewell.mp3` and set the key in `CFG.voCues`.
- **No music bed and no SFX.** `sounds/` is untouched. `Voice.duck()` exists so a bed can
  be added later as a level write rather than a rewrite.
- **`guideUnlockAt` is 0** — the room is live the instant the welcome starts, so a visitor
  who already understands is never blocked. Once the track is cut, move it onto the second
  where the instruction actually lands if they should hear it first.
- **`serve.py` does not answer HTTP Range requests.** If a track plays on the desktop but
  not in the headset, that is the likely cause. Keep the files small enough to be fetched
  whole, or teach the server `Range`.
- Still **not run on a physical Quest.**

---

# v9.2 — it sits down properly, 9 September 2026

One change, in the landing. **The butterfly's hind legs are drawn shorter than its front
ones, so it did not rest on the hand.**

`BODY_ALPHA` is a body in **flight**, seen side-on: front legs long and hanging forward,
hind pair short and swept back. v9's `perchLegDrop` took the single lowest painted pixel
and hung the model that far above the palm, which stands it on its deepest leg and leaves
everything behind that leg in the air — measured at `perchSize`, the two hind tips sat
**24.1 and 26.6 mm** off the hand. The tail half of the butterfly was hovering.

Label the four leg strands in the decoded alpha and their tips are at, along the body from
the wing hinge (head is −x):

| | along the body | below the hinge |
|---|---|---|
| front | −0.0575 | −0.1145 |
| mid | −0.0301 | **−0.1407** ← the lowest, and all v9.1 used |
| hind | +0.0892 | −0.0964 |
| hind | +0.1171 | −0.0915 |

**They are not collinear.** The mid pair hangs 15 mm below the line through the other two,
so no rigid pose lands all four and the only question is which error to spend:

| pitch | `perchLegDrop` | the four tips, mm off the hand at `perchSize` | |
|---|---|---|---|
| 0.000 | 0.1406 | +15.1  +2.0  +24.1  +26.6 | v9.1 |
| **0.205** | **0.1145** | **+9.1  −6.6  +3.0  +2.5** | **shipped** |
| 0.323 | 0.1239 | +18.8  +2.0  +4.1  +2.0 | the lower hull |

(as shipped, so `perchLift`'s 2 mm of clearance is in those numbers; negative is a tip
inside the hand.)

**`CFG.perchPitch` = 0.205 rad — 11.8° of nose-up**, the least-squares line through the four
tips. It puts the hind pair down within a millimetre, which is the whole complaint, and buys
that with the mid pair 8.6 mm *into* the hand — where a leg tip reads as contact. A leg tip
**above** a hand reads as floating, and that is the error worth avoiding. The lower hull is
the no-penetration answer and lands three of the four exactly, but 11.8° reads as a
butterfly settling and 18.5° as one rearing; move `perchPitch` there if the sunk pair shows
in a headset, and `0` gives the flat pose back.

**The pitch is about the wing SPAN axis** (model local Z: the body runs along X, the wings
out along Z), so the wings stay level across the palm and only tip fore-and-aft. The span
axis stays *exactly* in the palm plane at any `perchYaw` — that is now the invariant the
harness asserts, in place of "the wings lie in the palm plane" — and the wing normal comes
off the palm normal by cos(`perchPitch`) = 0.979 and no more. Clearance was re-checked over
every painted pixel after the tilt: **body 22 mm off the palm, abdomen tip 29 mm.** Nothing
but the legs reaches the hand.

`perchLegDrop` keeps its meaning and its units — the drop of the legs' **contact line**
below the origin, now measured perpendicular to that line — so `perchPoint` is still one
offset along the palm normal and `perchLift` still sits on top of it.

## Tested

`sh tools/reach/run.sh` — all three suites, and `test-palm.js` gained a block that pushes
the four measured tips through the real `_restQuat` and the real `perchPoint` and prints
what each one is off the hand, plus the v9.1 pose for comparison. Driven in the running
engine too: 11.75° of head pitch, wing span in the palm plane to 1e-5, and the four tips at
**+9.1 / −6.6 / +3.0 / +2.5 mm** — the shipped row of the table, from the real component.

## Files

| | |
|---|---|
| `js/config.js` | `perchPitch` (new), `perchLegDrop` 0.1406 → 0.1145 |
| `js/collection.js` | `_restQuat` applies the pitch; `perchPoint`'s comment |
| `tools/reach/test-palm.js` | the span-axis invariant, and the leg-contact block |
| `tools/knobs.html` | regenerated — 249 tunables |

Everything else is byte-identical to v9.1.

---

# v9 — the kaleidoscope answers, 8 September 2026

Serve this folder and it runs. `tools/` is the two servers, the two dev tuning pages
(`shape-preview.html`, `colour-preview.html`), `knobs.html` — the reference for every
adjustable constant — and, new in v9, `reach/`, a headless harness for the interaction
this version adds.

```bash
python3 tools/serve.py 8123        # then http://localhost:8123/
python3 tools/serve-https.py 8443  # for a Quest, over the local network
sh tools/reach/run.sh              # the new interaction, tested without a headset
```

v8.3–v8.7 were all about the wing — its colour, then its shape. v9 does not touch either.
It is about what the room **does** once it has butterflies in it.

## What was actually wrong

Nothing was broken. The piece just stopped after the reveal — and once it did not, three
things about the room turned out to be in the way. All four are in here.

A visitor spelled their name, watched their butterfly bloom, greet them and launch into the
kaleidoscope — and that was the end of the interaction. Everything after it was **scenery**:
twelve butterflies orbiting a room, unreachable by construction. `collection.js` had no
`targets()` at all, so `interact.js` could not see the collection even in principle. The
one thing every visitor wants to do with their own butterfly — get it back, look at it, have
it come to them — was the one thing the piece could not do.

## The interaction

Pinch one of the orbiting butterflies, exactly the way you pinch a letter. It leaves its
orbit and comes to you. What happens when it arrives is decided entirely by what your hands
are doing:

| | |
|---|---|
| **a flat palm, turned up, held up** | it lands on it, and stays for `perchDwell` (12 s) |
| **anything else** | it hovers in front of your face for `hoverDwell` (7 s), then goes |
| **the palm turns, drops or closes** | it goes, on that frame |
| **a palm goes up while it is hovering** | it goes to it |

And while it is coming, **nothing else in the room is pickable** — not the letters, not
accept, not delete. Reaching for a butterfly flying at your face means putting your hand
through the whole keyboard, and every letter it passes was a live target.

Four new states in `collection.js` — `summon`, `perch`, `hover`, `leave` — built exactly the
way the reveal's eight beats are, so they are skipped by `separate()`, are not pickable
while they run, and hand back to `tickOrbit` through the same representation the soar
lands on.

**There is nothing to learn and nothing announced.** The whole grammar is *hold your hand
out and it will come to it*, which is what people already do around butterflies. Discovery
is free: the butterfly comes to your face whether or not you know about the hand, and
putting one up while it is hovering there redirects it immediately.

## Three things this needed, in order of risk

### 1. The palm — `hands.js`

`hand-tracking-controls` pins its entity to the origin (the note this build has carried
since v2), so `hands.js` already read the joint matrices itself. v9 reads five more of them
and publishes a posture:

```
rig.palm         world position of the middle of the palm
rig.palmNormal   unit vector out of its front
rig.palmWidth    index knuckle to pinky knuckle, metres
rig.palmUp / palmFlat / palmRaised     the three raw conditions
rig.offering     all three, held and released on timers
```

**Everything geometric is quoted in palm widths or as a dot product, never in
centimetres** — a child's hand and an adult's have to read the same. Measured off the
joint model:

| | flat | curled |
|---|---|---|
| mean fingertip-to-wrist distance | ~1.9 palm widths | ~1.0 |
| mean fingertip offset off the palm plane | ~0.2 | 0.5–0.75 |

so `palmFlatExtend = 1.45` sits in the middle of a wide gap and is the test doing the work;
`palmFlatOffset` is a lenient backstop against a cupped hand, not a demand for a rigid
salute.

**The palm normal is handed, and getting it wrong is invisible.** Wrist→index-knuckle
crossed with wrist→pinky-knuckle points *down* for one hand and *up* for the other with the
palm in the same real-world orientation, so the sign is flipped per side. A sign error here
leaves one hand permanently unusable and the other permanently offering — and it cannot be
seen on a desktop at all. It is the first thing `tools/reach/test-palm.js` checks.

**Raised is measured from the headset, not the floor** (`palmRaiseBelowEye`). Visitors are
different heights and may be seated; "raised" means raised for them.

**A dropout is not a withdrawn hand.** `holdOffer` takes `palmHoldMs` (220) of the pose
before it counts as an offer and `palmGraceMs` (320) of its absence before it stops
counting. This is the same argument as `trackLossGraceMs` in `interact.js`, for the same
reason: Quest hand tracking drops a frame or two at a time, and a butterfly that took off
every time it did would never stay on anyone's hand.

### 2. The two swarms, and the pick between them — `interact.js`, `config.js`

`interact.js` now gathers targets from **providers** — the keyboard and the collection —
tags each target with the provider that owns it, and routes activation back there.
Its three layers are tested in a fixed order:

```
panel        the two controls. Fixed, inside everything else.
key          the 26 letters, on their low dome
collection   the kaleidoscope, on its high one above them
```

**But that was not enough, and the reason is worth writing down.** The collection used to fly
*inside* the letters' angular band — letters spanned −31° to +35° of elevation from the eye
and the collection −17° to +28° — so there was no direction in which a collected butterfly
did not have letters in front of it. With an absolute veto, **42% of attempts to pick one
were blocked by a letter that was merely nearby.**

Two changes, and they are both needed:

**The bands moved apart.** The letters became a low dome (`hgtMax` 2.30 → 1.95) and the
collection a high one, brought *closer* as well as lifted (2.6–4.3 → 1.7–3.0 m out, 0.8–3.0 →
2.2–3.1 m up). Closer and higher work together: at 1.7 m out it takes only 2.2 m of height to
clear the letters, where at 2.6 m it would have taken 2.9 — so the look-up is 19–42°, not the
36–52° the old radius would have forced, and the top of the band stays under a real 3 m
ceiling for passthrough. Apparent size was checked rather than assumed: at the new distances a
collected butterfly spans 4–18° of view against the keys' own 4–21°, so `colSize*` did not
need to move.

**And the key layer's veto became a margin.** A key's cone is enormous in angular terms —
20.3° wide for a big key at 1 m — against which the new bands buy a geometric gap of a
fraction of a degree at the very bottom of the collection's range. Monte Carlo over both
bands, 26 letters in the room, aiming dead-on at a collected butterfly:

| | a letter vetoes the pick |
|---|---|
| v8.7's bands, absolute veto | **42.0%** |
| new bands, absolute veto | 9.3% |
| **new bands + the margin** | **1.1%** |

The vetoing letter's own score was a median 0.65–0.77 — plain near-misses, which is what says
the margin is the right instrument rather than a wider cone. A key now keeps the pick unless
the butterfly beats it by `CFG.colBeatsKey` (0.45) on the same 0..1 score. A key actually
aimed at scores near 0 and cannot be beaten, so **spelling cannot break**: checked the other
way round over 6000 trials, **0 letters lost**. Verified against the running scene too, aimed
at each of the 26 live keys in turn: **26 of 26 still pick themselves.**

`pickBase`, `pickAngle`, `touchRadius`, the hover lock and the pinch thresholds are all
untouched. `keyboard.js` is untouched — its targets are still told apart by the `panel` flag
it already sets, and only the collection labels its own layer. `hgtMax` is the single number
v9 changes outside its own four files.

### 2b. Nothing else is pickable while it is coming

`butterfly-collection` reports itself **exclusive** through `summon`, `hover` and `perch`,
and `interact.js` then offers nothing but its own butterflies — so the letters and both
controls go dead, and visibly so: nothing highlights, rather than pinches being silently
swallowed. In the running scene that is 28 targets → 0, with a ray aimed straight at `accept`
picking nothing.

The lockout lifts the moment the butterfly turns for home, so a visitor mid-name waits about
twelve seconds rather than fifteen and the room returns while they are still watching it go.
Its own targets stay live throughout, so a pinch on a different butterfly still swaps which
one is coming — only the letters and the two destructive controls go away.

### 3. The four states — `collection.js`

**The approach is a cruise, not a lerp.** A lerp toward a target is fastest when it is
furthest away and crawls at the end, which is exactly backwards for something flying to
your hand. `summonSpeed` holds until the last `summonEase` metres and then eases down, so
it arrives settled rather than stopping dead. The first pass (0.55 m/s, easing over a full
metre to 0.16) took **8 s** from 3.7 m out — past deliberate and into waiting. At the
shipped numbers the same trip is **5 s**, and the furthest butterfly in the room reaches
you in about 6.5.

**It is re-aimed every frame**, at the palm if one is being offered and at a spot in front
of the visitor's face otherwise. Putting a hand up mid-flight redirects it; dropping one
sends it back to the hover spot. Neither is a state change.

**The sway is a velocity, not an offset.** The lateral wander that stops the approach
reading as a dolly move fades out as it arrives; added as a position offset it would step
the moment the fade factor moved, so it goes in as amplitude × rate × cos and integrates.

**And when it gets there with no hand out, it FLIES.** The first pass held it in the reveal's
flat pinned-specimen pose, wings spread square to the visitor — the one thing in a room full
of flight that was not flying, and it read as a diagram of a butterfly rather than a
butterfly. That pose is the hero's and stays the hero's. It now takes the ordinary flight
wingbeat, turns its body to follow its heading, and wanders left-right / up-down / in-out
about the held spot on the same fbm noise it flies its orbit with. Measured in the running
scene, the wing-to-camera aspect travels **0.08 → 0.53**; the flat pose sat pinned at 0.99.

Two things that cost a measurement each. The wander is applied to the **target**, with the
position lagging it — that is where the damping lives. And it has to **ease in**: the
butterfly arrives within `summonArrive` of the un-wandered spot, but the noise at that instant
can be a full span away, so the target jumped on the first frame and the lag chased it at
**1.0 m/s** — a lunge toward a face 0.6 m away.

**And the heading is held, not chased** — which was the second pass, and the bigger half of
"it moves too radically". Following its own travel direction is right for the orbit, where a
butterfly travels one way for many seconds, and wrong here, where the wander reverses every
couple of seconds and the body swung a full half turn each time: **4.6 radians of yaw in
3.3 seconds.** It now holds **broadside** to the visitor and sways about it — broadside
rather than square-on, because with the body axis pointed at the visitor the wing plane
cannot face them either, so facing them is the one heading at which the butterfly is an
edge-on twig. The side is chosen on arrival as the shorter turn from the heading it flew in
on (drawn at random it could swing a half turn to settle: 179°/s against 84 now). The drift
came down with it.

| over the whole 7 s wait | first pass | now |
|---|---|---|
| drift | 0.24 × 0.11 × 0.10 m | **0.09 × 0.05 × 0.06 m** |
| peak speed | 0.36 m/s | **0.19 m/s** |
| yaw swept | 264° | **52°** |

**The resting pose is built directly, like the reveal's.** The wing plane (local +Y is its
normal) is laid into the palm plane and the head turned to the visitor — so the head is
parallel to the visitor direction *projected into the palm plane*, which is not the same as
the visitor direction and is why the harness checks the projection. The degenerate case is
real: a visitor looking straight down their own palm leaves no in-plane direction to point
at, and `_restQuat` falls back to a world axis rather than producing a NaN pose.

**A resting butterfly is not a still one.** It opens and shuts its wings every couple of
seconds, jittered so two never sync up. Without the flutter it reads as a sticker stuck to
your palm.

**And it stands on its legs.** `perchPoint` first put the model's *origin* on the palm — but
the origin is the **wing hinge**, and the body sprite hangs below it: body, then three pairs
of legs. The butterfly was planted wings-deep in the hand with every leg buried, about 52 mm
of it. `perchLegDrop` is measured off `BODY_ALPHA` itself rather than guessed — decode the
PNG, threshold at the material's own `alphaTest` of 0.5, map rows through the body plane's
geometry, and the paint runs from local y +0.0287 down to **−0.1406**, the last of that being
the longest pair of legs. (Cross-check: `tagBodyDrop`, measured independently for the name
tag, is −0.135.) Quoted per unit model size and applied against the *current* scale, so the
legs do not sink as the butterfly grows into its landing. Verified in the running scene: leg
tips **2 mm** off the palm, body **72 mm** clear of it.

**And it sits BROADSIDE, not head-on.** The body is a single *plane* through the body axis,
so with the head pointed at the visitor they look straight down its length and it disappears
— two wings with nothing joining them. It now turns 60–70° across the view, drawn fresh on
each landing and to either side (both read as broadside; a fixed angle made every landing
identical). The turn is about the **palm's own normal**, which is what keeps the wings lying
flat in the palm plane however the hand is tilted — the harness checks that invariant at
every angle it draws.

**It hovers ABOVE the eye line**, not below. The name field hangs at −0.235 and the two
controls at −0.435 on a panel 0.80 m out; a butterfly holding station at 0.62 m *below* the
eye line sits directly in front of both. It could never steal their pick — a summoned
butterfly is not a target — but it would cover them. The reveal solved the same problem the
same way, with `presentRise`.

## Tested without a headset

Hand tracking cannot be reproduced on a desktop, and the landing is most of what v9 is. Two
things close that gap.

**SPACE toggles a synthetic palm** held out in front of the camera (`Hands`, `palmSim*`).
It is a real offer as far as everything downstream is concerned — same shape of answer, same
code path — so the whole approach / land / hold / leave arc can be driven and tuned on a
desktop. It only ever appears when no real hand is offering, and never inside an XR session.

**`tools/reach/`** runs the lot headless under JavaScriptCore (every Mac has one; this
machine has no node), against a maths-only THREE stub. **119 assertions**, about a second:

```bash
sh tools/reach/run.sh
```

It covers the handedness of the palm normal, every way of *not* offering a hand (turned
over, curled, lowered), the hold/release timers, the resting pose's axes and its degenerate
case, the broadside turn at every angle it draws, the leg tips landing on the palm rather
than the model's origin, the whole four-state arc in both branches,
the hover's wander and wingbeat, the exclusivity lockout, `summonMax`, a 300 ms frame, the
handoff back onto the orbit, and the pick ladder — including a margin case taken straight
out of the Monte Carlo rather than contrived, because the first draft of that test passed
while there was in fact no letter in the way at all.

Two rules it earned the hard way, both from tests that passed for the wrong reason: **never
hard-code a beat's duration, wait on the state** (every fixed `frames(10)` went stale the day
the collection's band moved closer and the approach got faster), and **call the component's
own method, never a reimplementation of it** (the exclusivity test's first draft rebuilt the
target-gathering inside the test and passed while the real rule did nothing — which is why
`gather()` exists as a method at all).

The arc was then driven end to end in the **real engine** in a browser — real THREE, real
wing generator, real reveal — by spelling a name, letting the reveal run, and calling the
butterfly back: 6.7 s to cross the room, 0.7 s more to reach a palm raised while it hovered,
18 mm off the palm plane with the wing normal on the palm normal to 1.000, gone on the frame
the hand dropped, and back on its orbit at radius 4.06 with the path offset cleared to
0.000 m.

## What is not here

- **The 26 letter butterflies cannot be called over.** They are the keyboard; catching one
  spells a letter, and that is a different verb.
- **`summonMax` is 1.** Calling a second sends the first home rather than refusing — a pinch
  that visibly does nothing reads as broken tracking. Raise it if a room of them is wanted.
- **The name tag hangs under a perched butterfly**, which puts it over the visitor's palm.
  On a desktop it reads as a caption and looks right; in passthrough it will be written
  across a real hand. That is an on-headset judgement call, not something arithmetic
  settles — `CFG.tagBodyDrop` is where to move it.
- **The desktop letter keys are not locked out**, only the pointer is. `keyboard.js` owns
  that `keydown` handler and it is explicitly a testing convenience ("the piece itself never
  needs a keyboard"), so leaving it alone is what keeps `keyboard.js` byte-identical.
- **The residual 1.1%.** A letter can still occasionally veto a pick — it takes a letter
  genuinely close to the line, where the visitor could reasonably have meant either. Driving
  it to zero means either dropping the veto entirely, which risks the letters, or widening
  `colBeatsKey` past the point where it is still true that a key aimed at cannot be beaten.
- Still **not run on a physical Quest**. Every hand path here is verified against a
  synthetic joint model, which is the same standard v6.1's selection work was held to.

## Files

| | |
|---|---|
| `js/hands.js` | +the palm: `palmPose`, `holdOffer`, and the `Hands` module (offers, and the SPACE stand-in) |
| `js/interact.js` | providers, `gather()` with its exclusivity rule, the pick ladder and its margin |
| `js/collection.js` | `targets`/`setHot`/`activate`/`exclusive`, and `summon`/`perch`/`hover`/`leave` |
| `js/config.js` | one new block (45 constants), plus three moved bands |
| `tools/reach/` | the headless harness |
| `tools/knobs.html` | regenerated — 245 tunables |

`js/keyboard.js`, the generator, the colour and everything else are **byte-identical to
v8.7**. The single number v9 changes outside its own four files is `CFG.hgtMax`, the top of
the letters' flight band.
