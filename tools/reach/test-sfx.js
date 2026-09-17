// ------------------------------------------------------------
//  sfx.js: the room's sound -- the looping bed, the wingbeats and the
//  select click.
//
//  Every other suite in this folder runs with NO audio, which is the
//  property the build depends on. This one is the other half: it stands
//  a minimal HTMLAudioElement up (src, volume, currentTime, duration,
//  loop, play/pause, ended) and drives the module on a fixed 1/60 clock
//  with the REAL durations of the four recordings, so the things that
//  cannot be eyeballed get checked --
//
//    * the bed's envelope reaches zero AT THE LOOP SEAM. This is the
//      whole reason there is no crossfade: the recording starts loud
//      (0.116 RMS in its first quarter second) and ends near-silent
//      (0.003), so a bare `loop = true` bangs once every 2:21. If this
//      assertion ever goes, the room clicks on the minute.
//    * only ever ONE wingbeat sounding, and both recordings used.
//    * the duck goes down under the narration AND comes back up. A duck
//      that sticks leaves the bed quiet for the rest of the day.
//    * the click POOL retriggers round-robin, so a visitor spelling a
//      name quickly does not cut every second press dead.
//
//      jsc test-sfx.js        (or sh run.sh, which includes it)
// ------------------------------------------------------------
load('stub-three.js');
load('stub-scene.js');
var V10 = '../../';          // this folder is <build>/tools/reach

// ---- the element, with just the surface sfx.js touches ----
//  Real lengths, because the envelopes are read off duration and the
//  seam only lands where it does at 141.18 s.
var DUR = {
  'audio/sfx/bg_music.m4a': 141.18,
  'audio/sfx/wing1.m4a':      5.00,
  'audio/sfx/wing2.m4a':      2.25,
  'audio/sfx/select.m4a':     1.85
};
var ALL = [], PLAYS = [];
function Audio() {
  this._src = ''; this.preload = ''; this.loop = false; this.volume = 0;
  this.currentTime = 0; this.paused = true; this.ended = false; this.duration = NaN;
  var self = this;
  Object.defineProperty(this, 'src', {
    get: function () { return self._src; },
    set: function (v) { self._src = v; self.duration = DUR[v]; }
  });
  this._on = {};
  this.addEventListener = function (k, fn) { (this._on[k] = this._on[k] || []).push(fn); };
  this.emit = function (k) {
    var h = this._on[k] || [];
    for (var i = 0; i < h.length; i++) { h[i](); }
  };
  this.play = function () {
    this.paused = false; this.ended = false;
    PLAYS.push(this._src);
    return { catch: function () {} };
  };
  this.pause = function () { this.paused = true; };
  ALL.push(this);
}

//  Not the real thing -- just the one method sfx.js asks about.
var Voice = { _t: false, playing: function () { return this._t; } };

load(V10 + 'js/config.js');
load(V10 + 'js/sfx.js');

var FAIL = 0;
function ok(c, w) { if (!c) { FAIL++; print('  FAIL  ' + w); } else { print('  ok    ' + w); } }

var DT = 1 / 60;
//  `render` false is A-Frame's tick loop STOPPED -- a hidden tab, a
//  headset off the face. The media clock keeps running either way, which
//  is the whole point of the case.
function frames(n, render) {
  if (render === undefined) { render = true; }
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < ALL.length; j++) {
      var a = ALL[j];
      if (a.paused) { continue; }
      var was = a.currentTime;
      a.currentTime += DT;
      if (a.currentTime >= a.duration) {
        if (a.loop) { a.currentTime -= a.duration; }
        else { a.currentTime = a.duration; a.ended = true; a.paused = true; }
      }
      //  a real element fires this about four times a second
      if (Math.floor(a.currentTime * 4) !== Math.floor(was * 4)) { a.emit('timeupdate'); }
    }
    if (render) { Sfx.tick(DT); }
  }
}
function live(kind) {
  var n = 0;
  for (var j = 0; j < ALL.length; j++) {
    if (ALL[j]._src.indexOf(kind) >= 0 && !ALL[j].paused) { n++; }
  }
  return n;
}

print('== nothing sounds until the page has had a gesture ==');
Sfx.init();
Sfx.wire(null);
ok(Sfx.available(), 'the element stub is seen');
ok(!Sfx.playingMusic(), 'the bed is silent before any gesture');
//  select() is deliberately NOT gated on the unlock. The browser blocks
//  it anyway until a gesture, and every path that reaches it -- a mouse
//  click, a touch, a keypress -- IS one, caught by the capture-phase
//  listener wire() puts on the document a moment earlier. Gating it as
//  well would mean one missed listener silences every click for the rest
//  of the day, to prevent a sound that could not have been heard.
Sfx.select();
ok(PLAYS.length === 1, 'a select before the gesture is attempted, not swallowed');
PLAYS.length = 0;
Sfx.unlock();
ok(Sfx.playingMusic(), 'the first gesture starts the bed');

print('\n== the bed comes up, rather than banging in ==');
var music = ALL[0];
frames(1);
ok(music.volume < 0.05, 'from nothing, vol ' + music.volume.toFixed(3));
frames(89);                                   // 1.5 s -- half of sfxMusicFadeIn
ok(music.volume > 0.15 && music.volume < 0.35, 'half way up at 1.5 s, vol ' + music.volume.toFixed(3));
frames(120);
ok(Math.abs(music.volume - CFG.sfxMusicGain) < 1e-6,
   'and at sfxMusicGain by 3.5 s, vol ' + music.volume.toFixed(3));

print('\n== ...and goes through ZERO at the loop seam ==');
frames(Math.round((141.18 - 3.5 - 1.25) * 60));
ok(music.volume > 0.15 && music.volume < 0.35,
   'half way down 1.25 s from the end, vol ' + music.volume.toFixed(3));
var minv = 1;
for (var i = 0; i < Math.round(2.5 * 60); i++) {
  frames(1);
  if (music.currentTime < 1.0) { minv = Math.min(minv, music.volume); }
}
ok(minv < 0.02, 'silent across the join, min ' + minv.toFixed(4));
ok(music.currentTime < 5 && !music.paused, 'and it looped rather than stopping, t ' + music.currentTime.toFixed(2));
frames(4 * 60);
ok(Math.abs(music.volume - CFG.sfxMusicGain) < 1e-6, 'back at full on the second pass, vol ' + music.volume.toFixed(3));

print('\n== the bed keeps its level with NOTHING rendering ==');
//  A-Frame's tick is requestAnimationFrame and rAF stops dead while the
//  page is hidden -- every time a headset comes off the face. The media
//  clock does not, so a seam crossed while hidden would come back up
//  SILENT and stay that way for the rest of the day. The level therefore
//  rides the element's own 'timeupdate' as well as the tick.
var before = music.volume;
frames(Math.round(4 * 60), false);                    // four seconds, no tick at all
ok(Math.abs(music.volume - CFG.sfxMusicGain) < 1e-6,
   'the level holds mid-track, vol ' + music.volume.toFixed(3));
//  ...and across a seam
while (music.currentTime < 141.18 - 3.0) { frames(30, false); }
frames(Math.round(6 * 60), false);                    // through the join and out the far side
ok(music.currentTime < 4 && !music.paused, 'it looped unrendered, t ' + music.currentTime.toFixed(2));
ok(music.volume > CFG.sfxMusicGain * 0.6,
   'and came back UP on the other side, vol ' + music.volume.toFixed(3));
frames(4 * 60);

print('\n== the wingbeats ==');
PLAYS.length = 0;
var over = 0;
for (var i = 0; i < 60 * 300; i++) {          // five minutes
  frames(1);
  if (live('wing') > 1) { over++; }
}
var w = PLAYS.filter(function (s) { return s.indexOf('wing') >= 0; });
ok(w.length > 10, 'they keep coming -- ' + w.length + ' in five minutes');
ok(w.indexOf('audio/sfx/wing1.m4a') >= 0 && w.indexOf('audio/sfx/wing2.m4a') >= 0,
   'both recordings get used');
ok(over === 0, 'and never two at once, overlaps ' + over);
//  the gap band. Five minutes is 300 s; at 4-14 s of quiet plus 2.25-5 s
//  of sound the count has to land well inside these.
ok(w.length >= 15 && w.length <= 50, 'at roughly the configured rate, ' + w.length + ' of them');

print('\n== the narration wins ==');
Voice._t = true;
frames(60);
ok(music.volume < CFG.sfxMusicGain * 0.5, 'the bed ducks under it, vol ' + music.volume.toFixed(3));
Voice._t = false;
frames(60);
ok(music.volume > CFG.sfxMusicGain * 0.9, 'and comes back when it stops, vol ' + music.volume.toFixed(3));

print('\n== the click is a pool, not an element ==');
PLAYS.length = 0;
for (var i = 0; i < 6; i++) { Sfx.select(); }
ok(PLAYS.length === 6, 'six presses, six plays -- none swallowed');
var sels = ALL.filter(function (a) { return a._src.indexOf('select') >= 0; });
ok(sels.length === CFG.sfxSelectVoices, CFG.sfxSelectVoices + ' voices, as configured');
var fresh = 0;
for (var i = 0; i < sels.length; i++) { if (sels[i].currentTime === 0 && !sels[i].paused) { fresh++; } }
ok(fresh === sels.length, 'all of them sounding at once, so fast presses overlap');

print('\n== ?sfx=0 ==');
Sfx.setEnabled(false);
ok(!Sfx.playingMusic(), 'stops the bed');
ok(live('wing') === 0, 'and the wingbeats with it');
PLAYS.length = 0;
Sfx.select();
ok(PLAYS.length === 0, 'and silences the click');
Sfx.setEnabled(true);
frames(2);
ok(Sfx.playingMusic(), 'switching it back on restarts the bed');

print(FAIL ? '\n*** ' + FAIL + ' FAILED ***' : '\nall passed');
