// ------------------------------------------------------------
//  guide.js: the session -- idle / welcome / live / wrapup / farewell,
//  the lockout that makes the idle room un-pickable, the quiet clock and
//  the three things that freeze it, and the headset handover.
//
//  Nothing here renders and nothing here plays: there is no `Audio` in
//  JavaScriptCore, which is exactly the point -- voice.js degrades to a
//  no-op and the whole arc still has to complete. That is the property
//  the build depends on until the tracks are cut.
//
//  v10.4 loads sfx.js alongside it for the same reason. The bed, the
//  wingbeats and the select click are ticked by guide.js on every frame
//  the session runs, and a sound module that threw on a machine with no
//  Audio would take the whole session down with it.
// ------------------------------------------------------------
load('stub-three.js');
load('stub-scene.js');
var V10 = '../../';          // this folder is <build>/tools/reach
load(V10 + 'js/config.js');
load(V10 + 'js/voice.js');
load(V10 + 'js/sfx.js');
load(V10 + 'js/guide.js');
load(V10 + 'js/hands.js');
load(V10 + 'js/interact.js');

var FAIL = 0;
function ok(c, w) { if (!c) { FAIL++; print('  FAIL  ' + w); } else { print('  ok    ' + w); } }
function V(x, y, z) { return new THREE.Vector3(x, y, z); }

// ---- the two other providers, with the parts the guide reaches for ----
var KB = {
  initialized: true, hot: null, fired: null, resets: 0,
  targets: function () {
    var out = [
      { id: 'accept', pos: V(0.46, 1.16, -0.80), radius: 0.09, panel: true },
      { id: 'delete', pos: V(-0.36, 1.16, -0.80), radius: 0.08, panel: true }
    ];
    for (var i = 0; i < 26; i++) {
      out.push({ id: 'key' + i, pos: V(-2 + i * 0.16, 1.6, -1.7), radius: 0.14, panel: false });
    }
    return out;
  },
  setHot: function (h) { this.hot = h; },
  activate: function (id) { this.fired = id; },
  exclusive: function () { return false; },
  reset: function () { this.resets++; }
};
var COL = {
  initialized: true, hot: null, fired: null, busy: false, released: 0,
  targets: function () {
    return [
      { id: 'col3', pos: V(0, 2.4, -2.4), radius: 0.22, panel: false, layer: 'col' },
      { id: 'col4', pos: V(-2.2, 2.6, -1.9), radius: 0.22, panel: false, layer: 'col' }
    ];
  },
  setHot: function (h) { this.hot = h; },
  activate: function (id) { this.fired = id; },
  exclusive: function () { return this.busy; },
  releaseAll: function () { this.released++; this.busy = false; }
};
ELEMENTS['[butterfly-keyboard]'] = { components: { 'butterfly-keyboard': KB } };
ELEMENTS['[butterfly-collection]'] = { components: { 'butterfly-collection': COL } };

// ---- the guide component ----
var gc = Object.create(COMPONENTS['session-guide']);
gc.el = { sceneEl: SCENE_EL, setObject3D: function () {}, removeObject3D: function () {} };
gc.data = {};
gc.init();
gc.initialized = true;
ELEMENTS['[session-guide]'] = { components: { 'session-guide': gc } };

// ---- what was said ----
//  Spying on Voice.play rather than on the guide: the cue names are the
//  contract between the two, and this is the only place they meet.
var PLAYED = [], CALLS = 0;
var realPlay = Voice.play;
//  flattened: a sequence is ONE call carrying several cue names, and both
//  facts are worth asserting separately
Voice.play = function (n) { CALLS++; PLAYED.push.apply(PLAYED, [].concat(n)); return realPlay.call(Voice, n); };
function saidSince(mark) { return PLAYED.slice(mark); }

// ---- the clock ----
//  50 ms is guide.js's own dt ceiling, so a frame here is a frame there.
var T = 0;
function frames(n, dtMs) {
  dtMs = dtMs || 50;
  for (var i = 0; i < n; i++) { T += dtMs; gc.tick(T, dtMs); }
}
//  NEVER hard-code a beat's duration -- wait on the state, and report how
//  long it took so the timers can be asserted as a band rather than a
//  magic number. (The harness earned this rule the day the collection's
//  band moved and every frames(10) went stale.)
function until(pred, capSeconds) {
  var spent = 0, cap = (capSeconds || 120) * 1000;
  while (!pred() && spent < cap) { T += 50; spent += 50; gc.tick(T, 50); }
  return spent / 1000;
}
function inState(s) { return function () { return Guide.state() === s; }; }

var pi = Object.create(COMPONENTS['pointer-input']);
pi.el = { sceneEl: SCENE_EL };
pi.data = {};
pi.init();

print('== it boots into an idle room ==');
ok(Voice.available() === false, 'there is no Audio here -- voice.js is a no-op, by design');
ok(Guide.state() === 'idle', 'the session starts idle, got ' + Guide.state());
ok(pi.providers().length === 3, 'interact.js finds three providers, got ' + pi.providers().length);
ok(Guide.roomLive() === false, 'the room is not the visitor\'s yet');

print('\n== and NOTHING in it is pickable but the flower ==');
var t0 = pi.gather();
ok(KB.targets().length === 28 && COL.targets().length === 2,
   'the room really is full: 28 keyboard targets and 2 collected');
ok(t0.length === 1, 'exactly one thing is offered, got ' + t0.length);
ok(t0[0].id === 'begin', 'and it is the start flower, got ' + t0[0].id);
ok(t0[0].panel === true, 'offered on the panel layer, so it uses the controls\' own tuned pick path');
ok(pi.layerOf(t0[0]) === 'panel', 'and interact.js agrees it is panel');

var eye = V(0, 1.6, 0);
function shoot(to) {
  var d = new THREE.Vector3().copy(to).sub(eye).normalize();
  return pi.pick(pi.gather(), eye, d);
}
ok(shoot(V(0.46, 1.16, -0.80)) === null, 'accept cannot be pressed in an idle room');
ok(shoot(V(-2 + 7 * 0.16, 1.6, -1.7)) === null, 'nor can a letter be caught');
ok(shoot(V(0, 2.4, -2.4)) === null, 'nor a collected butterfly called over');
var hit = shoot(gc.pos);
ok(hit && hit.id === 'begin', 'the flower can, got ' + (hit && hit.id));

print('\n== a real pinch on it starts the session ==');
//  driven the whole way through interact.js -- the shoulder ray, the
//  pinch edge and the routing -- not by calling activate() by hand
var rig = RIGS.right;
rig.tracked = true;
var sh = new THREE.Vector3(0, 1.6 - CFG.shoulderDown, 0).addScaledVector(V(1, 0, 0), CFG.shoulderOut);
var dir = new THREE.Vector3().copy(gc.pos).sub(sh).normalize();
rig.indexTip = new THREE.Vector3().copy(sh).addScaledVector(dir, 0.55);
rig.indexKnuckle = new THREE.Vector3().copy(sh).addScaledVector(dir, 0.50);
rig.pinch = 0.08;
CAM.matrixWorld.makeBasis(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1));
CAM.position.set(0, 1.6, 0);

var mark = PLAYED.length, calls0 = CALLS;
var f;
for (f = 0; f < 40; f++) { T += 16.7; gc.tick(T, 16.7); pi.tick(T, 16.7); }
ok(gc.hot === true, 'the flower highlights when it is pointed at');
rig.pinch = 0.02;
for (f = 0; f < 6; f++) { T += 16.7; gc.tick(T, 16.7); pi.tick(T, 16.7); }
ok(Guide.state() !== 'idle', 'the pinch started the session, state ' + Guide.state());
ok(KB.fired === null && COL.fired === null, 'nothing else was activated on the way');

//  v10.4: A BEAT FIRST. The press has its own sound now, and the opening
//  landing on the same frame put the confirmation and the first line of
//  the piece on top of each other. Nothing is said for voIntroDelay.
ok(saidSince(mark).length === 0,
   'nothing is said on the frame of the press, got ' + saidSince(mark).join(','));
frames(Math.ceil(CFG.voIntroDelay / 0.05) - 2);
ok(saidSince(mark).length === 0,
   'nor a frame before the beat is up, got ' + saidSince(mark).join(','));
frames(3);
ok(saidSince(mark).join(',') === CFG.voIntro.join(','),
   'and then the whole opening is asked for, got ' + saidSince(mark).join(','));

ok(CALLS - calls0 === 1, 'as ONE play() call, not three, got ' + (CALLS - calls0));

//  ...and the beat may not be mistaken for the narration having finished
ok(Guide.state() === 'welcome', 'the welcome held across the pause rather than falling through');

rig.tracked = false;                       // hand away; the room is the visitor's now
//  the room is pickable from guideUnlockAt (0) regardless of the state
//  name, so this is bookkeeping, not a wait the visitor ever feels
ok(Guide.roomLive() === true, 'the room is live immediately, inside the opening');
until(inState('live'), 30);
ok(Guide.state() === 'live', 'and the opening runs itself out, state ' + Guide.state());

print('\n== the opening is three recordings played as ONE cue ==');
//  With real files the guide must not treat the silence between two of
//  them as the narration having finished -- the room would unlock early
//  and the quiet clock would start counting mid-sentence.
var ENDED = [];
window.addEventListener('voice:ended', function (e) { ENDED.push(e.detail.cue); });
Guide.handover(); frames(4);
Voice.play = realPlay;                     // the real one, so the queue actually runs
Guide.begin();
frames(Math.ceil(CFG.voIntroDelay / 0.05) + 1);   // wait out v10.4's beat
var spanned = true;
for (var k = 0; k < CFG.voIntro.length; k++) {
  //  each silent cue finishes on a tick, then voGap is waited out
  frames(1);
  if (k < CFG.voIntro.length - 1 && !Voice.playing()) { spanned = false; }
  frames(Math.ceil(CFG.voGap / 0.05) + 1);
}
ok(ENDED.join(',') === CFG.voIntro.join(','),
   'all three finish, in order: ' + ENDED.join(',') + ' (want ' + CFG.voIntro.join(',') + ')');
ok(spanned, 'and playing() stayed true ACROSS the gaps, so nothing unlocked mid-sentence');
frames(4);
ok(Voice.playing() === false, 'the sequence reports itself finished at the end of it');
ok(Guide.state() === 'live', 'and only then does the room go live, state ' + Guide.state());
Voice.play = function (n) { PLAYED.push(n); return realPlay.call(Voice, n); };

print('\n== the whole room comes back ==');
var t1 = pi.gather();
ok(t1.length === 30, 'everything is offered again, got ' + t1.length);
ok(shoot(V(0.46, 1.16, -0.80)) !== null, 'accept is pressable');
ok(pi.gather().filter(function (x) { return x.id === 'begin'; }).length === 0,
   'and the flower is gone from the target list');
frames(20);
ok(Guide.ctlAlpha() > 0.9, 'the two controls have faded up, alpha ' + Guide.ctlAlpha().toFixed(2));
ok(Guide.flowerAlpha() < 0.1, 'and the flower has faded out, alpha ' + Guide.flowerAlpha().toFixed(2));

print('\n== the second spoken beat ==');
mark = PLAYED.length;
window.dispatchEvent(new CustomEvent('reveal:joined', { detail: { id: 1 } }));
frames(2);
ok(saidSince(mark).indexOf('recall') === 0, 'a butterfly joining the kaleidoscope asks for the recall cue');
mark = PLAYED.length;
window.dispatchEvent(new CustomEvent('reveal:joined', { detail: { id: 2 } }));
frames(2);
ok(saidSince(mark).indexOf('recall') === -1, 'a SECOND name does not repeat it');

print('\n== the quiet clock freezes when the visitor cannot act ==');
var quiet = CFG.guideQuietMs / 1000;
Reveal.active = true;
frames(Math.ceil(quiet * 2 * 20));
ok(Guide.state() === 'live', 'twice the quiet window inside a reveal does not end anything');
Reveal.active = false;

COL.busy = true;
frames(Math.ceil(quiet * 2 * 20));
ok(Guide.state() === 'live', 'nor does a butterfly coming over, or sitting on a hand');
COL.busy = false;

print('\n== ...and runs when they could be acting and are not ==');
var spent = until(inState('wrapup'), quiet * 3);
ok(Guide.state() === 'wrapup', 'quiet gets to the nudge, state ' + Guide.state());
ok(spent > quiet * 0.9 && spent < quiet * 1.2, 'after about ' + quiet + 's, took ' + spent.toFixed(1));
ok(PLAYED[PLAYED.length - 1] === 'nudge', 'and the nudge was asked for, got ' + PLAYED[PLAYED.length - 1]);

print('\n== a cue can only freeze the clock for so long ==');
//  A track that stalls mid-fetch never fires 'ended' and never reports
//  itself paused. Without guideTalkMax one bad file holds the session
//  open until guideMaxMs -- eight minutes of a headset nobody is wearing.
Guide.handover(); frames(4); Guide.begin(); until(inState('live'), 30);
var realPlaying = Voice.playing, realCue = Voice.cue;
Voice.playing = function () { return true; };
Voice.cue = function () { return 'welcome'; };
var q0 = Guide.stats().quietT;             // whatever ran before the stub went on
frames(Math.ceil(CFG.guideTalkMax * 0.5 * 20));
ok(Guide.stats().quietT === q0, 'a cue that is still talking freezes it -- FROZEN, not reset, at ' + q0.toFixed(2));
spent = until(inState('wrapup'), CFG.guideTalkMax + quiet * 2);
ok(Guide.state() === 'wrapup', 'but a stuck one does not hold the session open, state ' + Guide.state());
Voice.playing = realPlaying;
Voice.cue = realCue;
Guide.handover(); frames(4); Guide.begin(); until(inState('live'), 30);
until(inState('wrapup'), quiet * 3);

print('\n== ANY activity cancels it ==');
gc.setHot({ key7: true });                 // interact.js hands every provider the whole hot set
frames(2);
ok(Guide.state() === 'live', 'pointing at anything at all puts the session back, state ' + Guide.state());
gc.setHot({});
spent = until(inState('wrapup'), quiet * 3);
ok(spent > quiet * 0.9, 'and the clock restarted from zero, took ' + spent.toFixed(1) + 's again');

print('\n== the end, and what it does to the room ==');
mark = PLAYED.length;
var kbResets = KB.resets, released = COL.released;
//  deliberately NOT busy here: a butterfly with the visitor freezes the
//  clock, which is exactly what the freeze block above asserts. The
//  handover test below is where a busy room is actually cleared.
spent = until(inState('farewell'), CFG.guideQuietGrace / 1000 * 3);
ok(Guide.state() === 'farewell', 'the grace runs out, state ' + Guide.state());
ok(spent > CFG.guideQuietGrace / 1000 * 0.8, 'after the grace, took ' + spent.toFixed(1) + 's');
ok(saidSince(mark)[0] === 'farewell', 'the farewell was asked for, got ' + saidSince(mark)[0]);
ok(COL.released === released + 1, 'the collection was told to send anything with them home');
ok(KB.resets === kbResets + 1, 'and the keyboard was reset');
ok(pi.gather().length === 0, 'NOTHING is pickable during it, got ' + pi.gather().length);

spent = until(inState('idle'), CFG.guideFarewellMax * 2);
ok(Guide.state() === 'idle', 'and it returns to idle, state ' + Guide.state());
ok(spent >= CFG.guideFarewellMin * 0.9, 'not before guideFarewellMin, took ' + spent.toFixed(1) + 's');
frames(40);
ok(pi.gather().length === 1 && pi.gather()[0].id === 'begin', 'the flower is back, and alone');
ok(Guide.flowerAlpha() > 0.9, 'and visible again, alpha ' + Guide.flowerAlpha().toFixed(2));

print('\n== the headset coming off is the fast handover ==');
Guide.begin();
until(inState('live'), 30);
ok(Guide.state() === 'live', 'a fresh session, state ' + Guide.state());
mark = PLAYED.length;
kbResets = KB.resets;
COL.busy = true;
Guide._visible(false, 0);
Guide._visible(true, CFG.guideDoffMs + 500);
ok(Guide.state() === 'idle', 'off and back on ends it at once, state ' + Guide.state());
ok(saidSince(mark).indexOf('farewell') === -1, 'SILENTLY -- there is nobody in there to hear it');
ok(KB.resets === kbResets + 1 && COL.busy === false, 'but the room is still put back for the next visitor');

print('\n== a glance away is not a handover ==');
Guide.begin();
until(inState('live'), 30);
Guide._visible(false, 0);
Guide._visible(true, CFG.guideDoffMs - 500);
ok(Guide.state() !== 'idle', 'a blink shorter than guideDoffMs is ignored, state ' + Guide.state());

print('\n== the operator can always end it ==');
Guide.handover();
ok(Guide.state() === 'idle', 'Escape hands over, state ' + Guide.state());

print('\n== the hard cap ==');
Guide.begin();
until(inState('live'), 30);
COL.busy = true;                           // the quiet clock can never fire while this holds
spent = until(inState('farewell'), CFG.guideMaxMs / 1000 * 1.5);
ok(Guide.state() === 'farewell', 'a session busy forever still ends, state ' + Guide.state());
ok(spent > CFG.guideMaxMs / 1000 * 0.9, 'on guideMaxMs, took ' + Math.round(spent) + 's');
COL.busy = false;
until(inState('idle'), CFG.guideFarewellMax * 2);

print('\n== v10.4: the sound bed is present and inert ==');
ok(Sfx.available() === false, 'no Audio under jsc, so the module is a no-op');
ok(Sfx.playingMusic() === false, 'and the bed never started');
Sfx.init(); Sfx.wire(null); Sfx.unlock();
ok(Sfx.playingMusic() === false, 'init/wire/unlock are all safe with no DOM');
Sfx.select();
ok(true, 'and select() is a silent no-op rather than a throw');
mark = PLAYED.length;
Guide.begin();
spent = until(inState('live'), 30);
ok(Guide.state() === 'live', 'a session still reaches live with sfx loaded, state ' + Guide.state());
ok(Sfx._stats().wing === -1, 'no wingbeat is ever scheduled without audio');
Guide.handover();

print('\n== ?guide=0 gives back exactly v9.2 ==');
ok(Guide.mode() === 'on', 'the mode is on by default, got ' + Guide.mode());

print(FAIL ? '\n*** ' + FAIL + ' FAILED ***' : '\nall passed');
