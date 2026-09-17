# Kalei Identity

Kalei Identity is an interactive mixed reality experience exploring identity and embodied
design through a butterfly keyboard. Catch butterflies one at a time to spell your name,
building the genetic code of your own butterfly. Send it into a kaleidoscope that accumulates
across the exhibition, growing with every visitor's interaction.

Twenty-six butterflies hang in the air in front of you, and together they are the keyboard.
Each one carries a single letter. The name you spell is hashed into the four values the wing
generator grows a butterfly from, so the same name always grows the same butterfly, and names
of any length spread evenly: ANA and ANNA are visibly different rather than near-identical.

That gives the piece two scales of identity at once. The individual butterfly is a portrait of
the participant; the whole kaleidoscope is a portrait of the community. The room begins empty
and fills over the course of a day, one butterfly per visitor, and every butterfly made stays
for the rest of the exhibition.

**Version 11**, the build shown at the exhibition.

## The interaction

The hands are the whole interface. No controllers and no menus.

1. **Press the flower** floating in front of you to begin. A voice welcomes you in and tells
   you what to do.
2. **Reach** toward a butterfly. It highlights to confirm you have the right one.
3. **Pinch** to catch it. The butterfly is drawn towards you and its letter is appended to the
   name in front of you. Repeat until your name is complete.
4. **Accept** the name. Your butterfly springs out of the letters, holds still with its wings
   square on so it can actually be looked at, then launches up into the kaleidoscope, trailing
   the letters of your name behind it.
5. **Call it back.** Your butterfly is still yours. Pinch it and it leaves the kaleidoscope,
   flies over, and either lands on a raised flat open palm or hovers in front of you before
   flying home.

Fifteen seconds after the last thing a visitor does, the room resets itself and the start
flower comes back, ready for the next person.

## Running it

It is a static site. `index.html` sits at the root and there is no build step. It runs on
GitHub Pages, or locally:

```bash
python3 tools/serve.py 8123
```

WebXR needs a secure context, so a headset on the LAN needs TLS rather than plain HTTP:

```bash
python3 tools/serve-https.py 8443
```

That generates a self-signed certificate on first run and prints the address to open in the
headset. The browser will warn that the certificate is untrusted: Advanced, then Proceed.

On a desktop the mouse stands in for a hand, so the whole piece can be driven in a normal
browser window without a headset.

### URL flags

| | |
|---|---|
| `?reset=1` | start with an empty room |
| `?guide=live` | skip the start flower and the narration |
| `?vo=0` | no voice-over |
| `?sfx=0` | no room sound |

## The collection

Every butterfly made is stored in the browser and comes back on reload. Behind
`tools/serve.py` it is also written to `dna_sequences.json` on disk. On a static host such as
GitHub Pages there is no server to write to, so the committed `dna_sequences.json` is a **seed**
that the piece may only ever add to. It can never remove a butterfly the headset already holds.

`save.html`, opened at the same address, downloads a day's collection, restores one, or wipes
it. It is standalone on purpose: no dependencies and no network requests, because it is the
page you open when something has gone wrong.

## What is in here

| | |
|---|---|
| `index.html` | the scene |
| `save.html` | getting a day's collection off the headset |
| `js/` | the piece: the generator, the keyboard, the collection, the session |
| `audio/` | the voice-over and the room's sound ([notes](audio/README.md)) |
| `vendor/` | A-Frame 1.6.0, vendored so the piece still loads without wi-fi |
| `tools/` | the two local servers, plus headless test and preview harnesses |
| `CLAUDE.md` | development notes |
| `VERSION.md` | version history, v9 through v11 |

## Built with

[A-Frame](https://aframe.io) 1.6.0 and WebXR, on a Meta Quest 3S with hand tracking. The wing
generator is a port of a TouchDesigner script from an earlier version of the project.
Developed with Claude Opus 5.

## Credits

- **Duy Khai**: installation, interaction, concept
- **Jared Amuso**: concept, development, interaction, system flow
- **Uyen Thu**: sound, concept, installation
- **Lan Thanh**: sound, concept, installation

Sound: [Forest Atmosphere](https://sound-effects.bbcrewind.co.uk/search?q=NHU05003049)
(C. Watson, BBC Sound Effects) · [Meditation](https://freesound.org/s/655395/)
(SergeQuadrado) · [UI Button Press](https://freesound.org/s/788611/) (el_boss) ·
[GLEAM-GLOW-SFX-CHIME](https://freesound.org/s/351408/) (newagesoup)
