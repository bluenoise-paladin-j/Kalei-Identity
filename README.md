# Kalei Identity

A WebXR installation for the Meta Quest 3S, in which catching butterflies *is* typing.

Twenty-six butterflies hang in the air in front of you, each carrying a letter. You pinch
them one at a time to spell your name. The name is then hashed into the four values a wing
generator grows a butterfly from, so the butterfly you get is yours — the same name always
grows the same one — and it joins the room and stays there for the rest of the exhibition.

The room begins empty and fills up over the course of a day: one butterfly per visitor.
Each individual butterfly is a portrait of one person; the whole flock is a portrait of
everyone who passed through.

**Version 11**, the build shown at the exhibition.

## The interaction

1. **Begin.** Press the flower floating in front of you.
2. **Reach.** Extend a hand toward a butterfly; it highlights to confirm the target.
3. **Pinch.** The butterfly comes to you and its letter is added to your name.
4. **Accept.** Your butterfly is revealed, then launches into the kaleidoscope trailing
   the letters of your name behind it.
5. **Call it back.** Pinch your own butterfly and it flies over — landing on a flat, open
   palm, or hovering in front of you before heading home.

No controllers and no menus; hand tracking is the whole interface. Fifteen seconds after
the last interaction the room resets and the start flower returns, ready for the next
visitor.

## Running it

It is a static site — `index.html` at the root, no build step. It runs on GitHub Pages, or
locally:

```bash
python3 tools/serve.py 8123
```

WebXR needs a secure context, so a headset on the LAN needs TLS rather than plain HTTP:

```bash
python3 tools/serve-https.py 8443
```

That generates a self-signed certificate on first run and prints the address to open in the
headset. The browser will warn that the certificate is untrusted — Advanced → Proceed.

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
`tools/serve.py` it is also written to `dna_sequences.json` on disk; on a static host
(GitHub Pages) there is no server to write to, so the committed `dna_sequences.json` is a
**seed** that the piece may only ever add to — it can never remove a butterfly the headset
already holds.

`save.html`, opened at the same address, downloads a day's collection, restores one, or
wipes it. It is standalone on purpose: no dependencies and no network requests, because it
is the page you open when something has gone wrong.

## What is in here

| | |
|---|---|
| `index.html` | the scene |
| `save.html` | getting a day's collection off the headset |
| `js/` | the piece — the generator, the keyboard, the collection, the session |
| `audio/` | the voice-over and the room's sound ([notes](audio/README.md)) |
| `vendor/` | A-Frame 1.6.0, vendored so the piece still loads without wi-fi |
| `tools/` | the two local servers, plus headless test and preview harnesses |
| `CLAUDE.md` | development notes |
| `VERSION.md` | version history, v9 through v11 |

## Built with

[A-Frame](https://aframe.io) 1.6.0 and WebXR. The wing generator is a port of a
TouchDesigner script from an earlier version of the project. Developed with Claude Opus 5.

## Credits

- **Duy Khai** — installation, interaction, concept
- **Jared Amuso** — concept, development, interaction, system flow
- **Uyen Thu** — sound, concept, installation
- **Lan Thanh** — sound, concept, installation

Sound: [Forest Atmosphere](https://sound-effects.bbcrewind.co.uk/search?q=NHU05003049)
(C. Watson, BBC Sound Effects) · [Meditation](https://freesound.org/s/655395/)
(SergeQuadrado) · [UI Button Press](https://freesound.org/s/788611/) (el_boss) ·
[GLEAM-GLOW-SFX-CHIME](https://freesound.org/s/351408/) (newagesoup)
