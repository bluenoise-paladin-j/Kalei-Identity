// ============================================================
//  guide.js  --  the session, and the voice that runs it
// ============================================================
//  v10. Until now the piece had no SESSION. It was always live: a
//  visitor put the headset on and landed in a room that was already
//  fully interactive, with nothing to say what to do and nothing to say
//  when they were finished. This file gives the run a start, two spoken
//  beats, and an end that hands over to the next person -- and it does
//  all of that WITHOUT TOUCHING THE COLLECTION. The kaleidoscope is the
//  exhibition's accumulation and no session may ever reset it.
//
//  THE WHOLE LOCKOUT IS v9'S EXCLUSIVITY, REUSED. interact.js:gather()
//  already lets a provider claim the room: when one reports itself
//  exclusive, NOTHING else is offered, so nothing else highlights and
//  nothing swallows a pinch. That is exactly "the letters fly but there
//  is no interaction yet", for free. This file is therefore a THIRD
//  PROVIDER (targets / setHot / activate / exclusive) rather than a set
//  of edits to the keyboard, and keyboard.js's flight, capture and
//  picking are untouched.
//
//      idle  --pinch the flower-->  welcome  -->  live
//                                                  |  ^
//                                            quiet |  | any activity
//                                                  v  |
//                                                wrapup
//                                                  | quiet
//                                                  v
//        idle  <--  farewell  <---------------------
//         ^
//         |  headset doff / operator key, silently, from ANY state
//
//  | state    | the room                                   | audio      |
//  |----------|--------------------------------------------|------------|
//  | idle     | exclusive; the flower is the only target    | -          |
//  | welcome  | unlocks at CFG.guideUnlockAt into the track | welcome    |
//  | live     | the piece as it has always been             | recall x1  |
//  | wrapup   | unchanged and fully live                    | nudge      |
//  | farewell | exclusive with NO targets -- the room quiets | farewell   |
//
//  ENDING IS NON-DESTRUCTIVE, and that is what lets the timers be short.
//  It resets an empty keyboard, sends a perched butterfly home and
//  re-arms the flower; DNA and the kaleidoscope are never touched. A
//  visitor ended early presses start again and loses nothing. So on an
//  exhibition floor with rapid handovers, 30 s of quiet is a safe
//  default rather than a hair trigger.
//
//  THE QUIET CLOCK IS FROZEN WHENEVER THE VISITOR CANNOT ACT, which is
//  the other half of making 30 s safe: the reveal is ~14 s of watching
//  by design, perchDwell is 12 s of deliberately holding still, and a
//  cue that is teaching them something has not finished teaching it.
//  Freeze, not reset -- the clock is at zero going into all three
//  anyway, because whatever started them counted as activity.
//
//  PRESENCE COSTS NOTHING TO MEASURE. interact.js hands EVERY provider
//  the whole hot set each frame, so a non-empty set arriving in setHot()
//  means the visitor is pointing at something. No new event, no change
//  to interact.js beyond adding this component to its provider list.
//
//  Loads after config.js, ui.js and voice.js, and before interact.js.
// ============================================================

var Guide = (function () {
  'use strict';

  //  The v6.2 lesson, three times over: a CFG key the code reads but
  //  config.js never defined multiplies to NaN and does nothing, and it
  //  is invisible on a headset. Fail loud.
  ['guideUnlockAt', 'guideWelcomeMax', 'guideQuietMs', 'guideQuietGrace',
   'guideMaxMs', 'guideDoffMs', 'guideFarewellMin', 'guideFarewellMax',
   'guideCtlFade', 'guideFlowerFade', 'guideTalkMax', 'voGap',
   'guideBlobX', 'guideBlobY', 'guideBlobK', 'guideBlobHue',
   'guideBlobTilt', 'guideBlobCant', 'guideBlobSeed',
   'guideBlobLit', 'guideBlobLitHot'].forEach(function (k) {
    if (typeof CFG === 'undefined' || CFG[k] === undefined) {
      console.error('[guide] CFG.' + k + ' is undefined');
    }
  });

  var IDLE = 'idle', WELCOME = 'welcome', LIVE = 'live',
      WRAPUP = 'wrapup', FAREWELL = 'farewell';

  //  Cues that do NOT freeze the quiet clock. The nudge is literally
  //  asking whether anyone is still there, so its own playback must not
  //  answer the question -- and the farewell plays to a room that is
  //  already ending.
  var TALKS_OVER = { nudge: 1, farewell: 1 };

  var state = IDLE;
  var stateT = 0, quietT = 0, sessionT = 0;
  var joined = false;          // the recall cue has fired this session
  //  Two envelopes, built the way reveal.js builds its own: a raw
  //  parameter travelling LINEARLY at 1/duration per second, read out
  //  through a smoothstep. So the constant means exactly the seconds it
  //  says, both ends are soft, and it lands precisely on 0 and 1 --
  //  which an exponential approach never does, so a fade-out would keep
  //  a hair of the flower on screen forever.
  var ctlP = 0, flowerP = 1;   // raw 0..1
  var ctlA = 0, flowerA = 1;   // ...and the eased values the scene reads
  var hiddenAt = null;         // wall clock at the last visibility loss
  var doffTimer = null;
  var mode = 'on';             // 'on' | 'off' (?guide=0) | 'live' (?guide=live)
  var booted = false;

  // ---------------- the other two providers ----------------
  //  Looked up on demand, never cached: A-Frame defers init(), so an
  //  early cache would stick an empty answer for the whole run (the trap
  //  interact.js:providers() documents). These are only ever called on a
  //  session boundary, which happens once a visit.
  function comp(name) {
    var el = (typeof document !== 'undefined') && document.querySelector('[' + name + ']');
    var c = el && el.components && el.components[name];
    return (c && c.initialized) ? c : null;
  }
  function keyboard()   { return comp('butterfly-keyboard'); }
  function collection() { return comp('butterfly-collection'); }

  function colBusy() {
    var c = collection();
    return !!(c && c.exclusive && c.exclusive());
  }
  function revealing() {
    return (typeof Reveal !== 'undefined') && !!Reveal.active;
  }
  //  ...and a cue can only freeze the clock for as long as a cue could
  //  plausibly last. A track that stalls mid-fetch never fires 'ended'
  //  and never reports itself paused, so without this cap one bad file
  //  holds a session open until guideMaxMs -- eight minutes of an
  //  exhibition headset nobody is wearing. Found by driving the real
  //  scene with the tracks missing.
  var talkT = 0, talkCue = null;

  //  v10.4: the beat between the flower being pressed and the first word
  //  -- see CFG.voIntroDelay. > 0 means the opening is OWED but has not
  //  started, which counts as talking everywhere it matters, or the
  //  welcome would fall straight through to live in the silence.
  var introT = 0;

  function talking() {
    if (introT > 0) { return true; }
    if (!Voice.playing()) { return false; }
    if (TALKS_OVER[Voice.cue()]) { return false; }
    return talkT < CFG.guideTalkMax;
  }

  function runTalkClock(dt) {
    var cue = Voice.playing() ? Voice.cue() : null;
    if (cue !== talkCue) { talkCue = cue; talkT = 0; }
    if (cue) { talkT += dt; }
  }

  function emit(name) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent(name, { detail: { state: state } }));
    }
  }

  // ---------------- the states ----------------
  function toState(s) { state = s; stateT = 0; }

  //  Put the room back the way the next visitor should find it. NOT a
  //  reset of anything that persists: the collection keeps every
  //  butterfly, DNA is untouched, and a butterfly that was on someone's
  //  hand simply flies home the way it does when they lower it.
  function clearRoom() {
    var c = collection();
    if (c && c.releaseAll) { c.releaseAll(); }
    var k = keyboard();
    if (k && k.reset) { k.reset(); }
  }

  function begin() {
    if (mode === 'off' || state !== IDLE) { return; }
    Voice.unlock();               // belt and braces -- the Enter-AR click already did it
    toState(WELCOME);
    quietT = 0; sessionT = 0; joined = false;
    //  NOT played here. The press has just made its own sound and the
    //  flower is still bouncing; the opening starts voIntroDelay later,
    //  from the tick below.
    introT = Math.max(0, CFG.voIntroDelay);
    if (introT === 0) { Voice.play(CFG.voIntro); }
    emit('guide:started');
  }

  function toFarewell() {
    if (state === FAREWELL || state === IDLE) { return; }
    introT = 0;                   // an opening still owed is never delivered late
    toState(FAREWELL);
    clearRoom();
    Voice.play('farewell');
    emit('guide:ending');
  }

  //  `silent` is the handover path -- the headset came off, or an
  //  operator ended it. There is nobody in there to hear a farewell.
  function toIdle(silent) {
    introT = 0;
    if (silent) { Voice.stop(); clearRoom(); }
    toState(IDLE);
    quietT = 0; sessionT = 0; joined = false;
    emit('guide:idle');
  }

  function ease(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }
  function travel(x, to, step) {
    if (x === to) { return x; }
    if (Math.abs(to - x) <= step) { return to; }
    return x + (to > x ? step : -step);
  }

  function noteActivity() {
    quietT = 0;
    if (state === WRAPUP) { toState(LIVE); }
  }

  // ---------------- the quiet clock ----------------
  function runQuiet(dt) {
    if (sessionT >= CFG.guideMaxMs / 1000) { toFarewell(); return; }
    //  FROZEN, not reset -- see the header
    if (revealing() || colBusy() || talking()) { return; }
    quietT += dt;
    var quiet = CFG.guideQuietMs / 1000;
    if (state !== WRAPUP) {
      if (quietT >= quiet) { toState(WRAPUP); Voice.play('nudge'); }
      return;
    }
    if (quietT >= quiet + CFG.guideQuietGrace / 1000) { toFarewell(); }
  }

  // ---------------- per frame ----------------
  function tick(dt) {
    Voice.tick(dt);
    //  v10.4. The room's sound is NOT the session's: the bed keeps
    //  running through idle, through a handover and through ?guide=off,
    //  so it is ticked before the mode check and before every return
    //  below.
    if (typeof Sfx !== 'undefined') { Sfx.tick(dt); }
    if (mode === 'off') { ctlP = ctlA = 1; flowerP = flowerA = 0; return; }

    stateT += dt;
    runTalkClock(dt);

    //  Eased, never switched: the "setDeco is a scalar, not a switch"
    //  note in CLAUDE.md is about exactly this -- flipping visibility at
    //  a threshold pops a shape in at whatever opacity the threshold
    //  happened to land on.
    ctlP = travel(ctlP, roomLive() ? 1 : 0, dt / Math.max(0.05, CFG.guideCtlFade));
    flowerP = travel(flowerP, (state === IDLE) ? 1 : 0, dt / Math.max(0.05, CFG.guideFlowerFade));
    ctlA = ease(ctlP);
    flowerA = ease(flowerP);

    if (state === IDLE) { return; }
    sessionT += dt;

    if (state === WELCOME) {
      //  The held opening, before anything else looks at Voice.playing().
      if (introT > 0) {
        introT -= dt;
        if (introT <= 0) { introT = 0; Voice.play(CFG.voIntro); }
      }
      //  Live at guideUnlockAt into the track (0 by default -- a visitor
      //  who already knows what to do is never blocked), and formally in
      //  `live` once the welcome has finished talking. `introT` is part
      //  of that: during the beat before the first word nothing is
      //  playing yet, and without it the whole welcome would be skipped
      //  on the frame after the press.
      if (stateT >= CFG.guideWelcomeMax ||
          (stateT >= CFG.guideUnlockAt && introT <= 0 && !Voice.playing())) { toState(LIVE); }
      runQuiet(dt);
      return;
    }

    if (state === LIVE || state === WRAPUP) { runQuiet(dt); return; }

    if (state === FAREWELL) {
      if (stateT >= CFG.guideFarewellMax ||
          (stateT >= CFG.guideFarewellMin && !Voice.playing())) { toIdle(false); }
    }
  }

  // ---------------- what the rest of the build asks ----------------
  //  Exclusive in idle (only the flower is pickable) and in farewell
  //  (nothing is). Also for the first guideUnlockAt of the welcome, if
  //  that is ever set above 0.
  function exclusive() {
    if (mode === 'off') { return false; }
    if (state === IDLE || state === FAREWELL) { return true; }
    if (state === WELCOME && stateT < CFG.guideUnlockAt) { return true; }
    return false;
  }

  //  Is the room the visitor's? keyboard.js gates its desktop keydown
  //  convenience on this, so letter keys cannot spell into an idle room.
  function roomLive() { return !exclusive(); }

  //  keyboard.js multiplies the two controls' alpha by this, at the same
  //  setAlpha the reveal already drives -- so accept and delete go
  //  entirely while no session is running rather than hanging there dim
  //  next to the one thing worth pressing.
  function ctlAlpha() { return ctlA; }
  function flowerAlpha() { return flowerA; }

  // ---------------- events ----------------
  function wire() {
    if (typeof window === 'undefined' || !window.addEventListener) { return; }

    //  The name was accepted: the visitor is plainly present, and the
    //  reveal is about to freeze the clock anyway.
    window.addEventListener('keyboard:accepted', function () { noteActivity(); });

    //  THE SECOND SPOKEN BEAT. collection.js fires this on the frame a
    //  grown butterfly hands off from its soar onto the orbit -- the
    //  exact instant it has "joined the kaleidoscope". Only the FIRST of
    //  a session speaks: a visitor who spells a second name has already
    //  been told how to call one over.
    window.addEventListener('reveal:joined', function () {
      noteActivity();
      if (state === IDLE || state === FAREWELL || joined) { return; }
      joined = true;
      Voice.play('recall');
    });
  }

  // ---------------- the headset coming off ----------------
  //  The real end signal on an exhibition floor. WebXR reports
  //  visibilityState 'hidden' when the headset leaves the face, and the
  //  render loop stops with it -- so this cannot be a tick timer. Two
  //  paths, deliberately both: a timer for the case where the browser
  //  keeps running them, and a check when visibility RETURNS, which is
  //  the one that actually matters -- the next visitor puts it on and
  //  must find the start flower, not the last person's half-used
  //  session.
  //  `now` is passed rather than read so the harness can drive a doff of
  //  a known length without waiting out a real one.
  function onHidden(now) {
    if (state === IDLE) { return; }
    hiddenAt = (now === undefined) ? Date.now() : now;
    if (doffTimer !== null) { return; }
    doffTimer = setTimeout(function () {
      doffTimer = null;
      if (hiddenAt !== null) { toIdle(true); }
    }, CFG.guideDoffMs);
  }

  function onVisible(now) {
    var was = hiddenAt;
    hiddenAt = null;
    if (doffTimer !== null) { clearTimeout(doffTimer); doffTimer = null; }
    if (now === undefined) { now = Date.now(); }
    if (was !== null && state !== IDLE && (now - was) >= CFG.guideDoffMs) { toIdle(true); }
  }

  function wireVisibility(sceneEl) {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { onHidden(); } else { onVisible(); }
      });
    }
    if (!sceneEl || !sceneEl.addEventListener) { return; }
    sceneEl.addEventListener('exit-vr', function () { if (state !== IDLE) { toIdle(true); } });
    sceneEl.addEventListener('enter-vr', function () {
      Voice.unlock();                       // the Enter-AR click IS the gesture
      if (typeof Sfx !== 'undefined') { Sfx.unlock(); }
      var s = sceneEl.xrSession;
      if (!s || !s.addEventListener) { return; }
      s.addEventListener('visibilitychange', function () {
        if (s.visibilityState === 'hidden') { onHidden(); } else { onVisible(); }
      });
    });
  }

  // ---------------- the URL overrides ----------------
  //  Read once at load and deliberately not persisted, the convention
  //  every override in this build follows.
  function readMode() {
    if (typeof location === 'undefined' || !location.search) { return; }
    var m = /[?&]guide=([^&]*)/.exec(location.search);
    if (m) {
      if (m[1] === '0' || m[1] === 'off') { mode = 'off'; }
      else if (m[1] === 'live') { mode = 'live'; }
    }
    if (/[?&]vo=0/.test(location.search)) { Voice.setEnabled(false); }
    //  v10.4, the same convention: read once, never persisted. Silences
    //  the bed, the wingbeats and the click; the narration is untouched.
    if (/[?&]sfx=0/.test(location.search) && typeof Sfx !== 'undefined') { Sfx.setEnabled(false); }
  }

  return {
    IDLE: IDLE, WELCOME: WELCOME, LIVE: LIVE, WRAPUP: WRAPUP, FAREWELL: FAREWELL,
    tick: tick, begin: begin, noteActivity: noteActivity,
    endSession: function () { toFarewell(); },
    handover: function () { toIdle(true); },
    exclusive: exclusive, roomLive: roomLive,
    ctlAlpha: ctlAlpha, flowerAlpha: flowerAlpha,
    state: function () { return state; },
    mode: function () { return mode; },
    //  the harness reads these; nothing in the scene does
    stats: function () {
      return { state: state, stateT: stateT, quietT: quietT, sessionT: sessionT, joined: joined };
    },
    //  the visibility path, exposed so tools/reach can drive a doff of a
    //  known length. Nothing in the scene calls it -- the two real
    //  listeners in wireVisibility() do.
    _visible: function (vis, now) { if (vis) { onVisible(now); } else { onHidden(now); } },
    _boot: function (sceneEl) {
      if (booted) { return; }
      booted = true;
      Voice.init();
      //  BEFORE readMode(), which may switch it off -- and before wire(),
      //  so the first gesture the page sees is already being listened for.
      if (typeof Sfx !== 'undefined') { Sfx.init(); Sfx.wire(sceneEl); }
      readMode();
      wire();
      wireVisibility(sceneEl);
      //  set from the first frame, not from the first tick: with ?guide=0
      //  the flower must never be drawn at all, and it starts at 1
      if (mode !== 'on') { ctlP = ctlA = 1; flowerP = flowerA = 0; }
      if (mode === 'live') { toState(LIVE); }
    }
  };
})();


// ============================================================
//  the component  --  the start flower, and the provider face
// ============================================================
//  The flower is UI.blob(), the same six-lobed cluster keyboard.js
//  builds accept and delete from, at its own hue, its own place and
//  clearly bigger than either. In idle it is the only pickable thing in
//  the room, so pointing anywhere lights up one shape and nothing else:
//  there is nothing to read and nothing to learn.
//
//  It is offered with `panel: true`, which puts it on interact.js's
//  panel layer -- the tuned, tighter pick path the two controls already
//  use ("the controls win", panelPickBase / panelTouchRadius) -- and it
//  is picked by the desktop mouse through exactly the same call.
// ============================================================
AFRAME.registerComponent('session-guide', {
  init: function () {
    var self = this;
    this.root = new THREE.Group();
    this.el.setObject3D('mesh', this.root);

    this.blob = UI.blob(CFG.guideBlobSeed, CFG.blobW * CFG.guideBlobK, CFG.blobH * CFG.guideBlobK);
    this.anchor = CFG.panelPos(CFG.guideBlobX, CFG.guideBlobY);
    this.blob.mesh.position.copy(this.anchor);
    this.blob.mesh.rotation.set(0, CFG.guideBlobCant, CFG.guideBlobTilt);
    this.root.add(this.blob.mesh);

    this.pos = this.anchor.clone();
    this.radius = CFG.blobW * CFG.guideBlobK * 1.15;
    this.hot = false; this.wasHot = null;
    this.scale = 1; this.vel = 0;

    this.el.sceneEl.addEventListener('loaded', function () { Guide._boot(self.el.sceneEl); });
    //  the scene may already be loaded when a component initialises late
    if (this.el.sceneEl.hasLoaded) { Guide._boot(this.el.sceneEl); }

    //  Operator override. Escape ends the session and hands over at
    //  once -- for a visitor who walks off without taking the headset
    //  off, or for a stall on the floor.
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { Guide.handover(); }
    });
  },

  // ---------------- the provider face ----------------
  targets: function () {
    if (Guide.state() !== Guide.IDLE || Guide.mode() === 'off') { return []; }
    return [{ id: 'begin', pos: this.pos, radius: this.radius * CFG.panelPickShrink, panel: true }];
  },

  //  The WHOLE hot set, every provider's ids in it. Two jobs: our own
  //  flower's highlight, and -- for free -- PRESENCE. Anything hot at
  //  all means the visitor is pointing at something, which is the signal
  //  the quiet clock runs on.
  setHot: function (idSet) {
    this.hot = !!idSet.begin;
    for (var k in idSet) {
      if (idSet.hasOwnProperty(k) && idSet[k]) { Guide.noteActivity(); break; }
    }
  },

  activate: function (id) {
    if (id !== 'begin') { return; }
    this.vel += CFG.acceptConfirmKick;      // the same bounce accept's confirmation uses
    Guide.begin();
  },

  exclusive: function () { return Guide.exclusive(); },

  // ---------------- per frame ----------------
  tick: function (time, dtMs) {
    if (!dtMs) { return; }
    var dt = Math.min(dtMs / 1000, 0.05);
    var t = time / 1000;

    Guide.tick(dt);

    var a = Guide.flowerAlpha();
    this.blob.setAlpha(a);
    if (a <= 0.01) { return; }              // invisible: nothing else is worth doing

    var live = Guide.state() === Guide.IDLE;
    var want = (this.hot && live) ? 'hot' : 'off';
    if (want !== this.wasHot) {
      this.wasHot = want;
      this.blob.setColor(CFG.guideBlobHue, want === 'hot' ? CFG.guideBlobLitHot : CFG.guideBlobLit);
    }

    //  Exactly keyboard.js:tickUI's treatment of a control: float it on
    //  two periods that do not divide into each other, sway the tilt,
    //  and run the scale as an under-damped SPRING so a press rings down
    //  rather than easing back.
    var m = this.blob.mesh;
    m.position.set(
      this.anchor.x + 0.016 * Math.sin(t * 0.31),
      this.anchor.y + 0.013 * Math.sin(t * 0.23 + 1.7),
      this.anchor.z
    );
    this.pos.copy(m.position);
    m.rotation.set(0, CFG.guideBlobCant, CFG.guideBlobTilt + 0.12 * Math.sin(t * 0.13));

    var breathe = 1 + CFG.blobPulse * 1.4 * Math.sin(t * 0.9);
    var target = (this.hot && live ? 1.22 : 1) * breathe;
    this.vel += (target - this.scale) * CFG.ctlSpring * dt;
    this.vel *= Math.pow(CFG.ctlDamp, dt * 60);
    this.scale += this.vel * dt;
    if (this.scale < 0.25) { this.scale = 0.25; this.vel = 0; }
    m.scale.setScalar(this.scale);

    this.blob.shape(t);
  },

  remove: function () {
    this.blob.dispose();
    this.el.removeObject3D('mesh');
  }
});
