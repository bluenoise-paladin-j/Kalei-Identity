// ============================================================
//  collection.js  --  the kaleidoscope that accumulates
// ============================================================
//  Every visitor's name grows one butterfly (app.js -> DNA.create ->
//  'dna:committed'), and it stays for the rest of the exhibition. The
//  room begins empty and ends as a record of everyone who passed
//  through it. This component owns those butterflies: it flies a new
//  one in when it is committed, and it replays the whole stored
//  collection on load.
//
//  NOT the keyboard. These carry a NAME rather than a letter, they are
//  never captured or spent, and they fly in their own wider, taller shell
//  (CFG.col*) so the kaleidoscope reads as the room around you and the
//  keyboard stays the near, actionable layer in front.
//
//  v9 -- THEY CAN BE CALLED OVER. Until v8.7 these were scenery:
//  targets() did not exist here and interact.js could not see them at
//  all. Now this component is interact.js's second PROVIDER, on its own
//  pick layer behind the keyboard's (see interact.js's header for why
//  that ordering is load-bearing), and a pinch on one starts a four-beat
//  arc that is entirely driven by what the visitor's hands do:
//
//    'summon'  it leaves its orbit and flies to you -- to your PALM if
//              you are holding one out, otherwise to a spot in front of
//              your face. Re-aimed every frame, so putting a hand up
//              mid-flight redirects it.
//    'perch'   it lands on the palm and stays for CFG.perchDwell,
//              following the hand, breathing, fluttering now and then.
//    'hover'   no palm: it holds station in front of you for
//              CFG.hoverDwell, then gives up and goes.
//    'leave'   back out to its own orbit, rejoined at the nearest point
//              on its own ring, and it is scenery again.
//
//  The only rule the visitor has to discover is "hold your hand out".
//  Lowering it, turning it over or closing it ends the perch on the spot
//  -- hands.js:holdOffer decides that, with a release grace so a tracking
//  dropout is not read as a withdrawn hand.
//
//  These four are ORDINARY STATES, exactly like the reveal's eight: they
//  are skipped by separate() (which only ever touches 'orbit'), they are
//  not pickable while they run (targets() offers 'orbit' only), and they
//  all hand back to tickOrbit through the same representation the soar
//  lands on.
//
//  The flight is a simplified port of keyboard.js:tickKey / pathAt /
//  presentRoll / readSources / separate -- no capture states, no
//  slow-field, no per-key clock, no letter. keyboard.js:tickKey is the
//  SOURCE OF TRUTH; a flight bugfix there must be mirrored here. It is
//  copied rather than shared because factoring it out would be surgery
//  on the most-tuned file in the piece, and the two flights genuinely
//  differ. The file-global helpers (makeNoise / makeFbm / smoothstep /
//  rand / UP) are reused from keyboard.js -- this script loads after it.
//
//  A committed entry is ENQUEUED, never built in the event handler:
//  'dna:committed' fires synchronously inside keyboard.js's tick, and
//  generating a wing mid-tick hitches. tick() drains the queue a couple
//  per frame, the way web/js/swarm.js does.
//
//  v8.1 -- THE REVEAL IS EIGHT BEATS, not two. v7.2's `present` and
//  `joining` became arrive / settle / greet / still / coil / launch /
//  soar, ~12.5 s in all. `orbit` is untouched, replayed butterflies still
//  spawn straight into it, and `separate()` needs no change because it
//  already skips anything that is not `orbit`. The two things v7.2 proved
//  are kept exactly: _flatQuat's flat wings-to-visitor pose (aspect ~0.99,
//  which the flight's presentRoll geometrically cannot reach), and the
//  exact soar -> orbit handoff. reveal.js carries the room's dim/slow
//  envelope and the wake of shed letters; this file drives both.
// ============================================================
//  v8.1: the butterfly's own body axis, in model space. bfly-model builds
//  the head along local -X and the wing pivots hinge about X, so a
//  rotation about this is the roll presentRoll already solves for -- and
//  the axis the launch's barrel roll turns about.
var BODY_AXIS = new THREE.Vector3(1, 0, 0);

//  v9: the three states in which a butterfly has been called over and is
//  not scenery. Used to enforce CFG.summonMax and nothing else -- every
//  other "is this butterfly busy" test in the file is already covered by
//  `state !== 'orbit'`.
var SUMMONED = { summon: 1, hover: 1, perch: 1 };

AFRAME.registerComponent('butterfly-collection', {
  init: function () {
    var self = this;

    //  `this.name` on an A-Frame component silently unregisters its own
    //  tick() -- see CLAUDE.md. The collection lives on `this.collected`.
    this.root = new THREE.Group();
    this.el.setObject3D('mesh', this.root);

    this.collected = [];      // built butterflies: { id, bm, tag, group, anchor, phase, ... }
    this.queue = [];          // { entry, fling } waiting for a free frame to be built
    this.sources = [];        // repulsor sources (the hands, the head)
    this.repulsors = [];
    this._camPos = new THREE.Vector3();
    this._camFwd = new THREE.Vector3(0, 0, -1);   // where the visitor is looking
    this._camLevel = new THREE.Vector3(0, 0, -1); // v10.3: the same heading, pitch removed
    this._q = new THREE.Quaternion();
    this._tmp = new THREE.Vector3();
    this._haveCam = false;
    //  scratch for the reveal's orientation (holdPose / tickLaunch / tickSoar)
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._qc = new THREE.Quaternion();
    this._qd = new THREE.Quaternion();            // v8.1: the launch/soar barrel roll
    this._mat = new THREE.Matrix4();
    this._eul = new THREE.Euler();
    this._shock = null; this._shockT = 0;         // v8.1: the launch's one-shot shove
    //  v9: scratch for the summon / perch arc. Kept apart from the
    //  reveal's (_v1.._v3, _qa.._qd) so a stray edit to one beat cannot
    //  quietly corrupt the other.
    this._s1 = new THREE.Vector3();
    this._s2 = new THREE.Vector3();
    this._s3 = new THREE.Vector3();
    this._qs = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();          // the perch pitch, applied in the model's own frame
    this._zAx = new THREE.Vector3(0, 0, 1);     // ...about the wing span axis
    this._msc = new THREE.Matrix4();
    this._now = 0;                                // sim seconds, for summon bookkeeping

    //  v8.1: the wake hangs off the same unrotated root the butterflies
    //  do, so letters are shed into WORLD space and stay where they fell.
    Reveal.attach(this.root);

    //  The v6.2 lesson (see the "config keys drift" note in its
    //  VERSION.md): a CFG key the code reads but config.js never defined
    //  multiplies to NaN and renders nothing, invisibly. Fail loud instead.
    ['maxCollected', 'colRadMin', 'colRadMax', 'colHgtMin', 'colHgtMax',
     'colSizeMin', 'colSizeRange', 'bflySat', 'bflyLit', 'wander',
     'readRoll', 'acceptResetDelay', 'eyeY', 'tagBodyDrop', 'pitchEase',
     'presentDist', 'presentRise', 'presentSize',
     'revealCharge',
     'revealArrive', 'revealSettle', 'revealGreet', 'revealStill',
     'revealCoil', 'revealLaunch', 'revealSoar',
     'revealPopOver', 'revealArriveBurst', 'revealArriveBurstSpd',
     'revealFlapAmp', 'revealFlapRate',
     'revealGreetBeats', 'revealGreetBeat', 'revealGreetAmp', 'revealGreetLift',
     'revealCoilDip', 'revealCoilFlap', 'revealCoilSquash',
     'revealLaunchRise', 'revealLaunchLean', 'revealSpinTurns', 'revealShock',
     'revealTagFade',
     'revealBurst', 'revealTrailGap', 'revealTrailTail',
     'revealJoinLift', 'revealJoinBank', 'revealJoinArc',
     //  v9 -- calling one over
     'colPickRadius', 'colHiScale', 'summonMax',
     'summonSpeed', 'summonSpeedNear', 'summonEase',
     'summonSway', 'summonBob', 'summonSwayRate', 'summonArrive', 'summonGiveUp',
     'hoverDist', 'hoverRise', 'hoverSize', 'hoverDwell',
     'hoverSpanX', 'hoverSpanY', 'hoverSpanZ', 'hoverRate', 'hoverEase', 'hoverSettle',
     'hoverSwayYaw', 'hoverTurn',
     'perchSize', 'perchLift', 'perchLegDrop', 'perchPitch', 'perchFollow', 'perchDwell', 'perchSettle', 'perchRest',
     'perchYawMin', 'perchYawMax',
     'perchFlutterEvery', 'perchFlutterFor', 'perchFlutterAmp',
     'leaveTime', 'leaveLift', 'leaveBank', 'leaveArc'].forEach(function (k) {
      if (CFG[k] === undefined) { console.error('[collection] CFG.' + k + ' is undefined'); }
    });

    //  The collection persists -- replay the newest maxCollected of it,
    //  OLDEST FIRST. tick() drains this a couple per frame so a full room
    //  does not generate every wing in one hitch.
    //
    //  THE ORDER IS LOAD-BEARING and used to be `.reverse()`d. `collected`
    //  is appended to in spawn order, and the cap evicts `collected[0]` --
    //  so spawn order IS eviction order. Replayed newest-first, the room
    //  therefore threw away its NEWEST butterfly every time a name was
    //  added and kept the oldest: with ids 1..13 stored and a cap of 12 it
    //  evicted #2 and held on to #1. Oldest-first makes `collected[0]` the
    //  oldest, which is what the cap has always claimed to remove.
    //
    //  It also keeps the two texture LRUs safe by construction. Wings and
    //  WingColour both RECYCLE a record's canvas and texture in place when
    //  they evict, and a collected butterfly holds those textures directly
    //  -- so a live butterfly reaching the front of either LRU would have
    //  its wings silently redrawn as somebody else's. Spawn order is cache
    //  order, so evicting collected[0] always retires the butterfly whose
    //  textures are furthest from being recycled.
    var want = DNA.sequences().slice(-CFG.maxCollected);
    for (var i = 0; i < want.length; i++) { this.queue.push({ entry: want[i], fling: false }); }

    window.addEventListener('dna:committed', function (e) { self.enqueue(e.detail, true); });
    window.addEventListener('dna:changed', function () { self.rebuild(); });

    //  Repulsor sources, exactly as keyboard.js wires them: the tracked
    //  hands (via hand-rig, since hand-tracking-controls pins its entity
    //  to the origin) and the head. A fast hand scatters the cloud a
    //  little; a slow one does nothing.
    this.el.sceneEl.addEventListener('loaded', function () {
      var sel = ['#handL', '#handR', '[camera]'];
      for (var j = 0; j < sel.length; j++) {
        var n = document.querySelector(sel[j]);
        if (!n) { continue; }
        self.sources.push({
          el: n, isCamera: sel[j] === '[camera]', isHand: sel[j].indexOf('hand') === 1,
          pos: new THREE.Vector3(), prev: new THREE.Vector3(), speed: 0, started: false
        });
      }
    });
  },

  // ---------- the queue ----------
  //  A committed entry -> queued. NEVER build here (see the header):
  //  this runs synchronously inside keyboard.js's tick.
  enqueue: function (entry, fling) {
    if (this.hasId(entry.id)) { return; }
    this.queue.push({ entry: entry, fling: !!fling });
  },

  hasId: function (id) {
    var i;
    for (i = 0; i < this.collected.length; i++) { if (this.collected[i].id === id) { return true; } }
    for (i = 0; i < this.queue.length; i++) { if (this.queue[i].entry.id === id) { return true; } }
    return false;
  },

  //  Storage changed under us -- a DELETE, an import, or (phase 2) a
  //  hydrate from the shared file. Reconcile the scene against the
  //  newest maxCollected, keeping what should stay. Checks `collected`
  //  AND `queue` so an entry mid-flight is not queued twice.
  rebuild: function () {
    var want = DNA.sequences().slice(-CFG.maxCollected);   // oldest first -- see init()
    var wantIds = {}, i;
    for (i = 0; i < want.length; i++) { wantIds[want[i].id] = true; }

    for (i = this.collected.length - 1; i >= 0; i--) {
      if (!wantIds[this.collected[i].id]) { this.removeOne(i); }
    }
    this.queue = this.queue.filter(function (q) { return wantIds[q.entry.id]; });
    for (i = 0; i < want.length; i++) {
      if (!this.hasId(want[i].id)) { this.queue.push({ entry: want[i], fling: false }); }
    }
  },

  // ---------- build one ----------
  spawn: function (entry, fling) {
    var rec = Wings.forDials(DNA.dialsFor(entry));
    //  v8: the per-name procedural base-colour texture. The wings ARE the
    //  texture (white diffuse); the body takes a colour FROM THE WING'S OWN
    //  PALETTE so the two read as one object.
    //
    //  v8.6: `col.css` is that exact colour, used verbatim. It used to be
    //  rebuilt as hsl(col.hue, CFG.bflySat, CFG.bflyLit) -- but bflySat is
    //  100%, and v8.6's palette is deliberately not: an olive or a tan body
    //  came back neon and no longer matched its own wings. wing-colour.js
    //  picks the darkest chromatic member of the wing's set, so the body
    //  still reads as a silhouette against the white sky.
    //
    //  `col.hue` survives as that colour's hue angle -- Reveal.setName
    //  below and the name tag both still want a hue, not a colour.
    var col = WingColour.forEntry(entry);          // { canvas, tex, hue, css } -- WingColour's own LRU
    var hue = Math.floor(col.hue * 360);
    var color = col.css;
    var bm = BflyModel.build(rec.tex, color, undefined, undefined, col.tex);
    //  rec.tex is the wing-shape alphaMap (not srgb-tagged); col.tex is
    //  the RGB colour map (srgb-tagged by wing-colour.js).

    var group = new THREE.Group();
    group.add(bm.model);
    this.root.add(group);

    //  The name hangs off a position-only anchor, never the yaw -- the
    //  flying group turns to face its heading and would swing the name
    //  round the body. Same trick as the keys' letters.
    var anchor = new THREE.Group();
    this.root.add(anchor);
    var tag = null;
    if (entry.name) {
      //  seeded off the stored id: the name keeps its exact wonky layout
      //  across reloads, but two visitors with the same name differ
      tag = UI.nameTag(entry.name, entry.id);
      anchor.add(tag.sprite);
    }

    //  v8.1: the wake this butterfly will shed on the way up -- its own
    //  name, in its own hue. Only the hero sheds anything.
    if (fling) { Reveal.setName(entry.name, hue); }

    var sd = rand(0, 1000);
    var c = {
      id: entry.id, bm: bm, tag: tag, group: group, anchor: anchor,
      //  the SCRIPTED beats (all skipped by separate(), which only ever
      //  touches 'orbit'):
      //    'charge'  v8.2 -- the held breath after ACCEPT. NOTHING visible:
      //              the butterfly is scale 0 / alpha 0 while the room
      //              recedes and the name hangs there. The anticipation.
      //    'arrive'  the BLOOM -- the butterfly scales up from nothing with
      //              an overshoot, wings flinging open, letters bursting out
      //    'settle'  held flat and breathing
      //    'greet'   three deliberate flutters, aimed at the visitor
      //    'still'   nothing moves
      //    'coil'    the dip before the launch
      //    'launch'  the shot upward, rolling, shedding letters
      //    'soar'    out to its orbit, the roll unwinding to zero
      //    'orbit'   the ambient flight (replayed butterflies start here)
      state: fling ? 'charge' : 'orbit',
      stateT: 0,
      //  THE HERO. The one butterfly the reveal is about, and the only
      //  thing in the room that is not dimmed while it is up.
      hero: !!fling,
      //  v8.2: the name stays hidden through the WHOLE reveal and fades in
      //  only once the butterfly is orbiting (tickOrbit). A replayed one is
      //  labelled immediately.
      tagAlpha: fling ? 0 : 1,
      //  v8.2: `arrived` gates the one-shot pop-in setup in tickArrive.
      //  `wasHero` keeps the hero exempt from Reveal.dim until the room has
      //  fully faded back, so it never steps dark at the soar handoff.
      arrived: false, wasHero: false,
      launchFrom: new THREE.Vector3(), launchLean: new THREE.Vector3(),
      spin: 0, spinDir: 1, greetFlap: 0, trailT: 0, launched: false,
      sizeT: Math.random(), radT: Math.random(), hgtT: Math.random(),
      //  a touch slower than the keyboard's cruise -- this is ambient
      speed: (Math.random() < 0.5 ? -1 : 1) * rand(0.10, 0.32),
      phase: rand(0, Math.PI * 2),
      wobAmp: rand(0.035, 0.10), wobFreq: rand(0.018, 0.045),
      radAmp: rand(0.06, 0.20),  radFreq: rand(0.012, 0.036),
      hgtAmp: rand(0.05, 0.16),  hgtFreq: rand(0.010, 0.030),
      flapSpeed: rand(18, 27), flapAmp: rand(0.9, 1.3), flapPh: rand(0, 6.28),
      nWob: makeFbm(sd + 1.1), nRad: makeFbm(sd + 2.2), nHgt: makeFbm(sd + 3.3),
      offset: new THREE.Vector3(), offsetVel: new THREE.Vector3(),
      pathPos: new THREE.Vector3(), pos: new THREE.Vector3(), prev: new THREE.Vector3(),
      presentAt: new THREE.Vector3(), joinFrom: new THREE.Vector3(),
      first: true, smoothRoll: 0, smoothPitch: 0, _joinYaw: 0,
      //  v9 -- being called over. `hot` is the pointer hovering it,
      //  `hotScale` the eased bump that shows it; the rest is the arc.
      hot: false, hotScale: 1,
      summonAt: 0,                    // sim seconds it was called, for the summonMax queue
      summonSide: null,               // the hand it is aiming at, kept while that hand keeps offering
      summonTo: new THREE.Vector3(),
      wingRest: 0,                    // eased dihedral while perched
      perchYaw: 0,                    // drawn fresh on each landing -- see tickSummon
      hoverSide: 1,                   // which side of the visitor it holds broadside to, drawn per summon
      flutterCd: rand(0.4, 2.0), flutterOn: 0,
      leaveFrom: new THREE.Vector3(), leaveInit: false, _leaveYaw: 0,
      flapEnv: 1, gliding: false, cycleT: 1 + Math.random() * 2,
      //  both a committed butterfly (mid-present) and a replayed one fade
      //  and scale up from nothing
      scale: 0.5, alpha: 0
    };
    c.size = CFG.colSizeFor(c.sizeT);
    c.radius = CFG.colRadiusFor(c.radT);
    c.height = CFG.colHeightFor(c.hgtT);
    bm.model.scale.setScalar(c.size * c.scale);

    if (fling) {
      //  the spot in front of the visitor, captured ONCE now so the
      //  butterfly rises to a fixed point rather than chasing the head
      this.presentPoint(c.presentAt);
      c.pos.copy(c.presentAt);                        // v8.2: it BLOOMS here after `charge` -- no rise
      c.scale = 0;                                    // v8.2: invisible through `charge`; `arrive` scales it up from nothing
      Reveal.begin();                                // idempotent; 'keyboard:accepted' normally started it already
    } else {
      //  replayed: straight onto its orbit
      this.pathAt(c, 0, c.pos);
    }
    c.prev.copy(c.pos);
    c.group.position.copy(c.pos);
    c.anchor.position.copy(c.pos);

    this.collected.push(c);
    //  over the cap: evict the OLDEST from the scene, keep its record in
    //  storage -- it comes back on reload or if the cap is raised.
    //  collected[0] is the oldest because the queue is built oldest-first
    //  and nothing is ever inserted anywhere but the end. See init().
    while (this.collected.length > CFG.maxCollected) { this.removeOne(0); }
  },

  removeOne: function (i) {
    var c = this.collected[i];
    if (!c) { return; }
    //  If the hero goes before it reaches its orbit -- evicted by the cap,
    //  or a DELETE landing mid-reveal -- nothing else would ever call
    //  release(), and the room would stay dim for the rest of the run.
    if (c.hero) { c.hero = false; Reveal.release(); }
    this.root.remove(c.group);
    this.root.remove(c.anchor);
    c.bm.dispose();                 // geo + materials; the wing texture belongs to Wings
    if (c.tag) { c.tag.dispose(); } // material only; the tag texture stays cached
    this.collected.splice(i, 1);
  },

  // ---------- per frame ----------
  tick: function (time, dtMs) {
    if (!dtMs) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var t = time / 1000;
    var i;
    this._now = t;                    // v9: summonAt is quoted in this clock

    var cam = this.el.sceneEl.camera;
    this._haveCam = !!cam;
    if (cam) {
      cam.getWorldPosition(this._camPos);
      cam.getWorldQuaternion(this._q);
      this._camFwd.set(0, 0, -1).applyQuaternion(this._q);   // the look direction, unambiguously
      //  v10.3: the heading with the PITCH taken out -- what the reveal
      //  is hung on, see presentPoint(). Looking straight up or straight
      //  down leaves no horizontal component at all, and there the
      //  camera's own up vector IS the heading (up-ended forward), which
      //  keeps it continuous instead of snapping to -Z.
      this._camLevel.set(this._camFwd.x, 0, this._camFwd.z);
      if (this._camLevel.lengthSq() < 1e-6) {
        this._camLevel.set(0, 1, 0).applyQuaternion(this._q);
        this._camLevel.y = 0;
        this._camLevel.multiplyScalar(this._camFwd.y > 0 ? -1 : 1);
      }
      if (this._camLevel.lengthSq() < 1e-6) { this._camLevel.set(0, 0, -1); }
      this._camLevel.normalize();
    }

    //  build a couple of queued butterflies per frame -- WingGen.drawWing
    //  is a few ms and doing a roomful in one frame hitches
    var budget = 2;
    while (this.queue.length && budget-- > 0) {
      var q = this.queue.shift();
      if (!this.hasId(q.entry.id)) { this.spawn(q.entry, q.fling); }
    }

    //  v8.1: the room's dim/slow envelope, and the wake. Reveal.dim and
    //  Reveal.slow are exactly 1 outside a reveal, so with nothing
    //  happening this costs a couple of adds and changes nothing.
    Reveal.tick(dt);

    //  The launch publishes one radial impulse; both swarms watch shockT
    //  and apply it on the frame it moves, so neither has to know about
    //  the other and the order they tick in does not matter.
    if (Reveal.shockT !== this._shockT) { this._shockT = Reveal.shockT; this._shock = Reveal.shockAt; }
    else { this._shock = null; }

    this.readSources(dt);
    for (i = 0; i < this.collected.length; i++) { this.tickOne(this.collected[i], t, dt); }
    this.separate(dt);
    Reveal.tickTrail(t, dt, this._haveCam ? this._camPos : null);
  },

  //  Where the hands and the head are, and how fast. Verbatim from
  //  keyboard.js:readSources -- hand-tracking-controls pins its entity
  //  to the origin, so a hand's position comes from hand-rig.point.
  readSources: function (dt) {
    this.repulsors.length = 0;
    for (var i = 0; i < this.sources.length; i++) {
      var s = this.sources[i];
      var obj;
      if (s.isHand) {
        var rig = s.el.components && s.el.components['hand-rig'];
        obj = rig && rig.tracked ? rig.point : null;
      } else {
        obj = s.el.object3D;
      }
      if (!obj) { s.started = false; continue; }
      obj.getWorldPosition(s.pos);
      if (!s.started) {
        if (s.pos.lengthSq() > 1e-6) { s.started = true; s.prev.copy(s.pos); }
        continue;
      }
      s.speed = s.pos.distanceTo(s.prev) / dt;
      s.prev.copy(s.pos);
      this.repulsors.push({ pos: s.pos, speed: s.isCamera ? s.speed * 0.7 : s.speed });
    }
  },

  //  keyboard.js:pathAt, minus the partial-arc branch -- the collection
  //  is always a full circle around the visitor whatever CFG.arcSpan
  //  does to the keyboard, so k.centre / k.swing are not needed and the
  //  arcSpan-NaN hazard cannot reach here.
  pathAt: function (c, t, out) {
    var wa = CFG.wander;
    var theta = c.phase + c.speed * t;
    theta += c.wobAmp * wa * c.nWob(t * c.wobFreq);
    var r = Math.max(1.2, c.radius + c.radAmp * wa * c.nRad(t * c.radFreq));
    var y = Math.max(0.40, c.height + c.hgtAmp * wa * c.nHgt(t * c.hgtFreq));
    out.set(r * Math.cos(theta), y, r * Math.sin(theta));
    return out;
  },

  //  EIGHT beats. The first seven are scripted; 'orbit' is the ambient
  //  flight, and where a butterfly spends the rest of its life. The five
  //  HELD beats (arrive..coil) all share holdPose below -- they differ
  //  only in how the wings are set, how far the body sits off the held
  //  spot, and what size it is being drawn at.
  tickOne: function (c, t, dt) {
    switch (c.state) {
      case 'charge': this.tickCharge(c, t, dt); return;
      case 'arrive': this.tickArrive(c, t, dt); return;
      case 'settle': this.tickSettle(c, t, dt); return;
      case 'greet':  this.tickGreet(c, t, dt);  return;
      case 'still':  this.tickStill(c, t, dt);  return;
      case 'coil':   this.tickCoil(c, t, dt);   return;
      case 'launch': this.tickLaunch(c, t, dt); return;
      case 'soar':   this.tickSoar(c, t, dt);   return;
      //  v9 -- called over by the visitor. See the header.
      case 'summon': this.tickSummon(c, t, dt); return;
      case 'hover':  this.tickHover(c, t, dt);  return;
      case 'perch':  this.tickPerch(c, t, dt);  return;
      case 'leave':  this.tickLeave(c, t, dt);  return;
      default:       this.tickOrbit(c, t, dt);
    }
  },

  toState: function (c, name) { c.state = name; c.stateT = 0; },

  //  dress the mesh + place the tag -- shared by all eight states.
  //  v7.1: the name sits RIGHT under the body, tight against it. The
  //  wing/body planes carry a lot of transparent margin, so the drop
  //  point is CFG.tagBodyDrop (where the painted shape actually reaches,
  //  per unit model size) scaled by the butterfly's current size --
  //  NOT the plane's geometric edge. UI.nameTag then lands the name's
  //  own visible top on that point.
  //
  //  v8.1: everything that is not the hero is multiplied by Reveal.dim
  //  while a reveal is running. `visible` deliberately still tests the
  //  UNDIMMED alpha -- gating it on the dimmed one would pop the whole
  //  room off and back on as the envelope crosses 0.01.
  render: function (c) {
    //  v9: the highlight. The keys invert their letter and bump their
    //  scale (keyboard.js:dress); a collected butterfly has no letter to
    //  invert, so it is the bump alone -- eased, because these are big
    //  and a hard step in scale at 3 m reads as a glitch rather than as
    //  feedback. Same easing rate the keys use.
    c.hotScale += ((c.hot ? CFG.colHiScale : 1) - c.hotScale) * 0.18;
    var s = c.size * c.scale * c.hotScale;
    //  v8.2: `wasHero` holds the just-joined hero at full brightness until
    //  the room has finished fading back up around it (Reveal.active goes
    //  false when the envelope has fully released).
    if (c.wasHero && !Reveal.active) { c.wasHero = false; }
    var dim = (c.hero || c.wasHero) ? 1 : Reveal.dim;
    c.bm.model.scale.setScalar(s);
    c.bm.setOpacity(c.alpha * dim);
    c.group.visible = c.alpha > 0.01;
    c.anchor.visible = c.group.visible;
    c.anchor.position.copy(c.pos);                  // position only, never the yaw
    c.group.position.copy(c.pos);
    if (c.tag && this._haveCam) {
      c.tag.place(this._camPos, c.pos, CFG.tagBodyDrop * s, c.tagAlpha * dim);
    }
  },

  //  WHERE THE HERO IS PRESENTED. Head-tracked in YAW only, on the
  //  visitor's own eye line but never below the scene's.
  //
  //  v10.3 -- THE NAME USED TO CUT THROUGH THE BUTTERFLY. This was
  //  camPos + camFwd * presentDist: the full GAZE vector. But the name the
  //  visitor spelled hangs at a fixed world point (keyboard.js's nameGroup,
  //  at CFG.panelPos(nameX, nameY)) and stays there for the whole reveal --
  //  it only flies apart on 'reveal:launch'. So the two were never in the
  //  same frame, and looking down walked one into the other. Driven in the
  //  running scene at a 0.30 rad look-down, which is just looking AT the
  //  name you have spelled: the present spot fell from y 1.66 to 1.35, and
  //  ROSALIND came out written straight across the wings.
  //
  //  Both halves of the fix earn their place:
  //
  //    the LEVEL heading (_camLevel, pitch removed) so head pitch cannot
  //    move the butterfly down the gaze at all; and
  //
  //    a FLOOR on the height, because pitch is not the only way in. The
  //    height wants to be the visitor's own eye line -- that is the
  //    framing the beat was built for and a tall visitor should not have
  //    their butterfly presented at their chest. But a visitor whose eyes
  //    are below about 1.50 m -- a child, or anyone sitting -- walks it
  //    down onto a name that does not follow them either. So it rides the
  //    visitor's eye line and never goes below the SCENE's: everything
  //    else fixed in front of the visitor (the name, the two controls,
  //    the flower) is hung off CFG.eyeY, so CFG.eyeY + presentRise is
  //    exactly the height already known to clear all of them.
  //
  //  Pinning it to CFG.eyeY outright was tried first and is worse: a short
  //  visitor looking down then loses the butterfly off the top of the view
  //  entirely, which is a worse failure than the one being fixed. The floor
  //  costs them nothing -- at 1.36 m eyes it sits 21 degrees up at 0.8 m,
  //  well inside any headset's field of view, and clear of the name.
  //
  //  YAW is still followed, and that is the part worth keeping: a visitor
  //  who has turned away from the panel still gets the bloom in front of
  //  their face rather than behind their shoulder.
  //
  //  hoverPoint() has the same shape and the same latent problem, and is
  //  deliberately left alone -- see the note there.
  presentPoint: function (out) {
    if (this._haveCam) {
      out.copy(this._camPos).addScaledVector(this._camLevel, CFG.presentDist);
      out.y = Math.max(this._camPos.y, CFG.eyeY) + CFG.presentRise;
    } else {
      out.set(0, CFG.eyeY + CFG.presentRise, -CFG.presentDist);
    }
    return out;
  },

  //  THE HELD POSE, shared by arrive / settle / greet / still / coil.
  //  Verbatim v7.2 apart from the arguments: the butterfly hovers in a
  //  spot in front of the visitor, following the head on a slow lag so it
  //  stays in view, FLAT -- wings square to them like a pinned specimen.
  //
  //  The flight's presentRoll cannot do this. It only ever presents a
  //  three-quarter aspect, because there the butterfly is yawed to face
  //  the visitor, the body axis points at them, and the wing plane (which
  //  contains that axis) can never face them -- measured in the running
  //  scene, the aspect never tops ~0.18 at any roll. So the group carries
  //  NO yaw here and _flatQuat builds the model's orientation directly.
  //  Measured aspect while held: ~0.99. Do not route this through
  //  presentRoll.
  //
  //    dy         metres off the held spot (the coil's dip)
  //    flap       wing angle, passed straight to bm.flap
  //    scaleTo    the size it is easing toward
  //    bob        0..1 on the gentle hover bob -- `still` passes 0
  //    scaleHard  v8.2: if given, the scale is SET to this (the arrival's
  //               overshoot pop) instead of eased toward scaleTo
  holdPose: function (c, t, dt, dy, flap, scaleTo, bob, scaleHard) {
    //  the live spot in front of the visitor; presentAt eases toward it
    if (this._haveCam) {
      c.presentAt.lerp(this.presentPoint(this._tmp), Math.min(1, dt / 0.5));
    }
    this._tmp.copy(c.presentAt);
    this._tmp.y += dy;
    c.pos.lerp(this._tmp, Math.min(1, dt / 0.12));
    c.pos.y += bob * 0.012 * Math.sin(t * 2.1 + c.flapPh);

    //  flat to the visitor. The group carries NO yaw here; the model takes
    //  the look-at orientation directly, slerped in as it rises.
    c.group.rotation.set(0, 0, 0);
    c.bm.model.quaternion.slerp(this._flatQuat(c, this._qa), Math.min(1, dt / 0.22));
    c.bm.flap(flap);

    c.alpha += (1 - c.alpha) * 0.14;
    if (scaleHard !== undefined) { c.scale = scaleHard; }
    else { c.scale += (scaleTo - c.scale) * 0.12; }
    this.render(c);
    c.prev.copy(c.pos);
  },

  //  The slow shallow breath of the held beats. bm.flap's two pivots
  //  mirror, so the wing tips rise and fall TOGETHER -- it reads as the
  //  wings easing open and shut a little, not as a wingbeat.
  breath: function (c, t) {
    return Math.sin(t * CFG.revealFlapRate + c.flapPh) * CFG.revealFlapAmp;
  },

  //  A world-space quaternion for the model (with the group unrotated)
  //  that lays the wing plane square to the camera: local +Y (the wing
  //  normal) -> the camera, local +X (the head) -> DOWN. Used by the
  //  reveal. Head-down, not head-up: the wing slice is drawn with the
  //  forewing above the seam, and the plane's UVs put that at local -X,
  //  so pointing the head up renders the butterfly upside down.
  _flatQuat: function (c, out) {
    var toCam = this._v1;
    if (this._haveCam) { toCam.copy(this._camPos).sub(c.pos); } else { toCam.set(0, 0, 1); }
    if (toCam.lengthSq() < 1e-8) { toCam.set(0, 0, 1); }
    toCam.normalize();
    var headX = this._v2.set(0, -1, 0);
    headX.addScaledVector(toCam, -headX.dot(toCam));      // project head onto the plane facing the camera
    if (headX.lengthSq() < 1e-6) { headX.set(1, 0, 0); }  // camera dead above / below
    headX.normalize();
    var zA = this._v3.crossVectors(headX, toCam).normalize();
    this._mat.makeBasis(headX, toCam, zA);
    return out.setFromRotationMatrix(this._mat);
  },

  //  0. CHARGE -- v8.2. The held breath between ACCEPT and the reveal. The
  //  butterfly does NOT appear -- it is at scale 0, alpha 0, group hidden.
  //  The anticipation is carried entirely by the room going quiet and the
  //  name still hanging in front of the visitor where they spelled it;
  //  nothing new is on screen until the bloom. It tracks the spot in front
  //  of the visitor (so the bloom lands where they are looking) and holds
  //  the model pre-oriented flat, so the first VISIBLE frame is already
  //  face-on.
  tickCharge: function (c, t, dt) {
    c.stateT += dt;
    if (this._haveCam) {
      c.presentAt.lerp(this.presentPoint(this._tmp), Math.min(1, dt / 0.5));
    }
    c.pos.copy(c.presentAt);
    c.group.rotation.set(0, 0, 0);
    c.bm.model.quaternion.copy(this._flatQuat(c, this._qa));
    c.bm.flap(CFG.revealCoilFlap);          // wings loaded, ready to fling open on the bloom
    c.alpha = 0;
    c.scale = 0;
    this.render(c);                         // alpha 0 -> group.visible false
    c.prev.copy(c.pos);
    if (c.stateT >= CFG.revealCharge) { this.toState(c, 'arrive'); }
  },

  //  1. ARRIVE -- the BLOOM. v8.2: the butterfly was invisible through the
  //  whole of `charge`; now it appears here, scaling up FROM NOTHING -- past
  //  its held size on a half-sine overshoot and settling back onto it -- its
  //  wings flinging open out of the loaded pose, and a ring of the visitor's
  //  own letters bursting outward. Then straight into the flat breathing
  //  hold.
  tickArrive: function (c, t, dt) {
    var target = CFG.presentSize / c.size;
    if (!c.arrived) {
      c.arrived = true;
      c.pos.copy(c.presentAt);
      c.prev.copy(c.pos);
      //  the burst -- the visitor's own name, thrown outward, then it
      //  falls and fades on reveal.js's wake pool (already primed by
      //  Reveal.setName in spawn())
      for (var i = 0; i < CFG.revealArriveBurst; i++) {
        var a = (i / CFG.revealArriveBurst) * Math.PI * 2 + Math.random() * 0.5;
        var spd = CFG.revealArriveBurstSpd * (0.7 + Math.random() * 0.6);
        this._tmp.set(Math.cos(a) * spd, (Math.random() - 0.35) * spd, Math.sin(a) * spd);
        Reveal.emit(c.presentAt, this._tmp, 1);
      }
    }
    c.stateT += dt;
    var u = Math.min(1, c.stateT / CFG.revealArrive);
    //  scale = a smooth climb from 0 to 1 (smoothstep), PLUS a half-sine
    //  overshoot hump (revealPopOver) that peaks mid-beat and is exactly 0
    //  at u=1, so it lands cleanly on `target` however big the hump is.
    var k = smoothstep(u) + CFG.revealPopOver * Math.sin(Math.PI * u);
    this.holdPose(c, t, dt, 0, this.breath(c, t), target, 1, target * k);
    if (c.stateT >= CFG.revealArrive) { this.toState(c, 'settle'); }
  },

  //  2. SETTLE -- held flat, breathing. v8.2: the name stays hidden the
  //  whole time; it only fades in once the butterfly is orbiting.
  tickSettle: function (c, t, dt) {
    c.stateT += dt;
    this.holdPose(c, t, dt, 0, this.breath(c, t), CFG.presentSize / c.size, 1);
    if (c.stateT >= CFG.revealSettle) { this.toState(c, 'greet'); }
  },

  //  3. GREET -- three deliberate deep flutters, aimed at the visitor.
  //  Each beat moves for revealGreetBeat of its slot and then HOLDS; the
  //  pause is the whole thing. Without it, three flutters in a row are
  //  just a faster breath and the gesture disappears.
  //
  //  The sweep is negative because negative is wings-UP in bm.flap's
  //  convention (the glide pose is -1.0), so from the flat pose the wings
  //  rise toward each other and toward the viewer -- and the coil, which
  //  goes further the same way, follows on without a change of direction.
  tickGreet: function (c, t, dt) {
    c.stateT += dt;
    var slot = CFG.revealGreet / CFG.revealGreetBeats;
    var into = c.stateT % slot;
    var env = 0;
    if (c.stateT < CFG.revealGreet && into < CFG.revealGreetBeat) {
      //  one up-and-back sweep, starting and ending at rest so it joins
      //  the breath with no step at either end
      env = 0.5 - 0.5 * Math.cos((into / CFG.revealGreetBeat) * Math.PI * 2);
    }
    var flap = this.breath(c, t) - env * CFG.revealGreetAmp;
    //  and it lifts a little as it gestures -- a couple of centimetres,
    //  enough to read as the whole butterfly moving, not just its wings
    this.holdPose(c, t, dt, env * CFG.revealGreetLift, flap, CFG.presentSize / c.size, 1);
    if (c.stateT >= CFG.revealGreet) { c.greetFlap = flap; this.toState(c, 'still'); }
  },

  //  4. STILL -- nothing moves. In a scene where every object is always
  //  in motion this is the loudest device available, and it is what stops
  //  the launch reading as a lerp. The wings come to REST rather than
  //  snapping there (a step of the breath's own amplitude would be a pop,
  //  and settling into stillness is the right reading anyway); the bob is
  //  off outright. It still tracks the held spot, so a visitor who moves
  //  their head does not lose it.
  tickStill: function (c, t, dt) {
    c.stateT += dt;
    c.greetFlap += (0 - c.greetFlap) * Math.min(1, dt / 0.25);
    this.holdPose(c, t, dt, 0, c.greetFlap, CFG.presentSize / c.size, 0);
    if (c.stateT >= CFG.revealStill) { this.toState(c, 'coil'); }
  },

  //  5. COIL -- anticipation. It goes down before it goes up, the wings
  //  draw up into a loaded pose, and it contracts a little. All three are
  //  small: overdone this reads as a flinch rather than a gathering.
  tickCoil: function (c, t, dt) {
    c.stateT += dt;
    var e = smoothstep(Math.min(1, c.stateT / CFG.revealCoil));
    c.greetFlap += (CFG.revealCoilFlap - c.greetFlap) * Math.min(1, dt / 0.18);
    var scaleTo = (CFG.presentSize / c.size) * (1 - (1 - CFG.revealCoilSquash) * e);
    this.holdPose(c, t, dt, -CFG.revealCoilDip * e, c.greetFlap, scaleTo, 0);

    if (c.stateT >= CFG.revealCoil) {
      c.launchFrom.copy(c.pos);
      c._joinYaw = 0;                     // group yaw at handoff; eases up to the travel heading
      c.spinDir = c.speed >= 0 ? 1 : -1;  // roll the way it already turns, like the bank
      this.aimJoin(c, t);                 // bias its orbit slot into the forward view
      //  which way to lean on the way up, so `soar` does not start from a
      //  standstill: toward where it will BE when soar ends, flattened.
      this.pathAt(c, t + CFG.revealLaunch + CFG.revealSoar, c.pathPos);
      c.launchLean.set(c.pathPos.x - c.pos.x, 0, c.pathPos.z - c.pos.z);
      if (c.launchLean.lengthSq() > 1e-6) { c.launchLean.normalize(); }
      this.toState(c, 'launch');
    }
  },

  //  6. LAUNCH -- a hard downstroke out of the coil and it goes.
  //
  //  Vertical dominates and is FRONT-LOADED (ease-out quint: most of the
  //  rise inside the first third), which is the difference between a shot
  //  and a ride. Horizontal barely moves; soar does that. The barrel roll
  //  turns about the body axis, which flashes the wings edge-on twice a
  //  turn -- at this speed that reads as a tumble, and it is unwinding
  //  from its fastest the whole way (see spinAt).
  tickLaunch: function (c, t, dt) {
    if (!c.launched) {
      c.launched = true;
      //  Everything that happens at the instant of takeoff, on one frame:
      //  the room is shoved outward, a burst of letters is thrown off, and
      //  the caught name hanging in front of the visitor flies apart
      //  (keyboard.js listens for this). Their name is in two places at
      //  that moment; one of them leaves, and the one on the butterfly
      //  stays. That is the whole idea of the piece in one movement.
      Reveal.shock(c.pos);
      for (var i = 0; i < CFG.revealBurst; i++) {
        var a = (i / CFG.revealBurst) * Math.PI * 2;
        this._tmp.set(Math.cos(a) * 1.05, -0.30, Math.sin(a) * 1.05);
        Reveal.emit(c.pos, this._tmp, 1);
      }
      window.dispatchEvent(new CustomEvent('reveal:launch'));
      c.trailT = 0;
    }

    c.stateT += dt;
    var u = Math.min(1, c.stateT / CFG.revealLaunch);
    var eV = 1 - Math.pow(1 - u, 5);        // ease-out quint -- the shot
    var eH = u * u;                         // ease-in -- the lean, late

    c.pos.set(c.launchFrom.x + c.launchLean.x * CFG.revealLaunchLean * eH,
              c.launchFrom.y + CFG.revealLaunchRise * eV,
              c.launchFrom.z + c.launchLean.z * CFG.revealLaunchLean * eH);

    //  The beat, phased so the FIRST movement is a downstroke: sin is at
    //  its minimum (wings up, where the coil left them) at fp = -PI/2, and
    //  rising from there. Blended out of the coil pose over a moment so
    //  there is no step -- both are travelling the same way, so it does
    //  not show.
    var fp = -Math.PI / 2 + c.stateT * c.flapSpeed * (0.6 + 0.4 * u);
    var beat = Math.sin(fp) * c.flapAmp - 0.5;
    var w = Math.min(1, c.stateT / 0.12);
    c.bm.flap(c.greetFlap + (beat - c.greetFlap) * w);

    c.spin = this.spinAt(c, c.stateT);
    c.group.rotation.set(0, 0, 0);
    this._qd.setFromAxisAngle(BODY_AXIS, c.spin);
    c.bm.model.quaternion.copy(this._flatQuat(c, this._qa)).multiply(this._qd);

    c.scale += (1 - c.scale) * 0.06;        // -> its real orbit size, started early
    c.alpha += (1 - c.alpha) * 0.1;
    this.render(c);
    this.shed(c, dt);
    c.prev.copy(c.pos);

    if (u >= 1) { c.joinFrom.copy(c.pos); this.toState(c, 'soar'); }
  },

  //  THE BARREL ROLL, as one curve across launch + soar. Two properties
  //  the reveal depends on, and one constraint that is easy to break:
  //
  //  - It accumulates from ZERO, so there is no step at the instant of
  //    takeoff. (An earlier pass had the angle DECAY from its total to 0
  //    instead: same speed profile, but the first frame of the launch
  //    snapped the butterfly through most of a turn.)
  //  - The rate is 1 - (1-x)^3, not smoothstep: cubed is fastest at the
  //    instant of takeoff and eases to a standstill as it meets its
  //    orbit. Smoothstep would start it FROM a standstill, which is
  //    backwards for a launch. ~87% of the roll is done by the halfway
  //    point, so it tumbles up and then settles.
  //  - CFG.revealSpinTurns MUST BE A WHOLE NUMBER. The total lands on the
  //    model as a roll of turns x 2PI, which is the identity quaternion
  //    only if `turns` is an integer -- and tickSoar's u = 1 handoff
  //    writes model.rotation.set(rhoT, 0, 0) on the assumption that it
  //    is. At 1.5 the butterfly would meet its orbit upside down.
  //
  //  Signed by the orbit direction, like the bank, so the roll agrees
  //  with the way it is already turning.
  spinAt: function (c, elapsed) {
    var span = CFG.revealLaunch + CFG.revealSoar;
    var x = Math.max(0, 1 - Math.min(1, elapsed / span));
    return c.spinDir * CFG.revealSpinTurns * Math.PI * 2 * (1 - x * x * x);
  },

  //  THE WAKE. One letter every revealTrailGap, shed where the butterfly
  //  is now and carrying a tenth of its velocity -- enough to be dragged
  //  a little, not enough to follow. From there they sink and fade on
  //  their own (reveal.js). A `while` rather than an `if` so a long frame
  //  sheds the letters it owes instead of quietly thinning the trail.
  shed: function (c, dt) {
    c.trailT += dt;
    if (c.trailT < CFG.revealTrailGap) { return; }
    var inv = 0.10 / Math.max(dt, 1e-4);
    while (c.trailT >= CFG.revealTrailGap) {
      c.trailT -= CFG.revealTrailGap;
      this._tmp.subVectors(c.pos, c.prev).multiplyScalar(inv);
      Reveal.emit(c.pos, this._tmp, 1);
    }
  },

  //  v7.2: shift c.phase (only) so the point the butterfly reaches at the
  //  END of the departure sits in the arc the visitor is looking at --
  //  they watch it fly off to JOIN the others, not peel away behind them.
  //  The orbit itself is unchanged, so from there it drifts freely (and
  //  eventually behind), which is the kaleidoscope.
  aimJoin: function (c, t) {
    if (!this._haveCam) { return; }
    var faceAng = Math.atan2(this._camFwd.z, this._camFwd.x);   // pathAt's angle frame: atan2(z, x)
    var side = c.speed >= 0 ? 1 : -1;                           // which way round it already travels
    var arrive = t + CFG.revealLaunch + CFG.revealSoar;
    //  pathAt: theta = c.phase + c.speed*t (+ a <=0.1 rad wobble, ignored).
    //  Solve c.phase so theta at arrival lands in the forward arc.
    c.phase = (faceAng + side * CFG.revealJoinArc) - c.speed * arrive;
  },

  //  7. SOAR -- out of the shot and into the kaleidoscope. This is v7.2's
  //  `joining`, and the parts that make the handoff exact are kept: the
  //  group yaw easing up to the travel heading, the orientation slerping
  //  from the flat present pose to the flight's presentRoll aspect, the
  //  bank through the turn, and the exact representation written at u = 1
  //  so tickOrbit continues it with no pop. Three things are v8.1's:
  //
  //    - the vertical is on a DELAYED curve, so the height the launch won
  //      is held through the first quarter rather than given straight
  //      back (and revealJoinLift is halved -- the launch climbs now);
  //    - the barrel roll keeps unwinding, applied ON TOP of the blended
  //      orientation rather than inside it. Inside, it would be weighted
  //      by the blend and so pop to nothing at u = 0; on top, it
  //      continues the launch's roll exactly and still reaches 0 at
  //      u = 1, so the handoff is untouched;
  //    - it keeps shedding letters for a moment after the shot.
  tickSoar: function (c, t, dt) {
    c.stateT += dt;
    var u = Math.min(1, c.stateT / CFG.revealSoar);
    var e = smoothstep(u);
    this.pathAt(c, t, c.pathPos);                   // its orbit position, now

    var eV = smoothstep(Math.max(0, (u - 0.25) / 0.75));
    c.pos.x = c.joinFrom.x + (c.pathPos.x - c.joinFrom.x) * e;
    c.pos.z = c.joinFrom.z + (c.pathPos.z - c.joinFrom.z) * e;
    c.pos.y = c.joinFrom.y + (c.pathPos.y - c.joinFrom.y) * eV;
    c.pos.y += CFG.revealJoinLift * Math.sin(Math.PI * u);   // and settles onto the orbit

    //  the full flight beat, with its half-radian bias
    var fp = t * c.flapSpeed + c.flapPh;
    c.bm.flap(Math.sin(fp) * c.flapAmp - 0.5);

    c.scale += (1 - c.scale) * 0.05;                // -> its real orbit size
    c.alpha += (1 - c.alpha) * 0.1;

    //  heading: ease a stored yaw toward the travel direction, and bring
    //  the GROUP yaw up from 0 (the flat present pose) to it across the
    //  departure
    var dx = c.pos.x - c.prev.x, dz = c.pos.z - c.prev.z;
    var travelYaw = (dx * dx + dz * dz > 1e-8) ? Math.atan2(dz, -dx) : c._joinYaw;
    c._joinYaw += Math.atan2(Math.sin(travelYaw - c._joinYaw), Math.cos(travelYaw - c._joinYaw)) *
                  Math.min(1, dt * 1000 / 380);
    c.group.rotation.y = c._joinYaw;               // eases from 0 (set at the coil handoff) on its own
    c.group.updateMatrixWorld(true);               // presentRoll + the flat-quat conversion read world

    //  blend model orientation: flat present pose (a group-identity world
    //  quat, re-expressed under the now-yawed group) -> the flight's
    //  presentRoll aspect, plus a bank that peaks mid-departure. Then the
    //  unwinding roll goes on TOP of that blend -- see the header.
    var bank = Math.sin(Math.PI * u) * CFG.revealJoinBank * (c.speed >= 0 ? 1 : -1);
    var rhoT = this.presentRoll(c, -0.5 * e);
    var gq = c.group.getWorldQuaternion(this._qb);
    var qBlend = this._qc.copy(gq).conjugate().multiply(this._flatQuat(c, this._qa));
    var qFlight = this._qa.setFromEuler(this._eul.set(rhoT + bank, 0, 0, 'XZY'));
    qBlend.slerp(qFlight, e);
    c.spin = this.spinAt(c, CFG.revealLaunch + c.stateT);
    this._qd.setFromAxisAngle(BODY_AXIS, c.spin);
    c.bm.model.quaternion.copy(qBlend).multiply(this._qd);

    this.render(c);
    if (c.stateT < CFG.revealTrailTail) { this.shed(c, dt); }
    c.prev.copy(c.pos);

    if (u >= 1) {
      c.group.rotation.y = c._joinYaw;             // land on the flight representation
      c.bm.model.rotation.set(rhoT, 0, 0, 'XZY');  // bank is 0, and the roll is a whole number of turns -- see spinAt
      c.state = 'orbit';
      c.first = true;
      //  v8.2: hand off to the flight, but keep this butterfly exempt from
      //  Reveal.dim (via wasHero) until the room has fully faded back --
      //  otherwise it steps to 0.28 the instant it stops being the hero and
      //  crawls back up, which reads as a hard cut. Now the room fades UP to
      //  meet it and it never changes brightness.
      c.hero = false;
      c.wasHero = true;
      Reveal.release();                            // and the room comes back, slowly
      //  v10 -- IT HAS JOINED THE KALEIDOSCOPE. The mirror of
      //  'reveal:launch': that fires on the takeoff frame and hands the
      //  caught name over, this fires on the frame the soar lands on the
      //  orbit. guide.js speaks its second beat here, because this is the
      //  instant the butterfly stops being the hero and becomes one of
      //  the many -- which is exactly what "you can call it back" is
      //  about. Replayed butterflies spawn straight into 'orbit' and
      //  never soar, so this only ever fires for a freshly grown one.
      window.dispatchEvent(new CustomEvent('reveal:joined', { detail: { id: c.id } }));
    }
  },

  //  keyboard.js:tickKey, flight only -- no capture states, no
  //  slow-field clock (t / dt are used directly), no letter, no hot.
  tickOrbit: function (c, t, dt) {
    var i;
    this.pathAt(c, t, c.pathPos);

    c.cycleT -= dt;
    if (c.cycleT <= 0) {
      c.gliding = !c.gliding;
      c.cycleT = c.gliding ? (0.5 + Math.random() * 0.9) : (1.2 + Math.random() * 2.2);
    }
    c.flapEnv += ((c.gliding ? 0 : 1) - c.flapEnv) * Math.min(1, dt / 0.22);

    var fp = t * c.flapSpeed + c.flapPh;
    var flapAngle = Math.sin(fp) * c.flapAmp - 0.5;
    var glideAngle = -1.0 + 0.08 * Math.sin(t * 3 + c.flapPh);
    var flap = c.flapEnv * flapAngle + (1 - c.flapEnv) * glideAngle;

    //  v8.1: the hero's takeoff shoves the room outward, once. Same
    //  impulse into the same spring the hands already scatter it with --
    //  no new physics; the spring reels it back on its own.
    if (this._shock && CFG.revealShock) {
      this._tmp.copy(c.pos).sub(this._shock);
      var sd = Math.max(0.6, this._tmp.length());     // clamped, or one standing right at the launch point is flung
      if (this._tmp.lengthSq() > 1e-8) {
        c.offsetVel.addScaledVector(this._tmp.normalize(), CFG.revealShock / (1 + sd * sd));
      }
    }

    for (i = 0; i < this.repulsors.length; i++) {
      var rp = this.repulsors[i];
      if (rp.speed < 1.2) { continue; }
      this._tmp.copy(c.pos).sub(rp.pos);
      var dist = this._tmp.length();
      if (dist > 1.4 || dist < 1e-4) { continue; }
      var push = Math.min(rp.speed, 6) * 9 / (1 + 6 * dist * dist);
      c.offsetVel.addScaledVector(this._tmp.normalize(), push * dt);
    }
    c.offsetVel.addScaledVector(c.offset, -1.2 * dt);        // spring back to the path
    c.offsetVel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
    c.offsetVel.y += (c.flapEnv - 0.5) * 0.08 * dt;          // glide sinks, flapping climbs
    c.offset.addScaledVector(c.offsetVel, dt);
    if (c.offset.length() > 6) { c.offset.setLength(6); }

    c.pos.copy(c.pathPos).add(c.offset);
    c.bm.flap(flap);
    c.pos.y += 0.01 * c.size * Math.sin(fp - 0.9) * c.flapEnv;   // per-wingbeat bob

    //  a replayed butterfly fades and scales up where it sits; a joined
    //  one is already at 1 and these are no-ops
    c.alpha += (1 - c.alpha) * Math.min(1, dt / 0.4);
    c.scale += (1 - c.scale) * Math.min(1, dt / 0.4);
    //  v8.2: the name tag fades in only now -- once the butterfly has
    //  joined the kaleidoscope. Replayed butterflies start at 1 (no-op).
    c.tagAlpha = Math.min(1, c.tagAlpha + dt / CFG.revealTagFade);
    this.render(c);

    if (c.first) { c.prev.copy(c.pos); c.first = false; return; }

    // ---- heading and banking ----
    var dx = c.pos.x - c.prev.x, dy = c.pos.y - c.prev.y, dz = c.pos.z - c.prev.z;
    var hSpeed = Math.sqrt(dx * dx + dz * dz);
    if (hSpeed > 1e-6) {
      var yaw = Math.atan2(dz, -dx);
      var cur = c.group.rotation.y;
      var diff = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      c.group.rotation.y = cur + diff * Math.min(1, dt * 1000 / 160);
      //  v10.3: LAGGED, like the bank below it. `dy` carries the
      //  per-wingbeat bob added a few lines up, so the raw pitch rocks
      //  the butterfly fore and aft once per flap -- see CFG.pitchEase.
      var pitch = -Math.atan2(dy, hSpeed) * 0.25;
      c.smoothPitch += (pitch - c.smoothPitch) * Math.min(1, dt * 1000 / CFG.pitchEase);
      var targetRoll = THREE.MathUtils.clamp(diff * 8, -0.09, 0.09);
      c.smoothRoll += (targetRoll - c.smoothRoll) * Math.min(1, dt * 1000 / 420);
      var mean = c.flapEnv * -0.5 + (1 - c.flapEnv) * -1.0;
      c.bm.model.rotation.set(this.presentRoll(c, mean) + c.smoothRoll, 0, c.smoothPitch, 'XZY');
    }
    c.prev.copy(c.pos);
  },

  // ============================================================
  //  v9 -- CALLED OVER: summon / perch / hover / leave
  // ============================================================

  // ---------- what interact.js asks for ----------
  //  The same shape of answer keyboard.js:targets() gives, plus a
  //  `layer` so the pick can put the kaleidoscope BEHIND the keyboard
  //  (interact.js). The radius is the keys' own 0.20 * size rule, so a
  //  collected butterfly is no easier and no harder to hit than a letter
  //  -- only further away, which the pick cone already handles.
  //
  //  Three things are deliberately not offerable:
  //    - anything not in 'orbit'. One already on its way to you cannot be
  //      called again, and none of the reveal's scripted beats can be
  //      interrupted by a pinch.
  //    - anything still fading in. A butterfly at alpha 0.2 is barely
  //      visible; picking one would look like picking nothing.
  //    - the whole room during a reveal. That is the hero's moment.
  targets: function () {
    var out = [];
    if (Reveal.active) { return out; }
    for (var i = 0; i < this.collected.length; i++) {
      var c = this.collected[i];
      if (c.state !== 'orbit') { continue; }
      if (c.alpha < 0.6 || c.scale < 0.6) { continue; }
      out.push({
        id: 'col' + c.id, pos: c.pos, panel: false, layer: 'col',
        radius: CFG.colPickRadius * c.size * c.scale
      });
    }
    return out;
  },

  //  The WHOLE hot set, every provider's ids in it -- only ours can
  //  match, because ours are the only ones prefixed 'col'.
  setHot: function (idSet) {
    for (var i = 0; i < this.collected.length; i++) {
      var c = this.collected[i];
      c.hot = !!idSet['col' + c.id];
    }
  },

  //  THE ROOM IS OURS while a butterfly is coming to the visitor or is
  //  with them: interact.js offers NOTHING else -- no letters, no accept,
  //  no delete. Reaching for a butterfly flying at your face means putting
  //  your hand through the whole keyboard, and every one of those letters
  //  was a live target on the way through.
  //
  //  'leave' is deliberately NOT in this set. The lockout lifts the moment
  //  the butterfly turns for home, so a visitor mid-name waits about
  //  twelve seconds rather than fifteen, and the room comes back while
  //  they are watching it go rather than after it has gone.
  //
  //  Note this leaves OUR OWN targets live throughout, so a pinch on a
  //  different butterfly still swaps which one is coming (summonMax) --
  //  a mis-pick stays correctable, and only the destructive controls and
  //  the letters go away.
  exclusive: function () {
    for (var i = 0; i < this.collected.length; i++) {
      var st = this.collected[i].state;
      if (st === 'summon' || st === 'hover' || st === 'perch') { return true; }
    }
    return false;
  },

  byTargetId: function (id) {
    for (var i = 0; i < this.collected.length; i++) {
      if ('col' + this.collected[i].id === id) { return this.collected[i]; }
    }
    return null;
  },

  //  A pointer pinched one of ours. `handPos` (where it pinched) is
  //  ignored: unlike a caught letter, this butterfly is not coming to the
  //  hand that called it -- it is coming to whichever hand is HELD OUT
  //  when it gets there, which may be the other one, or neither.
  activate: function (id) {
    var i;
    var c = this.byTargetId(id);
    if (!c || c.state !== 'orbit') { return; }

    //  CFG.summonMax at once. Calling another one sends the longest-held
    //  one home rather than refusing -- a pinch that visibly does nothing
    //  reads as broken tracking, and this way the newest call is always
    //  the one that is honoured.
    var live = [];
    for (i = 0; i < this.collected.length; i++) {
      var o = this.collected[i];
      if (o !== c && SUMMONED[o.state]) { live.push(o); }
    }
    live.sort(function (a, b) { return a.summonAt - b.summonAt; });
    var cap = Math.max(1, CFG.summonMax);
    while (live.length >= cap) { this.toLeave(live.shift()); }

    c.summonAt = this._now;
    c.summonSide = null;
    c.hoverSide = (Math.random() < 0.5 ? -1 : 1);
    c.leaveInit = false;
    c.flutterCd = rand(0.4, 1.6);
    c.flutterOn = 0;
    this.toState(c, 'summon');
  },

  // ---------- where it is going ----------
  //  THE OFFERED HAND, or null. Sticky: while the hand it is already
  //  aiming at keeps offering, it keeps aiming at that one, so holding
  //  both hands out does not make a butterfly dither between them. When
  //  there is no incumbent it takes the nearest.
  offerFor: function (c) {
    var i;
    if (c.summonSide) {
      var same = Hands.offerOn(c.summonSide);
      if (same) { return same; }
      c.summonSide = null;
    }
    var all = Hands.offers();
    var best = null, bestD = Infinity;
    for (i = 0; i < all.length; i++) {
      var d = all[i].pos.distanceTo(c.pos);
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    if (best) { c.summonSide = best.side; }
    return best;
  },

  //  WHERE THE MODEL'S ORIGIN GOES so that the butterfly STANDS on the
  //  palm. The origin is the wing hinge, and the body sprite hangs below
  //  it -- body, then the legs, down to the contact line CFG.perchLegDrop
  //  per unit model size beneath it. Placing the ORIGIN on the palm (which
  //  is what the first pass did) therefore buried the whole body and every
  //  leg in the hand, about 52 mm of it at perchSize.
  //
  //  The contact line, not the lowest leg tip: the legs are drawn at four
  //  different lengths and _restQuat pitches the butterfly nose-up onto
  //  the line through them (see CFG.perchPitch). perchLegDrop is measured
  //  perpendicular to THAT line, so this stays one number along the normal.
  //
  //  Along the palm's own normal, so it stands on a tilted hand rather
  //  than hovering level above it -- the pitch is about the wing span
  //  axis, which stays in the palm plane, so the drop is unaffected by it
  //  or by the broadside turn.
  //
  //  Scaled by the CURRENT size, not the final one: the landing eases its
  //  scale up over perchSettle, and the lift has to ease with it or the
  //  legs would sink as it grew.
  perchPoint: function (c, hand, out) {
    var s = c.size * c.scale * c.hotScale;
    return out.copy(hand.pos).addScaledVector(hand.normal, CFG.perchLift + CFG.perchLegDrop * s);
  },

  //  The spot in front of the visitor it holds station at with no hand
  //  offered. Nearer than the reveal's presentDist: this one is being
  //  looked AT rather than presented, and closer reads as "it came to
  //  you" rather than "it stopped over there".
  //
  //  v10.3 LEFT THIS ON THE GAZE, unlike presentPoint above. hoverRise
  //  exists for the same reason presentRise does -- keeping the butterfly
  //  off the name and the two controls -- and pitch defeats it the same
  //  way. It is not fixed here because nothing was reported against it and
  //  the two cases are not equally exposed: the reveal always runs with a
  //  spelled name hanging in front of the visitor, while a butterfly is
  //  usually called over with the keyboard empty. If it does turn out to
  //  cover the name on the floor, this is one line -- _camLevel and
  //  CFG.eyeY, exactly as presentPoint does it.
  hoverPoint: function (c, out) {
    if (this._haveCam) {
      out.copy(this._camPos).addScaledVector(this._camFwd, CFG.hoverDist);
      out.y += CFG.hoverRise;
    } else {
      out.set(0, CFG.eyeY + CFG.hoverRise, -CFG.hoverDist);
    }
    return out;
  },

  //  WHICH SIDE it holds broadside to, chosen at the moment it arrives as
  //  whichever is the SHORTER turn from the heading it flew in on. Drawn at
  //  random instead, the butterfly could arrive flying at the visitor and
  //  then swing a full half turn to settle -- 179 deg/sec on the first
  //  frame, measured. The near side is at most a quarter turn.
  pickHoverSide: function (c) {
    if (!this._haveCam) { c.hoverSide = (Math.random() < 0.5 ? -1 : 1); return; }
    var face = Math.atan2(this._camPos.z - c.pos.z, -(this._camPos.x - c.pos.x));
    var cur = c.group.rotation.y, best = 1, bestAbs = Infinity;
    for (var i = 0; i < 2; i++) {
      var side = i ? -1 : 1;
      var d = Math.abs(Math.atan2(Math.sin(face + side * Math.PI / 2 - cur),
                                  Math.cos(face + side * Math.PI / 2 - cur)));
      if (d < bestAbs) { bestAbs = d; best = side; }
    }
    c.hoverSide = best;
  },

  //  THE HOVER'S HEADING, held rather than chased. faceTravel turns the
  //  body to follow where it is going, which is right for the orbit --
  //  where a butterfly travels one way for many seconds -- and wrong here,
  //  where the wander reverses every couple of seconds and the body swung
  //  a full 180 degrees each time it did. Measured before this: 4.6
  //  radians of yaw in 3.3 seconds, which is what "moving too radically"
  //  actually was.
  //
  //  So it holds BROADSIDE to the visitor and sways about it. Broadside
  //  rather than facing them because with the body axis pointed at the
  //  visitor the wing plane cannot face them either -- the same geometry
  //  that made the reveal need _flatQuat, where presentRoll's aspect never
  //  tops ~0.18 -- so square-on is the one heading at which the butterfly
  //  is an edge-on twig. It is also exactly what every orbiting butterfly
  //  is already doing, so it needs no new pose: presentRoll does the rest.
  hoverFace: function (c, t, dt) {
    var face = 0;
    if (this._haveCam) {
      //  the flight's yaw convention: the head (local -X) ends up along
      //  (cos, sin) of atan2(dz, -dx), so this points the head AT the
      //  visitor and the quarter turn below takes it broadside
      face = Math.atan2(this._camPos.z - c.pos.z, -(this._camPos.x - c.pos.x));
    }
    var want = face + c.hoverSide * Math.PI / 2 +
               CFG.hoverSwayYaw * c.nWob(t * 0.25 + 11.7);
    var cur = c.group.rotation.y;
    var diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    c.group.rotation.y = cur + diff * Math.min(1, dt / CFG.hoverTurn);
    //  no pitch: the vertical drift is centimetres and pitching to follow
    //  it is another thing moving for no reason
    c.bm.model.rotation.set(this.presentRoll(c, -0.5), 0, 0, 'XZY');
  },

  //  Heading + bank + presentRoll, factored out of tickOrbit's tail so
  //  the summon and the departure fly the way the orbit does. `tau` is
  //  how quickly the yaw chases the travel direction, in seconds.
  faceTravel: function (c, dt, flapMean, bank, tau) {
    var dx = c.pos.x - c.prev.x, dy = c.pos.y - c.prev.y, dz = c.pos.z - c.prev.z;
    var h2 = dx * dx + dz * dz;
    if (h2 > 1e-9) {
      var yaw = Math.atan2(dz, -dx);
      var cur = c.group.rotation.y;
      var diff = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      c.group.rotation.y = cur + diff * Math.min(1, dt / tau);
    }
    var hSpeed = Math.sqrt(h2);
    var pitch = hSpeed > 1e-6 ? -Math.atan2(dy, hSpeed) * 0.25 : 0;
    c.bm.model.rotation.set(this.presentRoll(c, flapMean) + bank, 0, pitch, 'XZY');
  },

  //  THE RESTING POSE, for a butterfly sitting on a palm: the wing plane
  //  (local +Y is its normal -- see bfly-model.js) laid onto the palm
  //  plane, and the head turned to the visitor.
  //
  //  BROADSIDE, not head-on. The body is ONE PLANE through the body axis,
  //  so with the head pointed at the visitor they are looking straight
  //  down its length and the body vanishes -- two wings with nothing
  //  joining them. Turned across the view by c.perchYaw (60-70 degrees,
  //  drawn on landing, either way round) it is seen in profile instead,
  //  with a wing to each side. The head still starts from "toward the
  //  visitor" -- that is the baseline the turn is measured from, so
  //  setting perchYawMin/Max to 0 gives the head-on pose back.
  //
  //  Same makeBasis convention as _flatQuat -- (X, Y, X cross Y) -- so the
  //  two poses can be slerped between with no flip.
  _restQuat: function (c, normal, out) {
    var n = this._s3.copy(normal);
    if (n.lengthSq() < 1e-8) { n.set(0, 1, 0); }
    n.normalize();

    var ax = this._s2;
    if (this._haveCam) { ax.copy(c.pos).sub(this._camPos); } else { ax.set(0, 0, -1); }
    ax.addScaledVector(n, -ax.dot(n));                 // into the palm plane
    //  the visitor looking straight down their own palm: any direction in
    //  the plane will do, so take the world axis least aligned with it
    if (ax.lengthSq() < 1e-6) {
      ax.set(0, 0, 1).addScaledVector(n, -n.z);
      if (ax.lengthSq() < 1e-6) { ax.set(1, 0, 0).addScaledVector(n, -n.x); }
    }
    ax.normalize();
    //  ...and turned across the visitor's view, about the palm's own
    //  normal so the wings stay in the palm plane however the hand tilts
    if (c.perchYaw) { ax.applyAxisAngle(n, c.perchYaw); }
    var z = this._s1.crossVectors(ax, n);
    this._msc.makeBasis(ax, n, z);
    out.setFromRotationMatrix(this._msc);

    //  ...and PITCHED NOSE-UP onto its legs. The legs are not all the same
    //  length -- BODY_ALPHA draws a body in flight, front legs long and
    //  forward, hind pair short and swept back -- so laid flat it rests on
    //  the deepest pair with the hind tips 22-25 mm clear of the hand and
    //  the tail end of it plainly not on the palm. CFG.perchPitch is the
    //  least-squares line through the four tips; the numbers, and the two
    //  poses that were not taken, are in config.js.
    //
    //  About local Z, which is the wing SPAN axis (bfly-model.js: the body
    //  runs along X, the wings out along Z). So the wings stay level
    //  across the palm and only tip fore-and-aft -- the span axis is still
    //  exactly in the palm plane, whatever perchYaw did. Negative, because
    //  this basis is right-handed and the head is at local -X: a negative
    //  turn about Z drops the tail and lifts the head.
    if (CFG.perchPitch) {
      this._qp.setFromAxisAngle(this._zAx, -CFG.perchPitch);
      out.multiply(this._qp);                          // in the model's own frame
    }
    return out;
  },

  toLeave: function (c) {
    c.leaveInit = false;
    c.summonSide = null;
    this.toState(c, 'leave');
  },

  //  v10 -- send everything that is with the visitor home, at once. The
  //  session guide calls this on a handover so the next person does not
  //  inherit a butterfly sitting on a hand that has gone. It is the same
  //  exit the interaction already takes when a palm drops, so there is
  //  no new pose and no new state: NOTHING IS DELETED and nothing about
  //  the collection changes -- they simply fly back to their orbits.
  releaseAll: function () {
    for (var i = 0; i < this.collected.length; i++) {
      if (SUMMONED[this.collected[i].state]) { this.toLeave(this.collected[i]); }
    }
  },

  // ---------- 1. SUMMON -- it comes to you ----------
  //  Re-aimed every single frame: at the palm if one is being offered,
  //  otherwise at the spot in front of the visitor's face. So putting a
  //  hand up while it is on its way redirects it, and dropping one sends
  //  it back to the hover spot, with no state change either way.
  //
  //  A CRUISE, NOT A LERP. A lerp toward a target is fastest when it is
  //  furthest away and crawls at the end -- exactly backwards for
  //  something flying to your hand. This holds summonSpeed until the last
  //  summonEase metres and then eases down, so it arrives settled instead
  //  of stopping dead.
  //
  //  The sway is added as a VELOCITY (amplitude x rate x cos), not as a
  //  position offset. As an offset it would step the moment the fade
  //  factor moved; as a velocity it integrates to the same wander and can
  //  never discontinue.
  tickSummon: function (c, t, dt) {
    c.stateT += dt;
    var hand = this.offerFor(c);
    if (hand) { this.perchPoint(c, hand, c.summonTo); }
    else { this.hoverPoint(c, c.summonTo); }

    var to = this._s1.copy(c.summonTo).sub(c.pos);
    var dist = to.length();
    if (dist > 1e-6) { to.multiplyScalar(1 / dist); } else { to.set(0, 0, -1); }

    var sp = CFG.summonSpeedNear +
             (CFG.summonSpeed - CFG.summonSpeedNear) * Math.min(1, dist / CFG.summonEase);
    c.pos.addScaledVector(to, Math.min(sp * dt, dist));

    var fade = Math.min(1, dist / 0.7);            // the wander dies out as it arrives
    var side = this._s2.crossVectors(to, UP);
    if (side.lengthSq() > 1e-8) {
      side.normalize();
      var w = CFG.summonSwayRate;
      c.pos.addScaledVector(side, CFG.summonSway * w * Math.cos(t * w + c.phase) * fade * dt);
      c.pos.y += CFG.summonBob * w * Math.cos(t * w * 1.37 + c.flapPh) * fade * dt;
    }

    //  a slightly lazy version of the flight beat -- it is crossing the
    //  room deliberately, not commuting
    var fp = t * c.flapSpeed * 0.85 + c.flapPh;
    c.bm.flap(Math.sin(fp) * c.flapAmp - 0.5);

    var want = (hand ? CFG.perchSize : CFG.hoverSize) / c.size;
    c.scale += (want - c.scale) * Math.min(1, dt / 0.8);
    c.alpha += (1 - c.alpha) * 0.1;
    this.render(c);
    this.faceTravel(c, dt, -0.5, 0, 0.20);
    c.prev.copy(c.pos);

    //  measured AFTER the move, so a frame long enough to cover the whole
    //  remaining distance arrives on that frame instead of overshooting
    //  and turning back
    if (c.pos.distanceTo(c.summonTo) <= CFG.summonArrive) {
      if (hand) {
        c.wingRest = -0.5;                        // wings still up from the approach
        //  which way it sits, drawn fresh for this landing: 60-70 degrees
        //  off head-on, and the side is drawn too -- both read as
        //  broadside, and a fixed one made every landing identical
        var yaw = rand(CFG.perchYawMin, CFG.perchYawMax) * Math.PI / 180;
        c.perchYaw = (Math.random() < 0.5 ? -yaw : yaw);
        this.toState(c, 'perch');
      }
      else { this.pickHoverSide(c); this.toState(c, 'hover'); }
      return;
    }
    if (c.stateT >= CFG.summonGiveUp) { this.toLeave(c); }
  },

  // ---------- 2. PERCH -- it lands on your hand ----------
  //  The palm is checked FIRST and every frame: lower the hand, turn it
  //  over, or close it and the butterfly is gone on that frame. There is
  //  no timer on the way out and no forgiveness here -- what forgiveness
  //  there is lives in hands.js:holdOffer, which is where a tracking
  //  dropout is told apart from a hand actually being taken away.
  //
  //  It FOLLOWS the hand on a short lag rather than being welded to it.
  //  Hands are never still; a butterfly rigid on a jittering palm reads
  //  as a decal stuck to it.
  tickPerch: function (c, t, dt) {
    var hand = this.offerFor(c);
    if (!hand) { this.toLeave(c); return; }
    c.stateT += dt;

    this.perchPoint(c, hand, c.summonTo);
    c.pos.lerp(c.summonTo, Math.min(1, dt / CFG.perchFollow));

    //  wings: fold down out of the approach onto the resting dihedral,
    //  breathe slowly, and flutter every few seconds. The flutter is what
    //  stops it reading as a sticker -- a resting butterfly is not a
    //  still one.
    c.wingRest += (CFG.perchRest - c.wingRest) * Math.min(1, dt / CFG.perchSettle);
    var flap = c.wingRest + Math.sin(t * CFG.revealFlapRate * 0.7 + c.flapPh) * CFG.revealFlapAmp;
    if (c.flutterOn > 0) {
      c.flutterOn -= dt;
      var u = 1 - Math.max(0, c.flutterOn) / CFG.perchFlutterFor;
      //  three strokes, under one fade-in/out envelope so it neither
      //  starts nor ends on a step
      flap -= Math.abs(Math.sin(u * Math.PI * 3)) * CFG.perchFlutterAmp * Math.sin(Math.PI * u);
    } else {
      c.flutterCd -= dt;
      if (c.flutterCd <= 0) {
        c.flutterOn = CFG.perchFlutterFor;
        c.flutterCd = CFG.perchFlutterEvery * rand(0.6, 1.5);   // jittered, so two never sync up
      }
    }
    c.bm.flap(flap);

    //  flat on the palm, head to the visitor. The group carries no yaw
    //  here (same arrangement as the reveal's held beats) -- _restQuat
    //  builds the whole orientation.
    c.group.rotation.set(0, 0, 0);
    c.bm.model.quaternion.slerp(this._restQuat(c, hand.normal, this._qs), Math.min(1, dt / 0.18));

    c.scale += (CFG.perchSize / c.size - c.scale) * Math.min(1, dt / 0.45);
    c.alpha += (1 - c.alpha) * 0.1;
    this.render(c);
    c.prev.copy(c.pos);

    if (c.stateT >= CFG.perchDwell) { this.toLeave(c); }
  },

  // ---------- 3. HOVER -- no hand, so it waits in front of you ----------
  //  IT FLIES. The first pass held it in the reveal's flat pinned-specimen
  //  pose, wings spread square to the visitor, and it read as a diagram of
  //  a butterfly rather than a butterfly -- the one thing in a room full of
  //  flight that was not flying. That pose is the hero's and stays the
  //  hero's (see holdPose/_flatQuat).
  //
  //  So: the ordinary flight wingbeat, the body turned to follow its
  //  heading, presentRoll keeping the wing readable at any height, and a
  //  slow wander left-right / up-down / in-out about the held spot. It is
  //  WAITING in front of you, not posing at you.
  //
  //  The wander is the fbm noise the butterfly already carries for its
  //  orbit, read at its own frequencies x hoverRate, so no two wait the
  //  same way and nothing about it is periodic. It is applied to the
  //  TARGET, not to the position, and c.pos lags it by hoverEase -- which
  //  both gives the movement weight and smooths the travel direction the
  //  body turns to follow. Steering the position directly would leave the
  //  heading chasing noise.
  //
  //  A palm going up at any point during this puts it straight back into
  //  'summon', which then aims at that palm -- so the interaction is
  //  discoverable by simply trying it while the butterfly is right in
  //  front of your face.
  tickHover: function (c, t, dt) {
    var hand = this.offerFor(c);
    if (hand) { this.toState(c, 'summon'); return; }
    c.stateT += dt;

    var r = CFG.hoverRate;
    //  THE WANDER EASES IN. It arrives within summonArrive of the
    //  un-wandered spot, but the noise at that instant is wherever the
    //  butterfly's own clock has it -- up to the full span away -- so the
    //  target jumped on the first frame of the hover and the lag chased it
    //  at 1.0 m/s. That is a lunge toward the visitor's face, 0.6 m from
    //  it. Ramped in, the peak over the whole wait is 0.3 m/s.
    var w = smoothstep(Math.min(1, c.stateT / CFG.hoverSettle));
    this.hoverPoint(c, c.summonTo);
    c.summonTo.x += w * CFG.hoverSpanX * c.nWob(t * c.wobFreq * r);
    c.summonTo.y += w * CFG.hoverSpanY * c.nHgt(t * c.hgtFreq * r);
    c.summonTo.z += w * CFG.hoverSpanZ * c.nRad(t * c.radFreq * r);
    c.pos.lerp(c.summonTo, Math.min(1, dt / CFG.hoverEase));

    //  the ordinary flight beat -- the same one the orbit flies
    var fp = t * c.flapSpeed + c.flapPh;
    c.bm.flap(Math.sin(fp) * c.flapAmp - 0.5);

    c.scale += (CFG.hoverSize / c.size - c.scale) * Math.min(1, dt / 0.6);
    c.alpha += (1 - c.alpha) * 0.1;
    this.render(c);
    this.hoverFace(c, t, dt);
    //  NO per-wingbeat body bob here, deliberately. In the orbit it is a
    //  centimetre at 3-4 Hz seen from metres away; at 0.62 m from the face
    //  the same movement is the fastest thing in the room and reads as
    //  jitter -- which is exactly the complaint v2 cut it for. The wander
    //  and the wingbeat carry the flight on their own.
    c.prev.copy(c.pos);

    if (c.stateT >= CFG.hoverDwell) { this.toLeave(c); }
  },

  // ---------- 4. LEAVE -- back into the kaleidoscope ----------
  //  The same shape as the reveal's soar, minus everything that belongs
  //  to the reveal (no barrel roll, no shed letters, no dim): blend out to
  //  its own orbit, arc a little on the way, land exactly on the
  //  representation tickOrbit expects.
  tickLeave: function (c, t, dt) {
    if (!c.leaveInit) {
      c.leaveInit = true;
      c.leaveFrom.copy(c.pos);
      this.aimReturn(c, t);
    }
    c.stateT += dt;
    var u = Math.min(1, c.stateT / CFG.leaveTime);
    var e = smoothstep(u);
    var eV = smoothstep(Math.max(0, (u - 0.2) / 0.8));      // holds its height a moment first
    this.pathAt(c, t, c.pathPos);

    c.pos.x = c.leaveFrom.x + (c.pathPos.x - c.leaveFrom.x) * e;
    c.pos.z = c.leaveFrom.z + (c.pathPos.z - c.leaveFrom.z) * e;
    c.pos.y = c.leaveFrom.y + (c.pathPos.y - c.leaveFrom.y) * eV;
    c.pos.y += CFG.leaveLift * Math.sin(Math.PI * u);

    var fp = t * c.flapSpeed + c.flapPh;
    c.bm.flap(Math.sin(fp) * c.flapAmp - 0.5);

    c.scale += (1 - c.scale) * Math.min(1, dt / 0.9);       // back to its own orbit size
    c.alpha += (1 - c.alpha) * 0.1;
    this.render(c);

    var bank = Math.sin(Math.PI * u) * CFG.leaveBank * (c.speed >= 0 ? 1 : -1);
    this.faceTravel(c, dt, -0.5, bank, 0.30);
    c.prev.copy(c.pos);

    if (u >= 1) {
      //  hand back EXACTLY what tickOrbit continues from: no path offset
      //  left over from before it was called, no bank, no stale smoothed
      //  roll, and the yaw already on the travel heading.
      c.offset.set(0, 0, 0);
      c.offsetVel.set(0, 0, 0);
      c.smoothRoll = 0;
      c.smoothPitch = 0;
      c.bm.model.rotation.set(this.presentRoll(c, -0.5), 0, 0, 'XZY');
      c.state = 'orbit';
      c.first = true;
    }
  },

  //  WHERE IT REJOINS. Its own ring, at the point nearest to wherever it
  //  is standing now -- so it flies OUT and away rather than back across
  //  the room to whatever slot its phase happened to travel to while it
  //  was with you. Biased leaveArc radians round the ring in the
  //  direction it already travels, which turns a radial exit into a
  //  curve. Only c.phase moves; the orbit itself is untouched, exactly as
  //  aimJoin does it for the reveal.
  aimReturn: function (c, t) {
    var ang;
    var r2 = c.pos.x * c.pos.x + c.pos.z * c.pos.z;
    if (r2 > 1e-6) { ang = Math.atan2(c.pos.z, c.pos.x); }
    else { ang = c.phase + c.speed * t; }              // dead centre: keep the slot it had
    ang += (c.speed >= 0 ? 1 : -1) * CFG.leaveArc;
    c.phase = ang - c.speed * (t + CFG.leaveTime);
  },

  //  keyboard.js:presentRoll, verbatim. The collection orbits through
  //  eye height, so without this a butterfly there is an edge-on twig.
  //  (The reveal's held beats do NOT use this -- see holdPose/_flatQuat.)
  presentRoll: function (c, flapMean) {
    if (!CFG.readRoll || !this._haveCam) { return 0; }
    this._tmp.copy(this._camPos).sub(c.pos);
    this._tmp.applyAxisAngle(UP, -c.group.rotation.y);
    var beta = Math.atan2(this._tmp.z, this._tmp.y);
    var want = Math.PI / 2 - CFG.readRoll;
    var best = 0, bestAbs = Infinity;
    for (var i = 0; i < 6; i++) {
      var x = (i % 2 ? -want : want) - beta + (Math.floor(i / 2) - 1) * Math.PI - flapMean;
      var a = Math.abs(x);
      if (a < bestAbs) { bestAbs = a; best = x; }
    }
    return best;
  },

  //  keyboard.js:separate -- butterflies steer apart instead of
  //  stacking. Wider band than the keyboard (the collection's own
  //  butterflies are bigger) and no state check (they are always flying).
  separate: function (dt) {
    var f = this.collected;
    for (var a = 0; a < f.length; a++) {
      var A = f[a];
      if (A.state !== 'orbit') { continue; }        // present / joining are scripted
      for (var b = a + 1; b < f.length; b++) {
        var B = f[b];
        if (B.state !== 'orbit') { continue; }
        var dx = A.pos.x - B.pos.x, dy = A.pos.y - B.pos.y, dz = A.pos.z - B.pos.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.49 || d2 < 1e-6) { continue; }
        var d = Math.sqrt(d2);
        var push = (0.7 - d) * 2.0 * dt / d;
        A.offsetVel.x += dx * push; A.offsetVel.y += dy * push; A.offsetVel.z += dz * push;
        B.offsetVel.x -= dx * push; B.offsetVel.y -= dy * push; B.offsetVel.z -= dz * push;
      }
    }
  },

  remove: function () {
    for (var i = this.collected.length - 1; i >= 0; i--) { this.removeOne(i); }
  }
});
