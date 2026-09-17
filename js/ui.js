// ============================================================
//  ui.js  --  everything that is not a butterfly
// ============================================================
//  Two kinds of thing, built two different ways for two different
//  reasons:
//
//    letters   SPRITES. They ride under butterflies that circle the
//              visitor, so a mounted plane would be edge-on half the
//              time and mirrored the other half. A sprite faces the
//              camera for free, with no per-frame billboarding to run
//              over twenty-six of them.
//
//    shapes    GEOMETRY. They deform every frame, and deforming a drawn
//              shape means re-uploading a texture every frame to say
//              what a hundred vertices say for nothing.
//
//  Everything is FLAT: no glow, no gradient, no soft edge anywhere. If
//  something needs to stand out it changes colour or size.
//
//  No font asset is fetched -- the type is whatever the browser already
//  has, drawn into a canvas. Helvetica Neue on a Mac, Roboto on a Quest.
//  For A-Z and a short name that is fine, and it keeps the network off
//  the critical path.
// ============================================================
var UI = (function () {
  'use strict';

  //  Helvetica Neue where it exists, then the usual grotesque fallbacks.
  //  Nothing is fetched -- these are whatever the browser already has,
  //  which on a Quest is Roboto and on a Mac is Helvetica Neue itself.
  //  No bold anywhere: 500 is as heavy as it gets.
  var FONT = '"Helvetica Neue", Helvetica, Arial, "Roboto", sans-serif';

  //  A canvas holds sRGB. three.js assumes NO colour space on a
  //  CanvasTexture, so with A-Frame's colour management on it treats
  //  these bytes as linear and encodes them again on the way out --
  //  every flat fill comes back a stop lighter and visibly desaturated.
  //  A solid red draws as pink. Say what the canvas actually is.
  //
  //  Only the COLOUR canvases need this. The wing and body maps are
  //  alpha, read straight off a channel, and must stay unconverted.
  function srgb(tex) {
    if (THREE.SRGBColorSpace) { tex.colorSpace = THREE.SRGBColorSpace; }
    return tex;
  }

  // ---- one letter, riding under one butterfly ----
  //  A SPRITE, not a plane. The butterflies circle the visitor, so a
  //  letter mounted flat would be edge-on half the time and mirrored
  //  the other half; a sprite always faces the camera for free, with no
  //  per-frame billboarding to run over twenty-six of them.
  //
  //  Textures are cached per (character, state), so the whole keyboard
  //  is 52 small canvases however long it runs.
  //
  //  FLAT. No glow, no halo, no soft edge -- a highlighted letter is
  //  simply blacker and heavier than an idle one. The scene is white and
  //  a passthrough room is usually light, so ink reads on both.
  var letterCache = {};

  //  Three flavours, all flat, all in THE BUTTERFLY'S OWN COLOUR:
  //
  //    idle   the glyph, under a butterfly waiting to be caught
  //    hot    the glyph knocked out of a solid disc -- the highlight
  //    name   the glyph, for a letter already caught
  //
  //  Cached on character and flavour alone: a letter has exactly one
  //  butterfly, so the colour is a function of the character.
  //
  //  The HIGHLIGHT is on the letter, not on the butterfly. Recolouring
  //  the butterfly was the obvious move and is wrong twice over: against
  //  white the only colour with enough contrast to mean anything is
  //  black, which reads as switched off rather than chosen, and in a dark
  //  passthrough room it disappears outright. Filling the letter's disc
  //  is unmistakable on any background and leaves all 26 butterflies
  //  their own colour, which is the point of them.
  function letterTex(ch, mode, color, v) {
    v = v || {};
    var key = ch + mode + color + (v.hollow ? 'o' : '') + (v.mirror ? 'm' : '');
    if (letterCache[key]) { return letterCache[key]; }
    var S = 128;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    x.clearRect(0, 0, S, S);

    if (v.mirror) { x.translate(S, 0); x.scale(-1, 1); }

    if (mode === 'hot') {
      // the highlight is a filled disc in the butterfly's own colour,
      // whatever the letter was doing before
      x.fillStyle = color;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
      x.fill();
    }
    x.font = '500 ' + (mode === 'hot' ? 82 : 96) + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (mode !== 'hot' && v.hollow) {
      // hollow: the letter as an outline. Cut through a dense corner of
      // the composition without adding another solid mass to it.
      x.strokeStyle = color;
      x.lineWidth = 3.5;
      x.strokeText(ch, S / 2, S / 2 + 4);
    } else {
      x.fillStyle = mode === 'hot' ? '#ffffff' : color;
      x.fillText(ch, S / 2, S / 2 + 4);
    }

    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;           // small text mushes in the low levels
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);
    letterCache[key] = t;
    return t;
  }

  //  Lay the glyph into a wing slice -- the ONE transform the hole
  //  (punchLetter) and its fill (letterMask) both go through, so they
  //  can never drift apart.
  //
  //  The slice is drawn with the BODY AXIS VERTICAL down the left edge
  //  and the plane's UVs turn it ninety degrees, so the glyph is laid in
  //  sideways here to come out upright on the butterfly. On top of that
  //  sits this butterfly's own angle, squash and shear -- rotation plus
  //  an uneven squash plus a shear is what a plane tilted out of frame
  //  looks like, which is the whole job.
  function wingGlyph(x, w, h, ch, st) {
    x.save();
    x.translate(w * (0.52 + st.wingOffX), h * (0.46 + st.wingOffY));
    x.rotate(-Math.PI / 2 + st.wingRot);
    x.scale(st.wingSX, st.wingSY);
    x.transform(1, st.wingShear, 0, 1, 0, 0);
    x.font = '600 ' + Math.round(w * st.wingSize) + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 0, 0);
    x.restore();
  }

  //  The same glyph, in the same place, on its own: white on black, to
  //  be read as the alphaMap of a second wing sitting inside the hole
  //  the first one has been punched through. That is how the cut-out
  //  letter gets a colour instead of showing the room behind it.
  function letterMask(w, h, ch, st) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.fillStyle = '#000000';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff';
    wingGlyph(x, w, h, ch, st);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  //  THE LETTER CUT OUT OF THE WING.
  //  The generated wing is an OPAQUE canvas -- white shape on black --
  //  read as an alphaMap off the green channel, so filling the glyph
  //  with black punches a letter-shaped hole straight through it. No
  //  compositing modes, no premultiplied-alpha surprises.
  function punchLetter(src, ch, st) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.fillStyle = '#000000';
    wingGlyph(x, c.width, c.height, ch, st);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  function letter(ch, color, st, ghostColor) {
    //  A letter is a GROUP: the impression itself, its ghosts, and for
    //  some butterflies a three-dimensional lattice of the same letter
    //  scattered through the space around the body. They share two
    //  textures -- the letter in its own ink, and the letter in the
    //  ghost's -- because every copy is the same letter, not another one.
    var group = new THREE.Group();
    var map = letterTex(ch, 'idle', color, st);
    var ghostMap = letterTex(ch, 'idle', ghostColor, st);
    var hotMap = letterTex(ch, 'hot', color, st);

    function impression(m, op) {
      var mat = new THREE.SpriteMaterial({
        map: m, transparent: true, opacity: op, depthWrite: false
      });
      //  SpriteMaterial.rotation turns the sprite in SCREEN space, so a
      //  letter can be thrown to any angle and still face the camera.
      //  Nothing here is billboarded by hand and nothing is ever edge-on.
      mat.rotation = st.rot;
      var sp = new THREE.Sprite(mat);
      group.add(sp);
      return sp;
    }

    var main = impression(map, 0.95);
    var i, echoes = [];
    for (i = 0; i < st.echo; i++) { echoes.push(impression(ghostMap, 0)); }

    //  The lattice. Positions come off a small deterministic generator
    //  seeded per butterfly, so a given letter always wears the same
    //  arrangement -- wild, but the same wild every session.
    var cells = [], grid = [];
    var g = st.gridSeed;
    function gr() { g = (g * 9301 + 49297) % 233280; return g / 233280; }
    for (i = 0; i < st.grid; i++) {
      cells.push({
        x: (gr() - 0.5) * 2, y: (gr() - 0.5) * 2, z: (gr() - 0.5) * 2,
        k: 0.35 + gr() * 0.85,            // each copy its own size
        rot: (gr() - 0.5) * 1.6,
        ph: gr() * 6.283
      });
      grid.push(impression(gr() < 0.4 ? map : ghostMap, 0));
    }

    var o = {
      group: group, hot: false, deco: 1,
      //  v8.1 -- drop the DECORATION while the reveal has the room. The
      //  glyph itself stays; its ghosts and its lattice go. Two jobs: the
      //  room simplifies to butterflies and their letters exactly when the
      //  hero wants the attention, and it hands back ~105 sprite draw
      //  calls at the one moment the wake wants them -- against a scene
      //  already noted in VERSION.md as ~308 objects on a 180 budget.
      //
      //  A SCALAR, not a switch: they fade, and only stop being drawn once
      //  they are already invisible. Flipping `visible` at a threshold
      //  would pop a lattice sprite in at whatever opacity the threshold
      //  happened to land on.
      setDeco: function (a) { o.deco = a < 0 ? 0 : (a > 1 ? 1 : a); },
      setHot: function (on) {
        if (on === o.hot) { return; }
        o.hot = on;
        main.material.map = on ? hotMap : map;
        main.material.rotation = on ? st.rot * 0.35 : st.rot;   // straightens when chosen
        main.material.needsUpdate = true;
      },
      //  Angular scale: multiplied by distance from the camera so the
      //  letter stays about the same size on screen wherever its
      //  butterfly is, clamped at both ends.
      place: function (camPos, worldPos, size, alpha, t) {
        var dist = camPos.distanceTo(worldPos);
        var h = Math.max(CFG.letterMin, Math.min(CFG.letterMax, dist * CFG.letterAngular));
        h *= st.scale;
        if (o.hot) { h *= 1.35; }
        main.scale.set(h, h, 1);
        var d = h * st.dist;
        var px = Math.cos(st.around) * d;
        var py = Math.sin(st.around) * d - 0.10 * size;
        main.position.set(px, py, 0);
        main.material.opacity = (o.hot ? 1.0 : 0.95) * alpha;

        //  THE GHOST WALKS. Each step turns a little further off the last
        //  (echoBend), the spacing swells and shrinks on its own slow
        //  period (echoRate), and the whole trail fans out while the
        //  letter is chosen. A straight evenly-spaced trail is a drop
        //  shadow; this is meant to read as something moving.
        //  v8.1: gone, so do not walk them either
        var j;
        if (o.deco <= 0.02) {
          for (j = 0; j < echoes.length; j++) { echoes[j].visible = false; }
          for (j = 0; j < grid.length; j++) { grid[j].visible = false; }
          return main.position;
        }

        var ang, step, x = px, y = py;
        var breathe = 1 + 0.35 * Math.sin(t * st.echoRate * 6.283);
        var open = o.hot ? 2.1 : 1;
        for (j = 0; j < echoes.length; j++) {
          ang = st.echoDir + st.echoBend * j + 0.25 * Math.sin(t * st.echoRate * 3.1 + j);
          step = h * st.echoStep * breathe * open * (1 - j * 0.12);
          x += Math.cos(ang) * step;
          y += Math.sin(ang) * step;
          var kk = 1 - (j + 1) * 0.15;
          echoes[j].visible = true;
          echoes[j].position.set(x, y, -0.0004 * (j + 1));
          echoes[j].scale.set(h * kk, h * kk, 1);
          echoes[j].material.opacity = (0.38 / (j + 1)) * alpha * o.deco;
          echoes[j].material.rotation = st.rot + 0.12 * j;
        }

        //  The lattice drifts, each cell on its own phase, so the cluster
        //  is never quite the shape it was a moment ago.
        var sp2 = h * st.gridSpread;
        for (j = 0; j < grid.length; j++) {
          var c = cells[j];
          var w = 0.12 * Math.sin(t * 0.31 + c.ph);
          grid[j].position.set(px + (c.x + w) * sp2,
                               py + (c.y + w * 0.7) * sp2,
                               c.z * sp2);
          var s2 = h * c.k * (1 + 0.10 * Math.sin(t * 0.23 + c.ph * 1.7));
          grid[j].visible = true;
          grid[j].scale.set(s2, s2, 1);
          grid[j].material.opacity = (o.hot ? 0.75 : 0.42) * alpha * o.deco;
          grid[j].material.rotation = c.rot + 0.05 * Math.sin(t * 0.17 + c.ph);
        }
        return main.position;
      },
      dispose: function () {
        group.children.forEach(function (sp) { sp.material.dispose(); });
      }
    };
    return o;
  }

  // ---- one letter of the name, hanging in the air ----
  //  The name is not drawn into a text field. It is loose letters in
  //  front of the visitor, each on its own sprite, each drifting on its
  //  own slow phase -- the same kind of object as the letters under the
  //  butterflies, so the name reads as something caught rather than
  //  something typed.
  function nameLetter(ch, color, st) {
    //  Two impressions, deliberately OUT OF REGISTER: the letter in its
    //  butterfly's colour, and behind it the same letter a fraction off
    //  in magenta -- the way a two-colour job goes wrong on press. The
    //  offset is fixed per slot, so a name always misprints the same way.
    var group = new THREE.Group();

    var overMat = new THREE.SpriteMaterial({
      map: letterTex(ch, 'name', 'hsl(' + st.overHue + ', 100%, 52%)', st), transparent: true,
      opacity: 0, depthWrite: false
    });
    overMat.rotation = st.rot + 0.05;
    var over = new THREE.Sprite(overMat);
    over.position.z = -0.001;
    group.add(over);

    var mat = new THREE.SpriteMaterial({
      map: letterTex(ch, 'name', color, st), transparent: true,
      opacity: 0, depthWrite: false
    });
    mat.rotation = st.rot;
    var sp = new THREE.Sprite(mat);
    group.add(sp);

    group.ch = ch;
    group.st = st;
    group.born = 0;                    // seconds of life, for the arrival
    group.set = function (size, alpha) {
      var h = size * st.scale;
      sp.scale.set(h, h, 1);
      over.scale.set(h, h, 1);
      over.position.x = st.overX * h;
      over.position.y = st.overY * h;
      mat.opacity = alpha;
      overMat.opacity = alpha * 0.7;
    };
    //  v8.2: both impressions turn together, keeping their fixed misprint
    //  offset. Used by the caught name's downward burst at launch.
    group.spin = function (rad) { mat.rotation = rad; overMat.rotation = rad + 0.05; };
    group.dispose = function () { mat.dispose(); overMat.dispose(); };
    return group;
  }

  // ---- a visitor's name, hanging under their butterfly (v7) ----
  //  The collection's butterflies carry a whole NAME, not a letter. It
  //  is drawn the way the caught name is set on the keyboard: every
  //  letter its own small angle, its own rise off the baseline, and --
  //  here -- its own colour, nothing to do with the wing. One canvas,
  //  one sprite (a sprite for the same reason the keys' letters are:
  //  the butterflies circle you, so a mounted plane would be edge-on).
  //
  //  The wonk is DETERMINISTIC, seeded off the butterfly's stored id --
  //  so a name keeps its exact layout across reloads, but two visitors
  //  with the same name still get different arrangements.
  //
  //  Cached by text+seed. dispose() frees the MATERIAL only; the texture
  //  stays cached for the next butterfly that needs it, like letterTex.
  //
  //  v11 -- AND THE CACHE IS BOUNDED, because unlike letterTex's this one
  //  is keyed on something a VISITOR supplies. letterTex holds at most
  //  26 x HUE_STEPS entries however long the run is (reveal.js quantises
  //  its hue for exactly this reason); this one gained a canvas per
  //  distinct NAME and never freed one. At roughly 300 x 120 px that is
  //  ~140 KB of texture per visitor, so a day on the floor is tens of
  //  megabytes of GPU memory that only ever goes up -- on a headset, the
  //  shape of a slow crash rather than a visible bug.
  //
  //  TAG_MAX is deliberately several times CFG.maxCollected. Only the
  //  newest maxCollected butterflies are ever in the scene and entries are
  //  evicted oldest-first, so an evicted texture cannot belong to a live
  //  sprite -- the same invariant the two wing LRUs rely on, and the
  //  reason collection.js spawns oldest-first.
  var TAG_MAX = 64;
  var tagCache = {};
  var tagOrder = [];

  function tagRemember(key, rec) {
    tagCache[key] = rec;
    tagOrder.push(key);
    while (tagOrder.length > TAG_MAX) {
      var gone = tagOrder.shift();
      if (gone === key || !tagCache[gone]) { continue; }
      tagCache[gone].tex.dispose();
      delete tagCache[gone];
    }
  }

  //  a tiny seeded generator, same shape as style.js's
  function tagRng(seed) {
    var s = ((seed | 0) * 9301 + 49297) % 233280;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function nameTagTex(text, seed) {
    var key = text + '|' + seed;
    if (tagCache[key]) { return tagCache[key]; }
    var r = tagRng(seed + 7);
    var j = CFG.tagJitter;
    var fs = 40;

    var glyph = [], i;
    for (i = 0; i < text.length; i++) {
      glyph.push({
        ch: text[i],
        rot: (r() - 0.5) * 1.0 * j,          // radians, in the plane of the tag
        rise: (r() - 0.5) * 0.85 * j,        // fraction of the cap height
        squash: 0.92 + r() * 0.26,           // a little uneven, like hand-set type
        hue: Math.floor(r() * 360)
      });
    }

    var probe = document.createElement('canvas').getContext('2d');
    probe.font = '600 ' + fs + 'px ' + FONT;
    var adv = [], total = 0;
    for (i = 0; i < glyph.length; i++) {
      adv.push(probe.measureText(glyph[i].ch).width * 0.9 + 1);   // tight tracking
      total += adv[i];
    }
    var pad = fs;                            // room for the rotation + rise to spill into
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(total + pad * 2));
    c.height = Math.max(2, Math.ceil(fs + pad * 2));
    var x = c.getContext('2d');
    x.font = '600 ' + fs + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    var cx = pad, midY = c.height / 2;
    for (i = 0; i < glyph.length; i++) {
      var g = glyph[i];
      x.save();
      x.translate(cx + adv[i] / 2, midY + g.rise * fs);
      x.rotate(g.rot);
      x.scale(1, g.squash);
      x.fillStyle = 'hsl(' + g.hue + ', 85%, 44%)';   // dark enough to read on white
      x.fillText(g.ch, 0, 0);
      x.restore();
      cx += adv[i];
    }

    //  Where the actual INK sits inside the padded canvas -- the drawn
    //  letters, jitter and all, occupy only a band in the middle. v7.1
    //  hangs the name TIGHT under the body, so `place()` has to know
    //  where the visible top of the name really is, not where the canvas
    //  edge is. Scan for the first and last rows that carry a pixel.
    var px = x.getImageData(0, 0, c.width, c.height).data;
    var top = c.height, bot = 0, yy, xx;
    for (yy = 0; yy < c.height; yy++) {
      for (xx = 0; xx < c.width; xx += 2) {           // step 2: fast enough, exact enough
        if (px[(yy * c.width + xx) * 4 + 3] > 8) {
          if (yy < top) { top = yy; }
          bot = yy;
          break;
        }
      }
    }
    if (top > bot) { top = 0; bot = c.height - 1; }   // empty name -- shouldn't happen

    var t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;               // small type mushes in the low mip levels
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    srgb(t);                                 // a COLOUR canvas -- unlike the wing alphaMap
    tagRemember(key, {
      tex: t,
      aspect: c.width / c.height,
      inkTopFrac: top / c.height,            // 0 = ink touches the canvas top
      inkBotFrac: (bot + 1) / c.height
    });
    return tagCache[key];
  }

  //  -> { sprite, place(camPos, worldPos, dropY, alpha), dispose() }.
  //  `dropY` is where the visible TOP of the name should sit relative to
  //  the anchor (collection.js passes the butterfly's silhouette bottom
  //  minus a hair). `place` sets the ANGULAR size (a far name stays as
  //  readable as a near one) and then offsets the sprite so its first
  //  row of ink lands exactly on `dropY` -- the padded canvas edge is
  //  well above that. NOT faded with distance -- the name is the record
  //  of a visitor and should stay legible however far it wanders.
  function nameTag(text, seed) {
    var rec = nameTagTex(String(text || ''), seed | 0);
    var mat = new THREE.SpriteMaterial({
      map: rec.tex, transparent: true, opacity: 0, depthWrite: false
    });
    var sp = new THREE.Sprite(mat);
    return {
      sprite: sp,
      place: function (camPos, worldPos, dropY, alpha) {
        var dist = camPos.distanceTo(worldPos);
        var h = Math.max(CFG.tagMin, Math.min(CFG.tagMax, dist * CFG.tagAngular));
        sp.scale.set(h * rec.aspect, h, 1);
        //  canvas row 0 maps to world y = centre + h/2; the first inked
        //  row is inkTopFrac down from there. Put that row on dropY.
        sp.position.set(0, dropY - h * (0.5 - rec.inkTopFrac), 0);
        mat.opacity = 0.95 * (alpha == null ? 1 : alpha) * (CFG.tagShow ? 1 : 0);
        sp.visible = mat.opacity > 0.01;
      },
      dispose: function () { mat.dispose(); }             // texture stays cached
    };
  }

  // ---- a control: a cluster of lobes, not one blob ----
  //  v3's control was a single deforming outline. v4's is a FLOWER: five
  //  or six near-circular lobes overlapping around a centre, which is the
  //  shape the reference builds its whole poster out of.
  //
  //  Overlapping opaque circles in one flat colour read as a union
  //  without any of the work of computing one -- there is no boolean
  //  here, just lobes drawn on top of each other. Each lobe is its own
  //  triangle fan whose rim is rebuilt every frame from three harmonics,
  //  so the silhouette of the cluster is always moving.
  //
  //  Geometry rather than a canvas: deforming a drawn shape means
  //  re-uploading a texture every frame to say what a few hundred
  //  vertices say for nothing, and geometry is exactly flat -- one solid
  //  unlit colour, nothing to soften it, no colour space to get wrong.
  //
  //  v10.5 -- TWO MESHES PER LOBE, not one, so the flower is a genuinely
  //  FLAT shape at every alpha, not just at 1. Six overlapping circles
  //  sharing one transparent material double-blend wherever two of them
  //  cover the same pixel -- each lobe is drawn in turn and every one
  //  that reaches a given pixel blends over whatever the last one left,
  //  so a translucent flower showed its own overlaps as a darker lattice
  //  instead of fading as one piece. A depth-only PREPASS (colourWrite
  //  off, otherwise ordinary opaque geometry) is rendered first and
  //  claims the z-buffer's nearest surface at every pixel the union
  //  covers; the real, transparent colour pass runs second, and depth
  //  test with three.js's default LessEqualDepth only lets a fragment
  //  through where its own z matches what the prepass already wrote --
  //  i.e. exactly the lobe that owns that pixel, once. three.js renders
  //  all opaque objects (the prepass) before any transparent one (the
  //  colour pass) regardless of scene order, so this needs no manual
  //  render call and no second scene. At alpha 1 the result is pixel-for
  //  -pixel what the old single-material version drew -- the z-buffer
  //  was already picking one lobe per pixel, just inside one pass instead
  //  of two -- so this only changes anything once the flower is fading.
  var LOBE_RIM = 40;

  function lobe(depthMat, colorMat, z) {
    //  ONE geometry, shared by both meshes -- shape() below writes it
    //  once and both the invisible prepass and the visible colour read
    //  the same vertices, so they can never drift a frame apart.
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array((LOBE_RIM + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var idx = [];
    for (var i = 0; i < LOBE_RIM; i++) { idx.push(0, 1 + i, 1 + (i + 1) % LOBE_RIM); }
    geo.setIndex(idx);
    var depthMesh = new THREE.Mesh(geo, depthMat);
    depthMesh.frustumCulled = false;
    depthMesh.position.z = z;            // a hair apart, or lobe vs lobe z-fights
    var colorMesh = new THREE.Mesh(geo, colorMat);
    colorMesh.frustumCulled = false;
    colorMesh.position.z = z;            // MUST match depthMesh's -- see the note above
    return { depthMesh: depthMesh, colorMesh: colorMesh, geo: geo, pos: pos };
  }

  //  v10.5 -- the optional glyph riding at the flower's own centre.
  //  { tex, spin } -- spin is a fixed extra twist in the local plane, on
  //  top of whatever tilt/cant the caller hangs the whole flower at, so
  //  the icon reads as pinned to the flower at its own small angle
  //  rather than a decal stamped dead level on top of it.
  function blob(seed, w, h, icon) {
    var depthMat = new THREE.MeshBasicMaterial({
      colorWrite: false, side: THREE.DoubleSide
    });
    var colorMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, depthWrite: false
    });
    var group = new THREE.Group();
    var N = 6;
    var lobes = [];
    for (var i = 0; i < N; i++) {
      var L = lobe(depthMat, colorMat, i * 0.0006);
      //  Petals ring a centre, with one lobe sitting in the middle to
      //  fill the well. They have to sit FAR ENOUGH OUT to read as
      //  separate lobes -- pulled in tight they merge into one lump and
      //  the flower turns back into a blob, which is what the first pass
      //  did.
      var a = (i / (N - 1)) * Math.PI * 2 + seed;
      L.cx = i === N - 1 ? 0 : Math.cos(a) * w * 0.46;
      L.cy = i === N - 1 ? 0 : Math.sin(a) * h * 0.46;
      L.r  = (i === N - 1 ? 0.42 : 0.36);
      L.ph = seed * 1.7 + i * 1.9;
      lobes.push(L);
      group.add(L.depthMesh);
      group.add(L.colorMesh);
    }

    //  The glyph sits on the hub lobe, in front of every lobe's own z
    //  stagger, square (not stretched by w/h) since the source PNG
    //  already bakes its own aspect in -- inscribed in the tighter of
    //  the hub's two (elliptical) radii so it never overruns the petal
    //  it is sitting on.
    //
    //  depthTest is OFF, deliberately, and that is not a shortcut -- a
    //  small local +Z offset is not a reliable "in front" once the whole
    //  group is tilted/canted, because which way +Z ends up facing after
    //  that rotation depends on the angles themselves. It happened to
    //  work at accept's tilt/cant and silently discarded the icon's
    //  fragments against the lobes' own depth prepass at delete's --
    //  found by comparing the two flowers side by side, not by reasoning
    //  about the matrices. The icon is a small fixed decal on a control
    //  that is always close and near the top of the scene anyway, so
    //  skipping the depth test (still drawn after every opaque object,
    //  since transparent objects always are) costs nothing worth having.
    var iconMesh = null;
    if (icon && icon.tex) {
      var iconMat = new THREE.MeshBasicMaterial({
        map: icon.tex, color: 0xffffff, transparent: true,
        depthWrite: false, depthTest: false, side: THREE.DoubleSide
      });
      var iconSize = 2 * 0.42 * Math.min(w, h) * (icon.scale || 0.88);
      iconMesh = new THREE.Mesh(new THREE.PlaneGeometry(iconSize, iconSize), iconMat);
      iconMesh.frustumCulled = false;
      iconMesh.renderOrder = 1;            // after the lobes, whatever the z-sort says
      iconMesh.position.z = N * 0.0006 + 0.004;
      iconMesh.rotation.z = icon.spin || 0;
      group.add(iconMesh);
    }

    return {
      mesh: group,
      shape: function (t) {
        for (var i = 0; i < lobes.length; i++) {
          var L = lobes[i], p = L.pos;
          p[0] = L.cx; p[1] = L.cy; p[2] = 0;
          for (var j = 0; j < LOBE_RIM; j++) {
            var a = (j / LOBE_RIM) * Math.PI * 2;
            var r = L.r * (1
              + 0.10 * Math.sin(3 * a + L.ph + t * 0.34)
              + 0.06 * Math.sin(5 * a - L.ph + t * 0.21));
            p[(j + 1) * 3]     = L.cx + Math.cos(a) * r * w;
            p[(j + 1) * 3 + 1] = L.cy + Math.sin(a) * r * h;
            p[(j + 1) * 3 + 2] = 0;
          }
          L.geo.attributes.position.needsUpdate = true;
        }
      },
      setColor: function (hue, lit) {
        colorMat.color.setStyle('hsl(' + hue + ', 100%, ' + lit + '%)');
      },
      //  v8.1 -- the two controls fade right out while the reveal has the
      //  room. They are unusable then anyway (keyboard.js:targets returns
      //  nothing once `done`), so leaving them sitting there was only ever
      //  clutter in front of the one thing worth looking at. Switching
      //  `transparent` on is safe here: they hang at panelR 0.8 m, inside
      //  everything else, with depth test on.
      //
      //  depthMat is deliberately left alone here -- it is a pure depth
      //  prepass and stays "opaque" regardless of the requested fade, the
      //  same as the old single-material version's default depthWrite
      //  (true) already did unconditionally, so this is not a new source
      //  of occlusion, only a correct one.
      setAlpha: function (a) {
        colorMat.transparent = a < 0.999;
        colorMat.opacity = a;
        if (iconMesh) { iconMesh.material.opacity = a; }
        group.visible = a > 0.01;
      },
      dispose: function () {
        for (var i = 0; i < lobes.length; i++) { lobes[i].geo.dispose(); }
        depthMat.dispose();
        colorMat.dispose();
        if (iconMesh) { iconMesh.geometry.dispose(); iconMesh.material.dispose(); }
      }
    };
  }

  //  v10.5 -- the accept/delete glyphs, drawn once and cached. Canvas2D's
  //  `Path2D` takes SVG path data directly, so `icons.js`'s two records
  //  are drawn exactly the way `letterTex` above draws a letter: no
  //  image to load, no decode to race, nothing for a browser's texture
  //  upload to reject (see icons.js's header -- a baked PNG was tried
  //  first, and one of the two failed to upload as a WebGL texture
  //  while decoding correctly everywhere else it was checked).
  //
  //  White, not the source SVGs' black, because both sit on a SATURATED
  //  flower (accept green, delete red) -- the same white-on-colour
  //  treatment a caught letter's own highlight already uses (letterTex's
  //  `hot` mode).
  var ICON_S = 256;
  function drawIcon(rec) {
    var c = document.createElement('canvas');
    c.width = c.height = ICON_S;
    var x = c.getContext('2d');
    var pad = 0.80;                    // fraction of the canvas the glyph fills
    var scale = Math.min(ICON_S * pad / rec.viewW, ICON_S * pad / rec.viewH);
    x.save();
    x.translate((ICON_S - rec.viewW * scale) / 2, (ICON_S - rec.viewH * scale) / 2);
    x.scale(scale, scale);
    x.fillStyle = x.strokeStyle = '#ffffff';
    if (rec.strokeWidth) { x.lineWidth = rec.strokeWidth; }
    for (var i = 0; i < rec.paths.length; i++) {
      var p = new Path2D(rec.paths[i]);
      x.fill(p);
      if (rec.strokeWidth) { x.stroke(p); }
    }
    x.restore();
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }

  var iconTex = {};
  function getIcon(name) {
    if (!iconTex[name]) {
      iconTex[name] = drawIcon(name === 'accept' ? ENTER_ICON : DELETE_ICON);
    }
    return iconTex[name];
  }

  return {
    letter: letter, nameLetter: nameLetter, nameTag: nameTag,
    punchLetter: punchLetter, letterMask: letterMask,
    blob: blob, icon: getIcon,
    //  v8.1: reveal.js builds the wake's glyphs from this. Note its cache
    //  keys on colour and is unbounded -- callers outside the fixed 26 have
    //  to quantise their hue, which reveal.js:setName does.
    letterTex: letterTex
  };
})();
