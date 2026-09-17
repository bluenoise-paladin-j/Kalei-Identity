// ------------------------------------------------------------
//  The rest of the scene, stubbed: A-Frame's component registry,
//  a DOM with a camera and two hands, and the modules collection.js
//  leans on (Wings / WingColour / BflyModel / UI / DNA).
// ------------------------------------------------------------
var COMPONENTS = {};
var AFRAME = {
  registerComponent: function (name, def) { COMPONENTS[name] = def; return def; }
};

var listeners = {};
var window = this;
window.addEventListener = function (k, fn) { (listeners[k] = listeners[k] || []).push(fn); };
window.dispatchEvent = function (e) {
  var l = listeners[e.type] || [];
  for (var i = 0; i < l.length; i++) { l[i](e); }
};
function CustomEvent(type, opts) { this.type = type; this.detail = opts && opts.detail; }
var performance = { now: function () { return Date.now(); } };
var console = { log: print, warn: function (m) { print('WARN ' + m); }, error: function (m) { print('ERROR ' + m); } };

// ---- the DOM ----
var CAM = new THREE.Object3D();
CAM.position.set(0, 1.6, 0);
CAM.updateMatrixWorld = function () {};
CAM.matrixWorld.makeBasis(new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1));

var SCENE_EL = {
  camera: CAM,
  object3D: new THREE.Object3D(),
  is: function () { return false; },
  addEventListener: function (k, fn) { if (k === 'loaded') { fn(); } },
  renderer: null, frame: null
};

//  the two hand entities, each carrying a fake hand-rig with the fields
//  Hands.offers() reads
function makeRig(side) {
  return {
    tracked: false, offering: false, side: side,
    palm: new THREE.Vector3(), palmNormal: new THREE.Vector3(0, 1, 0),
    //  v10: the face that points at the sky -- what Hands.offers()
    //  publishes, and the surface a butterfly actually lands on
    faceNormal: new THREE.Vector3(0, 1, 0), palmWidth: 0.085
  };
}
var RIGS = { left: makeRig('left'), right: makeRig('right') };
var ELEMENTS = {
  '#handL': { components: { 'hand-rig': RIGS.left } },
  '#handR': { components: { 'hand-rig': RIGS.right } },
  'a-scene': SCENE_EL
};
var document = {
  querySelector: function (sel) { return ELEMENTS[sel] || null; },
  addEventListener: function () {},
  removeEventListener: function () {}
};

// ---- the modules collection.js builds a butterfly out of ----
var Wings = { forDials: function () { return { tex: {}, canvas: { width: 128, height: 256 } }; } };
var WingColour = { forEntry: function () { return { canvas: {}, tex: {}, hue: 0.5, css: '#888' }; } };
var BflyModel = {
  build: function () {
    var m = new THREE.Object3D();
    return {
      model: m, flapAngle: 0, opacity: 1,
      setColor: function () {}, setOpacity: function (a) { this.opacity = a; },
      flap: function (a) { this.flapAngle = a; }, dispose: function () {}
    };
  }
};
var UI = {
  nameTag: function () {
    return { sprite: new THREE.Object3D(), place: function () {}, dispose: function () {} };
  },
  //  v10: guide.js builds its start flower out of this. Only the shape
  //  of the answer matters headless -- there is nothing to draw.
  blob: function () {
    return {
      mesh: new THREE.Object3D(),
      shape: function () {},
      setColor: function (h, l) { this.hue = h; this.lit = l; },
      setAlpha: function (a) { this.alpha = a; },
      dispose: function () {}
    };
  }
};

//  v10: jsc has no timers. guide.js's doff path arms one AND checks the
//  elapsed time when visibility returns -- the second is the one that
//  matters (the next visitor puts the headset on and must find the start
//  flower), and it is the one the harness drives. These exist so arming
//  it is not a ReferenceError.
function setTimeout(fn, ms) { return 0; }
function clearTimeout(id) {}

//  v10: the reveal's envelope, as much of it as the guide reads. The
//  quiet clock freezes while this is true.
var Reveal = { active: false, dim: 1, slow: 1, shockT: 0, shockAt: null };
var STORE = [];
var DNA = {
  sequences: function () { return STORE; },
  dialsFor: function () { return [0, 0, 0, 0]; }
};
