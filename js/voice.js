// ============================================================
//  voice.js  --  the narration, and nothing else
// ============================================================
//  v10. One named cue at a time, played to the whole room. There is no
//  positional audio here and there should not be: the voice is not a
//  thing in the scene, it is the piece talking to the visitor.
//
//      Voice.play('recall')      -> starts it, stops whatever was playing
//      Voice.play(['a','b','c'])  -> ...and a SEQUENCE, back to back
//      Voice.playing()           -> is a cue sequence still running
//      Voice.stop()
//      'voice:ended'             -> fired when a cue finishes, WITH ITS NAME
//
//  A SEQUENCE IS ONE CUE as far as everything else is concerned. The
//  opening is three separate recordings -- the welcome, what to do, and
//  how to do it -- and the guide must not treat the silence between two
//  of them as the narration having finished: `playing()` stays true
//  across the gap, so the room does not unlock early and the quiet clock
//  does not start counting mid-sentence.
//
//  THREE RULES, all load-bearing.
//
//  1. A MISSING CUE IS A SILENT NO-OP THAT STILL FINISHES. play() on a
//     cue with no file behind it returns false and fires 'voice:ended'
//     on the next tick, exactly as a real track would. guide.js is
//     therefore drivable end to end with no audio in the build at all,
//     which is the whole point -- the tracks are being cut separately.
//     Nothing in the piece may ever WAIT on audio: the guide advances on
//     state, and every wait it does have carries its own timeout.
//
//  2. NO AudioContext. HTMLAudioElement and `.volume`, nothing else. No
//     resume() dance, no graph to get wrong inside an XR session, no
//     decode cost and no decoded copy in memory. duck() is a level
//     write. If a music bed is ever added it goes on its own element
//     with its own level and this file does not change shape.
//
//  3. NO `Audio` CONSTRUCTOR -> THE WHOLE MODULE IS A NO-OP. That is
//     what lets tools/reach/ drive the guide headless under
//     JavaScriptCore, where there is no DOM at all.
//
//  THE UNLOCK, and why it hangs off the Enter-AR button.
//
//  Browsers refuse programmatic playback until the page has had a real
//  user gesture. A HAND-TRACKED PINCH IS NOT ONE -- it is our own
//  threshold on a joint distance, invisible to the browser -- so the
//  visitor pressing the start flower cannot authorise anything. What
//  can, and always happens first, is the click on A-Frame's Enter AR
//  button: you cannot get into the piece without it. unlock() plays and
//  immediately pauses every element from inside that gesture, after
//  which later programmatic play() calls are allowed. It is also wired
//  to the first click/keydown/touchstart on the document, which covers
//  the desktop.
//
//  Loads after config.js (it reads CFG.voCues) and before guide.js.
// ============================================================
var Voice = (function () {
  'use strict';

  var HAVE_AUDIO = (typeof Audio !== 'undefined');

  var els = {};              // name -> HTMLAudioElement, built once
  var current = null;        // the element sounding right now
  var currentName = null;
  var pendingEnd = null;     // a silent cue's name, to "finish" next tick
  var queue = [];            // what is still to come in this sequence
  var gapT = 0;              // seconds left of the beat between two of them
  var unlocked = false;
  var level = 1;             // duck() writes this; every play honours it
  var enabled = true;        // ?vo=0 turns the narration off, guide intact

  function fire(name) {
    if (typeof window === 'undefined' || !window.dispatchEvent) { return; }
    window.dispatchEvent(new CustomEvent('voice:ended', { detail: { cue: name } }));
  }

  //  Build one element per cue that has a file behind it. Deliberately
  //  lazy and deliberately tolerant: a cue whose entry is missing, null
  //  or '' simply has no element, and every call about it is a no-op.
  function init() {
    if (!HAVE_AUDIO) { return; }
    var cues = (typeof CFG !== 'undefined' && CFG.voCues) || {};
    for (var name in cues) {
      if (!cues.hasOwnProperty(name) || !cues[name]) { continue; }
      if (els[name]) { continue; }
      var a = new Audio();
      a.src = cues[name];
      a.preload = 'auto';
      a.loop = false;
      a.volume = level;
      //  named in the closure so the handler knows which cue ended --
      //  a bare `currentName` would be wrong if a second cue started
      //  between the end and the event
      (function (nm, el) {
        el.addEventListener('ended', function () {
          if (current === el) { current = null; currentName = null; }
          fire(nm);
        });
        //  a 404 or an unsupported codec must not stall the guide: treat
        //  it exactly as a missing cue and finish immediately
        el.addEventListener('error', function () {
          if (current === el) { current = null; currentName = null; }
          console.warn('[voice] cue "' + nm + '" failed to load (' + el.src + ')');
          fire(nm);
        });
      })(name, a);
      els[name] = a;
    }
  }

  //  From a real DOM gesture only. Play-then-pause on every element is
  //  the standard way to spend one gesture on all of them at once; a
  //  rejected promise here is normal and means the gesture was not one.
  function unlock() {
    if (!HAVE_AUDIO || unlocked) { return; }
    unlocked = true;
    for (var name in els) {
      if (!els.hasOwnProperty(name)) { continue; }
      var el = els[name];
      try {
        var p = el.play();
        if (p && p.then) { p.then(function () { /* paused below */ }).catch(function () {}); }
        el.pause();
        el.currentTime = 0;
      } catch (e) { /* not a gesture -- the next one will do */ }
    }
  }

  //  A name, or a list of them to play back to back. Returns true only if
  //  a REAL track started. Either way every cue finishes: a silent one on
  //  the next tick, a real one on its own 'ended'. Both arrive as
  //  'voice:ended' carrying the cue's name.
  function play(what) {
    stop();
    if (Object.prototype.toString.call(what) === '[object Array]') {
      queue = what.slice();
      return startNext();
    }
    queue.length = 0;
    return start(what);
  }

  function startNext() {
    if (!queue.length) { return false; }
    return start(queue.shift());
  }

  function start(name) {
    if (!enabled || !HAVE_AUDIO || !els[name]) { pendingEnd = name; return false; }
    var el = els[name];
    try {
      el.currentTime = 0;
      el.volume = level;
      var p = el.play();
      if (p && p.catch) {
        p.catch(function () {
          //  blocked (no gesture yet) or interrupted -- do not leave the
          //  guide waiting on a track that will never sound
          if (current === el) { current = null; currentName = null; }
          fire(name);
        });
      }
    } catch (e) { pendingEnd = name; return false; }
    current = el;
    currentName = name;
    return true;
  }

  function stop() {
    pendingEnd = null;
    queue.length = 0;
    gapT = 0;
    if (!current) { return; }
    try { current.pause(); current.currentTime = 0; } catch (e) {}
    current = null;
    currentName = null;
  }

  //  TRUE ACROSS THE WHOLE SEQUENCE, gaps included -- see the header. A
  //  pending silent cue counts too, so a missing file in the middle of a
  //  sequence does not read as the narration having stopped.
  function playing() {
    if (queue.length || gapT > 0 || pendingEnd !== null) { return true; }
    if (!current) { return false; }
    return !current.paused && !current.ended;
  }

  //  The level every cue is played at. v10 never calls this -- it is the
  //  seam a music bed would duck through, kept so adding one is a level
  //  write rather than a rewrite.
  function duck(g) {
    level = Math.max(0, Math.min(1, g));
    if (current) { try { current.volume = level; } catch (e) {} }
  }

  //  Drains the silent-cue finish, the beat between two cues, and the
  //  queue. guide.js calls this once a frame, so all three run on the SIM
  //  clock like everything else rather than on a timer that a frame drop
  //  can outrun (the v8.2 lesson).
  function tick(dt) {
    dt = dt || 0;
    if (pendingEnd !== null) {
      var nm = pendingEnd;
      pendingEnd = null;
      fire(nm);
      if (queue.length) { gapT = CFG.voGap; }
      return;
    }
    if (gapT > 0) {
      gapT -= dt;
      if (gapT <= 0) { gapT = 0; startNext(); }
      return;
    }
    //  a real track that has finished on its own: the 'ended' listener
    //  cleared `current`, and the next one waits out the same beat
    if (!current && queue.length && gapT === 0) { gapT = CFG.voGap; }
  }

  return {
    init: init, unlock: unlock, play: play, stop: stop,
    playing: playing, duck: duck, tick: tick,
    cue: function () { return currentName; },
    available: function () { return HAVE_AUDIO; },
    setEnabled: function (v) { enabled = !!v; if (!enabled) { stop(); } },
    isEnabled: function () { return enabled; }
  };
})();
