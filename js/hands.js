// ============================================================
//  hands.js  --  usable data out of hand-tracking-controls
// ============================================================
//  A-Frame's hand-tracking-controls does two things that make it
//  awkward to build on, both visible in its tick():
//
//    this.el.object3D.position.set(0,0,0)
//    this.el.object3D.rotation.set(0,0,0)
//
//  The ENTITY IS PINNED TO THE ORIGIN every frame. Anything that reads
//  the entity's world position -- a repulsor, a landing anchor, a
//  raycaster -- gets (0,0,0) and silently does nothing. The real data
//  is in `jointPoses`, a Float32Array of one 4x4 matrix per joint, and
//  in `wristObject3D`, which the component parents to the scene.
//
//  (There is no `wristPosition` property, despite the obvious guess.)
//
//  So this component reads the joint matrices directly and publishes
//  what the rest of the scene actually needs:
//
//      rig.tracked        is the hand being seen right now
//      rig.point          an Object3D at the wrist, parented to the scene
//      rig.wrist          world position of the wrist
//      rig.indexTip       world position of the index fingertip
//      rig.indexKnuckle   world position of the index knuckle
//      rig.pinch          thumb-to-index distance, metres
//
//  v9 adds THE PALM, because a butterfly has to have somewhere to land:
//
//      rig.palm           world position of the middle of the palm
//      rig.palmNormal     unit vector out of the palm's front
//      rig.palmWidth      index knuckle to pinky knuckle, metres
//      rig.faceNormal     v10 -- the face that points at the SKY: the
//                         palm's normal turned up, or its opposite (the
//                         back of the hand) when the palm is turned down.
//                         This is the surface a butterfly lands on, and
//                         it is what Hands.offers() publishes
//      rig.palmUp / palmFlat / palmRaised   the three raw conditions
//                         (palmUp is HORIZONTAL either way up, v10 --
//                         see palmPose and CFG.palmEitherFace)
//      rig.offering       all three, held and released on timers
//
//  All four palm quantities are SCALE-FREE where it matters: flatness is
//  measured in palm widths, not centimetres, so a child's hand and an
//  adult's read the same. See palmPose() for what each test is and why
//  its threshold is where it is.
//
//  It also hides the hand model. The rendered hand is not needed --
//  nothing in this piece looks at your hands -- and the mesh both
//  occludes the butterflies and flickers as tracking drops in and out.
//  Hiding the parent object3D is enough; the component keeps setting
//  its own child visibility every tick, so fighting it per-child would
//  be a losing battle.
// ============================================================

// WebXR hand joints are a fixed order; these are the ones we use.
// Confirmed against A-Frame's own detectPinch, which reads byte offset
// 64 for the thumb tip (joint 4) and 144 for the index tip (joint 9).
//  v9 adds the other three knuckles and tips: a palm plane needs two
//  knuckles to span it, and "flat" needs all four fingers, not one.
//  Knuckles are the PROXIMAL phalanges (6/11/16/21), tips are 9/14/19/24.
var HAND_JOINT = {
  wrist: 0, indexKnuckle: 6, thumbTip: 4, indexTip: 9,
  middleKnuckle: 11, ringKnuckle: 16, pinkyKnuckle: 21,
  middleTip: 14, ringTip: 19, pinkyTip: 24
};

//  The four fingers, knuckle and tip, in one place -- palmPose() walks
//  this rather than four near-identical blocks.
var PALM_FINGERS = [
  [HAND_JOINT.indexKnuckle,  HAND_JOINT.indexTip],
  [HAND_JOINT.middleKnuckle, HAND_JOINT.middleTip],
  [HAND_JOINT.ringKnuckle,   HAND_JOINT.ringTip],
  [HAND_JOINT.pinkyKnuckle,  HAND_JOINT.pinkyTip]
];

var WORLD_UP = new THREE.Vector3(0, 1, 0);

AFRAME.registerComponent('hand-rig', {
  schema: { hideModel: { default: true } },

  init: function () {
    this.tracked = false;
    this.poses = new Float32Array(25 * 16);   // our own copy of the joint matrices
    this.via = 'none';                        // which path supplied them
    this.wrist = new THREE.Vector3();
    this.indexTip = new THREE.Vector3();
    this.indexKnuckle = new THREE.Vector3();
    this.thumbTip = new THREE.Vector3();
    this.pinch = 0;
    this._m = new THREE.Matrix4();

    //  v9 -- THE PALM. Everything a butterfly needs to decide whether it
    //  has been offered a place to land, and where that place is.
    this.palm = new THREE.Vector3();
    this.palmNormal = new THREE.Vector3(0, 1, 0);
    this.palmWidth = 0.085;                   // metres; a sane default before the first read
    this.palmUp = false;                      // horizontal -- see palmPose
    //  v10: the face that points at the sky. The palm's own normal when
    //  the palm is up, and its opposite -- the back of the hand -- when it
    //  is down. This, not palmNormal, is the surface a butterfly lands on.
    this.faceNormal = new THREE.Vector3(0, 1, 0);
    this.palmFlat = false;                    // fingers out, not curled
    this.palmRaised = false;                  // held up, not hanging by your side
    this.poseOk = false;                      // all three, this frame
    this.offering = false;                    // ...and held/released on timers
    this._okSince = null;
    this._badSince = null;
    this._pk = new THREE.Vector3();           // palm scratch
    this._pn = new THREE.Vector3();
    this._pa = new THREE.Vector3();
    this._pb = new THREE.Vector3();
    this._cam = new THREE.Vector3();

    // Something the rest of the scene can treat as "where the hand is".
    // Parented to the scene, not the entity, because the entity is pinned.
    this.point = new THREE.Object3D();
    this.el.sceneEl.object3D.add(this.point);
  },

  remove: function () {
    if (this.point.parent) { this.point.parent.remove(this.point); }
  },

  //  READ THE JOINTS OURSELVES.
  //
  //  Two reasons not to rely on hand-tracking-controls for this:
  //
  //  1. Its data only lands if ITS tracked-controls matched the input
  //     source. When that does not happen the component still looks
  //     healthy from outside while publishing nothing.
  //
  //  2. THE REFERENCE SPACE. The component calls requestReferenceSpace()
  //     itself and fills poses in THAT space. three.js renders the camera
  //     in renderer.xr.getReferenceSpace(), which is not necessarily the
  //     same one -- and any difference between them shows up as hands
  //     sitting at an offset from where you actually see your hands.
  //     Filling poses in the renderer's own space makes them agree by
  //     construction.
  readDirect: function () {
    var sceneEl = this.el.sceneEl;
    var frame = sceneEl.frame;
    var r = sceneEl.renderer;
    if (!frame || !frame.fillPoses || !r || !r.xr) { return false; }
    var session = r.xr.getSession && r.xr.getSession();
    var space = r.xr.getReferenceSpace && r.xr.getReferenceSpace();
    if (!session || !space || !session.inputSources) { return false; }

    var want = this.side();
    for (var i = 0; i < session.inputSources.length; i++) {
      var src = session.inputSources[i];
      if (!src.hand || src.handedness !== want) { continue; }
      try {
        if (frame.fillPoses(src.hand.values(), space, this.poses)) {
          this.via = 'direct';
          return true;
        }
      } catch (e) { /* fall through to the component */ }
    }
    return false;
  },

  //  Fallback: whatever hand-tracking-controls managed to collect.
  readFromComponent: function (c) {
    if (!c || !c.hasPoses || !c.jointPoses) { return false; }
    this.poses.set(c.jointPoses);
    this.via = 'component';
    return true;
  },

  side: function () {
    var c = this.el.components['hand-tracking-controls'];
    if (c && c.data && c.data.hand) { return c.data.hand; }
    return this.el.id === 'handL' ? 'left' : 'right';
  },

  jointPos: function (poses, index, out) {
    this._m.fromArray(poses, index * 16);
    return out.setFromMatrixPosition(this._m);
  },

  //  v9 -- THE PALM POSE. Three separate questions, because the
  //  interaction they gate is "hold your hand out flat, palm up, and a
  //  butterfly will land on it" and each of the three can fail on its own.
  //
  //  THE PLANE. Wrist -> index knuckle and wrist -> pinky knuckle span
  //  the palm; their cross product is its normal. The SIGN is handed:
  //  with the palm up and the fingers pointing away from you, a right
  //  hand's index knuckle is on the thumb side and a left hand's is on
  //  the other, so the same cross product points down for one and up for
  //  the other. Hence the per-side flip -- get it wrong and one hand can
  //  never be offered while the other is offered permanently.
  //
  //  FLAT. Two independent measures, both quoted in PALM WIDTHS so hand
  //  size cancels out:
  //
  //    extension   mean fingertip-to-wrist distance. About 1.9 palm
  //                widths with the fingers out, about 1.0 in a fist --
  //                a wide gap, so this is the load-bearing test.
  //    offset      mean |distance of a fingertip off the palm plane|.
  //                About 0.2 flat, 0.5-0.75 curled. Kept deliberately
  //                lenient: it exists to reject a cupped hand that is
  //                still technically "extended", not to demand a rigid
  //                salute.
  //
  //  UP. The palm normal against world up, as a dot product -- a cone,
  //  not an exact match, so a natural, slightly-tilted offer counts.
  //
  //  RAISED. Relative to the HEADSET, not to the floor: visitors are
  //  different heights and may be seated, and "raised" means raised for
  //  them. Falls back to an absolute floor if the camera is not up yet.
  palmPose: function (p) {
    var wrist = this.wrist;
    var ik = this.jointPos(p, HAND_JOINT.indexKnuckle, this._pa);
    var pk = this.jointPos(p, HAND_JOINT.pinkyKnuckle, this._pb);

    this.palmWidth = Math.max(0.03, ik.distanceTo(pk));

    //  the middle of the palm: the wrist and the two knuckles that span it
    this.palm.copy(wrist).add(ik).add(pk).multiplyScalar(1 / 3);

    //  the plane's normal, flipped per side (see above)
    this._pn.copy(ik).sub(wrist);
    this._pk.copy(pk).sub(wrist);
    this._pn.cross(this._pk);
    if (this._pn.lengthSq() < 1e-10) { this.palmUp = this.palmFlat = false; this.poseOk = false; return; }
    this._pn.normalize();
    if (this.side() !== 'left') { this._pn.multiplyScalar(-1); }
    this.palmNormal.copy(this._pn);

    //  flat: extension and off-plane offset, averaged over four fingers
    var ext = 0, off = 0;
    for (var i = 0; i < PALM_FINGERS.length; i++) {
      var tip = this.jointPos(p, PALM_FINGERS[i][1], this._pa);
      this._pk.copy(tip).sub(wrist);
      ext += this._pk.length();
      off += Math.abs(this._pk.dot(this.palmNormal));
    }
    ext /= (PALM_FINGERS.length * this.palmWidth);
    off /= (PALM_FINGERS.length * this.palmWidth);
    this.palmFlat = ext >= CFG.palmFlatExtend && off <= CFG.palmFlatOffset;

    //  v10 -- EITHER FACE. v9 asked for the palm to be turned up. The
    //  narration asks the visitor to hold their hand out flat and palm
    //  DOWN, and following it exactly took the hover-then-leave branch:
    //  the interaction read as broken to anyone who did as they were
    //  told. So the test is now that the hand is HORIZONTAL, and the
    //  butterfly lands on whichever face points at the sky -- the palm,
    //  or the back of the hand, which is where a butterfly lands on a
    //  person anyway.
    //
    //  It is also strictly more forgiving, which is the argument for it
    //  independent of the script: a visitor who holds the wrong side up
    //  still succeeds. The pose is still gated by palmFlat (fingers
    //  extended -- a pinching hand never qualifies) and palmRaised (held
    //  up near the headset), so an idle hand is still not an offer.
    //
    //  palmEitherFace = false restores v9.2's palm-up-only rule exactly.
    var upness = this.palmNormal.dot(WORLD_UP);
    this.palmUp = CFG.palmEitherFace ? (Math.abs(upness) >= CFG.palmUpDot)
                                     : (upness >= CFG.palmUpDot);
    //  THE LANDING SURFACE, not the palm's own normal. Everything
    //  downstream -- perchPoint's offset, _restQuat's plane, perchYaw's
    //  turn, the leg drop -- is quoted against the normal it is handed,
    //  so flipping it here is the whole change and none of v9.2's landing
    //  arithmetic moves.
    this.faceNormal.copy(this.palmNormal);
    if (upness < 0) { this.faceNormal.multiplyScalar(-1); }

    var floor;
    var cam = this.el.sceneEl.camera;
    if (cam) { cam.getWorldPosition(this._cam); floor = this._cam.y - CFG.palmRaiseBelowEye; }
    else { floor = CFG.eyeY - CFG.palmRaiseBelowEye; }
    this.palmRaised = this.palm.y >= floor;

    this.poseOk = this.palmFlat && this.palmUp && this.palmRaised;
  },

  //  THE OFFER, held on the way in and on the way out. The pose has to
  //  hold for palmHoldMs before it counts -- a hand sweeping past
  //  horizontally on its way somewhere else is not an offer -- and has to
  //  be gone for palmGraceMs before it stops counting. The release grace
  //  is the same argument as trackLossGraceMs in interact.js: Quest hand
  //  tracking drops a frame or two at a time, and a butterfly that took
  //  off every time it did would never stay on anyone's hand.
  holdOffer: function (ok, now) {
    if (ok) {
      if (this._okSince === null) { this._okSince = now; }
      this._badSince = null;
      if (!this.offering && (now - this._okSince) >= CFG.palmHoldMs) { this.offering = true; }
    } else {
      if (this._badSince === null) { this._badSince = now; }
      this._okSince = null;
      if (this.offering && (now - this._badSince) >= CFG.palmGraceMs) { this.offering = false; }
    }
  },

  tick: function (time) {
    var c = this.el.components['hand-tracking-controls'];
    if (time === undefined) { time = performance.now(); }

    if (this.data.hideModel && c) {
      this.el.object3D.visible = false;
      // and each joint entity, in case the parent hide is ever defeated
      if (c.jointEls) {
        for (var k = 0; k < c.jointEls.length; k++) {
          if (c.jointEls[k].object3D) { c.jointEls[k].object3D.visible = false; }
        }
      }
      if (c.mesh) { c.mesh.visible = false; }
    }

    if (!this.readDirect() && !this.readFromComponent(c)) {
      this.tracked = false;
      this.via = 'none';
      this.point.visible = false;
      //  A DROPOUT IS NOT A WITHDRAWN HAND. The pose reads false, but the
      //  release timer above is what decides -- so a butterfly sitting on
      //  a palm the tracker blinks on does not take off.
      this.poseOk = false;
      this.holdOffer(false, time);
      return;
    }
    var p = this.poses;
    this.tracked = true;
    this.point.visible = true;

    this.jointPos(p, HAND_JOINT.wrist, this.wrist);
    this.jointPos(p, HAND_JOINT.indexTip, this.indexTip);
    this.jointPos(p, HAND_JOINT.indexKnuckle, this.indexKnuckle);
    this.jointPos(p, HAND_JOINT.thumbTip, this.thumbTip);

    this.point.position.copy(this.wrist);
    this._m.fromArray(p, 0);
    this.point.quaternion.setFromRotationMatrix(this._m);

    this.pinch = this.thumbTip.distanceTo(this.indexTip);

    this.palmPose(p);
    this.holdOffer(this.poseOk, time);
  },

  //  Raw state, for the on-headset readout. Hand tracking cannot be
  //  reproduced on a desktop, so the only way to see why it is not
  //  working is to put the actual chain of preconditions on screen:
  //
  //    comp     hand-tracking-controls attached
  //    tc       tracked-controls has matched an input source
  //    hand     that input source is an XRHand (not a controller)
  //    ref      the reference space resolved (set on enter-vr)
  //    poses    fillPoses succeeded this frame
  //
  //  Whichever is the first `no` is the thing that is broken.
  debug: function () {
    var c = this.el.components['hand-tracking-controls'];
    var tc = this.el.components['tracked-controls'];
    var ctrl = tc && tc.controller;
    var r = this.el.sceneEl.renderer;
    var xrSpace = r && r.xr && r.xr.getReferenceSpace && r.xr.getReferenceSpace();
    return {
      comp: !!c,
      tc: !!ctrl,
      hand: !!(ctrl && ctrl.hand),
      ref: !!xrSpace,                 // the RENDERER's space, the one that matters
      poses: this.via !== 'none',
      tracked: this.tracked,
      via: this.via,
      y: this.tracked ? this.wrist.y : null,
      //  v9: and the three palm conditions separately, so an offer that
      //  is not being taken can be read off as WHICH of them is failing
      up: this.palmUp, flat: this.palmFlat, raised: this.palmRaised,
      face: this.faceNormal.toArray(),
      offering: this.offering
    };
  }
});

// convenience: the rig for a side, or null
function handRig(side) {
  var el = document.querySelector(side === 'left' ? '#handL' : '#handR');
  return el && el.components ? el.components['hand-rig'] || null : null;
}

// ============================================================
//  Hands  --  v9. Who is offering a palm right now.
// ============================================================
//  One question, asked by collection.js every frame: is there somewhere
//  for a butterfly to land, and where is it? Each answer is
//
//      { side, pos, normal, width, sim }
//
//  and the vectors are the RIG'S OWN, live -- read them, do not keep
//  them. A hand whose tracking has just dropped still answers while its
//  release timer runs (hands.js:holdOffer), with the last palm it saw,
//  which is the behaviour that keeps a butterfly on a blinking hand.
//
//  THE DESKTOP STAND-IN. Hand tracking cannot be reproduced on a desktop,
//  and the landing is most of what v9 adds, so SPACE toggles a synthetic
//  palm held out in front of the camera. It is a real offer as far as the
//  rest of the piece is concerned -- same shape of answer, same code path
//  -- so the whole approach / land / hold / leave arc can be driven and
//  tuned without a headset. It only ever appears when no real hand is
//  offering, and never inside an XR session.
// ============================================================
var Hands = (function () {
  'use strict';

  var out = [];
  var sim = {
    side: 'sim', pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
    width: 0.085, sim: true
  };
  var camPos = new THREE.Vector3();
  var fwd = new THREE.Vector3();
  var q = new THREE.Quaternion();
  var simOn = false;

  function scene() { return document.querySelector('a-scene'); }

  //  Where a hand held out in front of you would be, from the camera
  //  pose alone: forward, flattened to the horizontal, and down.
  function simPalm() {
    var sc = scene();
    var cam = sc && sc.camera;
    if (!cam || (sc.is && sc.is('vr-mode'))) { return null; }
    cam.updateMatrixWorld();
    cam.getWorldPosition(camPos);
    cam.getWorldQuaternion(q);
    fwd.set(0, 0, -1).applyQuaternion(q);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) { fwd.set(0, 0, -1); }
    fwd.normalize();
    sim.pos.copy(camPos).addScaledVector(fwd, CFG.palmSimOut);
    sim.pos.y = camPos.y - CFG.palmSimDrop;
    sim.normal.set(0, 1, 0);
    return sim;
  }

  function offers() {
    out.length = 0;
    var sides = ['left', 'right'];
    for (var i = 0; i < sides.length; i++) {
      var rig = handRig(sides[i]);
      //  deliberately NOT gated on rig.tracked -- see the header
      if (rig && rig.offering) {
        //  faceNormal, NOT palmNormal: the surface that points at the sky,
        //  which is the back of the hand when the palm is turned down
        out.push({ side: sides[i], pos: rig.palm, normal: rig.faceNormal,
                   width: rig.palmWidth, sim: false });
      }
    }
    if (!out.length && simOn) {
      var s = simPalm();
      if (s) { out.push(s); }
    }
    return out;
  }

  //  ...and the one on a given side, or null. Used to keep a butterfly
  //  aimed at the hand it was already aimed at.
  function offerOn(side) {
    var all = offers();
    for (var i = 0; i < all.length; i++) { if (all[i].side === side) { return all[i]; } }
    return null;
  }

  window.addEventListener('keydown', function (e) {
    //  SPACE, and only on a desktop. keyboard.js owns the letter keys.
    if (e.code !== 'Space' && e.key !== ' ') { return; }
    e.preventDefault();
    simOn = !simOn;
  });

  return {
    offers: offers, offerOn: offerOn,
    simulating: function () { return simOn; },
    simulate: function (v) { simOn = !!v; }
  };
})();
