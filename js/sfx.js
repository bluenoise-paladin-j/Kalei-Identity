// ============================================================
//  sfx.js  --  the room's sound: a music bed, wingbeats, and a click
// ============================================================
//  v10.4. Everything that is NOT the narration. voice.js is the piece
//  talking to the visitor; this is the room the visitor is standing in,
//  and the two are deliberately separate objects with separate levels
//  so one can duck under the other.
//
//      Sfx.select()          one-shot, on every activation
//      Sfx.unlock()          spend a real gesture on every element
//      Sfx.tick(dt)          the envelopes and the wingbeat scheduler
//      Sfx.setEnabled(v)     ?sfx=0
//
//  THREE SOUNDS, THREE DIFFERENT SHAPES OF PLAYBACK.
//
//  1. THE BED. bg_music, `loop = true`, running from the first gesture
//     to the end of the day -- it is not part of the session and does
//     not stop between visitors. The recording starts LOUD (0.116 RMS
//     in its first quarter-second) and ends in near-silence (0.003), so
//     a bare loop bangs on every seam. Its level is therefore an
//     ENVELOPE READ OFF `currentTime`: up over sfxMusicFadeIn at the
//     head, down over sfxMusicFadeOut at the tail. Because currentTime
//     resets when the element loops, that one expression is both the
//     fade-in the piece opens with AND the crossfadeless seam, for
//     free. It also hides the encoder padding an AAC loop leaves at the
//     join -- the gap lands where the level is already zero.
//
//  2. THE WINGBEATS. Two recordings, picked at random with a random
//     gap between (sfxWingGapMin..Max), one sounding at a time. Same
//     envelope helper as the bed, so each one fades up and away rather
//     than snapping in. They are atmosphere, not feedback: nothing in
//     the piece triggers them and nothing waits on them.
//
//  3. THE CLICK. A POOL, not an element. Retriggering one element cuts
//     the previous sound dead, and a visitor spelling a name presses
//     things faster than the 1.85 s the recording runs -- so N voices
//     round-robin and overlapping selects overlap.
//
//  THE LEVELS ARE NOT ARBITRARY. Measured off the masters:
//
//      bg_music   RMS -28.5 dB    peak  -3.8 dB
//      select     RMS -30.5 dB    peak -13.8 dB
//      wing1      RMS -42.8 dB    peak -21.1 dB
//      wing2      RMS -46.8 dB    peak -30.7 dB
//
//  The wingbeats are recorded some 15-18 dB under the bed. Played at
//  matched gains they are simply not there, so sfxWingGain is 1 and the
//  BED is the one pulled down (sfxMusicGain). Turn the room up by
//  raising the bed, not by touching the wings.
//
//  TWO RULES CARRIED OVER FROM voice.js, for the same reasons.
//
//  * NO AudioContext. HTMLAudioElement and `.volume`, nothing else --
//    no resume() dance inside an XR session, no decode cost, no graph
//    to get wrong. Every fade in this file is a level write on a tick.
//  * NO `Audio` CONSTRUCTOR -> THE WHOLE MODULE IS A NO-OP, so
//    tools/reach/ drives the scene headless under JavaScriptCore where
//    there is no DOM. Nothing in the piece may ever wait on a sound.
//
//  THE UNLOCK is voice.js's problem too: browsers refuse programmatic
//  playback until a real gesture, and a hand-tracked pinch is not one.
//  The bed has to start before the visitor has pressed anything, so
//  unlock() is wired to the first click/keydown/touchstart on the
//  document AND to the Enter-AR button, and it starts the bed as well
//  as spending the gesture. Until then the room is silent, which is the
//  correct behaviour for a page nobody has touched.
//
//  Loads after config.js (it reads CFG.sfx*) and after voice.js, whose
//  playing() it ducks under.
// ============================================================
var Sfx = (function () {
  'use strict';

  var HAVE_AUDIO = (typeof Audio !== 'undefined');

  var music = null;          // the bed, loop = true
  var wings = [];            // [{ name, el }]
  var sel = [];              // the click pool
  var selNext = 0;

  var enabled = true;
  var unlocked = false;
  var started = false;       // has the bed actually been told to play

  var wingIdx = -1;          // which wing element is sounding, -1 for none
  var wingT = 0;             // seconds until the next one starts

  var duck = 1;              // eased 1 -> CFG.sfxDuck while the narration talks

  function ease(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }

  //  Up over `inS` at the head, down over `outS` at the tail, smooth at
  //  both ends. `dur` NaN (metadata not in yet) just skips the tail --
  //  the head fade still works, so a bed that starts before its own
  //  duration is known still comes up rather than banging in.
  function envelope(t, dur, inS, outS) {
    var a = (inS > 0) ? (t / inS) : 1;
    var b = (outS > 0 && dur > 0) ? ((dur - t) / outS) : 1;
    return ease(Math.min(a, b));
  }

  function make(src, loop) {
    var a = new Audio();
    a.src = src;
    a.preload = 'auto';
    a.loop = !!loop;
    a.volume = 0;
    a.addEventListener('error', function () {
      console.warn('[sfx] "' + src + '" failed to load');
    });
    return a;
  }

  function init() {
    if (!HAVE_AUDIO || music || wings.length) { return; }
    var s = (typeof CFG !== 'undefined' && CFG.sfx) || {};
    var i;

    if (s.music) {
      music = make(s.music, true);
      //  the level rides the media clock, not the render loop -- see
      //  applyMusic()
      music.addEventListener('timeupdate', applyMusic);
    }

    var names = (typeof CFG !== 'undefined' && CFG.sfxWings) || [];
    for (i = 0; i < names.length; i++) {
      if (!s[names[i]]) { continue; }
      wings.push({ name: names[i], el: make(s[names[i]], false) });
    }
    wingT = CFG.sfxWingFirstGap;

    //  The pool. One element per voice, all on the same file: the
    //  browser fetches it once and every copy shares the cache entry.
    if (s.select) {
      var n = Math.max(1, CFG.sfxSelectVoices);
      for (i = 0; i < n; i++) { sel.push(make(s.select, false)); }
    }
  }

  //  Every element gets the gesture at once -- play-then-pause is the
  //  standard way to spend one on all of them. The bed is the exception:
  //  it is left RUNNING, because starting it is the whole point of
  //  catching the gesture in the first place.
  function unlock() {
    if (!HAVE_AUDIO || unlocked) { return; }
    unlocked = true;
    var all = sel.slice();
    var i;
    for (i = 0; i < wings.length; i++) { all.push(wings[i].el); }
    for (i = 0; i < all.length; i++) {
      try {
        var p = all[i].play();
        if (p && p.catch) { p.catch(function () {}); }
        all[i].pause();
        all[i].currentTime = 0;
      } catch (e) { /* not a gesture -- the next one will do */ }
    }
    startMusic();
  }

  //  THE BED'S LEVEL, from its own clock. Called from tick() at frame rate
  //  for a smooth fade, AND from the element's own 'timeupdate' (~4 Hz)
  //  so the level is still right when nothing is rendering.
  //
  //  That second path is not belt and braces. A-Frame's tick loop is
  //  requestAnimationFrame, and rAF stops dead while the page is hidden
  //  -- which on a headset is every time it comes off the face, and on a
  //  desktop is any backgrounded tab. The media clock keeps running
  //  regardless, so without this the bed plays on at whatever volume the
  //  last rendered frame left it at, and a loop seam crossed while hidden
  //  comes back up SILENT and stays that way. Found by watching the
  //  element's own clock advance with `v` stuck at 0.
  function applyMusic() {
    if (!music || !started) { return; }
    var d = isFinite(music.duration) ? music.duration : 0;
    var g = envelope(music.currentTime, d, CFG.sfxMusicFadeIn, CFG.sfxMusicFadeOut);
    try { music.volume = CFG.sfxMusicGain * g * duck; } catch (e) {}
  }

  function startMusic() {
    if (!music || started || !enabled) { return; }
    try {
      music.volume = 0;                  // the envelope brings it up
      var p = music.play();
      if (p && p.catch) {
        p.catch(function () { started = false; });   // blocked: the next gesture retries
      }
      started = true;
    } catch (e) { started = false; }
  }

  // ---------------- the click ----------------
  //  Round-robin, so two selects a few hundred ms apart do not cut each
  //  other off. Deliberately fire-and-forget: it returns nothing, it is
  //  never waited on, and with no file behind it it does nothing at all.
  function select() {
    if (!enabled || !sel.length) { return; }
    var el = sel[selNext];
    selNext = (selNext + 1) % sel.length;
    try {
      el.currentTime = 0;
      el.volume = CFG.sfxSelectGain * duck;
      var p = el.play();
      if (p && p.catch) { p.catch(function () {}); }
    } catch (e) {}
  }

  // ---------------- the wingbeats ----------------
  function startWing() {
    if (!wings.length) { return; }
    //  Pure random, not alternating: with two recordings "never the same
    //  one twice" IS strict ping-pong, which is the one pattern an ear
    //  picks out of a quiet room.
    wingIdx = Math.floor(Math.random() * wings.length) % wings.length;
    var el = wings[wingIdx].el;
    try {
      el.currentTime = 0;
      el.volume = 0;                     // the envelope brings it up
      var p = el.play();
      if (p && p.catch) { p.catch(function () { wingIdx = -1; }); }
    } catch (e) { wingIdx = -1; }
  }

  function gap() {
    return CFG.sfxWingGapMin + Math.random() * (CFG.sfxWingGapMax - CFG.sfxWingGapMin);
  }

  // ---------------- per frame ----------------
  //  Driven from guide.js's tick, on the SIM clock like everything else
  //  -- not on a timer a frame drop can outrun (the v8.2 lesson).
  function tick(dt) {
    if (!HAVE_AUDIO) { return; }
    dt = dt || 0;

    //  THE DUCK. The narration is the piece speaking and must win; the
    //  bed and the wings drop under it and come back. Eased, so the
    //  return is not a step on the frame a cue ends.
    var talking = (typeof Voice !== 'undefined') && Voice.playing();
    var want = talking ? CFG.sfxDuck : 1;
    var step = dt / Math.max(0.05, CFG.sfxDuckFade);
    duck = (Math.abs(want - duck) <= step) ? want : duck + (want > duck ? step : -step);

    applyMusic();

    if (!enabled || !unlocked || !wings.length) { return; }

    if (wingIdx >= 0) {
      var w = wings[wingIdx].el;
      if (w.ended || w.paused) {
        wingIdx = -1;
        wingT = gap();
      } else {
        var wd = isFinite(w.duration) ? w.duration : 0;
        var wg = envelope(w.currentTime, wd, CFG.sfxWingFade, CFG.sfxWingFade);
        try { w.volume = CFG.sfxWingGain * wg * duck; } catch (e) {}
      }
      return;
    }

    wingT -= dt;
    if (wingT <= 0) { wingT = 0; startWing(); }
  }

  function stopAll() {
    var all = sel.slice();
    var i;
    for (i = 0; i < wings.length; i++) { all.push(wings[i].el); }
    if (music) { all.push(music); }
    for (i = 0; i < all.length; i++) {
      try { all[i].pause(); all[i].currentTime = 0; } catch (e) {}
    }
    started = false;
    wingIdx = -1;
    wingT = CFG.sfxWingFirstGap;
  }

  //  From the first real gesture the page sees, whatever it is. The bed
  //  has to start before the visitor has pressed anything in the scene,
  //  so unlike the narration this cannot wait for the Enter-AR click --
  //  though that is wired too, since on a headset it is the first
  //  gesture there is.
  function wire(sceneEl) {
    if (typeof document === 'undefined' || !document.addEventListener) { return; }
    var kinds = ['click', 'keydown', 'touchstart', 'pointerdown'];
    function go() {
      unlock();
      for (var i = 0; i < kinds.length; i++) { document.removeEventListener(kinds[i], go, true); }
    }
    for (var i = 0; i < kinds.length; i++) { document.addEventListener(kinds[i], go, true); }
    if (sceneEl && sceneEl.addEventListener) {
      sceneEl.addEventListener('enter-vr', function () { unlock(); startMusic(); });
    }
  }

  return {
    init: init, wire: wire, unlock: unlock, tick: tick,
    select: select, stopAll: stopAll,
    available: function () { return HAVE_AUDIO; },
    playingMusic: function () { return !!(music && started && !music.paused); },
    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled) { stopAll(); } else { startMusic(); }
    },
    isEnabled: function () { return enabled; },
    //  The harness reads these, and so does anyone debugging a silent
    //  headset from the browser console -- `t` advancing with `v` at
    //  sfxMusicGain is the whole "is the bed actually sounding" question,
    //  and neither is visible any other way (these elements are built
    //  with `new Audio()` and are not in the document).
    _stats: function () {
      return {
        duck: duck, wing: wingIdx, wingT: wingT, started: started, unlocked: unlocked,
        music: music ? { t: music.currentTime, v: music.volume, paused: music.paused,
                         dur: music.duration, err: music.error ? music.error.code : 0 } : null
      };
    }
  };
})();
