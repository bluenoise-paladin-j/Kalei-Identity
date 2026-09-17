# audio/ — the guide's voice-over, and (v10.4) the room's sound

**Two things live here.** This file is about the **voice-over** — the four spoken cues in this
folder. `sfx/` is the room's own sound (the music bed, the wingbeats, the select click); it is
`js/sfx.js`'s, is named in `CFG.sfx`, and is documented at the bottom.

Four recordings. The names live in **`CFG.voCues` in `js/config.js`**, not here — rename the
constant, not the file, if you want a different one.

The four tracks in this folder are the real recordings, copied from
**`sounds/ai_voiceover/v1/`** — that folder is the master and is untouched. (The
machine-spoken placeholders this was built against have been deleted; the `say` line at the
bottom regenerates one in a second if a stand-in is ever wanted again.)

## The opening — three recordings, played as one

Fires when the visitor presses the start flower. `CFG.voIntro` is the order; `CFG.voGap`
(0.45 s) is the beat between them.

| file | from | script | length |
|---|---|---|---|
| `welcome.mp3` | `1. Welcome` | "Welcome to Kalei Identity." | 1.9 s |
| `spell.mp3` | `2. Catch the butterfly` | "Catch butterflies one at a time to spell your name. This will build the genetic code of your own butterfly." | 6.7 s |
| `pinch.mp3` | `3. Pinching` | "Start by pinching a selected butterfly to attract it towards you." | 4.1 s |

**The three are one cue as far as the rest of the piece is concerned.** `Voice.playing()`
stays true across the gaps, so the silence between two of them is never mistaken for the
narration having finished — the quiet clock does not start counting mid-sentence, and the
`welcome` state does not hand over to `live` until the third one is done. Driven in the real
scene: the three end at **2.02 s / 9.04 s / 13.44 s**, gaps exactly 0.45 s, `playing()` true
throughout. **The opening runs 13.4 s in total.**

**The room is pickable from the first second regardless** (`CFG.guideUnlockAt` = 0), so a
visitor who already knows what to do is never made to wait out twelve seconds of narration.
Raise it if they should hear the instruction first.

## The recall

| file | from | script | length |
|---|---|---|---|
| `recall.mp3` | `4.UPDATED` | *the amended line — re-recorded after the palm interaction changed* | 7.1 s |

The first cut of this track said *"hold out your palm facing down"*, which at the time was
the one instruction in the piece that did not work: v9.2's offer required the palm turned
**up**. That is fixed in the code as well as in the recording — **`CFG.palmEitherFace` means
a hand held out flat and horizontal is an offer either way up**, so this line is free to say
whichever it likes and a visitor who does the opposite still succeeds. See "Either face" in
`CLAUDE.md`.

It fires on **`reveal:joined`** — the frame their butterfly's soar hands off onto the orbit,
which is the instant it stops being the hero and becomes one of the many. Only the **first**
of a session speaks: a visitor who spells a second name has already been told.

## Not recorded

`nudge` and `farewell` are `null` in `CFG.voCues`, and the session runs without them — a
missing cue is a silent no-op that still reports itself finished.

- **`nudge`** would play 30 s into a quiet stretch. *"Still there?"* — any activity cancels
  the end.
- **`farewell`** would play as the room hands over. Without it the end is silent and the
  start flower reappearing is the whole signal, which works — but **a short "thank you,
  please pass the headset to the next person" is the one line an exhibition floor would most
  want next.** Record it, drop it in as `farewell.mp3`, and set the key in `CFG.voCues`.

## Format

**mp3 is right, and no conversion is needed.** The Quest browser is Chromium and plays mp3
and m4a/aac equally well; mp3 is the more universally supported of the two. These four are
mono 44.1 kHz and total **395 KB**, which is nothing over the LAN.

**`.wav` is the one to avoid**, purely on size — these are fetched over TLS by a headset, and
a 30 s stereo wav is about 5 MB against the ~100 KB the same speech costs as mp3.

```bash
# if a master ever needs converting
ffmpeg -i welcome.wav -c:a libmp3lame -b:a 96k -ac 1 welcome.mp3

# a machine-spoken stand-in, if one is wanted again
say -v Samantha -r 175 -o welcome.m4a --data-format=aac "Welcome to Kalei Identity."
```

The extension is not special anywhere in the code — `CFG.voCues` holds whatever path you
give it.

## Why nothing plays until the visitor has clicked something

Browsers refuse programmatic playback until the page has had a real user gesture, and **a
hand-tracked pinch is not one** — it is our own threshold on a joint distance, invisible to
the browser. What is one, and always happens first, is the click on **Enter AR**: you cannot
get into the piece without it, and `Voice.unlock()` spends that gesture on every track at
once. If audio ever goes silent on a headset, that click is the first thing to check.

**`serve.py` and `serve-https.py` answer HTTP `Range` as of v10.4**, and call `.m4a`
`audio/mp4` rather than Python's `audio/mp4a-latm` (a raw AAC-LATM stream, which Chromium
refuses outright). Both were added for the music bed and neither was ever exercised by these
100 KB mp3s — but they were the standing answer to "it plays on the desktop but not in the
headset", so if that happens now, look elsewhere first.


---

# audio/sfx/ — the room's sound (v10.4)

Not the narration. `js/voice.js` is the piece talking to the visitor; `js/sfx.js` is the room
they are standing in. The names live in **`CFG.sfx` in `js/config.js`**, not here.

| file | from `sounds/sfx/` | what it is | length |
|---|---|---|---|
| `bg_music.m4a` | `bg_music.wav` | the bed. `loop = true`, from the page's first gesture to the end of the day | 2:21 |
| `wing1.m4a` | `butterfly_wing1.wav` | a wingbeat | 5.0 s |
| `wing2.m4a` | `butterfly_wing2.wav` | the other one | 2.25 s |
| `select.m4a` | `select.wav` | on everything selected — the flower, accept, delete, a letter, a collected butterfly | 1.85 s |

`sounds/sfx/` is the master and is untouched. **2.3 MB the lot** as AAC, against 26 MB as wav
— the same argument this file already makes for the voice-over, only more so: `bg_music.wav`
alone is 25 MB.

```bash
# how these were made. mp3 would be equally fine; this machine has no ffmpeg
# and macOS's own afconvert does AAC, not mp3. The Quest browser plays both.
afconvert -f m4af -d aac -b 112000 -s 3 bg_music.wav        bg_music.m4a
afconvert -f m4af -d aac -b  96000 -s 3 butterfly_wing1.wav wing1.m4a
afconvert -f m4af -d aac -b  96000 -s 3 butterfly_wing2.wav wing2.m4a
afconvert -f m4af -d aac -b  64000 -c 1 -s 3 select.wav     select.m4a
```

## Replacing one

Drop the file in, point `CFG.sfx` at it, and **re-measure the level** — nothing else changes.

The gains in `config.js` are not guessed. Off the masters: `bg_music` −28.5 dB RMS, `select`
−30.5, `wing1` −42.8, `wing2` −46.8. The wingbeats are recorded 15–18 dB under the bed, so at
matched gains they are simply not there; `sfxWingGain` is 1 and the **bed** is the one pulled
down. **To make the room louder or quieter, move `sfxMusicGain`.**

## Two things a replacement bed must survive

- **It is looped, and the seam is a FADE, not a crossfade.** `sfx.js` reads the level off
  `currentTime` — up over `sfxMusicFadeIn`, down over `sfxMusicFadeOut` — and `currentTime`
  resets when the element loops, so the same envelope is the opening fade-in *and* the join.
  A track that ends loud is fine; a track shorter than the two fades together will simply
  never reach full level, so shorten the fades with it.
- **Looping is a SEEK**, which is why the servers had to learn `Range`. A file served by
  something that does not answer `Range` may play once and then stop.

`?sfx=0` silences all four and leaves the narration alone.
