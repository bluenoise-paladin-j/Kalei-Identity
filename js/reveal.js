// ============================================================
//  reveal.js  --  the room recedes, and the launch leaves a wake
// ============================================================
//  v8.1. Three things that belong to neither the keyboard nor the
//  collection, because both of them read them:
//
//    THE ENVELOPE   Reveal.dim / Reveal.slow. While a visitor's butterfly
//                   is being revealed, everything that is NOT it fades
//                   back and calms down. keyboard.js multiplies its
//                   opacities by `dim` and ceilings its slow field with
//                   `slow`; collection.js does the same for every
//                   butterfly except the hero. Both are exactly 1 outside
//                   a reveal, so with nothing happening this file has no
//                   effect at all and the flight is byte-for-byte v8's.
//
//    THE SHOCK      A one-shot radial impulse published at the launch
//                   instant. Both swarms already carry an `offsetVel`
//                   spring for hand-scatter; the takeoff pushes them with
//                   the same maths, and the same spring reels them back.
//                   No new physics -- see keyboard.js's repulsor loop.
//
//    THE WAKE       The letters the launch sheds. LETTERS and not sparks
//                   for two reasons: everything in this piece is a letter
//                   (the numerals went in v6, the satellites in v6.2), and
//                   there is no post-processing here to make a spark out
//                   of -- see "Flat" in CLAUDE.md. They FALL rather than
//                   rise, because they are ink. And they are shed into
//                   WORLD space and never follow the butterfly, which is
//                   the difference between a wake and a tail.
//
//  Loads after config.js (CFG), ui.js (UI.letterTex) and style.js
//  (Style.forLetter), and BEFORE keyboard.js, which reads Reveal.dim and
//  Reveal.slow every frame.
//
//  A note on the texture cache: UI.letterTex caches on character + mode +
//  COLOUR, unbounded. A per-visitor ink would add 26 canvases per name and
//  never free one -- a real leak over an exhibition run. setName()
//  quantises the hue to HUE_STEPS buckets before building the colour, so
//  the cache is bounded at 26 x HUE_STEPS however many people pass
//  through. Visually you cannot tell.
// ============================================================
var Reveal = (function () {
  'use strict';

  //  The v6.2 lesson: a CFG key the code reads but config.js never
  //  defined multiplies to NaN and renders nothing, invisibly. Fail loud.
  ['revealDim', 'revealSlow', 'revealDimIn', 'revealDimOut',
   'revealShock', 'revealBurst', 'revealTrailGap', 'revealTrailLife',
   'revealTrailFall', 'revealTrailDrag', 'revealTrailSpin',
   'letterAngular', 'letterMin', 'letterMax', 'letterLit'].forEach(function (k) {
    if (CFG[k] === undefined) { console.error('[reveal] CFG.' + k + ' is undefined'); }
  });

  var MAX_TRAIL = 28;        // the whole pool, allocated once and reused forever
  var HUE_STEPS = 24;        // hue buckets -- see the header's note on the cache

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------------- the envelope ----------------
  //  One parameter, p: 0 = the room as it normally is, 1 = fully receded.
  //  It travels toward pTarget at 1/duration per second and both readable
  //  values are shaped off ease(p), so the ends are soft in BOTH
  //  directions and land exactly on 1 / the floor. Down fast, up slow --
  //  the room should recede at once and return gently, or the fade back
  //  reads as a second event.
  var p = 0, pTarget = 0, rate = 1;

  function begin() {
    pTarget = 1;
    rate = 1 / Math.max(0.05, CFG.revealDimIn);
  }

  function release() {
    pTarget = 0;
    rate = 1 / Math.max(0.05, CFG.revealDimOut);
  }

  function tick(dt) {
    if (p !== pTarget) {
      var step = rate * dt;
      if (Math.abs(pTarget - p) <= step) { p = pTarget; }
      else { p += (pTarget > p ? step : -step); }
    }
    var e = ease(p);
    R.dim  = 1 + (CFG.revealDim  - 1) * e;
    R.slow = 1 + (CFG.revealSlow - 1) * e;
    R.active = p > 0;
  }

  // ---------------- the shock ----------------
  //  Published, not pushed. Both swarms watch shockT for a change and
  //  apply the impulse once on the frame it moves, so neither has to know
  //  about the other and the order they tick in does not matter.
  var shockAt = new THREE.Vector3();

  function shock(pos) {
    if (!CFG.revealShock) { return; }
    shockAt.copy(pos);
    R.shockAt = shockAt;
    R.shockT += 1;
  }

  // ---------------- the wake ----------------
  var root = null;           // collection.js's root -- world space, unrotated
  var pool = [];             // MAX_TRAIL sprites, allocated lazily, reused forever
  var next = 0;              // round-robin cursor: the oldest is the one recycled
  var glyphs = [];           // this reveal's letters: { tex, rot }
  var _v = new THREE.Vector3();

  function attach(group) { root = group; }

  //  The glyphs and the ink this reveal will shed. Called from
  //  collection.js:spawn for the hero, with the name it grew from and the
  //  hue its wings were painted around, so the wake is visibly the same
  //  butterfly's and visibly the same name.
  function setName(name, hueDeg) {
    glyphs.length = 0;
    var text = String(name || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!text) { return; }
    //  quantised -- see the header. The ink is the wing's hue at the
    //  letters' own darker lightness, the rule the 26 keys already follow:
    //  a wing is a silhouette and a letter is type.
    var hue = (Math.round((hueDeg || 0) / (360 / HUE_STEPS)) * (360 / HUE_STEPS)) % 360;
    var color = 'hsl(' + hue + ', 100%, ' + CFG.letterLit + '%)';
    for (var i = 0; i < text.length; i++) {
      //  the letter's OWN typographic decisions, so a shed A is set the
      //  way the A in the swarm is set -- angle included, off the same
      //  quantised list (style.js:ANGLES)
      var st = Style.forLetter(text.charCodeAt(i) - 65);
      glyphs.push({ tex: UI.letterTex(text[i], 'name', color, st), rot: st.rot });
    }
  }

  function grow() {
    var mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false });
    var sp = new THREE.Sprite(mat);
    sp.visible = false;
    var rec = {
      sp: sp, mat: mat,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      life: 0, maxLife: 1, k: 1,
      //  v8.2: a shed letter tumbles as it falls. baseRot is the glyph's
      //  own typographic angle (style.js); rot accumulates on top of it
      //  and rotVel bleeds off on the same drag the throw does.
      baseRot: 0, rot: 0, rotVel: 0
    };
    pool.push(rec);
    if (root) { root.add(sp); }
    return rec;
  }

  //  Shed `n` letters at `pos`, thrown along `vel` (which each one varies
  //  around). Silently does nothing before setName has been called or
  //  before there is a group to hang them on.
  function emit(pos, vel, n) {
    if (!root || !glyphs.length) { return; }
    for (var i = 0; i < n; i++) {
      var rec = pool.length < MAX_TRAIL ? grow() : pool[next % pool.length];
      next = (next + 1) % MAX_TRAIL;
      var g = glyphs[Math.floor(Math.random() * glyphs.length)];
      rec.mat.map = g.tex;
      rec.baseRot = g.rot;
      rec.rot = 0;
      rec.rotVel = rnd(-CFG.revealTrailSpin, CFG.revealTrailSpin);
      rec.mat.rotation = g.rot;
      rec.mat.needsUpdate = true;
      rec.pos.copy(pos);
      rec.vel.copy(vel);
      rec.vel.x += rnd(-0.35, 0.35);
      rec.vel.y += rnd(-0.20, 0.20);
      rec.vel.z += rnd(-0.35, 0.35);
      rec.life = 0;
      rec.maxLife = CFG.revealTrailLife * rnd(0.75, 1.25);
      rec.k = rnd(0.55, 1.25);
      rec.sp.visible = true;
    }
  }

  //  Integrate and place. Size is ANGULAR, on the same rule and the same
  //  clamps as the letters under the butterflies, so a shed letter three
  //  metres away is as readable as one at arm's length -- and the wake
  //  matches the swarm's type instead of sitting at its own scale.
  function tickTrail(t, dt, camPos) {
    for (var i = 0; i < pool.length; i++) {
      var rec = pool[i];
      if (!rec.sp.visible) { continue; }
      rec.life += dt;
      if (rec.life >= rec.maxLife) { rec.sp.visible = false; continue; }

      rec.vel.y -= CFG.revealTrailFall * dt;
      rec.vel.multiplyScalar(Math.max(0, 1 - CFG.revealTrailDrag * dt));
      rec.pos.addScaledVector(rec.vel, dt);
      rec.sp.position.copy(rec.pos);

      //  tumble -- same drag as the throw, so it slows as it settles
      rec.rotVel *= Math.max(0, 1 - CFG.revealTrailDrag * dt);
      rec.rot += rec.rotVel * dt;
      rec.mat.rotation = rec.baseRot + rec.rot;

      var dist = camPos ? camPos.distanceTo(rec.pos) : 1.5;
      var h = Math.max(CFG.letterMin, Math.min(CFG.letterMax, dist * CFG.letterAngular)) * rec.k;
      rec.sp.scale.set(h, h, 1);
      //  full for the first breath, then away -- a letter that fades from
      //  the instant it is shed never reads as having been there
      var u = rec.life / rec.maxLife;
      rec.mat.opacity = 0.92 * (1 - ease(clamp01((u - 0.15) / 0.85)));
    }
  }

  function clear() {
    for (var i = 0; i < pool.length; i++) { pool[i].sp.visible = false; }
  }

  var R = {
    dim: 1, slow: 1, active: false,
    shockAt: null, shockT: 0,
    begin: begin, release: release, tick: tick,
    shock: shock,
    attach: attach, setName: setName, emit: emit, tickTrail: tickTrail, clear: clear,
    stats: function () { return { pool: pool.length, glyphs: glyphs.length, p: p }; }
  };
  return R;
})();

//  The room starts receding the moment the name is accepted -- BEFORE the
//  butterfly exists (it is queued, and collection.js builds it on a free
//  frame). That ordering is the point: the butterfly rises into a room
//  that has already gone quiet, rather than one that dims around it.
window.addEventListener('keyboard:accepted', function () { Reveal.begin(); });
