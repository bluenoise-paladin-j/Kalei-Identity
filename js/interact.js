// ============================================================
//  interact.js  --  reach, highlight, pinch
// ============================================================
//  Three pointers feed one selection model:
//
//    left hand, right hand   from hand-rig (see hands.js)
//    the mouse               so the piece can be driven on a desktop
//
//  A pointer picks in two ways, in this order:
//
//    TOUCH   the index fingertip is inside a target's sphere. Reaching
//            out and putting your finger on a butterfly wins over the
//            ray once it's been there a moment (see ROUND 3's touch
//            dwell below -- a single frame of passing-by proximity no
//            longer counts).
//    POINT   otherwise, a ray from an estimated SHOULDER point through
//            the fingertip (v6.1 -- see below; was knuckle-through-tip
//            in v6). The keyboard is 1.15 m away -- far enough that it
//            reads as butterflies hanging in the room rather than a
//            panel stuck to your face, and further than most people can
//            comfortably reach -- so pointing is the normal case and
//            touching is the bonus.
//
//  "Reach toward a butterfly, it highlights" is satisfied by either.
//
//  ACTIVATION is the pinch EDGE, not the pinch state: the frame the
//  thumb and index close. Two thresholds, not one -- a single distance
//  chatters on and off across it and fires repeatedly.
//
//  Nothing here knows what a target is. It asks its PROVIDERS for
//  spheres and hands back ids.
//
//  v9 -- TWO PROVIDERS, THREE LAYERS. The keyboard is no longer the only
//  thing in the room you can pinch: the collected butterflies orbiting
//  beyond it can be called over (collection.js). So the target list is
//  gathered from every provider that offers one, each target carries the
//  provider that owns it, and activation is routed back there.
//
//  The order they are tested in is a PRIORITY LADDER, and it is the only
//  thing that keeps the two swarms apart:
//
//      panel        the two controls. Fixed, inside everything else.
//      key          the 26 letters, on their low dome at 1.0-2.4 m
//      collection   the kaleidoscope, on its high one above them
//
//  A ray aimed through a letter carries on into the kaleidoscope behind
//  it, and scoring alone cannot separate those: both are inside their own
//  cone, and the far one can easily be nearer the axis. So the near layer
//  wins. Cone geometry is untouched; the same numbers do the same job per
//  layer.
//
//  ...BUT THE KEY LAYER'S VETO IS A MARGIN, NOT AN ABSOLUTE (second pass).
//  Making it absolute made the collection nearly unselectable, because a
//  key's cone is enormous in angular terms -- 20 degrees wide for a big
//  key at 1 m, against a geometric band gap of a fraction of a degree.
//  Any letter drifting anywhere near the line vetoed a butterfly the
//  visitor was aimed squarely at. A key now has to be within
//  CFG.colBeatsKey of the butterfly's own score to keep the pick; a key
//  actually aimed at scores near 0 and cannot be beaten, so spelling is
//  untouched. See config.js:colBeatsKey for the measurements.
//
//  AN EXCLUSIVE PROVIDER (second pass). While a collected butterfly is on
//  its way to the visitor, or with them, `butterfly-collection` reports
//  itself exclusive and NOTHING ELSE IN THE ROOM IS PICKABLE -- not the
//  letters, not accept, not delete. Reaching for a butterfly that is
//  flying at your face means passing your hand through the whole keyboard,
//  and every one of those letters was a live target. The lockout lifts the
//  moment the butterfly turns for home.
//
//  v6.1 -- three things made real hand tracking harder to select with
//  than it needed to be, and all three are fixed here rather than by
//  widening the pick cone (see config.js: the cone is already tuned
//  right up against the point where neighbours start blobbing together):
//
//    THE RAY'S OWN ORIGIN WAS THE NOISE SOURCE. v6 cast from the index
//              knuckle through the fingertip -- a ~3cm baseline, so a
//              few millimetres of finger curl during a pinch swung the
//              aim by tens of degrees. This is exactly what Meta's own
//              hand-pointing model (the ray Quest's system UI casts)
//              avoids: it anchors the ray near the SHOULDER instead,
//              aimed through the hand. A ~60-80cm baseline means the
//              same finger curl swings the aim by a couple of degrees,
//              often less than the pick cone's own slack. `shoulderOf()`
//              below estimates that point each tick from the camera
//              pose (there is no tracked shoulder joint to read).
//    JITTER    hands.js deliberately publishes raw, unfiltered joints, so
//              a hover could still flicker on residual noise even with a
//              stable ray origin. `smAim` is an exponential moving
//              average of the fingertip the ray is aimed through, per
//              hand, used for the POINT pick only -- touch stays on the
//              raw fingertip, and the mouse pointer has no jitter to
//              smooth.
//    THE PINCH ITSELF CAN STILL PERTURB THE PICK, just far less than
//              before. `lastHotId`/`lastHotAt` remember what a hand had
//              hot; a pinch's rising edge with nothing picked that exact
//              frame still activates the remembered target if it was hot
//              within `CFG.pickGraceMs` -- butterflies only, never the
//              two controls (see the grace-window check in tick()).
//
//  The ray line still visually emanates from the fingertip -- only the
//  invisible shoulder anchor moved, not what you see -- and now bends to
//  touch whatever is actually picked instead of just gesturing toward
//  it, and flashes briefly on a catch. All free reads of the same pick
//  data, no new raycasts.
//
//  v6.1 ROUND 2 -- three things remained after the shoulder-ray pass:
//
//    NEIGHBOURS STILL GOT CONFUSED. Butterflies sit ~0.6m apart, so their
//              cones genuinely overlap; a fresh best-score-wins pick each
//              frame flickers between two overlapping candidates on
//              ordinary joint noise. `pickFlySticky()` adds MEMORY --
//              once a hand has a hovered butterfly, a challenger has to
//              clearly beat it or keep winning for a while to steal it,
//              but a target the ray plainly left releases instantly. Cone
//              geometry itself is untouched (see config.js).
//    THE CONTROLS GOT BRUSHED. Their own pick RADIUS, not just the cone's
//              slack, was bigger than a typical butterfly's -- so "the
//              controls win" kept firing on near-misses. `panelPickBase`/
//              `panelTouchRadius` here and a radius shrink in
//              `keyboard.js:targets()` bring a control's total tolerance
//              below a butterfly's, so it only wins when genuinely aimed
//              at. The priority RULE itself is untouched.
//    THE PINCH DIDN'T ALWAYS REGISTER. `rig.pinch` is raw and unsmoothed,
//              and Quest hand tracking is noisiest right as fingers
//              occlude each other -- exactly at a real pinch. `smPinch`
//              (EMA, same technique as `smAim`) plus widening
//              `pinchOn`/`pinchOff` by the same 5mm (preserving the
//              hysteresis gap) address the noise and the threshold fit
//              together -- smoothing alone can't fix a signal that's
//              systematically a little wide at occlusion.
//
//  v6.1 ROUND 3 -- two things remained after round 2:
//
//    THE PINCH STILL SOMETIMES DIDN'T REGISTER. A SINGLE untracked frame
//              used to reset closed/smPinch/pinchInit/lockId/lastHotId
//              unconditionally -- and Quest hand tracking commonly loses
//              confidence for a frame or two exactly as fingers occlude
//              each other, i.e. exactly at a real pinch. None of round
//              2's smoothing runs on an untracked frame at all, so it
//              was structurally blind to this. A dropout under
//              `CFG.trackLossGraceMs` now just holds every value where
//              it was (the line still hides -- honest about not knowing
//              where the hand is) instead of discarding a pinch already
//              in progress; only a genuinely sustained loss still resets.
//              `pinchOn`/`pinchOff` are deliberately NOT widened again --
//              that would make an accidental touch read as a deliberate
//              pinch, working against the next point.
//    STILL TOO EASY TO ACCIDENTALLY SELECT. `pickTouch()` won outright
//              over the stabilised ray on a SINGLE frame of proximity,
//              with no memory -- a hand travelling toward an intended
//              target routinely passes within touch range of unintended
//              neighbours en route. A touch pick now has to hold on the
//              SAME target for `CFG.touchDwellMs` before it can override
//              the ray -- short enough a deliberate touch still feels
//              instant, long enough to filter a pass-through.
// ============================================================
AFRAME.registerComponent('pointer-input', {
  init: function () {
    this._prov = null;
    this._provWant = 0;      // how many providers the DOM actually has
    this.pointers = [
      { kind: 'hand', side: 'left',  closed: false, hover: null, at: new THREE.Vector3(),
        smAim: new THREE.Vector3(), smInit: false,
        lastHotId: null, lastHotAt: -Infinity, flashT: 0,
        lockId: null, lockChallengeId: null, lockChallengeAt: -Infinity,
        smPinch: 0, pinchInit: false,
        trackLostAt: null, touchCandId: null, touchCandSince: -Infinity },
      { kind: 'hand', side: 'right', closed: false, hover: null, at: new THREE.Vector3(),
        smAim: new THREE.Vector3(), smInit: false,
        lastHotId: null, lastHotAt: -Infinity, flashT: 0,
        lockId: null, lockChallengeId: null, lockChallengeAt: -Infinity,
        smPinch: 0, pinchInit: false,
        trackLostAt: null, touchCandId: null, touchCandSince: -Infinity },
      { kind: 'mouse',               click: false,  hover: null, at: new THREE.Vector3() }
    ];

    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._ndc = new THREE.Vector2(0, 0);
    this._ray = new THREE.Raycaster();
    this._mouseIn = false;
    //  v11: when the cursor last actually moved. -Infinity so a cursor
    //  that has never moved is idle from the first frame rather than
    //  pointing at wherever the page happened to open.
    this._mouseMovedAt = -Infinity;

    // shoulder-ray scratch: a per-tick camera read, shared by both hands
    this._camPos = new THREE.Vector3();
    this._camX = new THREE.Vector3();
    this._camY = new THREE.Vector3();
    this._camZ = new THREE.Vector3();

    this.buildRayLines();
    this.bindMouse();
  },

  //  A short line out of each fingertip. Without it there is no way to
  //  tell where you are pointing until something highlights, and on a
  //  headset that is the difference between the keyboard feeling aimed
  //  and feeling random.
  buildRayLines: function () {
    this.lines = [];
    for (var i = 0; i < 2; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var mat = new THREE.LineBasicMaterial({
        color: 0x12121a, transparent: true, opacity: 0.5, depthWrite: false
      });
      var line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.el.sceneEl.object3D.add(line);
      this.lines.push(line);
    }
  },

  bindMouse: function () {
    var self = this;
    // The cursor is read on the PRESS as well as on the move. A press
    // that arrives without a preceding move -- a tap, a synthetic click,
    // a stylus -- would otherwise be tested against wherever the cursor
    // was last seen, which on a fresh page is dead centre.
    function readCursor(e) {
      var r = (self.el.sceneEl.canvas || document.body).getBoundingClientRect();
      self._ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      self._ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      self._mouseIn = true;
      //  v11: called from BOTH mousemove and mousedown, so a click always
      //  wakes the pointer even if the cursor had not moved -- otherwise a
      //  click on an idle pointer would be latched and never picked
      self._mouseMovedAt = (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
    }
    window.addEventListener('mousemove', readCursor);
    //  A click is LATCHED, not sampled. A real click closes and opens
    //  inside a single frame more often than not, so a tick that reads
    //  the button's level sees nothing happen -- the same trap the v2
    //  dev panel hit from the other direction. The latch is consumed by
    //  the next tick, which is also the tick that knows what is under
    //  the cursor.
    window.addEventListener('mousedown', function (e) {
      readCursor(e);
      self.pointers[2].click = true;
    });
  },

  //  The components that own selectable things. Both are A-Frame
  //  components, so both are subject to the trap v2 documented: the
  //  component object exists the moment setAttribute runs, but its init()
  //  is deferred until the entity loads. Test `initialized`, not
  //  existence -- and keep rescanning until BOTH are up rather than
  //  caching the first answer, or whichever loses the race is lost for
  //  the rest of the run.
  providers: function () {
    //  cached only once every provider the DOM has is actually up --
    //  never on an empty scan, which would happen on the first tick if
    //  this ran before the scene's children were parsed and would then
    //  stick for the rest of the run
    if (this._prov && this._provWant > 0 && this._prov.length === this._provWant) { return this._prov; }
    var out = [], want = 0;
    //  v10: THE GUIDE GOES FIRST. gather() takes the first exclusive
    //  provider it finds, and the session guide has to beat the
    //  collection's own lockout -- in idle and farewell the room is the
    //  guide's, whatever a butterfly happens to be doing.
    var pick = ['session-guide', 'butterfly-keyboard', 'butterfly-collection'];
    for (var i = 0; i < pick.length; i++) {
      var el = document.querySelector('[' + pick[i] + ']');
      if (!el) { continue; }
      want++;
      var c = el.components && el.components[pick[i]];
      if (c && c.initialized) { out.push(c); }
    }
    this._provWant = want;
    this._prov = out;
    return out;
  },

  //  EVERYTHING PICKABLE THIS FRAME, as one flat list, each target tagged
  //  with the provider that owns it. Both providers build fresh objects per
  //  call, so writing `owner` onto them is safe and costs nothing.
  //
  //  A PROVIDER MAY CLAIM THE ROOM. `butterfly-collection` does, while a
  //  butterfly is on its way to the visitor or is with them: reaching for
  //  something flying at your face means putting your hand through the
  //  whole keyboard, and the letters, accept and delete were all live
  //  targets on the way through. When a provider is exclusive nothing else
  //  is offered AT ALL -- so nothing else highlights either, and the room
  //  visibly goes quiet rather than silently swallowing pinches.
  //
  //  Its own targets stay live, so a pinch on a different butterfly still
  //  swaps which one is coming: only the letters and the two destructive
  //  controls go away.
  gather: function () {
    var provs = this.providers();
    var out = [], i, j, only = null;
    for (i = 0; i < provs.length; i++) {
      if (provs[i].exclusive && provs[i].exclusive()) { only = provs[i]; break; }
    }
    for (i = 0; i < provs.length; i++) {
      if (only && provs[i] !== only) { continue; }
      var ts = provs[i].targets();
      for (j = 0; j < ts.length; j++) { ts[j].owner = provs[i]; out.push(ts[j]); }
    }
    return out;
  },

  //  Which layer a target belongs to. The keyboard's own targets() is
  //  untouched by v9 -- it is the most-tuned file in the piece -- so its
  //  two kinds are still told apart by the `panel` flag it already sets,
  //  and only the collection labels itself.
  layerOf: function (tg) {
    return tg.layer || (tg.panel ? 'panel' : 'key');
  },

  //  Nearest target to a fingertip, or null. v6.1 round 2: the controls
  //  use their own, tighter radius -- see config.js:panelTouchRadius.
  pickTouch: function (targets, tip) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      var r = this.layerOf(tg) === 'panel' ? CFG.panelTouchRadius : CFG.touchRadius;
      var d = tip.distanceTo(tg.pos);
      if (d < r && d < bestD) { bestD = d; best = tg; }
    }
    return best;
  },

  //  Ray against the target spheres.
  //
  //  The tolerance is a CONE, not a fixed radius. The swarm ranges from
  //  about 1.6 m to 4 m out, and a fixed world radius makes the far half
  //  nearly unhittable while a radius generous enough for those turns
  //  the near ones into one big blob. `pickBase` is the slack close in,
  //  `pickAngle` is how fast it opens with distance.
  //
  //  Scored by how far off the axis the centre is RELATIVE to that
  //  tolerance, so a big slow butterfly does not out-compete a small one
  //  sitting right under the ray.
  //
  //  v6.1 round 2: the controls use their own, tighter slack
  //  (`panelPickBase`) -- their own pick RADIUS is already shrunk in
  //  `keyboard.js:targets()`, and this is the other half of that. Shared
  //  `pickAngle` stays shared: its contribution at the controls' fixed
  //  ~0.8m depth (~0.044m) was never the dominant term either way.
  //
  //  v9: takes a LAYER rather than a panel/not-panel boolean, so the
  //  collection can be tested as its own pass after the keys. Same
  //  arithmetic, same constants -- 'panel' still gets panelPickBase and
  //  everything else still gets pickBase.
  pickRay: function (targets, origin, dir, layer) {
    var best = null, bestScore = Infinity;
    var base = layer === 'panel' ? CFG.panelPickBase : CFG.pickBase;
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (this.layerOf(tg) !== layer) { continue; }
      this._w.copy(tg.pos).sub(origin);
      var along = this._w.dot(dir);
      if (along < 0.05 || along > CFG.rayMax) { continue; }
      var perp2 = this._w.lengthSq() - along * along;
      if (perp2 < 0) { perp2 = 0; }
      var tol = tg.radius + Math.max(base, along * CFG.pickAngle);
      var score = Math.sqrt(perp2) / tol;
      if (score < 1 && score < bestScore) { bestScore = score; best = tg; }
    }
    //  published for keyBeatsCol, which compares the two layers' winners
    //  rather than measuring anything itself
    if (best) { best._score = bestScore; }
    return best;
  },

  //  THE CONTROLS WIN. The two shapes are the only fixed things in the
  //  room and they sit inside the swarm's orbit, so a butterfly drifting
  //  across the green one must not steal the pick -- the visitor would be
  //  unable to finish until it moved on.
  //  v9: three layers, nearest-in-the-room first. The controls win
  //  outright; between the keys and the collection it is a MARGIN -- see
  //  keyBeatsCol() and the header.
  pick: function (targets, origin, dir) {
    var panel = this.pickRay(targets, origin, dir, 'panel');
    if (panel) { return panel; }
    var key = this.pickRay(targets, origin, dir, 'key');
    var col = this.pickRay(targets, origin, dir, 'col');
    return this.keyBeatsCol(key, col) ? key : (col || key);
  },

  //  WHICH OF THE TWO SWARMS GETS THE PICK. The key keeps it unless the
  //  collected butterfly is better aimed at by CFG.colBeatsKey, on the same
  //  0..1 score both were measured with (0 = dead centre of the cone,
  //  1 = its edge). `_score` is written by pickRay/pickFlySticky onto the
  //  target it returns, so nothing is re-measured here.
  //
  //  The two properties this has to have, and does:
  //    - a key the visitor is actually aimed at scores near 0, and no
  //      score can be 0.45 lower than that. Spelling cannot break.
  //    - a butterfly aimed squarely at (say 0.1) beats a letter merely
  //      grazed (0.8), which is the whole complaint.
  keyBeatsCol: function (key, col) {
    if (!key) { return false; }
    if (!col) { return true; }
    return !(col._score < key._score - CFG.colBeatsKey);
  },

  //  HOVER LOCK (v6.1 round 2, butterflies only, hands only). Resolves
  //  ambiguity between two candidates that are BOTH inside their own cone
  //  this frame -- which happens routinely at ~0.6m neighbour spacing --
  //  by favouring whichever the pointer already had, unless a challenger
  //  is either CLEARLY better (beats the lock's score by
  //  `CFG.hoverLockMargin`) or has been the SAME challenger, consistently
  //  better, for `CFG.hoverLockMs` running. A single wobble frame (the
  //  pinch-commit curl, one noisy sample) is protected either way; a
  //  sustained, deliberate re-aim onto a specific neighbour is not held
  //  past that window even if it never quite clears the full margin.
  //
  //  A target the ray has plainly left (score >= 1) is skipped by the
  //  loop below same as `pickRay` -- so `lockTarget` comes back null and
  //  the lock releases with NO delay. The lock only ever resists
  //  switching inside a genuine overlap band, never after a clean miss.
  //
  //  Deliberately a SEPARATE loop from `pickRay`, not a modification of
  //  it: `pickRay` stays exactly what the panel path and the mouse's
  //  `pick()` call, untouched and risk-free by construction.
  pickFlySticky: function (targets, origin, dir, p, now) {
    var best = null, bestScore = Infinity;
    var lockScore = Infinity, lockTarget = null;
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      //  v9: 'key' only, not "anything that is not the panel". The lock
      //  is per-layer by construction -- the collection is picked in its
      //  own later pass and has no lock of its own (it does not need one:
      //  the kaleidoscope holds its butterflies far further apart than
      //  the keyboard's ~0.6 m, so there is no overlap band to resolve).
      if (this.layerOf(tg) !== 'key') { continue; }
      this._w.copy(tg.pos).sub(origin);
      var along = this._w.dot(dir);
      if (along < 0.05 || along > CFG.rayMax) { continue; }
      var perp2 = this._w.lengthSq() - along * along;
      if (perp2 < 0) { perp2 = 0; }
      var tol = tg.radius + Math.max(CFG.pickBase, along * CFG.pickAngle);
      var score = Math.sqrt(perp2) / tol;
      if (score >= 1) { continue; }
      if (score < bestScore) { bestScore = score; best = tg; }
      if (p.lockId && tg.id === p.lockId) { lockScore = score; lockTarget = tg; }
    }

    //  A CHALLENGE ONLY MEANS ANYTHING WHILE IT IS ACTIVE. Whenever the
    //  lock isn't currently being challenged -- no lock target at all, or
    //  the lock is still winning outright -- `lockChallengeId` must be
    //  cleared alongside `lockChallengeAt`, not just the timestamp. Left
    //  stale, a later frame where that same id reappears as `best` sees
    //  `lockChallengeId === best.id` already (so the timer-reset branch
    //  below never fires) while `lockChallengeAt` is still the earlier
    //  `-Infinity` -- and `now - (-Infinity)` is always >= hoverLockMs,
    //  so `sustained` comes back true on a single fresh frame instead of
    //  after a genuine hoverLockMs of consistently losing. (Found by
    //  synthetic testing: a symmetric tie flickered every 5-7 frames
    //  instead of holding, tracing straight back to this.)
    //  every exit publishes the winner's score for keyBeatsCol -- the
    //  lock can hand back a target that was NOT this frame's best, so the
    //  score has to come from whichever one is actually returned
    if (!lockTarget) {
      p.lockId = best ? best.id : null;
      p.lockChallengeId = null;
      p.lockChallengeAt = -Infinity;
      return this._scored(best, bestScore);
    }
    if (best === lockTarget) {
      p.lockChallengeId = null;
      p.lockChallengeAt = -Infinity;
      return this._scored(lockTarget, lockScore);
    }

    if (p.lockChallengeId !== best.id) { p.lockChallengeId = best.id; p.lockChallengeAt = now; }
    var sustained = (now - p.lockChallengeAt) >= CFG.hoverLockMs;
    var clearWin = bestScore < lockScore - CFG.hoverLockMargin;
    if (clearWin || sustained) {
      p.lockId = best.id;
      p.lockChallengeId = null;
      p.lockChallengeAt = -Infinity;
      return this._scored(best, bestScore);
    }
    return this._scored(lockTarget, lockScore);
  },

  _scored: function (tg, score) { if (tg) { tg._score = score; } return tg; },

  //  v6.1 -- an estimated shoulder point for `side`, derived from the
  //  camera pose each tick (there is no tracked shoulder joint). Down by
  //  `CFG.shoulderDown` from the headset, and out by `CFG.shoulderOut`
  //  along the camera's HORIZONTAL right axis -- flattened to the XZ
  //  plane so a shoulder does not swing up or tilt when you look up or
  //  down, the way your actual shoulders do not. Requires `updateCamera()`
  //  to have been called this tick.
  shoulderOf: function (side, out) {
    out.copy(this._camPos);
    out.y -= CFG.shoulderDown;
    out.addScaledVector(this._camX, CFG.shoulderOut * (side === 'left' ? -1 : 1));
    return out;
  },

  //  Camera position and a FLATTENED right axis, read once per tick and
  //  shared by both hands (shoulderOf() just adds a per-side sign).
  //  Flattening (zeroing Y, renormalising) keeps the estimated shoulders
  //  level even if the headset pitches or rolls.
  updateCamera: function () {
    var cam = this.el.sceneEl.camera;
    if (!cam) { return false; }
    cam.updateMatrixWorld();
    cam.getWorldPosition(this._camPos);
    cam.matrixWorld.extractBasis(this._camX, this._camY, this._camZ);
    this._camX.y = 0;
    if (this._camX.lengthSq() < 1e-6) { this._camX.set(1, 0, 0); }  // looking straight up/down
    this._camX.normalize();
    return true;
  },

  tick: function (time, delta) {
    var provs = this.providers();
    if (!provs.length) { return; }
    var targets = this.gather();
    var hot = {}, pi;
    var dt = Math.min(0.1, (delta || 16.7) / 1000);
    var haveCam = this.updateCamera();

    // built once per tick so the grace-window rescue below can look a
    // remembered id back up against LIVE targets, not a stale snapshot
    var targetsById = {};
    for (var t = 0; t < targets.length; t++) { targetsById[targets[t].id] = targets[t]; }

    for (var i = 0; i < this.pointers.length; i++) {
      var p = this.pointers[i];
      var picked = null;
      var closed = false;

      if (p.kind === 'hand') {
        var rig = handRig(p.side);
        var line = this.lines[i];
        if (!rig || !rig.tracked) {
          //  v6.1 round 3 -- TRACKING-LOSS FORGIVENESS. A single untracked
          //  frame used to reset everything below unconditionally, but
          //  Quest hand tracking commonly loses confidence for a frame or
          //  two exactly as fingers occlude each other -- exactly at a
          //  real pinch -- so a pinch genuinely in progress was getting
          //  discarded by this reset before it could complete. The line
          //  still hides immediately (honest about not knowing where the
          //  hand is), but everything else -- closed/smPinch/pinchInit/
          //  lockId/lastHotId/smAim/smInit -- now just holds still through
          //  a brief dropout. Only a dropout that outlasts
          //  CFG.trackLossGraceMs does the original full reset.
          if (line) { line.visible = false; }
          p.hover = null;
          if (p.trackLostAt == null) { p.trackLostAt = time; }
          if (time - p.trackLostAt > CFG.trackLossGraceMs) {
            p.closed = false; p.smInit = false;
            p.lastHotId = null; p.flashT = 0;
            p.lockId = null; p.lockChallengeId = null; p.lockChallengeAt = -Infinity;
            p.pinchInit = false;
            p.touchCandId = null; p.touchCandSince = -Infinity;
          }
          continue;
        }
        p.trackLostAt = null;
        p.at.copy(rig.indexTip);              // capture point stays raw/exact

        //  Smoothing lives here, on the pointer's own state, not in
        //  hands.js -- the raw joint reader stays raw for anything else
        //  that ever reads it. EMA rather than a fixed-N average so it
        //  is frame-rate independent and needs no history buffer. Only
        //  the fingertip needs smoothing now -- the ray's ORIGIN is the
        //  shoulder estimate below, not a second noisy joint.
        if (!p.smInit) {
          p.smAim.copy(rig.indexTip);
          p.smInit = true;
        } else {
          var a = 1 - Math.exp(-dt / CFG.aimSmoothTau);
          p.smAim.lerp(rig.indexTip, a);
        }

        //  THE RAY. Shoulder to (smoothed) fingertip -- a long baseline,
        //  so the finger curl that happens as a pinch closes barely
        //  moves the aim (see the header comment). Falls back to the old
        //  knuckle-anchored origin on the very first tick or two before
        //  the camera pose is available, rather than skipping the pick.
        if (haveCam) { this.shoulderOf(p.side, this._o); }
        else { this._o.copy(rig.indexKnuckle); }
        this._d.copy(p.smAim).sub(this._o).normalize();

        // touch stays on the RAW fingertip; only the ray's aim is smoothed.
        // v6.1 round 2: the panel path (this.pickRay directly) and the
        // butterfly path (pickFlySticky, with hover-lock memory) are kept
        // as two separate calls rather than going through this.pick() --
        // "the controls win" still checks the panel first unconditionally,
        // but the fly pick needs the pointer's own lock state, which
        // this.pick()'s signature has no room for.
        var panelPick = this.pickRay(targets, this._o, this._d, 'panel');
        var flyPick = this.pickFlySticky(targets, this._o, this._d, p, time);
        //  v9: the kaleidoscope, last -- see pick() and the header
        var colPick = this.pickRay(targets, this._o, this._d, 'col');

        //  TOUCH DWELL (v6.1 round 3). pickTouch() itself is untouched --
        //  still the same nearest-within-radius scan -- but it used to win
        //  outright over the ray/hover-lock on a SINGLE frame of
        //  proximity, with no memory at all. A hand travelling through the
        //  swarm toward an intended target routinely passes within touch
        //  range of unintended neighbours en route; any one of those could
        //  instantly steal the pick. Now a touch has to be the SAME
        //  nearest target continuously for CFG.touchDwellMs before it's
        //  allowed to override the ray -- short enough (about half
        //  hoverLockMs) that a deliberate touch-and-hold still feels
        //  instant, long enough to filter a pass-through. Losing touch
        //  range releases the candidate immediately, no dwell on the way
        //  out, matching hover lock's own "plainly left -> no delay" rule.
        var touchRaw = this.pickTouch(targets, rig.indexTip);
        var touchPick = null;
        if (touchRaw) {
          if (p.touchCandId !== touchRaw.id) { p.touchCandId = touchRaw.id; p.touchCandSince = time; }
          if (time - p.touchCandSince >= CFG.touchDwellMs) { touchPick = touchRaw; }
        } else {
          p.touchCandId = null; p.touchCandSince = -Infinity;
        }
        //  same margin the mouse's pick() applies, on the sticky key pick
        picked = touchPick || panelPick ||
                 (this.keyBeatsCol(flyPick, colPick) ? flyPick : (colPick || flyPick));

        //  Pinch smoothing (v6.1 round 2): rig.pinch is raw, and Quest
        //  hand tracking is noisiest right as fingers occlude each other
        //  -- exactly at a real pinch. EMA it the same way smAim damps
        //  the aim, just with a shorter time constant (pinchSmoothTau)
        //  since activation should still feel immediate.
        if (!p.pinchInit) {
          p.smPinch = rig.pinch;
          p.pinchInit = true;
        } else {
          var ap = 1 - Math.exp(-dt / CFG.pinchSmoothTau);
          p.smPinch += (rig.pinch - p.smPinch) * ap;
        }

        // hysteresis: closes at pinchOn, opens again only past pinchOff
        closed = p.closed ? (p.smPinch < CFG.pinchOff) : (p.smPinch < CFG.pinchOn);

        if (picked) { p.lastHotId = picked.id; p.lastHotAt = time; }

        if (line) {
          p.flashT = Math.max(0, p.flashT - dt / CFG.flashTime);
          var baseOp = picked ? 0.85 : 0.35;
          //  THE LINE STILL VISUALLY COMES FROM THE HAND -- only the
          //  invisible ray origin used for picking moved to the shoulder
          //  estimate, not what is drawn. THE LINE CONNECTS: when
          //  something is picked the endpoint is its actual live
          //  position, exactly, not a projection that merely passes near
          //  it -- so what you see is exactly what would activate.
          var end;
          if (picked) {
            end = picked.pos;
          } else {
            end = this._w.copy(this._d).multiplyScalar(0.35).add(rig.indexTip);
          }
          var arr = line.geometry.attributes.position.array;
          arr[0] = rig.indexTip.x; arr[1] = rig.indexTip.y; arr[2] = rig.indexTip.z;
          arr[3] = end.x;          arr[4] = end.y;          arr[5] = end.z;
          line.geometry.attributes.position.needsUpdate = true;
          // a brief opacity pulse on a catch, decaying over flashT -- no
          // new geometry, no glow, just brighter ink for a moment
          line.material.opacity = baseOp + (1 - baseOp) * p.flashT;
          line.visible = true;
        }
      } else {
        // desktop: a ray from the camera through the cursor -- no jitter
        // to smooth, no pinch to be perturbed by, so none of the above
        // applies here
        //
        //  v11 -- A MOTIONLESS CURSOR IS NOT A POINTER, and this is the
        //  whole reason a desktop session would never time out. Unlike a
        //  hand, a cursor does not go away when you stop using it: it sits
        //  where it was left while the swarm keeps flying under it, so it
        //  hovered a fresh butterfly every couple of seconds and every one
        //  of those was read as the visitor being present (guide.js's
        //  setHot). The quiet clock was pinned at zero forever. Measured:
        //  34 s of a parked cursor, quietT never once reached 2 s.
        //
        //  Going idle is exactly what a hand does when you lower it --
        //  hand-tracking stops reporting a pointer, nothing is hovered,
        //  nobody is present. readCursor() above brings it back on the very
        //  next frame from any movement or any click.
        if (!this._mouseIn || this.el.sceneEl.is('vr-mode')) { p.hover = null; continue; }
        if ((time - this._mouseMovedAt) > CFG.mouseIdleMs) { p.hover = null; continue; }
        var cam = this.el.sceneEl.camera;
        if (!cam) { continue; }
        this._ray.setFromCamera(this._ndc, cam);
        this._o.copy(this._ray.ray.origin);
        this._d.copy(this._ray.ray.direction);
        picked = this.pick(targets, this._o, this._d);
        if (picked) { p.at.copy(picked.pos); }
      }

      if (picked) { hot[picked.id] = true; }

      // hands fire on the pinch EDGE; the mouse fires on its latch
      var fire;
      if (p.kind === 'hand') {
        fire = closed && p.closed !== true;
        p.closed = closed;
      } else {
        fire = !!p.click;
        p.click = false;
      }

      //  GRACE WINDOW. Only for hands, only rescuing a butterfly (never a
      //  control -- a wrong accept/delete costs more than a missed
      //  letter), and only if the remembered target is still live this
      //  frame. keyboard.js:activate() re-checks the key's own state
      //  before capturing, so a stale rescue just silently no-ops rather
      //  than double-firing.
      var activated = picked;
      if (fire && !picked && p.kind === 'hand' && p.lastHotId &&
          (time - p.lastHotAt) <= CFG.pickGraceMs) {
        var rescued = targetsById[p.lastHotId];
        if (rescued && !rescued.panel) { activated = rescued; }
      }

      if (fire && activated) {
        //  v10.4. THE ONE PLACE ANYTHING IS EVER SELECTED -- the start
        //  flower, accept, delete, a letter butterfly and a collected
        //  one all arrive here, by mouse and by pinch alike. The click
        //  belongs on this line and nowhere else: put it in the
        //  providers' activate() and it has to be repeated five times
        //  and will be missed on the sixth.
        if (typeof Sfx !== 'undefined') { Sfx.select(); }
        activated.owner.activate(activated.id, p.at);
        if (p.kind === 'hand') { p.flashT = 1; }
      }
      p.hover = picked ? picked.id : null;
    }

    //  Every provider gets the WHOLE hot set. Each one only ever looks up
    //  its own ids in it, so no splitting is needed -- and ids are unique
    //  across providers by construction (the collection prefixes its own
    //  with 'col').
    for (pi = 0; pi < provs.length; pi++) { provs[pi].setHot(hot); }
  }
});
