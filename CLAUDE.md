# Butterfly Keyboard — v11

**v11 is an exhibition pass: no new features, five things fixed, the whole build read
against "what breaks, or looks broken, on a floor in front of strangers?"** Four of the five
were bugs reachable in ordinary use that had never been looked for, because each one needs
*a second visitor*, *a full room*, or *a full day* to show itself.

| | |
|---|---|
| **A-Frame is vendored** | it was loaded from a CDN and nowhere else, so on a floor with no working wi-fi the whole piece was a blank white page. `vendor/aframe-1.6.0.min.js`, CDN kept as the fallback. The highest-consequence item here, and the cheapest |
| **The room kept the wrong butterflies** | the cap evicted `collected[0]`, and the replay was `.reverse()`d — so every new name threw away the room's *newest* butterfly and kept the oldest. One `.reverse()`, and it is also what keeps the two texture LRUs safe (see below) |
| **A finished name wiped the next one** | `accept()`'s 20 s fallback timer was never cancelled, and the normal reset lands at ~8.7 s — so anything typed in the following eleven seconds was silently cleared. That is the second butterfly, or the next person in the queue |
| **One texture per visitor, never freed** | `nameTagTex`'s cache is keyed on a *visitor-supplied* string and was unbounded. Tens of MB of GPU memory over a day, on a headset. Now capped at 64, evicted oldest-first |
| **The session never timed out on a desktop** | a parked mouse cursor hovered a butterfly every couple of seconds and every hover read as presence, so the quiet clock sat at zero forever. `CFG.mouseIdleMs` — a motionless cursor stops being a pointer, exactly as a lowered hand does. Timers are **10 s + 5 s**: 15 s from the last interaction to the room resetting |
| **GitHub Pages was deleting the exhibition** | `hydrate()` **replaced** the collection with the served file, and on a static host that fetch succeeds — so every reload swapped a headset's whole day for whatever was last pushed to git. It may now only **add**. See "Running it on GitHub Pages" |

Plus one guard: `DNA.usable()`, so a truncated `dna_sequences.json` is skipped rather than
throwing inside the tick loop every frame for the rest of the run — and `save.html`, a
standalone page for getting a day's collection off the headset.

**Nothing about the composition, the flight, the reveal, the generator or the interaction
changed.** `wing-gen.js`, `wing-colour.js`, `interact.js`, `hands.js`, `reveal.js`,
`guide.js`, `style.js`, `bfly-model.js` and `name-dna.js` are byte-identical to v10.5, and
`tools/reach/` passes unchanged — 229 assertions, five suites. `VERSION.md` has the
measurements.

## Running it on GitHub Pages

**This is the deployment target**, and it has one consequence that shapes everything below:
**a static host cannot accept the write-back POST**, so `dna_sequences.json` in the repo is a
**seed**, not the live collection. The live collection is the headset's own localStorage.

Three things follow, and all three are now handled rather than assumed:

- **`hydrate()` may only ADD.** It used to replace, which on Pages meant every reload swapped
  the day for the committed file *and rewrote the localStorage mirror with it*. `mergeIn()`
  takes the multiset difference on a content signature — `created | name | values`,
  deliberately **not the id**, since every device counts ids as `max + 1` and two devices
  independently produce 3, 4, 5 for different visitors. Nothing can ever be removed, on any
  host.
- **The refused POST is only attempted once.** A `405`/`501` sets `postRefused`; without it
  every save all day fires a request that cannot work and prints a red console line nobody
  can read in a headset. Not set on a network error or a 5xx — those are what a `serve.py`
  that is merely restarting looks like.
- **`save.html` gets the day off the device.** Same origin as `index.html`, which is the
  whole reason it can see the collection at all. Download / copy / restore / wipe, and
  **standalone by design** — no A-Frame, no `config.js`, no `dna-store.js`, no network
  requests, about forty lines of inline script. It is the page you open when something has
  gone wrong, so it must not be able to go wrong the same way.

### The day, end to end

| | |
|---|---|
| start clean | open the piece with **`?reset=1`** |
| run | the collection accumulates in the headset and survives reloads |
| end | open **`save.html`** at the same address → Download → commit that file as `dna_sequences.json` |
| next day | it is the seed, and `?reset=1` is *not* used |

**What Pages does not give you is a server-side backup.** The day lives in one headset's
localStorage until you export it, so export at the *end of the day*, not the end of the run.
Clearing site data or a browser storage eviction loses whatever has not been exported.
`serve.py` over USB (`adb reverse`) is the arrangement that keeps a file on disk instead;
it is unchanged and still works.

**One Pages-specific gotcha:** it serves assets with a cache lifetime, so a push may not
reach the headset immediately. The browser tab title says the version — check it reads
**v11** before a run.

### The invariant worth not breaking again

`Wings` (64 records) and `WingColour` (16) both **recycle a record's canvas and texture in
place** when they evict, and a collected butterfly holds those textures *directly* in its
material. So a live butterfly reaching the front of either LRU has its wings silently
redrawn as somebody else's, mid-flight. Nothing guards against that except an ordering:
**spawn order is cache order, and the cap always retires `collected[0]`** — the butterfly
whose textures are furthest from being recycled. v10.5 had that property by accident, and
the `.reverse()` fix above is what makes it true on purpose. `ui.js`'s new `TAG_MAX` rests
on the same invariant. If the collection ever stops being appended to in spawn order, all
three caches need refcounts instead.

---

# Butterfly Keyboard — v10.5

**v10.5 puts the accept/delete glyphs on the flowers, and makes the flowers actually flat.**
Two icons from the project's `icons/svg/` folder, and a rendering fix to `UI.blob()` that
had been latent since v4.

## The glyphs

`enter.svg` and `delete.svg`'s own path data (`js/icons.js`, new), drawn white onto a
canvas at runtime through Canvas2D's `Path2D` — which takes SVG path data directly — the
same way every other flat glyph in `ui.js` is drawn (`letterTex`, `nameTagTex`), rather than
fetched or baked to pixels. **The blue start flower does not get one** — this is
deliberately accept and delete only, the two controls that already carry meaning by colour
and now also by shape.

**A baked PNG was tried first and dropped.** Both SVGs were rasterised once to a
256×256 white-on-transparent PNG apiece and embedded as a data URI, loaded through
`THREE.TextureLoader` the way `bfly-model.js` loads `BODY_ALPHA`. It looked right in every
check that didn't involve the GPU: Python decoded both PNGs, a plain `<img>` displayed both
correctly, and `getImageData` read back the expected opaque white pixels on both. **Only
`delete.svg`'s bake failed, and only inside WebGL** — `texSubImage2D: bad image data`,
reproduced in complete isolation (a fresh texture, a fresh material, a fresh plane, no other
app state involved) — while `enter.svg`'s identically-produced bake uploaded and rendered
without complaint. Whatever specific byte pattern in that one PNG's compressed stream trips
Chromium's texture-upload path is not something this file can fix or explain, so it doesn't
depend on it: drawing the same vector data straight into a `CanvasTexture`, the upload path
every other texture in this codebase already goes through, sidesteps the PNG/Image decode
step entirely and the bug along with it.

The icon rides as a small square plane inscribed on the flower's own hub lobe (`UI.blob`'s
new fourth argument, `{tex, spin}`), added as a child of the flower's own group so it
inherits every bit of the flower's drift, breathe and press-spring for free — no extra
per-frame code anywhere the flower is driven from. Each carries its own small fixed
`spin` (accept −0.12 rad, delete +0.15 rad) so it reads as pinned to its own flower at its
own angle rather than a decal stamped level on top of it, the same idea `tilt`/`cant`
already apply to the six lobes ("neither of them square to you").

**The icon's depth test is OFF, and that is a second, unrelated fix.** The icon sits at a
small fixed offset along the flower's own local +Z so it draws in front of the lobes — but
"in front" only means "nearer the camera" for a *specific* tilt/cant, and accept's and
delete's are different enough (−0.33/0.24 against 0.50/−0.20) that the same offset lands on
opposite sides of the camera-relative depth test for the two controls. It happened to pass
at accept's angles and silently fail at delete's — the icon was being drawn, correctly
textured, and then discarded by its own flower's depth prepass every frame. Found by
comparing the two controls side by side (accept's icon showed, delete's never did, even
after the PNG fix above) rather than by reasoning about the matrices; fixed by turning the
icon's own `depthTest` off entirely (it is a small fixed decal on a control that is always
close and near the top of the scene, so genuine 3D occlusion was never worth having) and
giving it `renderOrder: 1` so it paints after its own lobes regardless of any z-sort.

## The flower was never actually flat

`UI.blob()`'s six lobes are overlapping opaque circles sharing one material — a cheap way
to get a union silhouette with no boolean, and it has always looked right at full opacity,
because the z-buffer already picks one lobe per pixel there. **It was never right at partial
opacity.** The moment `setAlpha()` turns transparency on (every fade the reveal or the guide
ever drives), each of the six lobes blends over whatever the previous one left at every pixel
it reaches — so wherever two lobes overlap, that pixel gets blended *twice* and comes out
visibly more opaque than the rest of the shape. A translucent flower showed its own overlaps
as a darker lattice instead of fading as one piece — exactly what "make the individual shapes
flat" was asking to fix, and it had been there, unnoticed, since v4 first built the cluster.

**The fix is a depth-only prepass**, one well-worn trick from anywhere overlapping
translucent geometry has to read as one surface (foliage, glass). Each lobe is now drawn by
two meshes sharing one geometry: an invisible `depthMat` (`colorWrite: false`, otherwise
ordinary opaque geometry) and the real, transparent `colorMat`. three.js renders every opaque
object in the scene before any transparent one, with no manual render call needed, so the
depth-only pass always claims the z-buffer's nearest surface at every pixel the union covers
*before* the colour pass runs — and the colour pass's default depth test (`LessEqualDepth`)
then only lets a fragment through where its own z matches what the prepass already wrote.
Exactly one lobe's fragment survives per pixel, however many overlap there, so the flower
fades as one flat shape at any alpha instead of a stack of double-counted blending.

At alpha 1 the result is pixel-identical to before — the z-buffer was already doing this
work, just inside one pass instead of two — so this only changes anything once a flower is
fading. Verified directly: with `Guide.ctlAlpha()` forced to 0.45 and the canvas scaled up
for inspection, both the accept and delete flowers render as a single uniform-opacity
colour with no darker seams at any lobe boundary, icon included (the icon has its own
depthWrite:false transparent plane in front of the lobes, so it was never subject to the
double-blend in the first place — only the six lobes were).

`js/ui.js` (`lobe()` and `blob()` rebuilt, `UI.icon()` added), `js/keyboard.js` (the two
control specs carry `icon`/`iconSpin`), `js/icons.js` (new), and `index.html` (one script
tag). `js/guide.js` is untouched — the start flower calls `UI.blob()` with no fourth
argument and gets the flat-shape fix with none of the icon code, for free.

---

# Butterfly Keyboard — v10.4

**v10.4 puts sound in the room.** Four recordings out of `sounds/sfx/`, one new module
(`js/sfx.js`), and one number in the guide.

**A music bed that never stops.** `bg_music` on `loop = true`, running from the page's first
gesture to the end of the day — through idle, through a handover, through `?guide=0`. It is
the room, not the session. **The loop seam is a fade, not a crossfade**: the master starts at
0.116 RMS and ends at 0.003, so a bare loop bangs once every 2:21. The level is an envelope
read off `currentTime` (up over 3.0 s, down over 2.5 s), and because `currentTime` resets when
the element loops that one expression is *both* the opening fade-in and every seam after it —
one element, no crossfade, and the AAC padding at the join lands where the level is zero.

**Wingbeats, as atmosphere.** Two recordings picked at random, one at a time, with 4–14 s of
quiet between and a 0.6 s fade at each end. Nothing triggers them and nothing waits on them.

**A click on everything selected** — the blue start flower, the green accept, the red delete, a
letter butterfly, a collected one. It lives on the **one line in `interact.js`** every
activation already goes through, not in the five providers' `activate()` methods.

**And a beat before the first word.** `CFG.voIntroDelay` = 0.90 s. The press has its own sound
now, and starting the narration on the same frame put the confirmation that the button worked
and the first line of the piece on top of each other. Measured in the running scene: silent at
frame 20, speaking at frame 53, with the state held at `welcome` across the pause so it cannot
fall through to `live` in the silence.

**The one thing that had to be found by running it: the bed's level cannot ride the render
loop.** A-Frame's tick is `requestAnimationFrame` and rAF stops dead while the page is hidden,
which on a headset is every time it comes off the face. The media clock does not. Caught by
watching the element's clock advance 4.3 s with `volume` stuck at 0 — a seam crossed while
hidden would have come back up silent and stayed that way. `applyMusic()` is therefore called
from the element's own **`timeupdate`** as well as from the tick.

**Both servers now answer HTTP `Range`**, which `loop = true` needs (looping is a seek), **and
call `.m4a` `audio/mp4`** rather than Python's `audio/mp4a-latm`, which Chromium refuses
outright. That is also the standing answer to "it plays on the desktop but not in the headset".

See `VERSION.md` for the measured levels, the Range and mime detail, and the fifth harness
suite (`tools/reach/test-sfx.js`, 229 assertions in all).

---

# Butterfly Keyboard — v10.3

**v10.3 fixes three things reported off the running piece: two of geometry, one of movement.**

**The visitor's name was written across their own butterfly.** The reveal presented the hero
at `camPos + camFwd * presentDist` — the full **gaze** vector — while the name they spelled
hangs at a *fixed world point* for the whole reveal. The two were never in the same frame, so
looking at your own name walked the butterfly down onto it: at a 0.30 rad look-down, which is
just reading what you spelled, the present spot fell from **1.660 to 1.424** against a name
whose top is **1.46**. Now `collection.js:presentPoint()` is the one place that answers the
question, and it uses the **levelled** heading (`_camLevel`, pitch removed) at
`max(camPos.y, CFG.eyeY) + presentRise` — the visitor's own eye line, floored at the scene's,
because everything else fixed in front of them (the name, the two controls, the flower) hangs
off `CFG.eyeY`. Yaw is still followed, so turning away does not lose the bloom. Pinning it to
`CFG.eyeY` outright was tried and is worse — a short visitor looking down loses the butterfly
off the top of the view. `hoverPoint()` has the same latent problem and is deliberately left
alone; see the note on it in the source.

**And the wings hinged at the belly.** The pivots sat at the model's `y = 0`, which the body
plane's `-s*0.63` shift lands on texture row **41** of `BODY_ALPHA` — the body's underside,
where the legs hang from. So the near wing lay *across* the body rather than on it.
**`CFG.wingRise` is 0.051** — texture row 23.5, on the body, in its top third, level with
where the front legs attach.

**It is NOT the body's top contour, and that is the whole subtlety.** Row 11 (the top outline)
was tried first and is too high, for a reason that is not in the body mask: **the painted wing
does not reach the plane's root edge.** The paint touches `u = 0` across only 0–6.6% of the
along-body span and the median row starts 11–18 px into the slice's 128 — a *different* inset
on every wing. Buried in the body that inset is invisible; sitting on the top contour it turns
into a gap between wing and back that varies from butterfly to butterfly. So the number comes
from where the **paint** lands, not the plane edge: median inset 0.070 s outward, lifted
`0.070 × sin(0.5)` = 0.034 s by the flight flap, under a thorax top of 0.0849 s → **0.051**.
**Raise the wings, do not drop the body**: `perchLegDrop` and `CFG.tagBodyDrop` are both
quoted against the body's ink, and neither had to move. It is free in the reveal's flat pose
too, where local +Y points at the visitor — the presented butterfly is pixel-identical.

**And it rocked fore and aft once per wingbeat.** The flight's pitch comes straight off the
frame's travel — `-atan2(dy, hSpeed) * 0.25` — and `dy` carries the **per-wingbeat body bob**,
added to `pos.y` a few lines earlier at the wingbeat's own 3-4 Hz. So the butterfly pitched
nose-up and nose-down once per flap, unsmoothed, where the yaw and the bank both have a lag.
Sampled every frame on five keys: the pitch oscillated at **3.1-3.8 turns/s**, matching each
key's own `flapSpeed` **to two decimal places**, travelling **18-53 °/s** — against a tuned
flight wobble of 0.35 °/s. It was worse on the slower butterflies, because `hSpeed` is the
denominator. **The bob is not the thing to cut** (it is already 0.030 → 0.010 × size); the
shake is the bob *differentiated*. **`CFG.pitchEase` (150 ms)** lags the pitch the way the
bank is already lagged: measured on the same frames, **66-73% less pitch travel**, while the
climb-and-dive pitch is untouched — the path noise runs at 0.010-0.045 Hz and a seventh of a
second is nothing to it. `faceTravel()` (summon / hover / leave) is deliberately left alone:
those states apply no per-wingbeat bob.

`config.js`, `bfly-model.js`, `collection.js` and `keyboard.js` are the only files that
changed.

---

# Butterfly Keyboard — v10.2

**v10.2 shortens the fuse to fifteen seconds.** `guideQuietMs` 30 s → **10 s** and
`guideQuietGrace` 15 s → **5 s**: fifteen seconds from the last thing a visitor did to the
room handing over, where v10 took forty-five. An exhibition floor turns people over fast and
ending is non-destructive, so the cost of ending early is that they press the flower again.
Verified in the running scene with no pointers (a headset with no hands tracked): live →
wrapup at **10.75 s** → farewell at **15.75 s** → idle at 17.0 s, with the collection
untouched throughout.

**A staff hard-reset gesture was built and REMOVED. Do not try a fist.** Two closed fists
held up for five seconds: measured against the joint model, cleanly separated from the pinch,
latch and timing proved in the harness — and **on a headset it did not fire at all**, while
hand tracking was working normally and letters were catching. **A closed fist is the worst
possible pose for optical hand tracking** and that is inherent, not a threshold: every
fingertip and the thumb are hidden behind the hand, so the cameras have nothing to infer
from. Deleted, not switched off — `hands.js`, `guide.js`, `interact.js` and `tools/reach/`
are byte-identical to v10 again. See `VERSION.md` for what to try instead if a staff reset is
ever wanted, and why `rig.debug()` being wired to nothing is half the story.

---

# Butterfly Keyboard — v10

**v10 gives the run a SESSION.** Until now the piece was always live: a visitor put the
headset on and landed in a room that was already fully interactive, with nothing to say what
to do and nothing to say when they were finished, so the next person inherited whatever the
last one left. Now the room starts as the **piece's**, not the visitor's — the twenty-six
letters fly exactly as they always have and **not one thing in the room is pickable** except
a single flower in front of you. Press it and a welcome track begins and the room becomes
yours; once your butterfly has joined the kaleidoscope a second track tells you how to call
it back; and when you stop, the session ends and hands over to the next person **without
touching the collection**. Two new files (`js/voice.js`, `js/guide.js`), one new block in
`js/config.js`, an `audio/` folder for the tracks, and five one-line-ish edits elsewhere.
See "The session" below and `VERSION.md`.

**The lockout is v9's exclusivity, reused, and that is the whole trick** —
`interact.js:gather()` already lets a provider claim the room, so `guide.js` is a THIRD
PROVIDER rather than a set of edits to the keyboard. Measured in the running scene, idle:
**30 pickable things in the room, `gather()` returns 1.** `keyboard.js`'s flight, capture and
picking did not change for any of it.

**The opening is three recordings, played as one.** The welcome, what to do, and how to do
it — `Voice.playing()` stays true across the gaps, so the silence between two of them is
never mistaken for the narration having finished. A cue with **no file behind it is a silent
no-op that still reports itself finished**, so any subset of the tracks runs the whole piece;
`nudge` and `farewell` are not recorded and the session runs without them. **Nothing in the
piece ever waits on audio.**

**And a hand held out PALM DOWN now lands a butterfly too.** The narration asks the visitor
to hold their hand out flat and palm down; v9.2's offer required the palm turned **up**, so
following the instruction exactly took the hover-then-leave branch and the interaction read
as broken to anyone doing as they were told. The test is now that the hand is **horizontal**,
and the butterfly lands on whichever face points at the sky — the back of the hand, when the
palm is down, which is where a butterfly lands on a person anyway. See "Either face" below.

---

**v9.2 sits the butterfly down properly on the hand.** One change, in the landing:
`BODY_ALPHA` draws a body in flight, and its hind legs are drawn shorter than its front
ones, so lying flat on the palm it rested on the deepest leg with the **hind tips 22 and
25 mm in the air** and the tail end of it plainly not on the hand. It is now pitched
**11.8° nose-up** onto the line through its own leg tips, measured off the alpha map the
same way `perchLegDrop` was. `CFG.perchPitch` is the new constant, `perchLegDrop` moves
0.1406 → 0.1145, and nothing else in the build changes. See "…and it stands on its legs"
below.

**v9 makes the kaleidoscope answer.** Until v8.7 the collected butterflies were scenery by
construction — `collection.js` had no `targets()` at all, so `interact.js` could not see
them even in principle — and the piece simply stopped after the reveal. Now a pinch on one
of them, the same pinch that catches a letter, calls it over: it leaves its orbit and flies
to you, and **lands on your hand if you hold it out flat and palm-up**, hovers in front of
your face for a few seconds if you do not, and goes the moment the palm turns, drops or
closes. While it is coming, **nothing else in the room is pickable** — not the letters, not
accept, not delete. Four new states in `collection.js` (`summon` / `perch` / `hover` /
`leave`), a palm posture published by `js/hands.js`, a pick ladder in `js/interact.js`, one
new block in `js/config.js`, and `tools/reach/` — a headless harness, because the whole thing
is a hand interaction and none of it can be eyeballed on a desktop.

**The two swarms also moved apart.** The collection used to fly *inside* the letters' angular
band, so every collected butterfly had letters in front of it and 42% of attempts to pick one
were vetoed by a letter that was merely nearby. The letters are now a low dome (`hgtMax` 2.30
→ 1.95) and the collection a high one above it, closer in (2.6–4.3 m → 1.7–3.0 m out, 0.8–3.0
→ 2.2–3.1 m up) — and the key layer's veto became a **margin** rather than an absolute.
Together: **42% → 1.1%**, with nothing lost the other way. That one number in the keyboard's
flight band is the only thing v9 changes outside its own four files; **the generator and the
colour are byte-identical to v8.7.** See "Calling a butterfly over" below and `VERSION.md`.

**v8.7 targets the wing SHAPE, not its colour.** The complaint was that some wings come
out too small; the measurement was that the wing filled only **10–39% of its slice, median
21%**, because the frame is sized for a worst case no roll reaches (outward) and because a
scale anchored at a fixed seam is limited by whichever of fore/hind reaches further (along
the body). A **fit stage** now measures the finished outline and places it: a uniform scale
about the body root, plus a shift of the seam onto the middle of the wing. Painted area
goes to **31 / 43 / 55%** at p05 / median / p95 — the smallest wing v8.7 draws is bigger
than the biggest v8.6 drew — and the size *spread* narrows, because the wings with the most
headroom are exactly the small ones. `expand()` and both wing generators are byte-identical
to v8.6; the shape is the same shape at a different size. `js/wing-gen.js`, four keys in
`js/config.js`, `js/wing-tex.js`'s cache key, one constant line of `js/wing-colour.js`, and
a new `tools/shape-preview.html`. See "The wing's fit in its slice" below and `VERSION.md`.

**v8.6 rebuilds the wing colour as flat graphic COMPOSITION.** v8.5 was a disciplined
geometric generator — one pattern per wing, straight cuts, the keyboard's own 26 hues at
full chroma — but it painted *pattern* where the reference graphics paint *composition*: a
ground (usually a light neutral), **1–3 big shapes** (circle, shard, band) each flat or
carrying its own pattern, each composited through a **blend mode** (`difference` leading),
optional orbital linework, and **hard edges everywhere**. The palette is now a **fixed
26-colour table sampled from those references** — bold primaries plus the muted earths and
neutrals that stop it looking like a screensaver — which deliberately drops v8.5's tie to
the keyboard's hue wheel. Contrast is **measured (WCAG) and gated, never maximised**, which
is what keeps it from collapsing to black-on-white. Only `js/wing-colour.js`,
`js/config.js`, **one line of `js/collection.js`**, `tools/colour-preview.html` and the
title; no new files. **Every collected butterfly re-renders its wing colour.** See "The
base-colour generator" below and `VERSION.md`.

**v8.6 is the version v8.7 builds on** and its wing colour is carried over unchanged —
see "The base-colour generator" below. **v8.5** is one pattern per wing over the keyboard's
own 26 hues, with black used sparingly by role; its `CFG.wingColWarp` and `wingColCuts` are
gone, and the code is in `versions/v8.5/` if that look is ever wanted back.

**v8.4 and v8.3 are the two versions v8.5 replaces.** v8.3 rebuilt v8's single global ramp
as a layered lepidopteran generator (a membrane wash through a two-tone harmonic palette,
plus venation, eyespots, a marginal band, a discal mark, speckle and basal suffusion); v8.4
gave that a per-name pattern archetype and one integrated dot system. Both still had a
gradient membrane underneath, which is exactly what v8.5 removes. **Their `CFG.wingCol*`
knobs are gone** — `wingColPeriod`, `wingColPeriodMax`, `wingColRampType`, `wingColHarmony`,
`wingColMotif`, `wingColDotAmt` — so do not carry a v8.3/v8.4 `config.js` block forward.
The code is in `versions/v8.3/` and `versions/v8.4/` if either look is ever wanted back.

**v8.2 refines the reveal.** Same nine-ish beats as v8.1, tuned on feedback: a **`charge`**
beat is prepended — ~1.8 s after **accept** where *nothing appears at all*, just the room
receding and the name hanging there, so the butterfly's arrival lands as a reward; the
arrival is now a **bloom** (scales up from nothing with a half-sine overshoot and a burst
of the visitor's letters) rather than a rise from below; the shed wake letters and the
launch burst **tumble** as they move; the caught name is **blasted downward** at launch
(and no longer vanishes early — the reset that disposed it raced a wall-clock timer);
the small name tag stays hidden until the butterfly has **joined the kaleidoscope**; and
the room's dim floor is raised (`revealDim` 0.28 → 0.42) with a slower return so it reads
as a fade, not a jump. Edits to `collection.js`, `reveal.js`, `keyboard.js`, `ui.js`,
`config.js`; no new files; generation, parity, DNA path, keyboard interaction and
persistence all untouched. See `VERSION.md` and "The reveal" below.

**v8.1 art-directs the reveal properly.** v7.2 gave the grown butterfly two beats —
rise, hover flat and breathing, fly away. v8.1 makes it **eight**, ~12.5 s, with a
**still beat at the centre of it**: arrive → settle → greet → still → coil → launch →
soar → orbit. The rest of the room **recedes** around the hero (it fades to 0.42 *and*
slows to 0.35×, and the decorative type and the two controls go entirely), the departure
becomes a real **launch** — an anticipation, a 1.6 m shot upward, a barrel roll unwinding
to nothing — and it sheds a **wake of the visitor's own letters** on the way up. At the
launch instant the name hanging in front of the visitor **flies apart** while the one
under the butterfly stays. One new file (`js/reveal.js`) plus edits to `collection.js`,
`keyboard.js`, `ui.js` and `config.js`; the generation, parity, DNA path, keyboard
interaction and persistence are all untouched. See "The reveal (v8.1)" below.

**v8 adds the base-colour generator.** The visitor's grown butterfly now carries a
**per-name procedural RGB texture** on its wings — a faithful-look port of the last
unported TouchDesigner script, `existing_work/td_py/wingbasecolour_script.py`. A mirror-fold
gradient ramp, perturbed by an fBm field, coloured through a dark→bright HSV palette,
multiplied by a second palette-coloured fBm ("mottle"), finished with a complementary
overlay tint. **The 26 keyboard letters stay flat.** The generation stage is now complete:
a name → a wing *shape* and a wing *colour*, both deterministic from the same four values.
See "The base-colour generator (v8)" below.

**v7.2 art-directs the reveal.** When a name grows a butterfly it now runs a shaped
two-beat "here's your butterfly": it hovers **flat, wings square to the visitor** like a
pinned specimen with only a slow shallow wing-breath, then **flutters up and away into the
part of the kaleidoscope the visitor is looking at**, wings rising to a full beat as it
banks into the turn. v7/v7.1 presented a three-quarter view with a full flight beat and
slid to a random orbit slot. This is `collection.js`'s `present`/`joining` states
reshaped plus five `CFG.reveal*` knobs (and retuned `present*` timings) — the generation,
the DNA path, parity, the keyboard, the name tag and the persistence are all untouched.
Superseded by v8.1 — see "The reveal (v8.1)" below.

**v7.1** is v7 with one change: the name tag under a collected butterfly now hangs **right
below the body, tight against it**. v7 placed it against the model's *bounding box*
bottom, but the wing/body planes carry ~3× more transparent margin than shape, so the name
floated well below. It now uses `CFG.tagBodyDrop` — where the *painted* silhouette
actually reaches — and `ui.js` scans the rendered name canvas for its first inked row so
the visible top of the name lands there. Everything else — the generation, the collection,
the flight, the persistence, the server — is v7's. Section "The generation stage" below
still describes the whole thing.

Catching butterflies is typing. Twenty-six butterflies circle the visitor, one per letter;
reach toward one, pinch, and its letter joins the name floating in front of you. A green
shape confirms, a red one takes a letter back — and then the name **grows a butterfly of
the visitor's own**, which joins an accumulating kaleidoscope and stays there for the rest
of the exhibition. The room begins empty and fills up. Then the piece resets for the next
person.

v4's typographic collage with everything explanatory taken out of it, and the two controls
given real weight.

**v7 adds the generation stage.** Every version from v3 to v6.2 collected a name, fired
`keyboard:accepted`, and stopped. v7 turns that name into four generator values, grows the
butterfly, and keeps the collection — in the browser, and (behind `serve.py`) in a shared
file on disk. **The 26-key interaction is untouched**: `keyboard.js`, `interact.js`,
`hands.js` are v6.2's, bar one line. See `VERSION.md` and "The generation stage (v7)"
below.

**v6.1 is v6 (tested and working on the Quest) with selection made easier**, driven by
exhibition feedback: reaching out and pinching a specific butterfly was harder than it
should be, and the swarm's motion risked motion sickness. Nothing about the composition,
typography, or capture flow changed — see "Selection, made easier (v6.1)" below for what
did.

**v6.2 was a janitorial pass over v6.1** — three latent `NaN` bugs fixed (a partial
`CFG.arcSpan` collapsing the swarm; the blown-up highlight letter and the satellites, both
of which had rendered nothing since v6 because their `CFG` keys went missing), dead code
removed, the generation seam left ready. Nothing changed on a clean load.

**The keyboard scene is butterflies and the two controls, nothing else.** The scatter —
the words on their side, the rules, the giant letters, the alphabet ring — is deleted, not
disabled. v7 adds one thing to the room: the collection, a second, wider, non-pickable
cloud of butterflies further out (see "The generation stage").

**Nothing in the scene is a word or a rectangle.** No instructions, no captions, no keyline.
The only written thing left is the alphabet, set on its side. If reaching at a butterfly and
watching it light up does not carry the interaction, a sentence hanging in the air was never
going to. **v10's guidance is SPOKEN for exactly that reason** — a voice-over is not a
caption, and the room it describes still has nothing written in it.

## Layout

```
index.html          scene + script tags
save.html           v11 — get the day's collection off the device, and put one
                    back. Standalone: no A-Frame, no deps, no network
vendor/             v11 — A-Frame 1.6.0, local. The piece will not start without
                    it and a CDN is not a dependency an exhibition can take
js/
  rolltable.js      GENERATED — 180 baked uniforms  ]
  wing-gen.js       the generator + v8.7's fit stage ] Parity with TouchDesigner
  textures.js       body alpha, base64              ]  is held in web/ — do not
  icons.js          v10.5 — the accept/delete glyphs' path data, from icons/svg/
  wing-colour.js    v8 → v8.6 — a name -> a base-colour texture (collection only; not parity-locked)
  name-dna.js       v7 — a spelled name -> four values (xmur3 hash)
  dna-store.js      v7 — the collection: made, kept, brought back (fork of web/)
  hands.js          usable data out of hand-tracking-controls, and (v9) the
                    palm posture that means "a butterfly may land here"
  config.js         every number the piece is built from
  style.js          the typographic decisions, made once per letter
  bfly-model.js     the mesh: one body plane, two wing planes on pivots
  ui.js             letter sprites, the cut-out wing glyph, the flower
                    clusters, and (v7) the name tag under a collected butterfly
  reveal.js         v8.1 — the room's dim/slow envelope, the launch's shove,
                    and the wake of shed letters
  keyboard.js       the swarm, the letters, capture, the name
  collection.js     v7 — the kaleidoscope that accumulates; v9 — and answers
  voice.js          v10 — the narration. One cue at a time; a missing one
                    is a silent no-op that still finishes
  sfx.js            v10.4 — the room's sound: the looping bed, the
                    wingbeats, and a click on everything selected
  guide.js          v10 — the session: the start flower, the spoken
                    beats, and the handover to the next visitor
  interact.js       reach / point / pinch -> highlight and activate;
                    v9 — over two providers, on three layers;
                    v10 — three providers, the guide first
  app.js            v7 — the seam: name -> NameDNA.toValues -> DNA.create
audio/              v10 — the four voice-over tracks, and a README naming
                    them. A missing one is a silent no-op; the piece runs anyway
  sfx/              v10.4 — the bed, two wingbeats and the select click.
                    AAC copies of the masters in sounds/sfx/ (2.3 MB the lot)
tools/
  serve.py          static server + the collection write endpoint (v7)
  serve-https.py    TLS server, for testing on a Quest + the same endpoint
  colour-preview.html  v8.6 — the wing base colour's tuning page
  shape-preview.html   v8.7 — the wing shape's, incl. the fit stage's knobs
  knobs.html           every adjustable constant, searchable. GENERATED
  build-knobs.py       …by this; edit its table and re-run, never the HTML
  reach/               v9 — the headless harness for the reach interaction,
                       v10 — and for the session, v10.4 — and for the sound:
                       sh tools/reach/run.sh   (needs nothing but a Mac)
```

The parity harness lives in `web/tools/` and is not archived into a release — a snapshot
carries what it needs to RUN, not to be tested. `rolltable.js` and `textures.js` here are
byte-identical copies of `web/`'s.

**`wing-gen.js` and `wing-tex.js` are NOT, as of v8.7**, and this is the one place that
matters. v8.7 added a fit stage to `wing-gen.js` and the fit knobs to `wing-tex.js`'s cache
key; `web/` does not have either. Both harness checks still pass on this file, but the
second one has a condition:

| check | how it stands |
|---|---|
| `expand()` vs the Python, parameter by parameter | **untouched.** The fit stage runs entirely downstream of `expand()`, `forewing()` and `hindwing()`, all three byte-identical to v8.6 |
| rasterised wing vs the Python's `build_mask` | **run it with `fitFill: 0, fitSeam: 0, fitGain: 1, fitMargin: 0` in `opts`** — those restore v8.6's rasterisation exactly, and that is the whole point of them existing. At the shipped defaults it will fail by design: the wing is deliberately bigger |

If `wing-gen.js` is edited again, port the change to `web/` and re-run the harness there
with the fit off. `dna-store.js` is a **deliberate fork**
of `web/`'s (see its header), not a sync target. `wing-colour.js` (v8) is a **faithful-look
port, not parity-locked** — it lives only here, has no `web/` counterpart, and its contract
is determinism from the name, not a bit-match with TouchDesigner (see "The base-colour
generator"). `tools/colour-preview.html` is its tuning aid, and v8.7's `tools/shape-preview.html` is the shape's.

## Passthrough

`XRMode: xr` offers both buttons. **AR** keeps the room; **VR** is the black void. Three
things make AR work and all three are in `index.html`:

- `hide-on-enter-ar` on the `<a-sky>`, or the black sphere covers the camera feed;
- `ar-hit-test="enabled: false"` — A-Frame adds a floor placement reticle by default and
  this piece has no use for one;
- `webxr="optionalFeatures: hand-tracking, ..."` rather than leaving it to the browser to
  infer from the hand entities.

The sky is **white**, not black, so the desktop view and a lit passthrough room look like
the same piece. Nothing in the UI has a background to hide behind, so everything carries its
own contrast as flat ink: grey letters, a darker caption, and two saturated shapes.

## The interaction

Two ways to pick, in order:

| | |
|---|---|
| **touch** | the index fingertip is inside a butterfly's sphere — wins outright |
| **point** | otherwise, a ray from the index knuckle through the fingertip |

Most of the swarm is further away than an arm, so pointing is the normal case and touching
is the bonus. The ray tolerance is a **cone**, not a fixed radius (`CFG.pickBase` close in,
`CFG.pickAngle` opening with distance): a fixed radius makes a butterfly four metres away
almost unhittable, and one wide enough for those turns a near one into a blob.

**The controls win.** The two shapes are the only fixed things in the room and they sit
inside the swarm's orbit, so a butterfly drifting across the green one must not steal the
pick — the visitor would be unable to finish until it moved on.

Activation is the pinch **edge** with two thresholds (`pinchOn` / `pinchOff`). A single
distance chatters across the boundary and fires repeatedly.

Desktop: hover and click drive the same code path, and letter keys / Backspace / Enter work
as a testing convenience. The piece itself never needs a keyboard. **v9 adds SPACE**, which
toggles a synthetic offered palm so the landing can be driven without a headset — see
"Calling a butterfly over". **v10 gates the letter keys on the session being live** — the
pointer is locked out by the guide's exclusivity, but that handler bypasses `interact.js`
entirely, so it needs the one check of its own. **Escape** ends a session and hands over.

**v9: there are three kinds of pickable thing, not two**, and they are tested in a fixed
order — the two controls, then the 26 letters, then the collected butterflies. See "The
pick ladder" below; the ordering is load-bearing, not a preference.

## Selection, made easier (v6.1)

The cone above is a fixed geometric budget, already tuned right up against a hard
ceiling — neighbours sit about 0.6 m apart, and slack much past a quarter of that turns
several of them into one unhittable blob, a regression already found and fixed once (see
`CFG.pickBase`/`pickAngle` further down). So v6.1 does not touch it. Instead it fixes the
three things that were actually making real hand tracking hard to select with, none of
them geometric:

- **The ray's own origin was the noise source.** v6 cast from the index knuckle through
  the fingertip — a ~3cm baseline, so a few millimetres of finger curl *while closing a
  pinch* swung the aim by tens of degrees: the single most common miss was being visibly
  on a butterfly right up until the frame the pinch committed. This is exactly what
  Meta's own hand-pointing model (the ray Quest's system UI casts) avoids, by anchoring
  the ray near the **shoulder** instead of the hand. There is no tracked shoulder joint,
  so `interact.js:shoulderOf()` estimates one each tick from the camera pose —
  `CFG.shoulderDown` below the headset, `CFG.shoulderOut` to the side along the camera's
  flattened (yaw-only) right axis, mirrored per hand — and the ray runs from there
  through the fingertip. A ~60-80cm baseline means the same finger curl swings the aim
  by a couple of degrees, often less than the pick cone's own slack. Measured directly:
  a realistic ~2.7cm pinch-close curl that puts the OLD knuckle-anchored math 0.70 m off
  axis against a 0.27 m tolerance (a clean miss) leaves the new shoulder-anchored ray
  still on target. The line drawn for the user still visually starts at the fingertip —
  only the invisible point used for picking moved.
- **Residual jitter.** `hands.js` deliberately publishes raw, unfiltered joint
  positions — that's correct, filtering belongs one layer up. `interact.js` keeps a
  per-hand exponential moving average of the fingertip the ray is aimed through
  (`CFG.aimSmoothTau`, in `tick()`), used for the ray pick only — touch stays on the raw
  fingertip (it's a deliberate close-range action, not the noisy long-range case), and
  the desktop mouse pointer has no jitter to smooth.
- **What the shoulder ray doesn't fully remove.** Activation only ever fired if a
  target was picked on the exact frame the pinch crossed its threshold.
  `interact.js` remembers each hand's last hot id and when (`lastHotId`/`lastHotAt`); a
  pinch's rising edge with nothing picked that exact frame still activates the
  remembered target if it was hot within `CFG.pickGraceMs`. **Butterflies only** — the
  two controls keep the exact old behaviour with no rescue, since a wrong accept/delete
  costs more than a missed letter, and they're fixed in place and easier to hit anyway.
  `keyboard.js:activate()` already re-validates a key's state before capturing, so a
  stale rescue (already captured by the other hand, mid-flight out) just silently
  no-ops.

**The line now literally connects.** It used to be a fixed-length segment gesturing along
the pointing direction; now, whenever something is picked, its endpoint is that target's
exact live position (not a projection along the ray — the shoulder anchor above means the
ray's own origin is no longer where the line is drawn from, so the endpoint is set
directly rather than derived from the ray math), so what you see is exactly what would
activate. It still visually starts at the fingertip, same dark, subtle ink (`0x12121a`),
same opacity behaviour — only the invisible picking origin moved. A successful catch also
gives the line a brief opacity flash (`CFG.flashTime`) that eases back down — pure
opacity on existing geometry, no new meshes, no glow, matching "Flat" below.

**A hot butterfly, and its neighbours, fly calmer.** Exhibition feedback flagged the
swarm's motion as a motion-sickness risk. Rather than slow the whole swarm at all times —
v6's cruising flight is already tuned and tested on-headset, and stays untouched —
`keyboard.js:updateSlowField()` eases a hot key's `timeScale` down to `CFG.slowHot`, and
eases nearby keys down too on a falloff (`CFG.slowRadius`), releasing back to 1 once
nothing is pointed there (`CFG.slowEase` controls how gradual both directions are — a
snap would be its own small motion-sickness risk). Each key carries its own accumulated
clock, `k.flightT`, incremented by `dt * k.timeScale` instead of tracking the scene clock
directly — this is what lets a slowed key's orbit, wobble noise, wingbeat, and glide/flap
burst cycle all calm down together, in `tickKey()`, rather than the body slowing while the
wings keep beating at full rate. At `timeScale` 1 (everywhere nothing is hot) `flightT`
tracks the scene clock exactly, so this is byte-for-byte v6's flight until something is
reached for. Hand-repulsion/scatter and the neighbour-separation spring are deliberately
**not** rescaled — both are `dt`-based physical reactions, and a slowed butterfly still
has to be able to react instantly if a hand brushes it, or it would read as stuck. This
also has a selection side-effect worth knowing: a target barely moving while hot is far
more forgiving of both the ray-jitter smoothing and the pinch's commit-frame perturbation
above, so the three fixes reinforce each other.

## Selection, round 2: memory instead of a wider cone

After trying the pass above on-headset, three things remained: neighbouring butterflies
(~0.6 m apart, cones that genuinely overlap at that spacing) still got confused for each
other, the two controls still got triggered by a reach that only grazed them, and the
pinch itself sometimes just didn't register. None of this is a job for the shared cone —
that ceiling is exactly the one described above, and the "closest pair 0.17 m apart, 26/26
self-pick" check in `VERSION.md` is what a further tightening would put at risk. So this
round adds *memory over time* and shrinks two *specific* targets, rather than touching the
shared budget.

**Hover lock.** `interact.js:pickFlySticky()` — butterflies only, hands only, called
alongside (not instead of) `pickRay`'s panel check, so "the controls win" and the mouse's
plain `pick()` are both untouched. Once a hand has a hovered butterfly (`p.lockId`), a
competing candidate only steals it by clearly beating its score (`CFG.hoverLockMargin`, a
fraction of the tolerance width) or by being the *same* better challenger for
`CFG.hoverLockMs` running. A target the ray has plainly left (`score >= 1`) releases with
**no delay** either way — the lock only ever resists switching inside a genuine overlap
band. This also stabilises the grace window from the pass above for free: `lastHotId` is
set from whatever the lock returns, so it inherits the same steadiness.

*A bug worth not rediscovering:* the two "still winning" branches reset
`p.lockChallengeAt = -Infinity` but originally left `p.lockChallengeId` stale. A later
frame where that same challenger id reappeared saw `lockChallengeId === best.id` already
(so the timer never restarted) while `lockChallengeAt` was still `-Infinity` — and
`now - (-Infinity)` is always `>= hoverLockMs`, so `sustained` came back true on a single
fresh frame instead of after a genuine `hoverLockMs` of consistently losing. Caught by a
synthetic symmetric-tie test that flickered every 5-7 frames instead of holding; the fix
clears `lockChallengeId` alongside `lockChallengeAt` in every branch that isn't an active
challenge.

**The controls stop being "fallen onto."** Their own pick **radius**, not just the cone's
slack, turned out to be the dominant term: the accept blob's pick radius was ≈0.29 m, the
delete blob's ≈0.23 m — both already bigger than a typical butterfly's own (`0.20 * size`,
0.09–0.21 m). `keyboard.js:targets()` now shrinks a control's *picking* radius by
`CFG.panelPickShrink`, decoupled from its visual size (which is untouched, everywhere
else); `interact.js:pickRay()`/`pickTouch()` also give panel targets their own, tighter
slack (`CFG.panelPickBase`/`panelTouchRadius`). Combined, a control's total tolerance
drops from ≈0.35–0.45 m to ≈0.19–0.22 m — tighter than a typical butterfly's, so "the
controls win" (still an unconditional rule) only matters when one is genuinely aimed at.

**Making the pinch itself register.** `rig.pinch` (hands.js, raw thumb-index distance) is
noisiest exactly as fingers occlude each other from the headset's own cameras — i.e.
exactly at a real pinch — and the absolute thresholds may not fit every hand. Two changes
together: `p.smPinch` EMA-smooths it (`CFG.pinchSmoothTau`, about half `aimSmoothTau`
since activation should still feel immediate — this only needs to bridge one bad sample,
not damp sustained jitter), and `pinchOn`/`pinchOff` both widened by the same 5 mm
(preserving the hysteresis gap, just shifting where it sits) — smoothing alone can't fix a
signal that's systematically a little wide right at occlusion. The small added lag before
`closed` flips is fine by the same logic the grace window already relies on: it looks
*backward* from the pinch frame, so a few ms of *forward* delay before that frame arrives
doesn't compound with it.

**The slow field, sharpened.** `slowHot` lower (0.25) and `slowRadius` wider (1.10), plus
a new `CFG.slowFalloffPow` biasing the falloff curve to stay close to `slowHot` near the
target and drop off more steeply near the edge, instead of `smoothstep`'s roughly-linear
middle (`keyboard.js:updateSlowField()`). Deliberately *not* flattening nearby neighbours
down toward the hot target's own speed — a near-stationary neighbour is an *easier*
accidental ray target than one still visibly drifting, so the contrast between "the hot
one" and "everything else nearby" has to stay legible; the goal is calming the immediate
neighbourhood's own flight noise, not equalising speeds.

## Selection, round 3: forgive the tracking, gate the touch

Round 2 on-headset left two things: the pinch still sometimes didn't register, and it was
still too easy to accidentally select a neighbour. Both traced to code round 2 never
touched — this round doesn't widen `pinchOn`/`pinchOff` again (that would make an
accidental touch read as a deliberate pinch, working against the second complaint), and
doesn't touch the shared cone either.

**Tracking-loss forgiveness.** `interact.js:tick()`'s untracked branch used to reset
`closed`/`smPinch`/`pinchInit`/`lockId`/`lastHotId`/etc. unconditionally on a **single**
untracked frame — and Quest hand tracking commonly loses confidence for a frame or two
exactly as fingers occlude each other, i.e. exactly at a real pinch, discarding a pinch
already in progress before it could complete. None of round 2's smoothing runs on an
untracked frame at all (it's inside that same early-return), so it was structurally blind
to this. Now a dropout under `CFG.trackLossGraceMs` (200ms) just hides the ray line
(honest about not knowing where the hand is) and otherwise holds every value exactly where
it was; only a dropout that outlasts that window does the original full reset. Verified
directly: through a brief (~50ms) synthetic dropout, `closed`/`smPinch`/`lockId` are
byte-identical before and after and the lock re-acquires with zero delay; through a
sustained (300ms) one, everything correctly returns to its reset defaults.

**Touch dwell.** `pickTouch()` itself is untouched (same nearest-within-`touchRadius`
scan) — but it used to win outright over the now-stabilised ray/hover-lock on a **single
frame** of proximity, with no memory at all. A hand travelling through the swarm toward an
intended target routinely passes within touch range of unintended neighbours en route; any
one of those could instantly steal the pick. A touch now has to be the *same* nearest
target continuously for `CFG.touchDwellMs` (120ms, about half `hoverLockMs` since physical
contact is already a stronger intent signal) before it's allowed to override
`panelPick`/`flyPick`. Losing touch range releases the candidate instantly — no dwell on
the way out, matching hover lock's own "plainly left → no delay" convention. Bonus effect:
a graze that never clears the dwell window no longer becomes `picked`, so it can no longer
pollute `p.lastHotId` either — the grace window can't be tricked into rescuing a butterfly
the hand only brushed past.

**An accept confirmation.** Pressing accept used to get the exact same press-bounce as
delete, then the whole panel immediately dimmed — not distinct enough to read as "that
worked." Two changes, both fired from `accept()`, both reusing the identical spring math
`tickUI()` already runs for button scale (no new colours, no glow — state via colour/size
only, never softness): `bump()` gained an optional `kick` parameter so accept can pass a
bigger one (`CFG.acceptConfirmKick`, roughly 2× the shared `CFG.ctlKick`; delete's call
site is byte-identical to before), and a second spring instance (`this.confirmScale`/
`confirmVel`) pulses the caught name itself, multiplied into `this.nameScale` everywhere
it's read. Measured directly against the real running springs: an ordinary press peaks at
1.35×; accept's button peaks at 1.79× and the name at 1.77×, essentially in lockstep —
bigger in *amplitude*, not *tempo*, so it reads as "the same bounce, bigger," and the name
— the thing actually being confirmed — visibly responds too, not just the button.
`reset()` snaps the name pulse back to its rest state for the next visitor even if caught
mid-ring-down.

**A smaller UI.** `CFG.blobW`/`blobH` walked back from `0.200/0.176` to `0.160/0.140` —
not a guess: `versions/v4/js/config.js` shipped `blobW: 0.155, blobH: 0.140`, the actual
prior size this file's "much bigger than v4's" was contrasting against, and a size already
proven not to blob-lump. A genuine ~20% area reduction from where v6.1 started, while
v6.1's own larger per-control `k` multipliers (1.26 accept / 1.02 delete, vs v4's 1.12/
0.90) still carry over unchanged, so accept still reads moderately bigger than v4's ever
did — a real shrink, not a full revert. No compensating change needed to `ctlGap` (cluster
half-widths only get *more* clearance, not less, once the shapes shrink — verified: 0.53m
combined half-width against `ctlGap`'s 0.82m). The shrink also tightens round 2's pick
math further (a happy accident, verified: accept's ray tolerance ≈0.22m → ≈0.19m, delete's
≈0.19m → ≈0.16m) — reinforcing "too easy to accidentally select" on top of that round's own
fix. Whether the six lobes still read as six lobes rather than one blob-lump at this size
is an on-headset judgement call CLAUDE.md's own earlier warning about this only poses
qualitatively — arithmetic can't settle it.

## Calling a butterfly over (v9)

Everything up to v8.7 ended at the reveal. A visitor spelled their name, watched their
butterfly bloom, greet them and launch — and from then on it was **scenery**, orbiting a
room it could not be reached in. That was structural, not an oversight waiting to be fixed:
`collection.js` had no `targets()`, so `interact.js` could not see the collection at all.

v9 gives it one. Pinch a butterfly in the kaleidoscope exactly the way you pinch a letter,
and it comes to you.

| what your hands are doing | what it does when it arrives |
|---|---|
| a flat palm, turned up, held up | **lands on it**, for `perchDwell` (12 s) |
| anything else | **hovers** in front of your face for `hoverDwell` (7 s), then goes |
| the palm turns, drops or closes | **goes**, on that frame |
| a palm goes up while it is hovering | goes to it |

**Nothing else in the room is pickable while this is happening.** Reaching for a butterfly
flying at your face means putting your hand through the whole keyboard, and every letter it
passes was a live target — so `butterfly-collection` reports itself *exclusive* and
`interact.js` offers nothing but its own butterflies. The lockout lifts the moment the
butterfly turns for home, so a visitor mid-name waits about twelve seconds rather than
fifteen, and the room comes back while they are still watching it go. Its own targets stay
live throughout, so a pinch on a different butterfly still swaps which one is coming — only
the letters and the two destructive controls go away.

There is nothing to learn and nothing announced. The whole grammar is *hold your hand out
and it will come to it*, which is what people already do around butterflies — and discovery
is free, because the butterfly comes to your face whether or not you know about the hand,
and putting one up while it is there redirects it immediately.

### The four states

`summon` / `perch` / `hover` / `leave`, built exactly the way the reveal's eight beats are:
skipped by `separate()` (which only ever touches `'orbit'`), not pickable while they run
(`targets()` offers `'orbit'` only), and handing back to `tickOrbit` through the same
representation the soar lands on — path offset zeroed, bank zero, yaw already on the travel
heading.

**The approach is a cruise, not a lerp.** A lerp toward a target is fastest when it is
furthest away and crawls at the end, which is exactly backwards for something flying to your
hand. `summonSpeed` holds until the last `summonEase` metres and then eases down, so it
arrives settled rather than stopping dead. The first pass — 0.55 m/s easing over a full
metre to 0.16 — took **8 s** from 3.7 m out, which is past deliberate and into waiting; the
shipped numbers do the same trip in **5 s**, and the furthest butterfly in the room in about
6.5.

**It is re-aimed every frame**, at the palm if one is offered and at a spot in front of the
visitor's face otherwise. Putting a hand up mid-flight redirects it and dropping one sends
it back to the hover spot, and neither is a state change — which is why the interaction
survives a visitor who works out the rule halfway through.

**The sway is a velocity, not a position offset.** The lateral wander that keeps the
approach from reading as a dolly move fades out as it arrives; as an offset it would step
the instant the fade factor moved, so it goes in as amplitude × rate × cos and integrates to
the same wander with no discontinuity possible.

**It hovers ABOVE the eye line.** The name field hangs at `nameY` −0.235 and the two
controls at `blobY` −0.435 on a panel 0.80 m out, so a butterfly holding station at 0.62 m
and *below* the eye line sits directly in front of both. It could never steal their pick — a
summoned butterfly is not a target — but it would cover them. The reveal used to solve the
same problem the same way, with `presentRise` alone; v10.3 found that pitch defeats it and
gave the reveal `presentPoint()` instead. `hoverPoint` is knowingly still on the gaze — see
the note on it in `collection.js`.

**And it FLIES while it waits.** The first pass held it in the reveal's flat pinned-specimen
pose, wings spread square to the visitor — which made it the one thing in a room full of
flight that was not flying, and read as a diagram of a butterfly rather than a butterfly.
That pose is the hero's and stays the hero's. Now it takes the ordinary flight wingbeat,
`presentRoll` keeps the wing readable, and it wanders about the held spot on the same fbm
noise it flies its orbit with, at `hoverRate` × its own frequencies — so no two wait the same
way and none of it is periodic. Measured in the running scene, the wing-to-camera aspect
travels **0.08 → 0.56**; the flat pose sat pinned at 0.99 the entire time.

**THE HEADING IS HELD, NOT CHASED**, and this is the part that took a second pass. It first
turned the body to follow its own travel direction, the way the orbit does — which is right
for the orbit, where a butterfly travels one way for many seconds, and wrong here, where the
wander reverses every couple of seconds and the body therefore swung a full half turn each
time it did. Measured: **4.6 radians of yaw in 3.3 seconds.** That, more than the drifting,
is what read as moving too radically.

It now holds a heading **broadside** to the visitor and sways gently about it
(`hoverSwayYaw`, `hoverTurn`). Broadside rather than facing them square, because with the
body axis pointed at the visitor the wing plane cannot face them either — the same geometry
that made the reveal need `_flatQuat`, where `presentRoll`'s aspect never tops ~0.18 — so
square-on is the one heading at which the butterfly is an edge-on twig. It is also exactly
what every orbiting butterfly is already doing, so it needs no new pose. Which side is chosen
at the moment it arrives, as whichever is the **shorter turn** from the heading it flew in
on: drawn at random instead, it could arrive flying at the visitor and then swing a half turn
to settle, which measured 179°/s on the first frame against 84 now.

The drift came down with it — `hoverRate` 20 → 9, the spans roughly halved, `hoverEase`
0.22 → 0.40. Over the whole 7 s wait:

| | first pass | now |
|---|---|---|
| drift | 0.24 × 0.11 × 0.10 m | **0.09 × 0.05 × 0.06 m** |
| peak speed | 0.36 m/s | **0.19 m/s** |
| yaw swept | 264° | **52°** |

Three details that are not obvious, each of which cost a measurement:

- **The wander is applied to the TARGET, and the position lags it** by `hoverEase`. That is
  where the damping lives — raise it to calm the movement without making it smaller.
- **The wander has to ease in** (`hoverSettle`). It arrives within `summonArrive` of the
  un-wandered spot, but the noise at that instant is wherever the butterfly's own clock has
  it — up to a full span away — so the target jumped on the first frame of the hover and the
  lag chased it at **1.0 m/s**. That is a lunge toward a face 0.6 m away. Ramped in, the peak
  over the whole wait is 0.36 m/s.
- **No per-wingbeat body bob here**, deliberately. In the orbit it is a centimetre at 3–4 Hz
  seen from metres away; at 0.62 m it is the fastest thing in the room and reads as jitter —
  which is exactly what v2 cut it for.

**A resting butterfly is not a still one.** It opens and shuts its wings every couple of
seconds, on an interval jittered per flutter so two never sync up, and follows the hand on a
50 ms lag rather than being welded to it. Hands are never still; without both it reads as a
sticker stuck to your palm.

**AND IT STANDS ON ITS LEGS.** `perchPoint` first put the model's *origin* on the palm — but
the origin sits high inside the **body**, and the body sprite hangs below it: body, then
three pairs of legs. (Through v10.2 the origin was also the wing hinge; v10.3 lifted the
hinge `CFG.wingRise` above it and left the body exactly where it was, so every number here
still holds unchanged.) So the butterfly was planted wings-deep in the hand with every leg buried, about
52 mm of it at `perchSize`. The lift is now `perchLegDrop × size`, so the legs land on the
surface and the body is held clear of it.

`perchLegDrop` is **measured off `BODY_ALPHA` itself**, not guessed: decode the PNG,
threshold at the material's own `alphaTest` of 0.5, map texture rows through the body plane's
geometry (`PlaneGeometry(0.42, 0.42)` translated −0.1764), and the painted silhouette runs
from local y **+0.0287** down to **−0.1406** — a wide horizontal body and antennae at the
top, then the legs descending, the longest reaching −0.1406. Cross-check:
`CFG.tagBodyDrop`, measured independently across flap and roll for the name tag, is −0.135.

It is quoted **per unit model size**, like `tagBodyDrop`, and applied against the *current*
scale — the landing eases its scale up over `perchSettle`, and a fixed lift would let the
legs sink as the butterfly grew.

**AND IT STANDS NOSE-UP, because the legs are not all the same length (v9.2).** One number
along the normal was *not* the whole correction. `BODY_ALPHA` draws a body in **flight**,
seen side-on: the front legs hang long and forward, the hind pair is short and swept back.
Label the four leg strands in the decoded alpha and their tips sit at

| | along the body | below the origin |
|---|---|---|
| front | −0.0575 | −0.1145 |
| mid | −0.0301 | **−0.1407** ← the lowest, and all v9.1 used |
| hind | +0.0892 | −0.0964 |
| hind | +0.1171 | −0.0915 |

so held level on the deepest of them the **hind tips floated 22 and 25 mm** over the palm at
`perchSize` and the tail end of the butterfly visibly did not rest on the hand.

**The four tips are not collinear** — the mid pair hangs 15 mm below the line through the
other two — so *no rigid pose lands all four*, and the choice is which error to spend:

| pitch | `perchLegDrop` | the four tips, mm off the hand at `perchSize` | |
|---|---|---|---|
| 0.000 | 0.1406 | +15.1  +2.0  +24.1  +26.6 | v9.1 |
| **0.205** | **0.1145** | **+9.1  −6.6  +3.0  +2.5** | **here** |
| 0.323 | 0.1239 | +18.8  +2.0  +4.1  +2.0 | the lower hull |

`CFG.perchPitch` is the least-squares line through the tips, 0.205 rad = **11.8°** of
nose-up. It puts the hind pair down within a millimetre — the whole complaint — and buys
that with the mid pair 8.6 mm *into* the hand, where a leg tip reads as contact; a leg tip
**above** a hand reads as floating, which is the error worth avoiding. The lower hull is the
no-penetration answer and lands three of the four exactly, but 11.8° reads as a butterfly
settling and 18.5° as one rearing. Move `perchPitch` there if the sunk pair shows in a
headset; `0` gives v9.1's flat pose back.

**The pitch is about the wing SPAN axis** (model local Z — the body runs along X and the
wings out along Z), so the wings stay level across the palm and only tip fore-and-aft. The
span axis is still *exactly* in the palm plane at any `perchYaw`, and the wing normal comes
off the palm normal by cos(`perchPitch`) = 0.979 and no more. Body clearance was re-checked
over every painted pixel after the tilt: **body 22 mm off the palm, abdomen tip 29 mm** —
nothing but the legs reaches the hand.

`perchLegDrop` is now the drop of that **contact line** below the origin, measured
perpendicular to it. Same meaning, same units, so `perchLift` still sits on top of it and
`perchPoint` is still one offset along the normal.

**`_restQuat` is built directly, like `_flatQuat`.** The wing plane (local +Y is its normal
— see `bfly-model.js`) is laid into the palm plane, the head turned to the visitor, and the
whole thing pitched nose-up onto its legs. What lies in the palm plane after that pitch is
the **wing span axis**, not the body axis — that is the invariant `tools/reach/test-palm.js`
asserts, and the head now comes out of the plane by exactly `perchPitch`. The head can only
ever be turned *within* the palm plane, so what it is parallel to is the visitor direction
**projected into that plane** — not the raw one, which is typically 40° out of it
when you are looking down at your own hand. The degenerate case is real and not theoretical:
a visitor looking straight down their own palm leaves no in-plane direction to point at, and
`_restQuat` falls back to a world axis rather than producing a NaN pose.

**…and then turned BROADSIDE.** Head-on, the visitor looks straight down the body's length —
and the body is a single *plane* through that axis, so it vanishes and all that is left is
two wings with nothing joining them. `c.perchYaw` turns it 60–70° across the view — drawn
fresh on each landing, and the side is drawn too, because both directions read as broadside
and a fixed one made every landing identical — so the body is seen in profile with a wing to
each side. The turn is about the **palm's own normal**, which is what keeps the wings lying
flat in the palm plane however the hand is tilted; `test-palm.js` checks that invariant at
every angle it draws. Setting `perchYawMin`/`perchYawMax` to 0 gives the head-on pose back.

### The palm — `hands.js`

`hand-tracking-controls` pins its entity to the origin every frame — `position.set(0,0,0)`
in its own `tick()`, so anything reading a hand entity's world position gets `(0,0,0)` and
silently does nothing (the long version is in `js/hands.js`'s header). `hands.js` therefore
already read the joint matrices itself, in the renderer's own reference space. v9 reads five
more of them — the middle, ring and pinky knuckles and tips — and publishes a posture:
`palm`, `palmNormal`, `palmWidth`, the three raw conditions `palmUp` / `palmFlat` /
`palmRaised`, and `offering`, which is all three on timers.

**Everything geometric is quoted in palm widths or as a dot product, never in
centimetres.** A child's hand and an adult's have to read the same. Measured off the joint
model:

| | flat | curled |
|---|---|---|
| mean fingertip-to-wrist distance | ~1.9 palm widths | ~1.0 |
| mean fingertip offset off the palm plane | ~0.2 | 0.5–0.75 |

`palmFlatExtend` at 1.45 sits in the middle of a wide gap and is the test doing the work;
`palmFlatOffset` is a lenient backstop against a cupped hand, not a demand for a rigid
salute. `palmUpDot` 0.62 is about 52° off vertical — generous on purpose, because the
failure mode of a tight threshold is an interaction that mysteriously does not work.

#### Either face (v10)

v9 asked for the palm to be turned **up**. The narration asks the visitor to hold their hand
out flat and palm **DOWN** — and under the old rule, following it exactly took the
hover-then-leave branch. **The interaction read as broken to precisely the people doing as
they were told**, which is the worst way for it to fail.

So `palmUp` no longer means "facing the sky", it means **horizontal**:

```js
var upness = palmNormal.dot(WORLD_UP);
palmUp = Math.abs(upness) >= CFG.palmUpDot;     // either way up
faceNormal = (upness < 0) ? -palmNormal : palmNormal;
```

**`rig.faceNormal` is the landing surface, and it is what `Hands.offers()` publishes** —
`palmNormal` is now read only inside `hands.js`. Everything downstream (`perchPoint`'s
offset, `_restQuat`'s plane, `perchYaw`'s turn about it, the leg drop) is quoted against the
normal it is handed, so **none of v9.2's landing arithmetic moved**: with the palm turned
down the butterfly simply stands on the back of the hand instead, measured at the same
**2.0 mm** off the surface.

It is also strictly more forgiving, which is the argument for it independent of the script: a
visitor who holds the wrong side up still succeeds. The pose is still gated by **`palmFlat`**
(fingers extended, so a pinching hand never qualifies) and **`palmRaised`** (held up near the
headset), and an edge-on hand is still rejected — that last one is the load-bearing half, or
the offer would fire on a flat hand at any angle at all.

`CFG.palmEitherFace = false` restores v9.2's palm-up-only rule exactly. `test-palm.js`
asserts both branches, and `test-flight.js` drives a whole palm-down approach and landing.

**THE PALM NORMAL IS HANDED, and getting it wrong is invisible.** Wrist→index-knuckle
crossed with wrist→pinky-knuckle points *down* for one hand and *up* for the other with the
palm in the same real-world orientation, so the sign is flipped per side. A sign error here
leaves one hand permanently unusable and the other permanently offering — and it cannot be
seen on a desktop at all, which is exactly why `tools/reach/test-palm.js` checks it first.

**Raised is measured from the headset, not the floor.** `palmRaiseBelowEye` is metres under
the camera, not metres above the ground: visitors are different heights and may be seated,
and "raised" means raised for them.

**A dropout is not a withdrawn hand.** `holdOffer` wants `palmHoldMs` (220) of the pose
before it counts as an offer, and `palmGraceMs` (320) of its absence before it stops
counting — including on frames where tracking is lost entirely, which is why the untracked
branch of `tick()` still runs the timer instead of returning early. This is the same
argument as `CFG.trackLossGraceMs` in `interact.js`, for the same reason: Quest hand
tracking drops a frame or two at a time, and a butterfly that took off every time it did
would never stay on anyone's hand.

### The two swarms are separated in HEIGHT

The collection used to fly *inside* the letters' angular band. From the eye, letters spanned
−31° to +35° of elevation and the collection −17° to +28° — so from where the visitor stands
there was no direction in which a collected butterfly did not have letters in front of it.
That is the geometry behind "they are hard to select through the bulk of letter butterflies",
and no amount of pick tuning fixes it while it holds.

| | v8.7 | v9 |
|---|---|---|
| letters | r 1.0–2.4 m, h 1.0–**2.30** | r 1.0–2.4 m, h 1.0–**1.95** |
| collection | r **2.6–4.3** m, h **0.8–3.0** | r **1.7–3.0** m, h **2.2–3.1** |
| elevation, letters | −31° … **+35°** | −31° … **+19°** |
| elevation, collection | −17° … +28° | **+19°** … +42° |

**Closer and higher work together.** At 1.7 m out it takes only 2.2 m of height to clear the
letters; at the old 2.6 m it would have taken 2.9. So bringing the kaleidoscope *in* is what
lets it be lifted clear without becoming a dome overhead — the look-up is 19–42°, not the
36–52° it would have been at the old radius.

Three things this had to be checked against, none of them assumed:

- **The letters' ceiling is driven by one worst case** — a key at its highest *and* nearest
  (1.95 m at 1.0 m out). That is the number the collection has to clear, not the average.
- **Apparent size.** Bringing them in makes them bigger. At the new distances a collected
  butterfly spans 4–18° of view against the keys' own 4–21°, so it is still not the biggest
  thing in the room and `colSize*` did not need to move.
- **A real ceiling.** In AR passthrough anything above about 3 m goes through one, so the top
  of the band stops at 3.1.

The radius bands now overlap in plan (1.7–3.0 against 1.0–2.4) and that is the point: the two
swarms are separated in **height**, which puts them at different *elevations* rather than
merely at different depths along the same ray.

### The pick ladder — `interact.js`

`interact.js` now gathers targets from **providers** — the keyboard and the collection, and
in v10 the session guide as well — tags each target with the provider that owns it, and
routes `activate()` back there. Three layers, tested in this order:

```
panel        the two controls. Fixed, inside everything else.
key          the 26 letters, on their low dome at 1.0–2.4 m out, 1.0–1.95 m up
collection   the kaleidoscope, on its high one at 1.7–3.0 m out, 2.2–3.1 m up
```

The controls win outright. Between the other two the near layer wins, because the
kaleidoscope is behind the keyboard from where the visitor stands and a ray aimed through a
letter carries on into it — and the far butterfly is often *nearer the ray's axis* than the
letter is, since the score is off-axis distance relative to the cone's own width. No cone
geometry can separate two things when one is directly behind the other. Checked against the
running scene, aimed at each of the 26 live keys in turn: **26 of 26 still pick themselves.**

#### …but the key layer's veto is a MARGIN, not an absolute

Making it absolute is what made the collection nearly unselectable, and the reason is that
**a key's cone is enormous in angular terms**:

| | tolerance | as an angle |
|---|---|---|
| a big key at 1.0 m | 0.37 m | **20.3°** |
| a key at 1.5 m | 0.25–0.37 m | 9.5–13.9° |
| a small key at 2.4 m | 0.25 m | 5.9° |

Against that, moving the two bands apart buys a geometric gap of a *fraction of a degree* at
the very bottom of the new collection band. So any letter drifting anywhere near the line
vetoed a butterfly the visitor was aimed squarely at. Monte Carlo over both bands, 26 letters
in the room, aiming dead-on at a collected butterfly:

| | a letter vetoes the pick |
|---|---|
| v8.7's bands, absolute veto | **42.0%** |
| new bands, absolute veto | 9.3% |
| **new bands + the margin** | **1.1%** |

and the vetoing letter's own score was a median 0.65–0.77, i.e. these were plain near-misses,
which is what says the margin is the right instrument rather than a wider cone.

A key now keeps the pick unless the collected butterfly beats it by `CFG.colBeatsKey` (0.45)
on the same 0..1 score both were measured with. The two properties this needs, and has:

- **a key actually aimed at scores near 0**, and no score can be 0.45 lower than that.
  Spelling cannot break. Checked the other way round over 6000 trials: **0 letters lost.**
- a butterfly aimed squarely at (0.00) beats a letter merely grazed (0.77), which is the
  whole complaint.

`pickRay` and `pickFlySticky` publish `_score` on the target they return — including at the
hover lock's four separate exits, where the target handed back is *not* always the frame's
best — so `keyBeatsCol` compares the two layers' winners without re-measuring anything.

Three details worth not rediscovering:

- **`keyboard.js` is untouched.** Its two kinds of target are still told apart by the
  `panel` flag it already sets; only the collection labels its own `layer`, and
  `layerOf()` derives the other two. The most-tuned file in the piece did not need to
  change for this.
- **The hover lock is keys-only.** `pickFlySticky` exists to resolve the overlap band
  between neighbours ~0.6 m apart; the kaleidoscope holds its butterflies far further apart
  than that, so there is no band to resolve and the collection is picked with a plain
  `pickRay` pass.
- **Providers are cached only once every one the DOM has is up**, never on an empty scan.
  A-Frame's `initialized` is deferred (see "The three traps this build hit"), and caching an
  empty result on the first tick would lose the collection for the rest of the run.
- **`gather()` is a method, not inline in `tick()`** — that is where the exclusivity rule
  lives, and the harness calls it directly. Its first draft reimplemented the gathering
  inside the test and duly passed while the real rule did nothing at all.

### Tested without a headset — `tools/reach/`

Hand tracking cannot be reproduced on a desktop and the landing is most of what v9 is, so
two things close that gap.

**SPACE toggles a synthetic palm** held out in front of the camera (`Hands`,
`CFG.palmSim*`). It is a real offer as far as everything downstream is concerned — same
shape of answer, same code path — so the whole approach / land / hold / leave arc can be
driven and tuned on a desktop. It only ever appears when no real hand is offering, and never
inside an XR session.

**`tools/reach/` runs the lot headless**, under JavaScriptCore — every Mac has one, and this
machine has no node — against a maths-only THREE stub. **193 assertions** over four suites
(v10 adds `test-guide.js`), about a second:

```bash
sh tools/reach/run.sh
```

Run it after touching `hands.js`, `interact.js`, `guide.js`, or `collection.js`'s states. It covers the
handedness of the palm normal, every way of *not* offering a hand, the hold/release timers,
the resting pose's axes and its degenerate case, the broadside turn at every angle it draws, the leg tips landing on the palm rather
than the model's origin,
both branches of the four-state arc, the hover's wander and wingbeat, the exclusivity
lockout, `summonMax`, a 300 ms frame, the handoff back onto the orbit, and the pick ladder
including the margin case drawn from real sampled geometry — and, from v10, the whole
session: the idle lockout (a full room, one pickable thing), a real pinch on the start flower
driven through the shoulder ray and the pinch edge, both spoken beats, all three freezes of
the quiet clock, the nudge and the cancel, the farewell and what it does to the room, the
doff and a blink that is not one, the hard cap, and the fact that every transition completes
with **no `Audio` present at all**. Nothing renders: it checks **behaviour**, which is
precisely the half that cannot be eyeballed.

Two rules the harness earned the hard way, both from tests that passed for the wrong reason:

- **Never hard-code a beat's duration; wait on the state.** Every `frames(10)` in the file
  went stale the day the collection's band moved closer and the approach got faster.
- **Call the component's own method, never a reimplementation of it.** The exclusivity test's
  first draft rebuilt the target-gathering inside the test, and passed while the real rule did
  nothing — which is why `gather()` exists as a method at all.

## The session (v10)

Everything up to v9.2 was always live. There was no start, no guidance and no end — and on
an exhibition floor all three of those are the piece, not decoration around it.

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

| state | the room | audio |
|---|---|---|
| **idle** | the guide is **exclusive**; the start flower is its only target. The letters fly, highlight nothing and swallow nothing. accept and delete are faded out | — |
| **welcome** | live from `CFG.guideUnlockAt` into the opening (**0** by default) | `welcome` → `spell` → `pinch` |
| **live** | the piece exactly as it has always been. Spell, accept, watch the reveal, call butterflies over, spell again — no limit and no ordering imposed | `recall`, once |
| **wrapup** | unchanged and fully live. Any activity returns to `live` | `nudge` — *not recorded* |
| **farewell** | exclusive with **no targets** — the room goes quiet | `farewell` — *not recorded* |

### The whole lockout is v9's exclusivity, reused

`interact.js:gather()` already takes the first provider that reports itself exclusive and
offers *nothing else at all*, so nothing else highlights and the room visibly goes quiet
rather than silently swallowing pinches. That is precisely "the letters fly but there is no
interaction yet", and it needed no new mechanism — `guide.js` is a **third provider**
(`targets` / `setHot` / `activate` / `exclusive`) alongside the keyboard and the collection.

**The guide goes FIRST in `interact.js:providers()`**, and that ordering is load-bearing:
`gather()` takes the first exclusive provider it finds, and in idle and farewell the room is
the guide's whatever a butterfly happens to be doing. That one line is the only change to
`interact.js` in the whole of v10.

### The start flower

`UI.blob()` — the same six-lobed cluster accept and delete are built from, with the same
`setColor` / `setAlpha` / `shape(t)` and the same under-damped scale spring on a press. It
differs where it should: hue **212** (neither accept's 142 nor delete's 356), panel centre
between the name field and the two controls, and `guideBlobK` **1.60** against their 1.26 and
1.02. In idle it is the only pickable thing in the room, so pointing anywhere lights up one
shape and nothing else — **there is nothing to read and nothing to learn.**

It is offered with `panel: true`, so it uses the tuned, tighter panel pick path three rounds
of selection work already produced (`panelPickBase`, `panelTouchRadius`, `panelPickShrink`,
and "the controls win"), and the desktop mouse picks it through the identical call.

**accept and delete go entirely between sessions.** One more factor on the `setAlpha` line
the reveal already drives — in idle there is nothing to accept or delete and one flower to
press, so two dim shapes beside it are exactly the clutter that line exists to remove.

### The two spoken beats

**The opening is three recordings** (`CFG.voIntro` — the welcome, what to do, and how to do
it), played back to back with `CFG.voGap` between and treated as **one cue** by everything
else: `Voice.playing()` stays true across the gaps, so the room does not unlock early and the
quiet clock does not start counting mid-sentence. Driven against the real recordings: the
three end at **2.02 / 9.04 / 13.44 s**, gaps exactly 0.45 s — **the opening runs 13.4 s.**
The room is pickable from the first second regardless (`guideUnlockAt` = 0), so a visitor who
already knows what to do never waits it out. The tracks are mono **mp3** (395 KB the lot),
copied into `audio/` from `sounds/ai_voiceover/v1/`; `nudge` and `farewell` are not recorded
and the session runs silent without them.

`recall` fires on **`reveal:joined`** — one new line in `collection.js`, the
mirror of the `reveal:launch` that has been there since v8.1. That one fires on the takeoff
frame and hands the caught name over; this one fires on the frame the soar hands off onto the
orbit, which is the instant the butterfly stops being the hero and becomes one of the many —
exactly what "you can call it back" is about. Replayed butterflies spawn straight into
`orbit` and never soar, so it only ever fires for a freshly grown one.

**Only the first of a session speaks.** A visitor who spells a second name has already been
told how to call one over.

### A missing track is a silent no-op that still finishes

The single most important property of `voice.js`, and the reason v10 could be built at all
before the tracks were cut:

- `Voice.play` on a cue with no file returns false and fires `voice:ended` on the next tick,
  exactly as a real track would;
- **no `Audio` constructor → the module is a no-op outright**, which is what lets
  `tools/reach/` drive the whole session headless;
- **nothing in the piece ever waits on audio.** The guide advances on *state*; every wait it
  does have carries its own timeout.

**THE UNLOCK HANGS OFF THE ENTER-AR CLICK, AND IT HAS TO.** Browsers refuse programmatic
playback until the page has had a real user gesture, and **a hand-tracked pinch is not one** —
it is our own threshold on a joint distance, invisible to the browser — so the visitor
pressing the start flower cannot authorise anything. What can, and always happens first, is
the click on A-Frame's Enter AR button: you cannot get into the piece without it, and
`Voice.unlock()` spends that one gesture on every track at once. If audio ever goes silent on
a headset, that click is the first thing to check.

No AudioContext anywhere: one `HTMLAudioElement` per cue and `.volume` for level. There is no
`resume()` dance, no graph to get wrong inside an XR session, and no decoded copy in memory.
`Voice.duck()` is the seam a music bed would use. **v10.4 added the bed** — and it ducks the
other way round, in `sfx.js`, off `Voice.playing()`; see "The sound (v10.4)" below.

## The sound (v10.4) — `sfx.js`

Everything that is **not** the narration. `voice.js` is the piece talking to the visitor;
`sfx.js` is the room the visitor is standing in, and they are deliberately two objects with
two levels so one can duck under the other.

    Sfx.select()      one-shot, on every activation
    Sfx.unlock()      spend a real gesture on every element
    Sfx.tick(dt)      the envelopes and the wingbeat scheduler
    Sfx.setEnabled()  ?sfx=0

It carries over `voice.js`'s two load-bearing rules for the same two reasons: **no
`AudioContext`** (one `HTMLAudioElement` per sound and `.volume` for level — no `resume()`
dance inside an XR session, no graph to get wrong, no decoded copy in memory; every fade in
the file is a level write on a tick), and **no `Audio` constructor → the whole module is a
no-op**, which is what keeps `tools/reach/` drivable headless.

### Three sounds, three different shapes of playback

|  | shape | why |
|---|---|---|
| the bed | ONE element, `loop = true`, envelope off `currentTime` | it is the room, not the session — see the seam, below |
| the wingbeats | one at a time, random pick, random gap | atmosphere; nothing triggers them, nothing waits on them |
| the click | a **POOL** of `sfxSelectVoices` (4) | the recording runs 1.85 s and a visitor presses faster than that; retriggering one element cuts the previous sound dead |

### The levels are measured, not guessed

|  | RMS | peak |
|---|---|---|
| `bg_music` | −28.5 dB | −3.8 dB |
| `select` | −30.5 dB | −13.8 dB |
| `wing1` | −42.8 dB | −21.1 dB |
| `wing2` | −46.8 dB | −30.7 dB |

The wingbeats are recorded **15–18 dB under the bed**, so at matched gains they are simply not
there. `sfxWingGain` is 1 and the **bed** is the one pulled down. **To make the room louder or
quieter, move `sfxMusicGain`.**

### The seam, and why there is no crossfade

`bg_music` starts loud (0.116 RMS in its first quarter-second) and ends near-silent (0.003), so
`loop = true` on its own bangs once every 2:21 for the whole run of an exhibition. The level is
an envelope read off `currentTime` — up over `sfxMusicFadeIn`, down over `sfxMusicFadeOut` —
and `currentTime` resets when the element loops, so the same expression is the opening fade-in
*and* the seam. One element, no crossfade, and the encoder padding an AAC loop leaves at the
join lands where the level is already zero.

### `applyMusic()` runs off the MEDIA clock as well as the tick

**A-Frame's tick is `requestAnimationFrame`, and rAF stops dead while the page is hidden** —
on a headset, every time it comes off the face; on a desktop, any backgrounded tab. The media
clock keeps running regardless. Found by watching the element's own clock advance **4.3 s with
`volume` stuck at 0**: without this the bed plays on at whatever level the last rendered frame
left it at, and a seam crossed while hidden comes back up **silent and stays that way**.

So the level is written from the element's `timeupdate` (~4 Hz) as well as from the tick. The
tick still gives the smooth 60 Hz fade whenever anything renders; `timeupdate` guarantees the
level is *right* when nothing does. `tools/reach/test-sfx.js` pins it with a `frames(n, false)`
case that advances the media clock with no tick at all.

The wingbeats deliberately do **not** get the same treatment: a room nobody is rendering does
not need wingbeats scheduled in it.

### The click belongs on ONE line

Every activation in the piece — the flower, accept, delete, a letter, a collected butterfly, by
mouse and by pinch alike — goes through `activated.owner.activate(...)` in `interact.js`. The
click goes there. Put it in the providers' own `activate()` methods and it has to be written
five times and will be missed on the sixth. The single other place it is said out loud is
`keyboard.js`'s desktop keydown convenience, which bypasses `interact.js` entirely by design.

### The unlock is a wider net than the narration's

The bed has to start **before the visitor has pressed anything in the scene**, so unlike
`Voice.unlock()` it cannot wait for the Enter-AR click. `Sfx.wire()` catches the first
`click` / `keydown` / `touchstart` / `pointerdown` on the document in the capture phase, and
Enter-AR is wired too since on a headset it is the first gesture there is. Until then the room
is silent, which is the correct behaviour for a page nobody has touched.

`Sfx.select()` is deliberately **not** gated on the unlock. The browser blocks it anyway until
a gesture, and every path that reaches it *is* one; gating it as well would mean a single
missed listener silences every click for the rest of the day, to prevent a sound that could not
have been heard.

### The beat before the first word — `CFG.voIntroDelay`

0.90 s between the flower being pressed and `Voice.play(CFG.voIntro)`. The press has its own
sound now and the flower is still bouncing; the two arriving together meant neither read.

`introT > 0` counts as **talking** everywhere it matters, and the `welcome → live` gate tests
it alongside `Voice.playing()` — without that the whole welcome state would be skipped on the
frame after the press, in the silence. It is cleared by `toIdle` and `toFarewell`, so an
opening still owed is never delivered late into someone else's session.

### The servers had to learn two things

Neither was ever exercised by the 100 KB voice-over mp3s.

- **`Range`.** `SimpleHTTPRequestHandler` ignores it and answers 200 with the whole file.
  Chromium tolerates that for a small clip but cannot **seek** inside one — and `loop = true`
  *is* a seek, back to zero, every time the track ends. `_serve_range()` answers 206 for a
  single range; multipart/byteranges is in the spec and no browser media element has ever sent
  it. This is the standing answer to `audio/README.md`'s "plays on the desktop but not in the
  headset".
- **The mime type.** Python calls `.m4a` `audio/mp4a-latm` — a raw AAC-LATM stream, which is
  not what these files are. Chromium refuses the wrong one outright, so the bed would 200
  cleanly and never sound. `extensions_map` says `audio/mp4`.

### Knobs

`CFG.sfx` (the four paths), `sfxWings`, `sfxMusicGain` / `FadeIn` / `FadeOut`, `sfxWingGain` /
`Fade` / `GapMin` / `GapMax` / `FirstGap`, `sfxSelectGain` / `Voices`, `sfxDuck` / `DuckFade`,
`voIntroDelay`. **`?sfx=0`** silences the bed, the wingbeats and the click and leaves the
narration alone — read once at load, never persisted, the same convention as `?vo=0`.

### The end, and why the timers are short

**Ending is non-destructive**, and that is the whole argument for a short default on a floor
with rapid handovers. It resets an empty keyboard, sends anything with the visitor home
the way a lowered palm already does, and re-arms the flower. **`DNA` and the kaleidoscope are
never touched** — a visitor ended early presses start again and loses nothing.

There is **no end control**. The visitor keeps playing as long as they want; museum visitors
do not press "done", they take the headset off.

| | |
|---|---|
| `guideQuietMs` **10 s** | of no interaction → the **nudge** |
| `guideQuietGrace` **5 s** | more → the **farewell**, which is what actually clears the room (`toFarewell` → `clearRoom`). Any activity cancels and puts the session back |
| | so: **15 s from the last thing a visitor did to the room resetting**, and the start flower back ~1.2 s after that (`guideFarewellMin`) |
| `guideMaxMs` 8 min | hard cap — the backstop for a session the quiet clock can never end |
| `guideDoffMs` 2 s | of XR visibility `hidden` → end **silently**, from any state |

**v11 raised these to 20 s / 10 s and then set them back to 15 s total, as asked.** The two
things worth still having in mind, neither of which is a reason not to: **neither beat makes
a sound** (`nudge` and `farewell` are both `null` in `voCues`, so from inside the headset the
room appears to reset itself for no visible reason), and **ending is non-destructive to the
collection but not to the name** — `clearRoom()` calls `keyboard.reset()`, so a visitor
halfway through spelling who pauses loses it.

**THE QUIET CLOCK IS FROZEN WHENEVER THE VISITOR CANNOT ACT.** This is the other half of
making a short fuse safe rather than a hair trigger: the reveal is ~14 s of watching by design,
`perchDwell` alone is 12 s of deliberately holding still, and a cue that is teaching them
something has not finished teaching it. **Frozen, not reset** — the clock is at zero going
into all three anyway, because whatever started them counted as activity.

**Presence costs nothing to measure.** `interact.js` hands *every* provider the whole hot set
each frame, so a non-empty set arriving in `setHot()` means the visitor is pointing at
something. No new event and no change to `interact.js` beyond its provider list.

**The headset coming off is the real end signal**, and it cannot be a tick timer: the render
loop stops with the visibility. `guide.js` listens on the XR session, on the document, and on
`exit-vr`, and checks the elapsed time **when visibility returns** as well as arming a timer —
the return is the one that matters, because that is the next visitor putting it on, and they
must find the start flower rather than the last person's half-used session.

### Three things this got wrong first

- **The nudge froze its own clock.** "A cue is playing" freezes the quiet clock, and the
  nudge is a cue — so playing it reset the very timer it was announcing and the grace never
  ran out. `TALKS_OVER` is the fix: the nudge is asking whether anyone is still there, so its
  own playback must not answer the question. The farewell is in the set for the same reason.
- **A stalled track could hold a session open for eight minutes.** Found by driving the real
  scene with the tracks missing: one that stalls mid-fetch never fires `ended` and never
  reports itself paused, so `talking()` stayed true and only `guideMaxMs` ended the session.
  `CFG.guideTalkMax` (90 s) caps how long any one cue may freeze the clock.
- **The two fade envelopes never landed.** `guideCtlFade` / `guideFlowerFade` read as
  "seconds to fade" and were written as an exponential approach: a second into a 0.70 s fade
  the flower was still at **0.16**. They are now built the way `reveal.js` builds its own — a
  raw parameter travelling **linearly** at 1/duration, read out through a smoothstep — so the
  constant means the seconds it says, both ends are soft, and it lands exactly on 0 and 1.

### Driving it without the tracks

| | |
|---|---|
| `?guide=0` | no guide at all: the room is live from load, exactly v9.2 |
| `?guide=live` | skip idle and welcome, start in `live` |
| `?vo=0` | the guide runs, the narration is silent |
| **Escape** | the operator override, desktop only. **There is no in-headset equivalent** — a gesture was tried and removed; see the v10.2 note at the top |

`tools/reach/test-guide.js` covers the arc headless (see "Tested without a headset" below).

**This used to be a documented desktop-only caveat, and v11 treats it as the bug it was.**
A mouse cursor left parked over the swarm hovered a fresh butterfly every time one drifted
under it, and a hover *is* presence — so the quiet clock was knocked back to zero forever and
a desktop session could never time out at all. Measured before the fix: **34 s of a parked
cursor and `quietT` never once reached 2 s.** No value of `guideQuietMs` could have been
reached, which is why changing the timers never helped.

**`CFG.mouseIdleMs` (2 s): a motionless cursor is not a pointer.** Unlike a hand, a cursor
does not go away when you stop using it — it sits where it was left while the swarm keeps
flying under it. Going idle is exactly what a hand does when you lower it: hand-tracking
stops reporting a pointer, nothing is hovered, nobody is present. Any movement or any click
brings it back on the next frame. It also removes something that was always wrong to look
at: a highlight sitting under an abandoned cursor, following whichever butterfly happened to
drift through it.

The headset path is untouched — with no hands tracked there were never any pointers or hot
ids, which is the case the signal was always built for.

## Flat, and how to keep it flat

No blur, no bloom, no gradients, no soft glow anywhere. Every surface is one solid colour:
`MeshBasicMaterial` with an `alphaMap` and `alphaTest`, and canvases painted with flat
fills. If something needs to stand out it changes **colour or size**, never blurriness.

**One deliberate exception: the visitor's own butterfly.** Its wings carry a procedural
texture (`wing-colour.js`) — the hero of the piece, and the one thing that is *theirs*. As
of **v8.6 that texture is itself flat**: a ground, big hard-edged shapes and one pattern
apiece, no gradient anywhere, painted from a fixed 26-colour table. The exception is now
only that the wings carry *more than one* colour. The 26 keys and every other surface are
untouched. See "The base-colour generator".

Two things this depends on:

- **Canvas textures must be tagged `SRGBColorSpace`.** three.js assumes no colour space on a
  `CanvasTexture`, so with A-Frame's colour management on it reads the bytes as linear and
  encodes them again on the way out. Every flat fill comes back a stop lighter and visibly
  desaturated — a solid red draws as pink, which is exactly what happened. `ui.js:srgb()`
  tags them. Only the **colour** canvases: the wing and body maps are alpha, read straight
  off a channel, and must stay unconverted.
- **The butterfly palette is tuned for white.** v2's `72% / 63%` was chosen against a black
  void and washes out completely against white; `CFG.bflySat` / `CFG.bflyLit` are `88 / 48`.

## The highlight is on the letter, not the butterfly

Recolouring the highlighted butterfly is the obvious move and is wrong twice over. Against
white the only colour with enough contrast to mean anything is black, which reads as
switched off rather than chosen; and in a dark passthrough room it disappears outright.

So a highlighted letter is **knocked out of a solid disc in its butterfly's own colour** and
grows by a third, and the butterfly grows by `CFG.hiScale` and keeps its colour — which is
the point of having twenty-six different ones.

Every letter carries its butterfly's colour: under the butterfly, in the highlight disc, and
in the name once it is caught, so the name in front of you is visibly made of the ones you
picked. The hue is the wing's, at full chroma but `CFG.letterLit` darker — a wing is a
silhouette and a letter is type, and type at the wing's own lightness is unreadable on white
for a good third of the wheel.

The type is Helvetica Neue with the usual grotesque fallbacks (Roboto on a Quest), at weight
500 and never heavier. Nothing is fetched — no font asset, no network on the critical path.
Letters sit close under the body, far enough to clear the hindwing and near enough that a
butterfly and its letter read as one object.

## The three traps this build hit

- **`this.name` on an A-Frame component unregisters its own `tick()`.** A-Frame keys its
  behaviour registry off `component.name`. Assigning to it drops the component out of the
  tick loop silently: everything builds, nothing animates, no error. The name being spelled
  is therefore `this.typed`.

- **A click is latched, not sampled.** A real mousedown/mouseup pair often lands inside one
  frame, so a tick that reads the button's *level* sees nothing. The press sets a flag the
  next tick consumes. The cursor is also read **on the press**, not only on the move, or a
  press with no preceding move is tested against screen centre.

- **`hand-tracking-controls` pins its entity to the origin** every frame — `js/hands.js`
  reads the joint matrices directly instead, in the renderer's own reference space. It was
  v2's file unchanged up to v8.7; **v9 adds the palm posture to it** (see "Calling a
  butterfly over") and nothing else. Its own header has the details.

## The presentation roll — the one departure from v2's flight

The body is a side-on silhouette plane and the wings are a plane **perpendicular** to it, so
the two can never both face you: whenever the wings spread across your view the body is
edge-on. A butterfly orbiting at eye height is therefore seen exactly edge-on and reads as a
twig. Fine for v2's ambient swarm; useless for a keyboard you have to read.

Roll the model by `rho` about its own body axis and the wing plane's visibility works out to
`|cos(rho + beta)|`, where `beta` is the angle of the camera in the plane perpendicular to
the body. So there is always a roll that presents the same three-quarter aspect, wherever
the butterfly is and whichever way round it is flying. `presentRoll()` solves for it every
frame and takes the branch closest to upright.

The flap is folded into that solve, because the wing pivots turn about the same axis: the
flap is biased half a radian upward, and without compensating, the whole swarm sits half a
radian off target.

`CFG.readRoll = 0` restores v2's look exactly.

## The reveal (v8.1)

The generation stage (below) always ran a beat on a freshly grown butterfly before it
joined the kaleidoscope. v7 presented a three-quarter view and slid to a random orbit
slot; v7.2 made it hover **flat**, wings square to the visitor, and leave into the part
of the flock they were looking at. **v8.1 gives that arc a shape.** `orbit` is still
untouched, and replayed butterflies still skip straight to it.

### Nine beats, ~14 s (v8.2 prepended `charge`)

| | |
|---|---|
| **hush** | `keyboard:accepted` fires and the room starts to recede — *before* the butterfly exists. That ordering is the point: it appears in a room that has already gone quiet rather than one that dims around it. |
| **charge** 1.8 s | **v8.2:** the held breath after **accept**. *Nothing new appears* — the butterfly is at scale 0, alpha 0, hidden. All that carries the beat is the room going quiet and the name still hanging in front of the visitor where they spelled it. The anticipation that makes the bloom land as a reward. |
| **arrive** 0.9 s | **v8.2:** the **bloom**. The butterfly scales up **from nothing** — past its held size on a half-sine overshoot, then settling exactly onto it — wings flinging open out of the loaded pose, while a ring of the visitor's own letters bursts outward and tumbles. Then straight into the flat breathing hold. |
| **settle** 1.8 s | Held flat, breathing. The name tag stays hidden. |
| **greet** 1.8 s | **Three deliberate deep flutters**, aimed at the visitor. |
| **still** 0.8 s | Nothing moves. |
| **coil** 0.4 s | It dips 8 cm, the wings draw up, the scale contracts to 0.93. |
| **launch** 1.1 s | A hard downstroke and it shoots up 1.6 m, barrel-rolling, shedding letters (which **tumble** as they fall — v8.2). The room is shoved outward; the caught name is **blasted downward** and falls away (v8.2), still visible into the soar. |
| **soar** 2.7 s | Decelerates and curves out to its orbit, the roll unwinding, the orientation slerping back to `presentRoll`. On the handoff the room fades **up** to meet it (v8.2) — the hero holds full brightness, so it never steps dark. |

Four things carry the whole moment, and none of them is an effect:

- **The charge beat (v8.2).** After **accept**, nothing appears for 1.8 s — the room
  recedes and the visitor's name just hangs there. No butterfly, not even a hint of one.
  The wait, and the empty space where the butterfly will be, is what makes the bloom a
  reward rather than a response to a button. A pop with no anticipation in front of it is
  just feedback.
- **The still beat.** In a scene where every object is always in motion, stopping is the
  loudest device available — and it is what stops the launch reading as a `lerpVectors`.
  It is also why the reveal has room to breathe: a pause only reads as a pause if there
  is space around it.
- **The pauses inside the greeting.** Each flutter moves for 0.38 s of its 0.60 s slot
  and then holds. Without the hold, three flutters in a row are just a faster breath and
  the gesture disappears entirely.
- **The anticipation.** It goes down before it goes up. Four tenths of a second, 8 cm, and
  the launch stops being a teleport.

### What must not break

- **`_flatQuat` and the flat pose.** The flight's `presentRoll` geometrically cannot
  present the wings to the visitor — there the butterfly is yawed to face them, the body
  axis points at them, and the wing plane (which contains that axis) can never face them;
  measured in the running scene, the aspect never tops ~0.18 at any roll. So the five
  **held** beats leave the group unyawed and orient the model with a direct look-at
  instead (wing normal → camera, head → **down**; head-up renders it upside down). All
  five share one `holdPose()` so that code is written once and cannot drift between them.
  Measured: **0.994–1.000** through `settle`, **0.999–1.000** through `still`. `greet`
  and `coil` dip to ~0.65 and ~0.59 because the wings are deliberately tilting — that is
  the gesture, not a regression.
- **The `soar → orbit` handoff.** At `u = 1` the lift, the bank and the roll are all
  exactly zero, and `tickSoar` writes the flight's own representation
  (`group.rotation.y = _joinYaw`, `model.rotation.set(rhoT, 0, 0)`) so `tickOrbit`
  continues with no pop. Verified: the position step across the handoff is 0.0168 against
  a typical frame's 0.0177.
- **`presentRoll` stays verbatim** from `keyboard.js`. The held beats do not go through it.

### `CFG.revealSpinTurns` must be a whole number

The barrel roll turns about the body axis, which flashes the wings edge-on twice a turn —
at launch speed that reads as a tumble. The total lands on the model as `turns × 2π`,
which is **the identity rotation only if `turns` is an integer**, and the handoff above
depends on that. At 1.5 the butterfly meets its orbit upside down.

It also has to **accumulate from zero** rather than decay to it. An earlier pass had the
angle start at its total and fall to 0 — the same speed profile, but the first frame of
the launch snapped the butterfly through most of a turn. The curve is `1 - (1-x)³`, not
`smoothstep`: what matters is the *rate*, and cubed is fastest at the instant of takeoff
and eases to a standstill as it meets the orbit. Smoothstep would start it *from* a
standstill, which is backwards for a launch.

### The isolation — `Reveal.dim` / `Reveal.slow`

v8's `VERSION.md` posed this as an open question: *"does the keyboard need to dim during
it?"* It does — but dimming alone leaves twenty-six butterflies still darting about
behind the one thing the visitor is meant to be looking at. So there are three ramps off
one envelope:

| | |
|---|---|
| `revealDim` 0.42 | opacity of everything that is not the hero — keys, their letters and leaders, and every other collected butterfly and its tag. **v8.2: was 0.28**, which against the white sky read as fully gone, so the return looked like a jump from nothing. 0.42 keeps the room visibly present but clearly backgrounded. |
| `revealSlow` 0.35 | a **ceiling on the keys' `timeScale`**. One line in `updateSlowField()`, riding the slow field v6.1 already built and tested on-headset, so it is eased both ways for free |
| `deco` | the same envelope taken all the way to **0**, for the things that should go entirely rather than merely recede: the letters' ghosts and lattices (**76 sprites**) and the two controls, which are unusable during the beat anyway. The `(dim − revealDim) / (1 − revealDim)` remap tracks the new floor automatically. |

Down over 1.5 s, back up over 3.5 s (**v8.2: was 1.2 / 2.5**). The room recedes without
vanishing and returns on a slow enough ramp that the eye reads it as one deliberate fade,
not a second event.

**The floor is deliberately well clear of 0.** With the hero now isolated as much by
*motion* — it moves deliberately while the keys crawl at `revealSlow` and the rest drifts —
as by opacity, the room can afford to stay visible. Switched off outright, or dimmed so far
it reads as off, the return is a scene change rather than a fade.

Two implementation notes that are easy to get wrong:

- **`visible` must test the UNDIMMED alpha.** Both `dress()` and `render()` gate
  `group.visible` on `alpha > 0.01`; multiplying the dim in there pops the whole room off
  and back on as the envelope crosses the threshold.
- **`setDeco` is a scalar, not a switch.** The decoration fades, and only stops being
  drawn once it is already invisible. Flipping `visible` at a threshold pops a lattice
  sprite in at whatever opacity the threshold happened to land on.

### The wake — letters, not sparks

`reveal.js` keeps a pool of **28 sprites**, allocated once and reused for every visitor
forever, hung off `collection.js`'s unrotated root so letters are shed into **world
space** and stay where they fell. That is the difference between a wake and a tail. Eight
are thrown outward at the launch instant, then one every 0.055 s carrying a tenth of the
butterfly's velocity, until 0.9 s into the soar. They **sink** rather than rise, because
they are ink, and each one **tumbles** as it falls (v8.2 — `CFG.revealTrailSpin`, a random
angular velocity on top of the glyph's own typographic angle, bled off on the same drag as
the throw). Size is angular, on the same rule and clamps as the letters under the
butterflies, so the wake matches the swarm's type at any distance.

**v8.2 also fires a burst on `arrive`** — `CFG.revealArriveBurst` letters flung outward
from the same pool as the butterfly pops in, so the arrival and the departure rhyme.

Letters and not sparks for two reasons: **everything in this piece is a letter** (the
numerals went in v6, the satellites in v6.2), and there is no post-processing here to
make a spark out of — see "Flat, and how to keep it flat" above.

> **`UI.letterTex` caches on colour and is unbounded.** A per-visitor ink would add 26
> canvases per name and never free one — a real leak over an exhibition run.
> `Reveal.setName` **quantises the hue to 24 buckets** first, so the cache is bounded at
> 26 × 24 = 624 however many people pass through. Measured cold: 26 canvases for the
> first name, 598 by the thirtieth — flattening against the ceiling instead of climbing
> 26 a name forever. Any future caller of `letterTex` outside the fixed 26 has to do the
> same.

### The launch's shove

The takeoff publishes one radial impulse (`Reveal.shock`); both swarms watch `shockT` and
apply it on the frame it changes, so neither has to know about the other and the order
they tick in does not matter. It goes into the `offsetVel` spring that already exists for
hand-scatter, and the same spring reels them back — **no new physics**. Measured: a key's
offset goes ~0.08 m → ~0.37 m and decays. The distance is clamped at 0.6 m or a butterfly
sitting right at the launch point is flung. `CFG.revealShock = 0` disables it.

### The name handover

At the launch instant the visitor's name is in two places: hanging in front of them where
they spelled it, and lit under the butterfly. **The one in front is blasted downward and
fades; the one on the butterfly stays and leaves with it.**

`collection.js` fires `reveal:launch` on the takeoff frame; `keyboard.js` runs the exit
through a `sp.flyOut` branch in `tickUI` — the mirror of the `sp.flyFrom` fly-in that has
been there since v3, so letters flying *out* of the name is a rhyme rather than a new
idea. **v8.2: the burst goes DOWN, not up** — the butterfly shoots up, so its name is
thrown the other way, on an accelerating fall (`flyOut²`, `CFG.nameExitDrop` 1.3 m),
fanning outward from the word's centre (`CFG.nameExitSpread`) and spinning as it goes. It
runs over `CFG.nameExitTime` 2.0 s (was 0.9) so it is still falling while the butterfly
soars, instead of snapping away and leaving a gap before the small tag appears. The
scatter is still deterministic (`Style.forNameSlot`), so a name always comes apart the
same way.

**v8.2 also fixes the intermittent "name vanishes early" bug.** The reset that disposes
these sprites used to be a wall-clock `setTimeout(reset, nameExitTime·1000 + 150)` in the
`reveal:launch` handler — timed against the fly-out's *sim-clock* duration. On any frame
drop the timer fired while the letters were still mid-air and `syncName()` disposed them
(exactly the bug the "used to simply vanish" note below is about, reintroduced by the
timer). Now `keyboard.js` carries `_nameExiting`, and `tickUI` calls `reset()` the frame
every sprite reaches `flyOut >= 1` — sim-clock, so a frame drop just means the fall takes
a few more real milliseconds.

**`CFG.acceptResetDelay` is the last-resort fallback** (20000). The reset normally follows
the burst completing; the wall-clock timer only matters if no butterfly ever launches — a
backgrounded tab whose render loop is throttled so `collection.js` never drains its queue.

**v11 CANCELS IT IN `reset()`, and that is load-bearing.** "Idempotent, so whichever path
gets there first wins" was true and not sufficient: the normal path resets at about 8.7 s
(the reveal's beats, then the name's 2 s fall) and the fallback stayed armed for another
eleven seconds, **wiping anything typed inside that window.** That is the second butterfly,
or the next person in the queue. Being cancelled is the property it needed, not being
idempotent.

### The name tag arrives

v7.2 had the tag up from the first frame, so the butterfly was labelled before the
visitor had seen it. v8.1 wrote it on 0.6 s into `settle`. **v8.2 holds it back through
the entire reveal** — it fades in only in `tickOrbit`, over `CFG.revealTagFade`, once the
butterfly has joined the kaleidoscope. The reveal is about the butterfly; the label is
what it becomes once it is one of the many. Replayed butterflies are labelled immediately,
exactly as before: `c.tagAlpha` is 1 at spawn for them and 0 for the hero.

### The room fades back up, it does not step (v8.2)

When `soar` hands off to `orbit`, `c.hero` clears — and without care the just-joined
butterfly would fall under `Reveal.dim` (still ~0.28, mid-release) on that very frame and
then crawl back to full over `revealDimOut`, reading as a hard cut. `c.wasHero` keeps it
**exempt from the dim** until `Reveal.active` goes false (the envelope fully released), so
its brightness never changes on the handoff — the rest of the room fades *up* to meet it.

### Naming, and where the numbers live

`present*` is **where** it presents (a place: `presentDist`, `presentRise`,
`presentSize`, unchanged since v7). `reveal*` is **when** and **how** — the eight beat
durations and everything that shapes them. v7.2's `presentArrive` / `presentHold` /
`presentJoin` are gone.

Every one of the ~30 new keys has its literal default and a one-line note in
`config.js`, in the same change as its reader, and both `collection.js` and `reveal.js`
`console.error` any of theirs that come back undefined — the "config keys drift → silent
`NaN`" trap this build has hit three times.

All the reveal numbers are on-headset judgement calls.

## Everything else in one place

The UI is two things: the caught name, hung off-centre on a slope, and the two clusters
below it. They are deliberately unequal in size, not level with each other, and each carries
its own tilt in the plane **and** its own cant in space — two matching shapes side by side at
the same angle is a button bar, and the piece has spent six versions not being one.

**Scale is a spring, not an eased value** (`CFG.ctlSpring` / `ctlDamp` / `ctlKick`). A press
calls `bump()`, which kicks the *velocity*; the spring pulls back, overshoots because it is
under-damped, and rings down over about a second. An eased lerp approaches from one side only
and can never overshoot, so it cannot bounce however it is tuned.

`config.js` holds every number — the swarm bands, the noise, the pick tolerances, the
capture timings, v9's forty constants for calling a butterfly over, and every position in
that composition. There is no dev panel, so there is nothing to open in a headset and one
file to change. `tools/knobs.html` is the searchable index of all **292** of them; it is
GENERATED by `tools/build-knobs.py`, so edit that table and re-run it, never the HTML —
and clear the previous version's `new`/`changed` flags when you add this version's, or the
coloured rail claims rows that are several versions old.

## The typography

`style.js` gives every letter its own angle, size, place on a circle around its butterfly,
and a few flags — mirrored, hollow, carrying a hairline leader, ghosted, wearing a lattice.
All of it is **deterministic**, seeded off the letter's index, which matters for an
exhibition: the
composition is wild but it is the *same* wild composition every session, so it can be
judged and signed off rather than re-rolled in front of an audience.

Angles are **quantised** rather than free. A composition where every angle differs by a
degree or two reads as sloppy; one built from a short list of angles reads as deliberate,
which is what the reference work does.

Two things this depends on:

- **The type hangs off its own anchor, not off the flying group.** The flying group yaws to
  face the butterfly's heading, so a letter thrown sideways inside it swings a full circle
  round the body every time the butterfly turns. Each key has a second, unrotated group that
  tracks position only.
- **`SpriteMaterial.rotation`** turns the sprite in screen space, so a letter can be thrown
  to any angle and still face the camera. Nothing is billboarded by hand, nothing is ever
  edge-on.

**The pick target is still the body.** However far a letter is thrown, the type is
decoration on top of a target that never moves relative to what you are aiming at — checked
by aiming dead-on at all 26 after ten seconds of flight.

**Everything is a letter.** An earlier pass used numerals for the far scenery and for
satellite marks hanging off the butterflies, and they were the one thing in the build about
something other than the alphabet, which is the only subject the piece has. All of it is
gone — the scatter was deleted in v6, the satellites in v6.2.

**The letter is cut out of the wing** (`ui.js:punchLetter`) and then FILLED. The hole is
punched through the first pair of wings, and a second pair sits inside it carrying only the
glyph (`ui.js:letterMask`) in a colour of its own — deliberately never the wing's and never
white, thrown far enough round the wheel that the two never sit next to each other, with an
odd step so twenty-six of them do not repeat. Same geometry and same pivots, so it flaps
with the wing it belongs to, nudged a hair along the plane normal so two coplanar meshes
cannot argue about depth.

Punched, not printed: the butterfly is holed in the shape of the letter it carries, twice,
because the far wing is the same texture mirrored. The generated slice is an opaque canvas
read as an alphaMap off the green channel, so **filling the glyph with black is the whole
operation** — no compositing modes, no premultiplied-alpha surprises. The slice is drawn
with the body axis vertical and the plane's UVs turn it ninety degrees, so the glyph goes in
sideways to come out upright on the butterfly.

**Echoes.** About two in five letters repeat behind themselves at falling size and opacity.
Not all of them — on twenty-six it stops being an accent and becomes a texture. They fan
further out while a letter is chosen, so the highlight moves the type as well as colouring
it.

The highlight is otherwise just the letter knocked out of a disc in its butterfly's colour
plus a `CFG.hiScale` size bump — see "The highlight is on the letter, not the butterfly"
above. (v4 also struck the chosen letter two metres tall behind its butterfly; that never
worked past v4 — its `CFG` keys were dropped — and v6.2 removed the dead code.)

## The controls are flowers, and they never hold still

`ui.js:blob()` builds **six overlapping lobes** around a centre, each its own triangle fan
whose rim is recomputed from harmonics every frame. Overlapping opaque circles in one flat
colour read as a union without anyone computing one — there is no boolean here, just lobes
drawn on top of each other, sharing a material so a state change is one colour write.

They have to sit far enough out to read as separate lobes: pulled in tight they merge into
one lump and the flower turns back into a blob, which is what the first pass did.

**v10.5: each lobe is two meshes, not one**, sharing a single geometry — an invisible
depth-only prepass and the real transparent colour — so overlapping lobes never double-blend
once the flower fades (see "v10.5" at the top). And **accept and delete each carry a glyph**
(`js/icons.js`) riding on the hub lobe as a small independent plane, pinned at its own fixed
spin; the start flower still has none.

On top of that `tickUI()` floats each cluster a couple of centimetres on two periods that do
not divide into each other, turns it, and breathes its scale.

Geometry rather than a canvas for two reasons. Deforming a *drawn* shape means redrawing and
re-uploading a 256×256 texture every frame — a quarter of a megabyte per shape per frame to
say what a hundred vertices say for nothing. And geometry is exactly flat: one solid unlit
colour with no texture anywhere in the path, so there is nothing to soften it and no colour
space to get wrong.

**Saturation is pinned at 100 and the lightness band is narrow.** State is carried by
lightness alone, a couple of stops at a time. The first pass lifted `off` to a pale tint to
say "nothing to accept yet" and it just made both shapes look washed out for most of a
visit — the keyboard starts empty, so `off` is what people see first and longest. Green sits
darker than red at full chroma or it glows next to it.

The pick sphere **follows the shape as it drifts**, not the point it was hung from, so a
shape that has floated 2 cm is still where you are pointing. Verified both ways: aiming at
the live position and at the original anchor both land.

The life in the rest of the UI is in `tickUI()` too — each letter drifts on its own slow
phase and swells in as it arrives.

The swarm orbits at `radMin`..`radMax` = **1.0 m to 2.4 m** horizontally, which puts every
butterfly 1.0–2.6 m from the eye: a lean and a reach, not a walk. `radMin` is deliberately
outside the UI at `panelR` 0.8 m so nothing flies through the name.

Three worth knowing:

- **`CFG.arcSpan`** is `2*PI`, v2's full orbit. That means only about a quarter of the
  alphabet is in front of you at any moment and spelling a name involves turning around.
  Setting it under `2*PI` — 3.4 rad is a good first try — makes the butterflies sweep back
  and forth across an arc in front of the visitor instead. Same flight, same noise; all 26
  stay findable. Measured over 20 s at 3.4: the worst butterfly reaches 94° off centre and
  none goes behind. `k.centre` / `k.swing` (the per-key arc slice) are read from
  `CFG.arcSpan` in `buildKeys`, so change it in `config.js` before load, not live.
  (v4–v6.1 left those two unset and any `arcSpan` under `2*PI` produced `NaN`; fixed in
  v6.2.)
- **`CFG.pickBase` / `CFG.pickAngle`** are the cone. Separation holds neighbours about
  0.6 m apart, so slack much past a quarter of that stops feeling like aiming. Checked by
  aiming dead-on at all 26 across 30 s of flight: 26/26 pick themselves, with the closest
  pair 0.17 m apart.
- **`CFG.captureTime + CFG.goneTime`** is how long a letter is unusable, currently ~0.95 s.
  A key is pickable again the moment it starts flying back in, because a keyboard where the
  letter you just used has gone cannot spell ANNA.

## The wing's fit in its slice (v8.7)

The wing **shape** comes from `wing-gen.js`, a parity-locked port of
`wingtexgen_script.py`. v8.7 does not change a line of that math. It adds a stage
**after** it, because the shape was right and its *placement in the frame* was wasteful.

### What the measurement said

Over 4000 spelled names, the painted wing filled **10–39%** of the slice, median **21%**.
It wasted it two ways at once:

| | |
|---|---|
| **outward** (across the slice) | median **0.59** of the budget, never more than 0.90. The slice is 128 px wide because the *worst case over all 331,776 reachable dial combinations* needs 1.0151 of 1.111 — but no single wing is that worst case, so almost every wing leaves 40% of the width blank |
| **along the body** | the extent is lopsided. `up 0.42` against `dn 1.05` is a typical wing: a deep hindwing under a shallow forewing. A scale anchored at a **fixed seam** is limited by the long side, so the short side's budget is simply thrown away |

### What it does

`fitPlan()` measures the finished outline — both polygons, scallops included, so the
bounding box is exact rather than estimated — and returns two numbers:

- a **uniform scale `k` about the body root**. The root sits at column 0 and the scale is
  anchored there, so the wing grows outward and along the body without ever leaving the
  attachment point;
- a **shift of the seam** onto the middle of the wing, which is what unlocks the wasted
  half of the along-body budget.

`drawWing`'s row/col mapping applies both. No control point moves.

```
col = x * fit * k
row = seamRow + (y - shift) * fit * k
```

### Uniform, not per-axis — and the seam recentre is the part that matters

| policy | p05 | med | p95 | spread |
|---|---|---|---|---|
| v8.6 | 14.2% | 21.5% | 30.3% | 2.13 |
| uniform fit, seam fixed | 20.7% | 33.8% | 53.0% | **2.56** |
| **uniform fit + seam recentre** | **33.1%** | **48.0%** | **62.9%** | **1.90** |
| per-axis fit + seam recentre | 45.2% | 57.6% | 68.9% | 1.53 |

Two readings worth keeping:

- **Per-axis fitting is not worth it.** It buys another ten points of coverage and
  stretches wings by up to **2.4:1** to get them. A wing stretched 2.4:1 is a different
  wing, and the whole claim of this file is that the shapes are the TouchDesigner shapes.
- **A fit with the seam left alone makes the spread *worse* (2.13 → 2.56).** A wing can be
  small in area and still touch the frame — that is exactly the lopsided case — so without
  the recentre the fit hands most of its gain to wings that were already big. If the
  complaint is "some wings are too small", `wingFitSeam` is the knob that answers it.

Rasterised, over 500 names: v8.6 painted **14.1 / 20.9 / 29.2%**, v8.7 paints
**31.2 / 43.0 / 54.9%**. The smallest wing v8.7 draws is bigger than the biggest v8.6 drew.

### Nothing can clip, structurally

The gain is applied **after** the headroom is computed and then capped by it, so no
combination of knobs can push a wing off the slice. Verified over 600 names: zero clipped,
and the tightest clear margin is exactly `wingFitMargin`.

Note that `fitLimits()` — the *old*, parity-locked clamp inside `expand()` — computes its
outward room as `2*aspect/fitScale` = 2.089 model units while the slice only has 1.111.
That cap has never bound and still does not, but it is **not** what keeps the wing in the
frame; the fit stage's cap is. Do not treat `fitLimits` as a guard.

### Knobs

| key | default | |
|---|---|---|
| `wingFitFill` | 0.80 | 0..1 of the per-wing headroom to take. Headroom runs 1.09× on a wing that already fills the slice up to 2.20× on one that does not, so any fraction of it is already biased toward the small wings |
| `wingFitSeam` | 1.00 | 0..1, how far to slide the seam onto the middle of the wing |
| `wingFitGain` | 1.05 | flat multiplier on top, for the overall lift. Still clamped by the headroom |
| `wingFitMargin` | 2.0 | pixels of slice left clear on every side. Mip headroom, not a safety margin |

`wingFitFill = 0` and `wingFitSeam = 0` restore v8.6's rasterisation exactly — that is how
the parity harness is run. 0.80 with gain 1.05 is within half a point of a full fit
(43.0% against 44.5%), so there is very little room above the default; the room is below.

The knobs resolve **opts → CFG → `WingGen.DEFAULTS`, at draw time**, because `config.js` is
a later `<script>` than `wing-gen.js` and `CFG` does not exist when this file loads.

### Paying for it: `WING_PLANE` 0.85 → 0.64

A bigger wing in the slice is a bigger butterfly in the room, and at v8.6's plane size the
kaleidoscope read as busy. `BflyModel`'s `WING_PLANE` — the wing plane's chord relative to
the body plane — is cut to **0.64** (`CFG.wingPlane`), which puts the painted wing back at
its v8.6 size in metres.

**The factor is measured on the scene, not on the generator, and that matters.** Sizing it
off the spelled-name distribution gives 0.595 and is wrong by 10%: 26 of the ~40 wings in
the room are the keyboard's, and `dialsForLetter` draws a different distribution from the
name hash — the keys already had fuller wings, so the fit stage had less to add to them.
Read off every wing texture live in the running scene, mean painted ink went **0.1575 →
0.2786**, an area ratio of **1.769**, so `0.85 × sqrt(1/1.769)` = 0.639. Verified back in
the scene at 0.64: painted area **1.003×** v8.6, along-body extent 0.987×, outward 0.916×.

**Area is the criterion**, because "busy" is how much of the view is butterfly. The two
extents cannot both be matched at once — the fit stage makes a wing proportionally *fuller*
inside its bounding box, not merely bigger.

**Do NOT do this on `CFG.sizeMin` / `colSizeMin` instead.** Those set `size`, and `size` is
the unit half a dozen tuned constants are quoted in — the pick radius (`keyboard.js`:
`0.20 * k.size`), the per-wingbeat bob (`0.01 * size`), `CFG.tagBodyDrop`, the letter's
placement. Scaling the bands silently shrinks every one of them by the same factor,
including three rounds' worth of selection tuning. Scaling the plane leaves `size` meaning
what it has always meant, so all of them stay valid with no edits. It also leaves the
**body** alone, which the size bands would not: the fit stage grew the wings and nothing
else, so taking it back out of the wings and nothing else is what restores v8.6 — scaling
the whole model would leave the body 30% small.

`CFG.wingPlane` is the knob for overall butterfly scale from here.

### `CFG.tagBodyDrop` did NOT have to move — checked, not assumed

The name tag hangs at `tagBodyDrop` (−0.135 per unit model size), documented as "where the
painted silhouette actually reaches below the butterfly's centre". A wing that reaches 44%
further outward is an obvious candidate to have invalidated it, so it was measured rather
than argued about: **`BODY_ALPHA`'s ink bottoms out at −0.1407**, and the constant is
−0.135. It is set by the **abdomen**, which v8.7 does not touch.

The wings only reach that low when flapped down, and the angle at which they do has come in
— sin θ = 0.135/0.201, about 42°, where v8.6 needed 74°. That is not a regression to fix:
a full-down wingbeat always passed the tag, a flapped wing's low point is its *tip*, off to
the side of the name rather than over it, and a collected butterfly holds a calm pose. If
the tag ever does need to clear the wings rather than the body, that is a different
constant, not this one.

### Two consequences elsewhere

- **`wing-tex.js`'s cache key carries the fit knobs.** Without that, tuning them would be
  served a stale texture out of the cache.
- **`wing-colour.js`'s `WX0..WY1` was widened.** That is the static box the composition is
  aimed at, and the fit stage changed the answer: the painted box went from x 0.00–0.59 /
  y 0.46–1.77 to **x 0.00–0.85 / y 0.07–1.93**. Left alone, the composition would aim at
  the middle of a wing that reaches well past it. The rng sequence is untouched, so every
  name keeps its palette, its pattern and its blend modes; only placement moves.

### `tools/shape-preview.html`

The shape's equivalent of `colour-preview.html`: a slider per knob, **v8.6 drawn beside
v8.7 for every wing**, the fill distribution recomputed live over 2000 names, and a second
view that assembles both wings on the **real body texture** — the fit has to be judged on
the butterfly, not on a rectangle.

Two things that view got wrong before it got them right:

- `BODY_ALPHA` is an **opaque white-on-black mask**, so drawn over a white wing it shows
  nothing at all. Key the black out into an alpha channel once on load and tint it.
- The body's ink sits **near one edge of its own square** — `bfly-model` shifts the body
  plane by `-s*0.63` to bring the drawn body line level with the wings — so the square has
  to be placed by its **measured ink centroid**, not centred. Deriving that offset by hand
  is one sign error away from a body drawn off the side of the butterfly, which is what it
  did first.

## The base-colour generator (v8 port → v8.3 layered → v8.4 archetyped → v8.5 geometric → **v8.6 composition**)

The wing **shape** is `wing-gen.js`, a parity-locked port of `wingtexgen_script.py`, and
its *math* is untouched by any of this — v8.7 only changed how big it is drawn in the
slice, and that widened one constant here (see "The wing's fit in its slice" above).
`wing-colour.js` is the wing **colour**. Still deterministic from the name, still not
parity-locked.

**What it paints.** A full-frame RGB texture, 128×256 (the shape slice), alpha a constant
1 — the wing shape supplies the cutout as a separate `alphaMap`, so `bfly-model.js` hands
the wing material *both* (`map` = colour, `alphaMap` = shape).

### The composition

All PRNG draws happen up front; the pixel loop and all three guards are pure maths.

1. **Square space.** The slice is 1:2, so `u` and `v` are not interchangeable. Geometry runs
   in `(x, y) = (u, v * VASP)`, one unit = `W` = 128 px on **both** axes. That is what keeps
   a circle round.
2. **A ground** — one flat colour, usually a light neutral.
3. Optionally (~55%) **one full-wing pattern** behind everything.
4. **1–3 big shapes** — circle (dominant), shard (polygon), band — each flat or carrying one
   pattern: `stripes`, `checker`, `dots` (offset halftone), `rings`, `sunburst`, at bold
   sizing (repeat counts 2–14).
5. Each shape composites through a **blend mode**: `normal`, `difference`, `multiply`,
   `screen`, `exclusion`. The mode is drawn **jointly with the ground's lightness** —
   `difference` against a light ground darkens and against black returns the source
   unchanged, so choosing it independently would make half of them vanish.
6. Optionally (~25%) **2–4 thin hard orbital ellipse outlines**. This is the one intricate
   gesture and the first thing to cut if the set ever reads busy.

### The palette is a fixed table

**Thirty-two** flat colours sampled from the references — **bold** (18), **earth** (8),
**neutral** (6) — and the mix is the point: bold alone reads as a screensaver, earth alone
as mud, neutrals alone as a wireframe. This **drops v8.5's tie to the keyboard's 26-hue
wheel**; the 26 keys keep their flat HSL colours and the visitor's butterfly deliberately no
longer draws from the same set.

**Six bright entries** (red, mint, coral, lime, azure, gold) were added on feedback that the
set felt dull and grey — the original bold twelve included deep blue, forest and dark teal,
all fully chromatic and all *dark*. Three rules keep it bright: `BRIGHT` requires high
chroma **and** a high value (chroma alone passes olive, which is mud); the ground is drawn
from `BRIGHT` 44% of the time; and **mid grey is barred from being the ground** — it stays a
useful partner colour, but the ground decides how the whole wing feels.

**CONTRAST IS A GATE, NOT AN OBJECTIVE.** This is the single most important line in the
file. The first v8.6 pass scored pairs on WCAG contrast ratio and the whole set came out
black and white — of course it did, **black on white is 21:1 and wins every comparison**, so
a scorer that maximises contrast always reaches for the neutrals. That is exactly what the
brief ruled out. Contrast now gates at 2.6:1, saturates at 7:1, and everything above earns
nothing; what earns score is **colour** — a chromatic pair scores far above a neutral one, a
`BRIGHT` member higher again, and two chromatics gain further for hue separation. Two
saturated hues at the same value are rejected outright without either a hue gap or a real
tonal step.

**A lead colour is drawn outright, not scored.** Otherwise the greedy builder converges on
the globally best-scoring pair — purple and lime are near-complementary and both bright, so
they won name after name and the whole set went purple. The scorer finds partners that
*work*; what a wing is *about* is the name's job.

**Neutrals are capped at two per wing, the ground included.** Even with contrast gated, an
unconstrained set drifts grey, because a neutral clashes with nothing and so never scores
badly.

### Three guards, all post-draw, none consuming rng

- **Legibility.** A blend mode can land on the ground colour it is blending with, and then
  the shape is invisible however big it is — `difference` against a near-white shifts a mid
  grey to another mid grey, and the ink guard cannot see it because the shape *is* covering
  the wing. Each shape's blended result is checked against the ground; the mode falls back
  to `normal` when it does not read.
- **Ink, measured over the WING REGION, not the frame.** The slice is 1×2 but the painted
  silhouette only ever fills part of it — roughly the left half, most of the length. A shape
  placed by *frame* coordinates is routinely cropped by the silhouette down to one flat
  block, and sampling the whole frame scores paint that will never be seen. Shapes are
  placed, sized and grown against `WX0..WX1 / WY0..WY1`. Deliberately a **static
  approximation** — `wing-colour.js` does not call the parity-locked shape generator and
  must not start.
- **Body legibility.** The body reads as a silhouette against a white sky, so it can never
  be a pale neutral — but "darkest chromatic in the set" is also wrong: deep blue has the
  lowest luminance of any hue in the table and won every time, making most butterflies
  navy. Every sufficiently dark chromatic member goes in a pool and one is drawn.

### Legibility at wing scale, and hard edges

The painted silhouette is **small on screen**, and that constrains this more than the
texture resolution does: repeat counts are **2–9** (fourteen repeats on a small wing is
mush), **at most two shapes may carry a pattern** — one if the ground already does — and the
`MINS` pixel floors are `[10, 12, 12, 10, 10]` with sunburst rays capped at 14.

`CFG.wingColAA` is a half-width in **pixels**, default **0** — every coverage test is a
binary compare. Hard edges alias, which is the other reason the scale stays bold;
**v8.5's fine-print variants are gone on purpose**. Circle edges
stair-step at 128 px wide; that is inherent, and the knob is the one place to soften it.

**One deliberate exception:** the sunburst's rays converge at its centre, where the angular
cell goes sub-pixel and a binary test makes a moiré star. It widens its antialias with
1/radius *there only*.

### What was removed

The chroma restore, the value posterise and the grain — all three existed to rescue a
palette that was fighting itself, and a curated flat table with deliberate blend modes needs
no rescuing; a grade would only muddy the blends. Also the warp overlay and its noise
fields, and the straight-cut system (shapes subsume it).

**Cost** ~5.8 ms/texture — once per name on a free frame, then LRU-cached.

**Not parity-locked.** Seeded off an FNV-1a hash of `entry.values`, drawn from
`mulberry32`. The contract is **same `entry.values` → byte-identical texture, any machine,
any reload** — held by every draw happening up front in the fixed order the `DRAW N`
comments mark, and by the pixel loop and all three guards containing no rng. Verified
byte-identical twice in-process and across two separate processes.

### The body colour — one line in `collection.js`

`collection.js` used to rebuild the body as `hsl(col.hue, CFG.bflySat, CFG.bflyLit)`. But
`bflySat` is **100%** and this palette deliberately is not: an olive or a tan body came back
neon and no longer matched its own wings. The record carries **`css`** — the exact palette
colour — and the line is now `var color = col.css;`. `col.hue` survives as that colour's hue
angle, because `Reveal.setName` (the wake letters) and the name tag both want a hue rather
than a colour; neither changed.

**Only the collection butterfly.** `collection.js:spawn()` passes the texture as
`BflyModel.build`'s **6th argument**; when present the wing material's diffuse `color` is
forced **white** (`MeshBasicMaterial` does `color × map`). The 26 keys call `build()` with
four arguments → `map: null` → untouched. Verified in the running scene: 130 key wing
meshes, **zero** with a colour map; the grown butterfly adds three of which exactly two
carry one, and its body mesh is the exact palette hex.

**Orientation.** The colour canvas is built with `u = col/(W−1)`, `v = row/(H−1)`; the
Python's final `rgb[::-1]` row-flip is **dropped** — that is only for TouchDesigner's
bottom-left texture origin. `map` and `alphaMap` share `WingGen`'s top-left pixel layout so
they line up under the wing plane's UVs.

**sRGB.** The colour `CanvasTexture` **is** `SRGBColorSpace`-tagged (the documented "Flat"
trap: untagged, a solid colour comes back a stop lighter). The wing `alphaMap` is **never**
tagged. Two textures, two rules, one material.

**Memory / cache.** `WingColour` keeps its **own** small LRU (`CFG.maxCollected + 4` = 16
records, 128 KB each), deliberately *not* routed through `Wings`' 64-slot cache — that would
halve the shape budget and its in-place redraw could mutate a live *key* wing. Raising
`CFG.maxCollected` past ~12 needs `MAX` in `wing-colour.js` bumped too.

**Knobs** (`config.js`, `CFG.wingCol*`):

| key | default | |
|---|---|---|
| `wingColRandAmt` | 0.29 | the jitter draws |
| `wingColStyle` | `'random'` | the pattern: `stripes` / `checker` / `dots` / `rings` / `sunburst` |
| `wingColHues` | 6 | palette entries in the working set |
| `wingColShapes` | 0 | big overlay shapes. 0 = per-name (1–3) |
| `wingColBlend` | `'random'` | force a blend mode |
| `wingColPatternScale` | 1.0 | pattern frequency; still floored in pixels |
| `wingColAA` | 0 | antialias half-width in **pixels**. 0 = fully hard |

`tools/colour-preview.html` has a control for each, runs the determinism check, reports
ms/wing, exact-palette share, minimum contrast and minimum ink, and captions every wing with
its shapes, their blend modes, its background pattern and its ink. `WingColour.info()`
returns the same for the last render. A dev aid, not needed to run.

## The generation stage (v7)

`keyboard.js` still fires one event and knows nothing beyond that:

```js
window.dispatchEvent(new CustomEvent('keyboard:accepted', { detail: { name: nm } }));
```

Everything downstream is three new files and a handful of small edits. `interact.js` and
`hands.js` are still v6.2's, untouched. `keyboard.js` was v6.2's plus one line in v7 (the
bare `3200` reset delay became `CFG.acceptResetDelay`); **v8.1** adds six small edits to
it, all for the reveal's isolation and the name handover — the flight, the capture states
and the picking are still v6.2's.

### The chain

```
name  --app.js--------------->  NameDNA.toValues(name)   ->  [v,v,v,v] in -1..1
      --DNA.create(values,{name})-->  a stored entry  +  'dna:committed'
      --collection.js------------>  a butterfly flown into the kaleidoscope
```

`app.js` is the whole seam and does nothing else. `name-dna.js` is the mapping.
`dna-store.js` is storage. `collection.js` is the scene.

### name → four values — `name-dna.js`

The Outline's open question, now settled. `NameDNA.toValues(name)` cleans the name to
A–Z, seeds an `xmur3` hash off the whole string, and takes four draws — four decorrelated
values in −1..1. A string hash **is** the mapping the Outline asks for: **stable** (same
name, same butterfly, on any machine) and **well spread** (a full avalanche per step,
length-independent, so "ANNA"/"ANA"/"NANA" diverge and a 2-letter name spreads as widely
as a 12-letter one). It is deliberately not a legible letter-to-parameter correspondence —
the brief asks only for deterministic and distinct.

Not to be confused with `keyboard.js:dialsForLetter(i)`, which hashes a letter's *index*
so the 26 keys look different. This hashes the whole *name*, for the one butterfly the
visitor takes away. Both end at `Wings.forDials(dials in 0..1)`; the name path goes
through `DNA.toDials`, which maps −1..1 → 0..1 and **wraps** (the roll chains are cyclic),
so a uniform hash needs no clamping.

### the collection — `dna-store.js` + `collection.js`

`dna-store.js` is a trimmed fork of `web/js/dna-store.js`. The four-slot capture buffer is
gone (that was for a narrative filling it at four beats); `DNA.create([v,v,v,v], { name })`
is the only entry point. The stored entry is TouchDesigner's schema exactly, plus a `name`
key it ignores. An in-memory `cache` array is the synchronous source of truth behind the
`Store` seam, so `DNA.sequences()` never blocks whatever the backing store is doing.

`collection.js` (`AFRAME.registerComponent('butterfly-collection')`) owns the grown
butterflies:

- **It is not the keyboard.** Collected butterflies are never in `keyboard.js:targets()`,
  so `interact.js` structurally cannot pick or highlight them — the Outline's "cannot be
  selected or captured" needs no code of its own. They carry a **name** (`UI.nameTag`),
  not a letter.
- **"Here's your butterfly."** A freshly committed butterfly runs a scripted beat before
  it joins the swarm. v7 had three states (`present` → `joining` → `orbit`); **v8.1 has
  eight** — `arrive` → `settle` → `greet` → `still` → `coil` → `launch` → `soar` →
  `orbit`, ~12.5 s. Only fresh commits do this; replayed butterflies spawn straight into
  `orbit`. Everything before `orbit` is scripted rather than the ambient flight, and
  `separate()` skips all of it for free because it only ever touches `orbit`. The
  keyboard resets off `reveal:launch` rather than a timer. See "The reveal (v8.1)" above
  for the whole thing.
- **Their own shell.** The 26 keys sit at 1.0–2.4 m — a tuned band that took three rounds
  of on-headset selection work (see the selection sections above). The collection flies
  closer but far higher (`CFG.col*` — 1.7–3.0 m out, 2.2–3.1 m up) so it reads as the
  kaleidoscope above and around you while the keyboard stays the near, actionable layer.
  **v9 lifted it there** to get it out of the letters' angular band — see "The two swarms
  are separated in HEIGHT". Full circle regardless of `CFG.arcSpan`.
- **Flight is a port of `keyboard.js:tickKey`** — `pathAt`, the offset spring, flap-glide,
  heading/bank, `presentRoll`, `separate` — with the capture states, the slow-field and
  the per-key clock stripped out. `keyboard.js:tickKey` is the **source of truth**: a
  flight bugfix there has to be mirrored in `collection.js`. Copied rather than shared
  because factoring it out would mean editing the most-tuned file in the piece, and the
  two flights genuinely differ. The file-global helpers (`makeNoise`/`makeFbm`/
  `smoothstep`/`rand`/`UP`) are reused from `keyboard.js`, which loads first — hence
  `<script src="js/collection.js">` sits **after** `keyboard.js` in `index.html`.
- **`presentRoll` is required**, not optional — the collection orbits through eye height,
  and a butterfly there without the roll solve is an edge-on twig (see "The presentation
  roll"). v7.2 gave it an optional third argument (the target aspect) so the reveal can
  present flatter than the flight; the no-argument path is the flight's solve unchanged.
- **A committed entry is enqueued, never built in the event handler.** `dna:committed`
  fires *synchronously* inside `keyboard.js`'s tick (`accept()` → `app.js` → `DNA.create`
  → `emit`), and generating a wing mid-tick hitches. `tick()` drains the queue ≤2 per
  frame, like `web/js/swarm.js`. `dna:changed` triggers a full reconcile against
  `this.collected` **and** `this.queue` (a change arriving between a commit and its spawn
  otherwise double-queues).
- **Colour** — v8: the wings are a **procedural texture** (`WingColour.forEntry`, see "The
  base-colour generator" above); the **body** stays flat at the name's base hue
  (`col.hue`), keys' white-tuned `CFG.bflySat`/`bflyLit`. **Size is random**, not from the
  name: identity is carried by the wing silhouette, the texture and the hue, and a name
  that hashed to a tiny size would be a permanent bad outcome.
- **The name tag** (`UI.nameTag`) is drawn the way the keyboard sets the caught name:
  every letter its own small angle, rise and colour, the wonk deterministic off the stored
  id (so a name keeps its layout across reloads, but two visitors with the same name
  differ). One canvas, one sprite. It hangs **right below the body, tight against it**
  (v7.1): `collection.js:render()` passes `CFG.tagBodyDrop * s` as the drop point.
  `tagBodyDrop` (−0.135 per unit model size) is where the *painted* silhouette actually
  reaches below the butterfly's centre — the wing/body planes carry ~3× more transparent
  margin than shape, so the geometry's bbox bottom (what v7's `tagCling` scaled) is far
  below the visible butterfly. `nameTagTex()` scans the rendered canvas for its first
  inked row so `nameTag().place()` lands the *visible* top of the name on the drop point —
  the padded canvas edge sits well above it, and the padding varies with how far the
  per-letter jitter threw a letter, so a fixed offset was always a little loose. **Never faded with
  distance** — the name is the visitor's record and has to stay legible however far the
  butterfly wanders. (An earlier pass faded it past a few metres; that is what made a
  drifting butterfly look "unlabelled".)
- **The cap.** `CFG.maxCollected` (12) is how many *render*. Over it, the oldest leaves
  the *scene* only — its `DNA` record is kept, and it returns on reload or if the cap goes
  up. **v11: the replay is oldest-first.** It used to be `.reverse()`d, which made
  `collected[0]` the *newest* butterfly and so made the cap evict the newest rather than
  the oldest — and `collected[0]` is also what keeps the two texture LRUs safe (see "The
  invariant worth not breaking again" at the top). `Wings.MAX_UNIQUE` is 64 and the 26 keys hold 26 of those texture slots for good, so
  `maxCollected` much past ~36 needs a deliberate bump there (the cache layer, not the
  parity-locked math).

### persistence — localStorage now, a shared file behind `serve.py`

`DNA._store` is the seam the whole thing turns on. localStorage is the **offline mirror**,
written every change. The server file `dna_sequences.json` is the **authority**:

- `Store.hydrate()` GETs it on load; if the server answers, that is the collection.
- `Store.write()` POSTs the whole collection back, debounced ~800 ms, and keeps mirroring
  to localStorage.
- No server (`file://`, a static host, `serve.py` down) → both fetches fail quietly and
  it is localStorage-only, per-origin, exactly as a pre-v7 build would have been.
- `hydrate()` will not overwrite a collection this session has already added to
  (`dirtiedLocally`) — the visitor in front of you always wins, and their butterfly is on
  its way to the server anyway.

Why it matters: localStorage is **per-origin**, so without the shared file the headset
(`https://LAN:8443`) and the desktop (`http://localhost:8123`) hold completely separate
collections, and clearing the headset's browsing data wipes the whole exhibition with no
backup. The file on disk is one collection everyone reads, and something you can copy to a
USB stick.

`serve.py` / `serve-https.py` gained a `do_POST` (writes the file atomically — temp file
+ `os.replace`, under a lock) and a `do_GET` that answers an empty collection instead of a
404 before the first butterfly. `serve-https.py` also had a long-standing broken block at
the top (`HERE` referenced before assignment — a `NameError` at import); v7 deletes it.
The server is **one writing station** — last-writer-wins on the whole blob, which is the
Outline's model (one keyboard, one visitor at a time). Two headsets writing at once would
need a merge.

**`?reset=1`** in the URL wipes the collection on load — the localStorage mirror, the
in-memory cache, and the server file — and stops that load's `hydrate()` bringing anything
back. Read once, not persisted. For clearing test butterflies, or resetting between
exhibition days on a headset where there is no console.

### traps this stage has to respect

- **`CFG` keys and silent `NaN`.** Three v6.2 bugs were `CFG.*` that the code read but
  `config.js` never defined → `NaN` → rendered nothing → invisible on the Quest. Every v7
  key has its literal default in `config.js` in the same change as its reader, no
  `CFG.x || fallback` in the new files, and `collection.js` `console.error`s any of its
  keys that come back undefined.
- **`this.name` on a component** silently unregisters its `tick()` — `collection.js` uses
  `this.collected`.
- **`dna:committed` is synchronous inside the tick** — enqueue, do not build.
- **The name tag is a colour canvas → `srgb()` it. The wing `rec.tex` is an alpha map →
  never.** v8: the base-colour texture (`col.tex`) is also a colour canvas → `srgb`-tagged
  (by `wing-colour.js`); it and the alphaMap sit in the *same* wing material.
- **A backgrounded browser tab pauses A-Frame's render loop**, so `collection.js`'s queue
  will not drain and nothing flies in until the tab is visible again. This is expected
  browser behaviour, not a bug; it bites automated testing, where the fix is to pump
  `sceneEl.tick(t, dt)` manually. **v8.1 gives it a second face:** the keyboard's reset
  now hangs off `reveal:launch`, which a stalled queue never reaches — hence
  `CFG.acceptResetDelay` surviving as a generous fallback.
- **A synthetic clock and a `setTimeout` disagree** (v8.1, testing only). Pumping
  `sceneEl.tick` in a tight loop advances the scene by seconds while real time barely
  moves, so a real-time reset timer fires long after the beat it belongs to — or, if a
  test stubs `reset()` out to hold the name still for a screenshot, `this.done` stays
  true and the *next* `accept()` silently short-circuits. Both cost a confusing half hour
  during v8.1's checks.
- **A WebGL canvas loses its drawing buffer after compositing** (v8.1, testing only), so
  a single `renderer.render()` followed by a screenshot captures a blank frame. Run a
  render-only animation loop instead — repainting every frame, never ticking — and the
  scene sits frozen on the beat you stopped at.
