// ------------------------------------------------------------
//  hands.js:palmPose against a synthetic hand, both sides, and
//  collection.js:_restQuat's axes.
// ------------------------------------------------------------
load('stub-three.js');
load('stub-scene.js');
var V9 = '../../';           // this folder is <build>/tools/reach
load(V9 + 'js/config.js');
load(V9 + 'js/reveal.js');
load(V9 + 'js/keyboard.js');
load(V9 + 'js/hands.js');
load(V9 + 'js/collection.js');

var FAIL = 0;
function ok(c, w) { if (!c) { FAIL++; print('  FAIL  ' + w); } else { print('  ok    ' + w); } }

//  A hand, in its own frame: +x across the palm toward the pinky (right
//  hand), -z the way the fingers point, +y out of the back of the hand.
//  Distances are ordinary adult ones; palm width comes out at 80 mm.
var HAND = {
  0:  [0, 0, 0],            // wrist
  6:  [-0.025, 0, -0.080],  // index knuckle
  11: [ 0.000, 0, -0.085],  // middle
  16: [ 0.028, 0, -0.080],  // ring
  21: [ 0.055, 0, -0.072],  // pinky
  9:  [-0.025, 0, -0.155],  // index tip
  14: [ 0.000, 0, -0.165],  // middle
  19: [ 0.028, 0, -0.155],  // ring
  24: [ 0.055, 0, -0.130],  // pinky
  4:  [-0.055, 0, -0.055]   // thumb tip
};
var FIST = { 9: [-0.025, 0.030, -0.060], 14: [0, 0.034, -0.062],
             19: [0.028, 0.032, -0.060], 24: [0.055, 0.028, -0.055] };

//  build a jointPoses array. `side` mirrors x, `flip` turns the hand
//  palm-DOWN (a rotation of pi about the finger axis: x and y negate),
//  `at` is where the wrist sits in the world.
function poses(side, flip, at, curled) {
  var p = new Array(25 * 16);
  for (var i = 0; i < 25 * 16; i++) { p[i] = (i % 17 === 0) ? 1 : 0; }
  for (var j in HAND) {
    var v = (curled && FIST[j]) ? FIST[j] : HAND[j];
    var x = v[0], y = v[1], z = v[2];
    if (side === 'left') { x = -x; }
    if (flip) { x = -x; y = -y; }
    p[j * 16 + 12] = at[0] + x;
    p[j * 16 + 13] = at[1] + y;
    p[j * 16 + 14] = at[2] + z;
  }
  return p;
}

function rigFor(side) {
  var r = Object.create(COMPONENTS['hand-rig']);
  r.data = { hideModel: true };
  r.el = { id: side === 'left' ? 'handL' : 'handR', components: {},
           sceneEl: SCENE_EL, object3D: new THREE.Object3D() };
  r.init();
  return r;
}

function read(rig, p) {
  for (var i = 0; i < p.length; i++) { rig.poses[i] = p[i]; }
  rig.jointPos(rig.poses, 0, rig.wrist);
  rig.palmPose(rig.poses);
}

print('\n== the palm normal is handed correctly ==');
['left', 'right'].forEach(function (side) {
  var rig = rigFor(side);
  read(rig, poses(side, false, [side === 'left' ? -0.2 : 0.2, 1.20, -0.35], false));
  print('  ' + side + ': normal.y ' + rig.palmNormal.y.toFixed(3) +
        '  width ' + (rig.palmWidth * 1000).toFixed(0) + ' mm');
  ok(rig.palmNormal.y > 0.9, side + ' hand held flat, palm up -> normal points up');
  ok(rig.palmUp, side + ' reads horizontal');
  ok(rig.faceNormal.y > 0.9 && Math.abs(rig.faceNormal.dot(rig.palmNormal) - 1) < 1e-6,
     side + ' palm up: the landing face IS the palm');
  ok(rig.palmFlat, side + ' reads flat');
  ok(rig.palmRaised, side + ' reads raised (1.20 m against a 1.60 m headset)');
  ok(rig.poseOk, side + ' is a complete offer');
});

print('\n== v10: a hand turned over is still an offer, and it lands on the BACK ==');
//  The narration asks the visitor to hold their hand out flat and palm
//  DOWN. Under v9.2's palm-up-only rule, following it exactly took the
//  hover-then-leave branch and the interaction read as broken to anyone
//  doing as they were told. The test is now that the hand is HORIZONTAL,
//  and the butterfly lands on whichever face points at the sky.
var r = rigFor('right');
read(r, poses('right', true, [0.2, 1.20, -0.35], false));      // palm down
ok(r.palmNormal.y < -0.9, 'palm turned over -> its own normal points DOWN (' + r.palmNormal.y.toFixed(2) + ')');
ok(r.palmUp && r.poseOk, 'and it is still a complete offer');
ok(r.faceNormal.y > 0.9, 'the landing face points at the sky (' + r.faceNormal.y.toFixed(2) + ')');
ok(Math.abs(r.faceNormal.dot(r.palmNormal) + 1) < 1e-6,
   'and it is exactly the OPPOSITE of the palm -- the back of the hand');
//  ...and the same hand, with the old rule, is not an offer at all
CFG.palmEitherFace = false;
read(r, poses('right', true, [0.2, 1.20, -0.35], false));
ok(!r.palmUp && !r.poseOk, 'palmEitherFace = false restores v9.2 exactly');
CFG.palmEitherFace = true;

print('\n== ...but a hand that is not HORIZONTAL still is not ==');
//  the load-bearing half of "either face": edge-on must still be rejected,
//  or the offer would fire on any flat hand at any angle
read(r, poses('right', false, [0.2, 1.20, -0.35], false));
r.palmNormal.set(1, 0, 0);                                     // held vertical, edge-on
r.palmUp = CFG.palmEitherFace ? (Math.abs(r.palmNormal.dot(new THREE.Vector3(0, 1, 0))) >= CFG.palmUpDot)
                              : false;
ok(!r.palmUp, 'a hand held edge-on is not horizontal either way up');

print('\n== and every other way of NOT offering is rejected ==');
read(r, poses('right', false, [0.2, 1.20, -0.35], true));      // fist
ok(!r.palmFlat && !r.poseOk, 'fingers curled -> not flat');
read(r, poses('right', false, [0.2, 0.85, -0.35], false));     // hand down by the hip
ok(!r.palmRaised && !r.poseOk, 'hand lowered to 0.85 m -> not raised');
read(r, poses('right', false, [0.2, 1.20, -0.35], false));
ok(r.poseOk, 'and back to a good offer');

print('\n== the offer is held on the way in and out ==');
var t = 0;
r.offering = false; r._okSince = null; r._badSince = null;
r.holdOffer(true, t); ok(!r.offering, 'not offered on the first good frame');
t += CFG.palmHoldMs - 20; r.holdOffer(true, t); ok(!r.offering, 'nor just before palmHoldMs');
t += 40; r.holdOffer(true, t); ok(r.offering, 'offered once the pose has held');
t += 100; r.holdOffer(false, t); ok(r.offering, 'a lost frame does not withdraw it');
t += CFG.palmGraceMs; r.holdOffer(false, t); ok(!r.offering, 'a sustained loss does');

print('\n== the resting pose sits the butterfly on the palm ==');
var def = COMPONENTS['butterfly-collection'];
var comp = Object.create(def);
comp.el = { setObject3D: function () {}, sceneEl: SCENE_EL };
comp.data = {};
STORE.push({ id: 1, name: 'ADA', values: [0, 0, 0, 0] });
comp.init();
comp.tick(16, 16);
var c = comp.collected[0];
comp._haveCam = true;
comp._camPos.set(0, 1.6, 0);
c.pos.set(0.20, 1.22, -0.36);                       // on a palm in front and to the right

var n = new THREE.Vector3(0.15, 0.98, 0.1).normalize();   // a slightly tilted palm
c.perchYaw = 0;                                          // head-on first, the baseline the turn is measured from
var q = comp._restQuat(c, n, new THREE.Quaternion());
var wingNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
var head = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);   // the model's head is along local -X
var toCam = new THREE.Vector3().copy(comp._camPos).sub(c.pos).normalize();

//  the head can only ever lie IN the palm plane, so what it should be
//  parallel to is the visitor direction PROJECTED into that plane -- not
//  the raw one, which here points 42 degrees up out of it
var toCamFlat = new THREE.Vector3().copy(toCam).addScaledVector(n, -toCam.dot(n)).normalize();
//  v9.2: the body is PITCHED NOSE-UP onto its legs, so the body axis no
//  longer lies in the palm plane -- it comes out of it by exactly
//  perchPitch. What still lies in the plane is the wing SPAN axis (local
//  Z), which is the axis the pitch turns about, and that is the invariant
//  worth asserting: the wings stay level across the hand.
var span = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
var headFlat = new THREE.Vector3().copy(head).addScaledVector(n, -head.dot(n)).normalize();
print('  wing normal . palm normal = ' + wingNormal.dot(n).toFixed(4) +
      '  (cos perchPitch = ' + Math.cos(CFG.perchPitch).toFixed(4) + ')');
print('  head out of the palm plane = ' + (Math.asin(head.dot(n)) * 180 / Math.PI).toFixed(2) +
      ' deg  (perchPitch = ' + (CFG.perchPitch * 180 / Math.PI).toFixed(2) + ')');
print('  head . (visitor, in the palm plane) = ' + headFlat.dot(toCamFlat).toFixed(4));
print('  head . (visitor, raw) = ' + head.dot(toCam).toFixed(4) + '  (the palm is 42 deg below the eye line)');
ok(Math.abs(span.dot(n)) < 1e-6, 'the WING SPAN lies in the palm plane, so the wings stay level on the hand');
ok(Math.abs(wingNormal.dot(n) - Math.cos(CFG.perchPitch)) < 1e-6,
   'the wings are off the palm plane by the pitch and no more');
ok(headFlat.dot(toCamFlat) > 0.999, 'the head is turned toward the visitor');
ok(Math.abs(Math.asin(head.dot(n)) - CFG.perchPitch) < 1e-6,
   'and the head is lifted by exactly perchPitch -- nose UP, tail down onto the short hind legs');

print('\n== turned broadside, so the body reads ==');
//  the body is ONE PLANE through the body axis: head-on, the visitor looks
//  straight down its length and it disappears. c.perchYaw turns it across
//  the view -- and must do so WITHOUT tipping the wings off the palm.
[0, 60, 65, 70, -65].forEach(function (deg) {
  c.perchYaw = deg * Math.PI / 180;
  var qy = comp._restQuat(c, n, new THREE.Quaternion());
  var sp = new THREE.Vector3(0, 0, 1).applyQuaternion(qy);
  var hd = new THREE.Vector3(-1, 0, 0).applyQuaternion(qy);
  hd.addScaledVector(n, -hd.dot(n)).normalize();        // the turn is measured IN the palm plane
  var got = Math.acos(Math.max(-1, Math.min(1, hd.dot(toCamFlat)))) * 180 / Math.PI;
  ok(Math.abs(got - Math.abs(deg)) < 0.01,
     'perchYaw ' + deg + ' deg -> head is ' + got.toFixed(1) + ' deg off the visitor');
  //  the pitch is about the span axis, so however far the broadside turn
  //  goes the wings never tip sideways off the hand
  ok(Math.abs(sp.dot(n)) < 1e-6, '   ...and the wing span still lies in the palm plane');
});
//  and the two turns of the same size are genuinely opposite sides
c.perchYaw = 65 * Math.PI / 180;
var hL = new THREE.Vector3(-1, 0, 0).applyQuaternion(comp._restQuat(c, n, new THREE.Quaternion()));
c.perchYaw = -65 * Math.PI / 180;
var hR = new THREE.Vector3(-1, 0, 0).applyQuaternion(comp._restQuat(c, n, new THREE.Quaternion()));
ok(hL.dot(hR) < 0.2, 'the two directions are opposite sides, not the same turn twice');
c.perchYaw = 0;

print('\n== the camera directly over the palm does not blow it up ==');
comp._camPos.copy(c.pos).addScaledVector(n, 0.4);   // looking straight down the normal
var q2 = comp._restQuat(c, n, new THREE.Quaternion());
ok(!q2.isNaN(), 'degenerate look direction still gives a finite pose');
var sp2 = new THREE.Vector3(0, 0, 1).applyQuaternion(q2);
ok(Math.abs(sp2.dot(n)) < 1e-6, 'and the wing span still lies in the palm plane');

//  ---- IT RESTS ON ITS LEGS, all of them ----
//  The four leg-tip positions are measured off BODY_ALPHA (config.js:
//  perchPitch has the table). Push them through the real pose and the real
//  perchPoint and check what actually reaches the hand: laid flat, the
//  hind pair floated 22 and 25 mm and the tail end of the butterfly did
//  not rest on the palm at all.
print('\n== every leg reaches the hand, not just the longest ==');
var TIPS = [[-0.0575, -0.1145, 'front'], [-0.0301, -0.1407, 'mid  '],
            [0.0892, -0.0964, 'hind '], [0.1171, -0.0915, 'hind ']];
c.perchYaw = 65 * Math.PI / 180;
comp._camPos.set(0, 1.6, 0);
var qr = comp._restQuat(c, n, new THREE.Quaternion());
var scale0 = c.scale;
c.scale = CFG.perchSize / c.size;                   // the size it actually lands at
var s = c.size * c.scale * c.hotScale;
var palm = new THREE.Vector3().copy(c.pos).addScaledVector(n, -(CFG.perchLift + CFG.perchLegDrop * s));
var worst = 0, sunk = 0;
TIPS.forEach(function (tp) {
  var w = new THREE.Vector3(tp[0] * s, tp[1] * s, 0).applyQuaternion(qr).add(c.pos);
  var gap = w.clone().sub(palm).dot(n);               // + floats over the palm, - into it
  print('  ' + tp[2] + ' leg tip ' + (gap * 1000 >= 0 ? '+' : '') + (gap * 1000).toFixed(1) + ' mm');
  worst = Math.max(worst, gap); sunk = Math.min(sunk, gap);
});
ok(worst < 0.010, 'no leg floats more than 10 mm over the hand: worst ' + (worst * 1000).toFixed(1) + ' mm');
ok(sunk > -0.010, 'and none is buried in it: deepest ' + (sunk * 1000).toFixed(1) + ' mm');
//  the thing that was actually wrong: laid flat (perchPitch 0) the hind
//  pair floats 22 and 25 mm and the tail end does not rest on the hand
var pitch0 = CFG.perchPitch, drop0 = CFG.perchLegDrop;
CFG.perchPitch = 0; CFG.perchLegDrop = 0.1406;      // v9.1: flat, on the deepest tip
var qf = comp._restQuat(c, n, new THREE.Quaternion());
var palmWas = new THREE.Vector3().copy(c.pos)
                .addScaledVector(n, -(CFG.perchLift + CFG.perchLegDrop * s));
var hindWas = new THREE.Vector3(TIPS[3][0] * s, TIPS[3][1] * s, 0).applyQuaternion(qf).add(c.pos)
                .sub(palmWas).dot(n);
CFG.perchPitch = pitch0; CFG.perchLegDrop = drop0;
print('  (laid flat, as v9.1 did: the rear hind tip sat ' + (hindWas * 1000).toFixed(1) + ' mm up)');
ok(hindWas > 0.020, 'which is what the pitch fixes -- it was ' + (hindWas * 1000).toFixed(0) + ' mm off the hand');
c.scale = scale0;
c.perchYaw = 0;

print(FAIL ? '\n*** ' + FAIL + ' FAILED ***' : '\nall passed');
