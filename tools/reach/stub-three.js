// ------------------------------------------------------------
//  A minimum THREE + A-Frame + DOM stub, enough to run the
//  scene's own flight code under jsc. Maths only -- nothing
//  renders. Vector3/Quaternion/Matrix4 are real implementations.
// ------------------------------------------------------------
var THREE = {};

function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
V3.prototype = {
  set: function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
  copy: function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  clone: function () { return new V3(this.x, this.y, this.z); },
  add: function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
  sub: function (v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
  subVectors: function (a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; },
  addVectors: function (a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; },
  addScaledVector: function (v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
  multiplyScalar: function (s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  lengthSq: function () { return this.x * this.x + this.y * this.y + this.z * this.z; },
  length: function () { return Math.sqrt(this.lengthSq()); },
  setLength: function (l) { return this.normalize().multiplyScalar(l); },
  normalize: function () { var l = this.length() || 1; return this.multiplyScalar(1 / l); },
  dot: function (v) { return this.x * v.x + this.y * v.y + this.z * v.z; },
  distanceTo: function (v) { var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); },
  crossVectors: function (a, b) {
    var ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx; return this;
  },
  cross: function (v) { return this.crossVectors(this, v); },
  lerp: function (v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; },
  applyQuaternion: function (q) {
    var x = this.x, y = this.y, z = this.z, qx = q._x, qy = q._y, qz = q._z, qw = q._w;
    var ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  },
  applyAxisAngle: function (axis, ang) { return this.applyQuaternion(new Q().setFromAxisAngle(axis, ang)); },
  setFromMatrixPosition: function (m) { var e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; },
  setScalar: function (v) { return this.set(v, v, v); },
  isNaN: function () { return !isFinite(this.x) || !isFinite(this.y) || !isFinite(this.z); }
};
THREE.Vector3 = V3;
THREE.Vector2 = function (x, y) { this.x = x || 0; this.y = y || 0; };

function Q(x, y, z, w) { this._x = x || 0; this._y = y || 0; this._z = z || 0; this._w = w === undefined ? 1 : w; this._onChange = null; }
Q.prototype = {
  set: function (x, y, z, w) { this._x = x; this._y = y; this._z = z; this._w = w; this.chg(); return this; },
  chg: function () { if (this._onChange) { this._onChange(); } },
  copy: function (q) { return this.set(q._x, q._y, q._z, q._w); },
  clone: function () { return new Q(this._x, this._y, this._z, this._w); },
  conjugate: function () { this._x *= -1; this._y *= -1; this._z *= -1; this.chg(); return this; },
  setFromAxisAngle: function (a, ang) {
    var h = ang / 2, s = Math.sin(h);
    return this.set(a.x * s, a.y * s, a.z * s, Math.cos(h));
  },
  multiply: function (q) { return this.multiplyQuaternions(this, q); },
  multiplyQuaternions: function (a, b) {
    var ax = a._x, ay = a._y, az = a._z, aw = a._w, bx = b._x, by = b._y, bz = b._z, bw = b._w;
    return this.set(ax * bw + aw * bx + ay * bz - az * by,
                    ay * bw + aw * by + az * bx - ax * bz,
                    az * bw + aw * bz + ax * by - ay * bx,
                    aw * bw - ax * bx - ay * by - az * bz);
  },
  slerp: function (q, t) {
    if (t <= 0) { return this; }
    if (t >= 1) { return this.copy(q); }
    var x = this._x, y = this._y, z = this._z, w = this._w;
    var cos = w * q._w + x * q._x + y * q._y + z * q._z;
    var qx = q._x, qy = q._y, qz = q._z, qw = q._w;
    if (cos < 0) { cos = -cos; qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    if (cos > 0.9995) {
      return this.set(x + (qx - x) * t, y + (qy - y) * t, z + (qz - z) * t, w + (qw - w) * t).normalize();
    }
    var th = Math.acos(cos), s = Math.sin(th);
    var a = Math.sin((1 - t) * th) / s, b = Math.sin(t * th) / s;
    return this.set(x * a + qx * b, y * a + qy * b, z * a + qz * b, w * a + qw * b);
  },
  normalize: function () {
    var l = Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w) || 1;
    return this.set(this._x / l, this._y / l, this._z / l, this._w / l);
  },
  setFromRotationMatrix: function (m) {
    var te = m.elements,
      m11 = te[0], m12 = te[4], m13 = te[8],
      m21 = te[1], m22 = te[5], m23 = te[9],
      m31 = te[2], m32 = te[6], m33 = te[10],
      trace = m11 + m22 + m33, s;
    if (trace > 0) {
      s = 0.5 / Math.sqrt(trace + 1.0);
      return this.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
    } else if (m11 > m22 && m11 > m33) {
      s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      return this.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    } else if (m22 > m33) {
      s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      return this.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
    }
    s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
    return this.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
  },
  setFromEuler: function (e) {
    var c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2);
    var s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
    // XYZ is close enough for a maths smoke test
    return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3,
                    c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
  },
  isNaN: function () { return !isFinite(this._x) || !isFinite(this._y) || !isFinite(this._z) || !isFinite(this._w); }
};
THREE.Quaternion = Q;

function M4() { this.elements = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
M4.prototype = {
  fromArray: function (a, o) { o = o || 0; for (var i = 0; i < 16; i++) { this.elements[i] = a[i + o]; } return this; },
  makeBasis: function (x, y, z) {
    var e = this.elements;
    e[0] = x.x; e[4] = y.x; e[8]  = z.x; e[12] = 0;
    e[1] = x.y; e[5] = y.y; e[9]  = z.y; e[13] = 0;
    e[2] = x.z; e[6] = y.z; e[10] = z.z; e[14] = 0;
    e[3] = 0;   e[7] = 0;   e[11] = 0;   e[15] = 1;
    return this;
  },
  extractBasis: function (x, y, z) {
    var e = this.elements;
    x.set(e[0], e[1], e[2]); y.set(e[4], e[5], e[6]); z.set(e[8], e[9], e[10]);
    return this;
  }
};
THREE.Matrix4 = M4;

function Eul(x, y, z, order) { this._x = x||0; this._y = y||0; this._z = z||0; this.order = order || 'XYZ'; this._onChange = null; }
Object.defineProperty(Eul.prototype, 'x', { get: function(){return this._x;}, set: function(v){this._x=v; if(this._onChange) this._onChange();} });
Object.defineProperty(Eul.prototype, 'y', { get: function(){return this._y;}, set: function(v){this._y=v; if(this._onChange) this._onChange();} });
Object.defineProperty(Eul.prototype, 'z', { get: function(){return this._z;}, set: function(v){this._z=v; if(this._onChange) this._onChange();} });
Eul.prototype.set = function (x, y, z, order) {
  this._x = x; this._y = y; this._z = z; if (order) { this.order = order; }
  if (this._onChange) { this._onChange(); }
  return this;
};
THREE.Euler = Eul;

function Obj3D() {
  this.position = new V3();
  this.rotation = new Eul();
  this.quaternion = new Q();
  this.scale = new V3(1, 1, 1);
  this.visible = true;
  this.children = [];
  this.parent = null;
  this.matrixWorld = new M4();
  var self = this;
  //  the real Object3D keeps rotation and quaternion in sync; the flight
  //  code switches between the two representations, so the stub must too
  this.rotation._onChange = function () { self.quaternion.setFromEuler(self.rotation); };
  this.quaternion._onChange = function () { /* euler back-conversion not needed here */ };
}
Obj3D.prototype.add = function () {
  for (var i = 0; i < arguments.length; i++) { arguments[i].parent = this; this.children.push(arguments[i]); }
  return this;
};
Obj3D.prototype.remove = function (o) {
  var i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this;
};
Obj3D.prototype.updateMatrixWorld = function () {};
Obj3D.prototype.getWorldPosition = function (out) { return out.copy(this.position); };
Obj3D.prototype.getWorldQuaternion = function (out) { return out.copy(this.quaternion); };
THREE.Object3D = Obj3D;
THREE.Group = Obj3D;
THREE.MathUtils = { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); } };
THREE.BufferGeometry = function () {
  var self = this;
  this.attributes = {};
  this.setAttribute = function (k, a) { self.attributes[k] = a; };
  this.dispose = function () {};
};
THREE.BufferAttribute = function (arr) { this.array = arr; this.needsUpdate = false; };
THREE.LineBasicMaterial = function (o) { this.opacity = (o && o.opacity) || 1; };
THREE.Line = function (geo, mat) { this.geometry = geo; this.material = mat; this.visible = false; this.frustumCulled = true; };
THREE.Raycaster = function () { this.ray = { origin: new V3(), direction: new V3() }; this.setFromCamera = function () {}; };
