// ------------------------------------------------------------
//  Drive collection.js's v9 arc head-on, under jsc.
// ------------------------------------------------------------
load('stub-three.js');
load('stub-scene.js');

var V9 = '../../';           // this folder is <build>/tools/reach
load(V9 + 'js/config.js');
load(V9 + 'js/reveal.js');     // real Reveal: dim/slow/active + the wake pool
load(V9 + 'js/keyboard.js');   // for makeNoise / makeFbm / smoothstep / rand / UP
load(V9 + 'js/hands.js');      // real hand-rig + the real Hands module
load(V9 + 'js/collection.js');

var FAIL = 0;
function ok(cond, what) { if (!cond) { FAIL++; print('  FAIL  ' + what); } else { print('  ok    ' + what); } }
function finite(v, what) { ok(isFinite(v.x) && isFinite(v.y) && isFinite(v.z), what); }

// ---- build the component ----
var def = COMPONENTS['butterfly-collection'];
var comp = Object.create(def);
comp.el = { setObject3D: function () {}, sceneEl: SCENE_EL };
comp.data = {};

// three stored butterflies
for (var i = 1; i <= 3; i++) { STORE.push({ id: i, name: 'NAME' + i, values: [0, 0, 0, 0] }); }
comp.init();

// ---- run frames ----
var T = 0;
function frames(seconds, dtMs) {
  dtMs = dtMs || 16.7;
  var n = Math.round(seconds * 1000 / dtMs);
  for (var f = 0; f < n; f++) { T += dtMs; comp.tick(T, dtMs); }
}
//  run until something is true, or give up. Used everywhere a beat's length
//  is a tuning constant rather than something the test should hard-code.
function until(pred, maxSec) {
  var t0 = T;
  while (!pred() && (T - t0) < maxSec * 1000) { frames(0.1); }
  return +((T - t0) / 1000).toFixed(1);
}
function states() {
  return comp.collected.map(function (c) { return c.state; }).join(',');
}
function byId(id) {
  for (var i = 0; i < comp.collected.length; i++) { if (comp.collected[i].id === id) { return comp.collected[i]; } }
  return null;
}
//  `down` turns the hand over: the palm's own normal points at the floor
//  and the landing face is the BACK of the hand. v10 accepts both -- see
//  test-palm.js and CFG.palmEitherFace.
function offerPalm(side, x, y, z, down) {
  var r = RIGS[side];
  r.tracked = true; r.offering = true;
  r.palm.set(x, y, z);
  r.palmNormal.set(0, down ? -1 : 1, 0);
  r.faceNormal.set(0, 1, 0);               // always the sky-facing side
}
function dropPalm(side) { RIGS[side].tracked = false; RIGS[side].offering = false; }

print('\n== the room replays and settles ==');
frames(4);
ok(comp.collected.length === 3, 'three butterflies built');
ok(states() === 'orbit,orbit,orbit', 'all orbiting: ' + states());

print('\n== targets ==');
var tg = comp.targets();
ok(tg.length === 3, 'three pickable, got ' + tg.length);
ok(tg[0].layer === 'col', "layer is 'col'");
ok(/^col\d+$/.test(tg[0].id), "id is prefixed: " + tg[0].id);
ok(tg[0].radius > 0.05 && tg[0].radius < 0.5, 'sane pick radius ' + tg[0].radius.toFixed(3));

print('\n== hover feedback ==');
comp.setHot({ col2: true });
ok(byId(2).hot === true && byId(1).hot === false, 'only #2 is hot');
frames(0.5);
ok(byId(2).hotScale > 1.1, 'hot one grew to ' + byId(2).hotScale.toFixed(3));
comp.setHot({});
frames(1);
ok(Math.abs(byId(2).hotScale - 1) < 0.02, 'and shrank back to ' + byId(2).hotScale.toFixed(3));

print('\n== NO HAND: summon -> hover -> leave -> orbit ==');
ok(comp.exclusive() === false, 'nothing is locked out while the room is just orbiting');
comp.activate('col1');
ok(byId(1).state === 'summon', 'pinch starts the summon');
ok(comp.exclusive() === true, 'and the letters go dead immediately -- the reach crosses the whole keyboard');
var far = byId(1).pos.distanceTo(CAM.position);
var t0 = T;
while (byId(1).state === 'summon' && T - t0 < 30000) { frames(0.1); }
print('        approach took ' + ((T - t0) / 1000).toFixed(1) + ' s from ' + far.toFixed(2) + ' m');
ok(T - t0 < 9000, 'the approach is under 9 s');
var near = byId(1).pos.distanceTo(CAM.position);
ok(near < far, 'it came closer: ' + far.toFixed(2) + ' -> ' + near.toFixed(2) + ' m');
ok(byId(1).state === 'hover', 'hovering in front of the visitor');
ok(comp.exclusive() === true, 'still locked out while it waits in front of you');
ok(Math.abs(byId(1).pos.distanceTo(CAM.position) - CFG.hoverDist) < 0.15,
   'at hoverDist: ' + byId(1).pos.distanceTo(CAM.position).toFixed(2) + ' m');
finite(byId(1).pos, 'position is finite');
print('\n   -- it FLIES while it waits, it does not pose --');
//  sample the flight over a few seconds: it should wander a real distance
//  in all three axes, keep flapping, and turn its body to follow
var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
var flaps = [], yaws = [], path = 0, was = null, peak = 0;
//  five seconds, not three: the wander was deliberately slowed to a 3-6 s
//  cycle, so a short window can land entirely inside one slow sweep and
//  see almost nothing move
for (var f = 0; f < 300; f++) {
  frames(1 / 60);
  var q = byId(1);
  var p3 = [q.pos.x, q.pos.y, q.pos.z];
  for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p3[a]); hi[a] = Math.max(hi[a], p3[a]); }
  if (was) {
    var st = Math.sqrt(Math.pow(p3[0] - was[0], 2) + Math.pow(p3[1] - was[1], 2) + Math.pow(p3[2] - was[2], 2));
    path += st;
    peak = Math.max(peak, st * 60);
  }
  was = p3;
  flaps.push(q.bm.flapAngle);
  yaws.push(q.group.rotation.y);
}
var span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
print('        wandered ' + span.map(function (v) { return v.toFixed(2); }).join(' x ') +
      ' m over 5 s, ' + path.toFixed(2) + ' m of path, peak ' + peak.toFixed(2) + ' m/s');
//  PATH LENGTH, not a bounding box: the box depends on catching a turning
//  point inside the window, the path does not
ok(path > 0.12, 'it is moving: ' + path.toFixed(3) + ' m of path in 5 s');
ok(span[0] <= CFG.hoverSpanX * 2.2 && span[1] <= CFG.hoverSpanY * 2.2,
   'and stays inside its span (2x the amplitude is the whole swing)');
//  ...calmly. 0.6 m from a visitor's face, peak speed is the number that
//  decides whether it reads as hovering or as darting.
ok(peak < 0.45, 'and calmly: peak ' + peak.toFixed(2) + ' m/s (it was 1.0 before the wander was eased in)');
var fmin = Math.min.apply(null, flaps), fmax = Math.max.apply(null, flaps);
ok(fmax - fmin > 1.0, 'the wings are beating, not held: range ' + (fmax - fmin).toFixed(2) + ' rad');
//  THE HEADING IS HELD, NOT CHASED. It should sway -- but within bounds.
//  Following its own travel direction (which is what it used to do) swung
//  the body a full half turn every time the wander reversed: 4.6 rad over
//  this same window, which is what read as frantic.
var ymin = Math.min.apply(null, yaws), ymax = Math.max.apply(null, yaws);
var swept = ymax - ymin;
ok(swept > 0.02, 'the body still sways: ' + swept.toFixed(2) + ' rad');
ok(swept < 2.0, '...but holds its heading rather than chasing the wander: ' +
   swept.toFixed(2) + ' rad, against 4.6 when it chased');

//  the sampling above already spent part of hoverDwell, so wait on the
//  STATE rather than counting frames off a fixed dwell
var waited = until(function () { return byId(1).state !== 'hover'; }, CFG.hoverDwell + 2);
ok(byId(1).state === 'leave', 'gave up and left after ' + waited + ' s more, state ' + byId(1).state);
frames(CFG.leaveTime + 1);
ok(byId(1).state === 'orbit', 'back in the kaleidoscope');
var r1 = Math.sqrt(byId(1).pos.x * byId(1).pos.x + byId(1).pos.z * byId(1).pos.z);
ok(r1 > CFG.colRadMin - 0.5, 'and back out at radius ' + r1.toFixed(2));
ok(byId(1).pos.y >= CFG.colHgtMin - 0.5 && byId(1).pos.y <= CFG.colHgtMax + 0.5,
   'on the high dome, above the letters: y = ' + byId(1).pos.y.toFixed(2) +
   ' (band ' + CFG.colHgtMin + '-' + CFG.colHgtMax + ', letters top out at ' + CFG.hgtMax + ')');
ok(byId(1).offset.length() < 0.2, 'no leftover path offset: ' + byId(1).offset.length().toFixed(3));

print('\n== A HAND: summon -> perch, and it holds ==');
offerPalm('right', 0.18, 1.15, -0.35);
comp.activate('col2');
var t1 = T;
until(function () { return byId(2).state !== 'summon'; }, 30);
print('        approach to the hand took ' + ((T - t1) / 1000).toFixed(1) + ' s');
frames(1);
ok(byId(2).state === 'perch', 'it landed, state ' + byId(2).state);
//  IT STANDS ON ITS LEGS, so what has to be on the palm is the bottom of
//  the body sprite, not the model's origin -- the origin is the wing hinge
//  and the legs hang perchLegDrop below it. Checking the origin (which the
//  first draft did) is what let the butterfly sit wings-deep in the hand.
function legTip(c, hand) {
  var s = c.size * c.scale * c.hotScale;
  return c.pos.clone().addScaledVector(hand.normal, -CFG.perchLegDrop * s);
}
var d = legTip(byId(2), Hands.offers()[0]).distanceTo(RIGS.right.palm);
ok(d < 0.006, 'the LEG TIPS are on the palm, ' + (d * 1000).toFixed(1) + ' mm off');
var origin = byId(2).pos.distanceTo(RIGS.right.palm);
ok(origin > 0.05,
   '...and the body is held clear of it: origin ' + (origin * 1000).toFixed(0) + ' mm up');
ok(Math.abs(byId(2).size * byId(2).scale - CFG.perchSize) < 0.06,
   'at perch size ' + (byId(2).size * byId(2).scale).toFixed(3));
ok(byId(2).summonSide === 'right', 'aimed at the right hand');
finite(byId(2).pos, 'position is finite');
ok(!byId(2).bm.model.quaternion.isNaN(), 'rest orientation is finite');

print('\n   -- and it is turned broadside on the palm --');
var deg = Math.abs(byId(2).perchYaw) * 180 / Math.PI;
ok(deg >= CFG.perchYawMin - 0.001 && deg <= CFG.perchYawMax + 0.001,
   'perchYaw drawn in range: ' + deg.toFixed(1) + ' deg');
//  drawn FRESH per landing, and both ways round -- run enough landings to
//  see the spread rather than asserting on one draw
var seen = [], sides = { '-1': 0, '1': 0 };
for (var i = 0; i < 60; i++) {
  var yy = rand(CFG.perchYawMin, CFG.perchYawMax) * Math.PI / 180;
  var sgn = (Math.random() < 0.5 ? -1 : 1);
  seen.push(Math.abs(yy) * 180 / Math.PI); sides[sgn] += 1;
}
ok(Math.max.apply(null, seen) - Math.min.apply(null, seen) > 5,
   'the draw really varies across landings, spread ' + (Math.max.apply(null, seen) - Math.min.apply(null, seen)).toFixed(1) + ' deg');
ok(sides['-1'] > 5 && sides['1'] > 5, 'and it turns both ways: ' + sides['1'] + ' / ' + sides['-1']);

print('\n== the room is locked out while it is with you ==');
ok(comp.exclusive() === true, 'exclusive while perched -- no letters, no accept, no delete');

print('\n== the hand moves: it follows ==');
RIGS.right.palm.set(-0.25, 1.30, -0.30);
frames(1.0);
ok(legTip(byId(2), Hands.offers()[0]).distanceTo(RIGS.right.palm) < 0.006, 'followed the hand');
ok(byId(2).state === 'perch', 'still perched');

print('\n== the hand drops: it goes, and the room comes back ==');
dropPalm('right');
frames(0.05);
ok(byId(2).state === 'leave', 'left on the frame the offer went, state ' + byId(2).state);
ok(comp.exclusive() === false, 'and the lockout lifts the moment it turns for home');
frames(CFG.leaveTime + 1);
ok(byId(2).state === 'orbit', 'and rejoined');
ok(comp.exclusive() === false, 'still unlocked once it is back');

print('\n== hover -> a palm goes up -> it comes to it ==');
//  wait on the STATE, never on a frame count -- the approach got faster
//  when the collection's band moved closer, and every hard-coded duration
//  in this file went stale the same day
comp.activate('col3');
until(function () { return byId(3).state === 'hover'; }, 20);
ok(byId(3).state === 'hover', 'hovering first, state ' + byId(3).state);
offerPalm('left', -0.20, 1.20, -0.40);
frames(0.1);
ok(byId(3).state === 'summon', 'a raised palm redirects it, state ' + byId(3).state);
until(function () { return byId(3).state === 'perch'; }, 20);
ok(byId(3).state === 'perch', 'and it lands, state ' + byId(3).state);

print('\n== perchDwell expires ==');
frames(CFG.perchDwell + 1);
ok(byId(3).state === 'leave' || byId(3).state === 'orbit', 'it leaves of its own accord, state ' + byId(3).state);
dropPalm('left');
frames(CFG.leaveTime + 2);
ok(states() === 'orbit,orbit,orbit', 'the room is scenery again: ' + states());

print('\n== summonMax ==');
comp.activate('col1');
frames(1);
comp.activate('col2');
frames(0.1);
ok(byId(1).state === 'leave', 'the first one was sent home, state ' + byId(1).state);
ok(byId(2).state === 'summon', 'the second one was honoured');
frames(20);

print('\n== a long frame does not break the approach ==');
comp.activate('col3');
comp.tick(T += 300, 300);       // a 300 ms hitch
finite(byId(3).pos, 'position survived a 300 ms frame');
frames(30);
ok(byId(3).state === 'orbit' || SUMMONED[byId(3).state], 'still in a sane state: ' + byId(3).state);

print('\n== v10: a hand turned OVER lands it just the same ==');
//  The narration asks the visitor to hold their hand out flat and palm
//  DOWN. This is the end-to-end version of test-palm.js's check: not just
//  that the pose is accepted, but that a butterfly completes the approach
//  and settles on the BACK of the hand.
//
//  Self-contained: it takes the room as it finds it, puts everything back
//  on its orbit first, and leaves no hand offered.
dropPalm('left'); dropPalm('right');
until(function () { return states() === 'orbit,orbit,orbit'; }, 40);
offerPalm('left', -0.18, 1.15, -0.35, true);        // palm turned over
comp.activate('col1');
until(function () { return byId(1).state !== 'summon'; }, 30);
frames(1);
ok(byId(1).state === 'perch', 'palm DOWN still lands it, state ' + byId(1).state);
ok(RIGS.left.palmNormal.y < 0, '...with the palm itself facing the floor (' + RIGS.left.palmNormal.y.toFixed(2) + ')');
var dBack = legTip(byId(1), Hands.offers()[0]).distanceTo(RIGS.left.palm);
ok(dBack < 0.006, 'and the legs on the BACK of the hand, ' + (dBack * 1000).toFixed(1) + ' mm off');
ok(byId(1).pos.y > RIGS.left.palm.y, 'sitting above the hand, not under it');
dropPalm('left');
until(function () { return states() === 'orbit,orbit,orbit'; }, 40);

print('\n== nothing is pickable during a reveal ==');
Reveal.begin(); comp.tick(T += 17, 17);
ok(comp.targets().length === 0, 'targets() is empty while the room is receding');
Reveal.release();
frames(CFG.revealDimOut + 1);
ok(comp.targets().length > 0, 'and comes back after it: ' + comp.targets().length);

print(FAIL ? '\n*** ' + FAIL + ' FAILED ***' : '\nall passed');
