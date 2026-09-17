// ============================================================
//  wing-colour.js  --  the per-name base-colour texture
//  v8   = faithful-look port of wingbasecolour_script.py
//  v8.3 = layered, lepidopteran (membrane + markings)
//  v8.4 = archetypes + an integrated dot system
//  v8.5 = flat GEOMETRIC design, one pattern per wing
//  v8.6 = flat GRAPHIC COMPOSITION -- big shapes, blend modes, hard edges
// ============================================================
//  A full-frame RGB texture, 128x256 (the wing shape slice); alpha is a
//  constant 1 and the wing SHAPE (wing-tex.js) supplies the cutout as a
//  separate alphaMap. ONLY the visitor's grown butterfly gets one
//  (collection.js) -- the 26 keyboard letters stay flat.
//
//  WHAT v8.6 CHANGES, and why. v8.5 was disciplined and coherent but it
//  was painting the wrong thing: one pattern stretched edge to edge, in
//  the keyboard's own twenty-six full-chroma HSL hues. The reference
//  graphics do something else --
//
//    * a LIGHT GROUND with a handful of BIG FLAT SHAPES on it and real
//      empty space between them. Sparse and bold, not a full-frame fill.
//    * shapes that OVERLAP and BLEND -- difference, multiply, screen --
//      so the overlaps make colours neither shape had.
//    * a PRINTED palette: bold primaries next to muted earths (brick,
//      olive, maroon, tan) and neutrals (cream, mid grey, black). The
//      earths and neutrals are what stop it looking like a screensaver.
//    * HARD EDGES. No antialiasing.
//
//  THE PALETTE IS A FIXED TABLE (PAL below), sampled from those graphics.
//  This deliberately DROPS v8.5's tie to the keyboard's 26-hue wheel: the
//  26 keys keep their flat HSL colours and the visitor's butterfly no
//  longer draws from the same set. That divergence is intentional.
//
//  CONTRAST IS MEASURED, NOT ASSUMED. The brief was explicit that black
//  must not be the only contrast device, so pairs are scored on WCAG
//  RELATIVE LUMINANCE -- a real perceptual metric -- and a pair must clear
//  a contrast ratio AND, when both colours are chromatic, a hue
//  separation, so it is never merely a light and a dark version of one
//  colour. v8.5 compared HSL lightness, which can only rank hues that are
//  all at the same chroma; this table is deliberately not.
//
//  HARD EDGES, AND WHAT THEY COST. CFG.wingColAA is a half-width in
//  PIXELS and defaults to 0: every coverage test is a binary compare.
//  Hard edges alias, so the scale range is BOLD (repeat counts 2-14, per
//  kind pixel floors in MINS) -- v8.5's fine-print variants are gone on
//  purpose. Circle edges stair-step at 128 px wide; that is inherent, and
//  wingColAA is the one place to soften it.
//
//  The chroma restore, the value posterise and the grain are all GONE.
//  Every one of them existed to rescue a palette that was fighting
//  itself. A curated flat table with deliberate blend modes needs no
//  rescuing, and a grade would only muddy the blends.
//
//  SQUARE SPACE. The slice is 1:2, so u and v are NOT interchangeable.
//  All geometry runs in (x, y) = (u, v * VASP) where one unit is W = 128
//  pixels on BOTH axes. That is what keeps a circle round.
//
//  NOT PARITY-LOCKED. Name-driven, mulberry32 off an FNV-1a hash of
//  entry.values. The contract is: SAME entry.values -> byte-identical
//  texture, any machine, any reload -- held by every draw happening up
//  front in the fixed order the DRAW N comments mark, and by the pixel
//  loop and the ink guard containing no rng at all.
//
//  Loads AFTER config.js (reads CFG.wingCol*), wing-gen.js (SLICE_W/H)
//  and A-Frame (THREE). Before collection.js.
// ============================================================
var WingColour = (function () {
  'use strict';

  var W = WingGen.SLICE_W;   // 128, outward from the body (root -> tip)
  var H = WingGen.SLICE_H;   // 256, along the body
  var VASP = H / W;          // 2 -- y = v * VASP gives SQUARE pixels
  var PXU = 1 / W;           // one pixel, in square-space units

  //  WHERE THE WING ACTUALLY IS, in square space. Composition has to be
  //  aimed HERE, not at the frame: a big shape placed by frame coordinates
  //  is routinely cropped by the silhouette down to one flat block, which
  //  is what the first v8.6 pass produced. Deliberately a static
  //  approximation -- wing-colour.js does not call the parity-locked shape
  //  generator, and must not start.
  //
  //  v8.7 WIDENED IT, because the fit stage changed the answer. v8.6's
  //  wing was roughly the left half of the slice and most of its length;
  //  measured over 500 names it painted a mean box of x 0.00-0.59,
  //  y 0.46-1.77 and filled 21% of the frame. With the fit stage that box
  //  is x 0.00-0.85, y 0.07-1.93 and 43% of the frame, so the old numbers
  //  now aim the composition at the middle of a wing that reaches well
  //  past them -- the outer third and both ends would get whatever a
  //  shape happened to spill into. These follow the new means with the
  //  same slack the old ones had.
  var WX0 = 0.01, WX1 = 0.85, WY0 = 0.10, WY1 = 1.90;   // v8.7: the wing fills far more of the slice -- see below
  var WCX = (WX0 + WX1) * 0.5, WCY = (WY0 + WY1) * 0.5;

  //  minimum feature size in PIXELS, by pattern kind. Higher than v8.5's
  //  because hard edges alias and the brief asked for bold sizing.
  //  0 stripes 1 checker 2 dots 3 rings 4 sunburst
  var MINS = [10, 12, 12, 10, 10];

  ['wingColRandAmt', 'wingColStyle', 'wingColHues', 'wingColShapes',
   'wingColBlend', 'wingColPatternScale', 'wingColAA'].forEach(function (key) {
    if (CFG[key] === undefined) { console.error('[wing-colour] CFG.' + key + ' is undefined'); }
  });

  var STYLES = ['stripes', 'checker', 'dots', 'rings', 'sunburst'];
  var BLENDS = ['normal', 'difference', 'multiply', 'screen', 'exclusion'];
  var TAU = Math.PI * 2;

  // ---------- the palette ----------
  //  Sampled from the reference graphics. Three families, and the mix is
  //  the point: bold alone reads as a screensaver, earth alone reads as
  //  mud, neutrals alone read as a wireframe.
  var PAL_HEX = [
    // bold -- the first pass had twelve and half of them were dark
    // (deep blue, forest, dark teal), so with eight muted earths and six
    // neutrals behind them the whole set read dull and grey. Six BRIGHT
    // entries added: red, mint, coral, lime, azure, gold.
    '#E03127', '#E8481C', '#E87722', '#F5C518', '#1257C4', '#1B3A8C',
    '#34D3C4', '#4E9A2F', '#2E6B4F', '#1F4A42', '#6B3FA0', '#E8336E',
    '#FF2D1F', '#4DE8A8', '#FF6B4A', '#B8E62E', '#00B4E0', '#FFC72C',
    // muted / earth
    '#8C2F39', '#A6522C', '#6E7A34', '#C9A96A', '#8B5E3C', '#9AA98C',
    '#E3A6AC', '#4A6B8A',
    // neutral
    '#141414', '#3A3A3A', '#9A9A9A', '#D6D6D6', '#F0E6D2', '#FFFFFF'
  ];
  var N_BOLD = 18, N_EARTH = 8;          // the rest are neutrals

  function hexRgb(h) {
    return [parseInt(h.substr(1, 2), 16) / 255,
            parseInt(h.substr(3, 2), 16) / 255,
            parseInt(h.substr(5, 2), 16) / 255];
  }
  //  WCAG relative luminance -- the sRGB transfer curve, not a naive mean.
  //  This is what makes "strong contrast" a measurement rather than a hope.
  function srgbToLin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function relLum(c) { return 0.2126 * srgbToLin(c[0]) + 0.7152 * srgbToLin(c[1]) + 0.0722 * srgbToLin(c[2]); }
  function hueOf(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn;
    if (d < 1e-6) { return 0; }
    var h;
    if (mx === c[0]) { h = ((c[1] - c[2]) / d) % 6; }
    else if (mx === c[1]) { h = (c[2] - c[0]) / d + 2; }
    else { h = (c[0] - c[1]) / d + 4; }
    return ((h / 6) % 1 + 1) % 1;
  }
  function chromaOf(c) {
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    return mx < 1e-6 ? 0 : (mx - mn) / mx;
  }

  var PAL = PAL_HEX.map(function (hex, i) {
    var rgb = hexRgb(hex);
    return {
      hex: hex, rgb: rgb, lum: relLum(rgb), hue: hueOf(rgb), chroma: chromaOf(rgb),
      family: i < N_BOLD ? 0 : (i < N_BOLD + N_EARTH ? 1 : 2)     // 0 bold 1 earth 2 neutral
    };
  });
  var PN = PAL.length;
  //  index groups worth naming once
  var LIGHT_NEUTRAL = [], DARK_NEUTRAL = [], CHROMATIC = [], BRIGHT = [];
  PAL.forEach(function (p, i) {
    //  0.45, not 0.25: mid grey sits at ~0.32 and it is the single dullest
    //  thing here. It stays in the table -- it is a fine partner colour --
    //  but it is no longer eligible to be the GROUND, which is the role
    //  that decides how the whole wing feels.
    //  mid grey (lum ~0.32) is the single dullest entry here. It stays in
    //  the table as a partner colour but is barred from BOTH ground pools:
    //  the ground decides how the whole wing feels, and a grey one always
    //  feels flat. Black and charcoal are dramatic and stay eligible.
    if (p.family === 2) {
      if (p.lum > 0.45) { LIGHT_NEUTRAL.push(i); }
      else if (p.lum < 0.15) { DARK_NEUTRAL.push(i); }
    }
    else { CHROMATIC.push(i); }
    //  BRIGHT needs high chroma AND a high VALUE. Chroma alone is not
    //  enough: olive, forest, deep blue, maroon and dark teal are all
    //  fully chromatic and all dark, and a ground drawn from those is
    //  exactly the muddy result this list exists to avoid. mx > 0.60 is
    //  what separates mint and coral from olive and forest.
    if (p.chroma > 0.45 && Math.max(p.rgb[0], p.rgb[1], p.rgb[2]) > 0.60) { BRIGHT.push(i); }
  });

  function contrast(a, b) {
    var la = PAL[a].lum, lb = PAL[b].lum;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function hueGap(a, b) {
    var d = Math.abs(PAL[a].hue - PAL[b].hue);
    return d > 0.5 ? 1 - d : d;
  }
  //  How good a PAIR is.
  //
  //  CONTRAST IS A GATE, NOT AN OBJECTIVE, and this is the single most
  //  important line in the file. The first pass scored pairs on raw
  //  contrast ratio and the whole set came out black-and-white: black on
  //  white is 21:1 and wins every comparison there is, so a scorer that
  //  maximises contrast will always reach for the neutrals. That is
  //  precisely what the brief ruled out -- "don't just use black for
  //  contrast; find colours that work well together AND have strong
  //  contrast". So contrast gates at 2.6:1, saturates at 7:1, and
  //  everything above that is worth nothing extra; what actually earns
  //  score is COLOUR.
  function pairScore(a, b) {
    if (a === b) { return -1; }
    var cr = contrast(a, b);
    if (cr < 2.6) { return -1; }
    var A = PAL[a], B = PAL[b];
    var bothChroma = A.chroma > 0.18 && B.chroma > 0.18;
    //  two saturated hues at the same value vibrate -- that needs either a
    //  hue gap or a real tonal step, not neither
    if (bothChroma && hueGap(a, b) < 0.09 && cr < 4.5) { return -1; }
    var s = Math.min(cr, 7) / 7 * 0.30;
    s += (A.chroma > 0.18 ? 0.26 : 0) + (B.chroma > 0.18 ? 0.26 : 0);
    //  BRIGHTNESS earns score too. Chromatic alone is not enough: deep
    //  blue, forest and dark teal are all fully chromatic and all dark, and
    //  a set built from those plus a grey ground is exactly the "dull"
    //  result this is here to prevent.
    s += (BRIGHT.indexOf(a) >= 0 ? 0.16 : 0) + (BRIGHT.indexOf(b) >= 0 ? 0.16 : 0);
    if (bothChroma) { s += hueGap(a, b) * 0.5; }
    return s;
  }

  // ---------- hashing ----------
  function fnv1a(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function canon(values) { return values.map(function (v) { return Number(v).toFixed(6); }).join(','); }
  function seedFor(values)    { return fnv1a(canon(values)); }
  function nameHueFor(values) { return fnv1a(canon(values.slice().reverse())) / 4294967296; }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- maths ----------
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function smoothstep(e0, e1, x) { var t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }

  var _aa = 0;               // antialias half-width in square-space units, per render

  //  the two primitives every coverage test goes through. At _aa = 0 both
  //  collapse to a binary compare, which is the whole point of v8.6.
  function inside(d, r) {
    return _aa <= 0 ? (d < r ? 1 : 0) : 1 - smoothstep(r - _aa, r + _aa, d);
  }
  function sq(t, duty, aa) {                 // square wave, 1 inside the bar
    var f = t - Math.floor(t);
    if (aa <= 0) { return f < duty ? 1 : 0; }
    return smoothstep(-aa, aa, f) - smoothstep(duty - aa, duty + aa, f);
  }

  // ---------- pattern operators ----------
  //  One fills a shape (or the whole wing). Coverage 0..1 of the MARK
  //  colour over the shape's own GROUND colour.
  function patternAt(R, x, y) {
    var t, a, b, aa;
    switch (R.kind) {
      case 0:                                                      // stripes
        return sq((x * R.ca + y * R.sa) / R.sc, R.duty, _aa / R.sc);
      case 1:                                                      // checker
        aa = _aa / R.sc;
        a = sq((x * R.ca + y * R.sa) / R.sc, 0.5, aa);
        b = sq((-x * R.sa + y * R.ca) / R.sc, 0.5, aa);
        return a + b - 2 * a * b;                                  // XOR
      case 2:                                                      // halftone dots
        //  a REGULAR staggered lattice: alternate rows offset half a cell,
        //  row pitch sc*sqrt(3)/2 for hexagonal packing, every dot the same
        //  size. Rounding to the nearest column in each of three rows finds
        //  the nearest site exactly -- 3 candidates, not 9.
        var hx = x * R.ca + y * R.sa, hy = -x * R.sa + y * R.ca;
        var rowH = R.sc * 0.8660254;
        var gy0 = Math.round(hy / rowH), best = 1e9;
        for (var ry = -1; ry <= 1; ry++) {
          var gy1 = gy0 + ry;
          var offx = (gy1 & 1) ? 0.5 : 0;                          // -1 & 1 is 1: holds for negative rows
          var cx = (Math.round(hx / R.sc - offx) + offx) * R.sc;
          var ddx = hx - cx, ddy = hy - gy1 * rowH;
          var dd2 = ddx * ddx + ddy * ddy;
          if (dd2 < best) { best = dd2; }
        }
        return inside(Math.sqrt(best), R.sc * R.rad);
      case 3:                                                      // concentric rings
        var rx = x - R.ox, ry2 = y - R.oy;
        return sq(Math.sqrt(rx * rx + ry2 * ry2) / R.sc, R.duty, _aa / R.sc);
      default:                                                     // 4 sunburst
        var sx = x - R.ox, sy = y - R.oy;
        var rr = Math.sqrt(sx * sx + sy * sy);
        if (rr < 1e-4) { return 0; }
        t = (Math.atan2(sy, sx) / TAU + 0.5) * R.rays;
        //  The ONE place a hard edge is not enough. Rays converge at the
        //  centre, so within a few pixels of it the angular cell is
        //  sub-pixel and a binary test produces a moire star. Widen the
        //  antialias with 1/radius there only, and beyond that fall back to
        //  the global _aa (0 by default), so the rays stay hard where they
        //  are actually resolvable.
        aa = Math.max(_aa, PXU * 0.9) * R.rays / (TAU * rr);
        if (aa > 0.5) { return R.duty; }                           // beyond resolving
        return sq(t, R.duty, rr > 12 * PXU ? _aa * R.rays / (TAU * rr) : aa);
    }
  }

  // ---------- shapes ----------
  //  0 circle  1 shard (polygon)  2 band
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var L2 = dx * dx + dy * dy || 1e-9;
    var t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
  }
  function shapeAt(S, x, y) {
    if (S.kind === 0) {                                            // circle
      var dx = x - S.cx, dy = y - S.cy;
      return inside(Math.sqrt(dx * dx + dy * dy), S.r);
    }
    if (S.kind === 2) {                                            // band
      var s = x * S.ca + y * S.sa - S.d;
      return inside(s < 0 ? -s : s, S.half);
    }
    //  shard: even-odd crossing gives an exact binary test for any simple
    //  polygon; the edge distance is only computed when AA is switched on.
    var P = S.pts, n = P.length, hit = false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) { hit = !hit; }
    }
    if (_aa <= 0) { return hit ? 1 : 0; }
    var dmin = 1e9;
    for (var k = 0, m = n - 1; k < n; m = k++) {
      var dd = segDist(x, y, P[m][0], P[m][1], P[k][0], P[k][1]);
      if (dd < dmin) { dmin = dd; }
    }
    return hit ? 1 - smoothstep(-_aa, _aa, -dmin) : 1 - smoothstep(-_aa, _aa, dmin);
  }

  //  a rotated ellipse OUTLINE, stroke width even all the way round --
  //  |f| / |grad f| is the first-order distance to the curve, which a bare
  //  radial test is not (it pinches at the ends of the major axis).
  function ringLine(L, x, y) {
    var dx = x - L.cx, dy = y - L.cy;
    var px = dx * L.ca + dy * L.sa, py = -dx * L.sa + dy * L.ca;
    var f = (px * px) / (L.a * L.a) + (py * py) / (L.b * L.b) - 1;
    var gx = 2 * px / (L.a * L.a), gy = 2 * py / (L.b * L.b);
    var g = Math.sqrt(gx * gx + gy * gy);
    if (g < 1e-9) { return 0; }
    return inside(Math.abs(f) / g, L.w);
  }

  // ---------- blend modes ----------
  //  The v8.6 mechanism. `difference` is the headline -- it is what the
  //  reference's overlapping rings are doing.
  function blend(mode, d, s) {
    switch (mode) {
      case 1: return d > s ? d - s : s - d;                        // difference
      case 2: return d * s;                                        // multiply
      case 3: return 1 - (1 - d) * (1 - s);                        // screen
      case 4: return d + s - 2 * d * s;                            // exclusion
      default: return s;                                           // normal
    }
  }

  // ---------- the render ----------
  //  k = { ramt, style, hues, shapes, blend, pscale, aa }
  function render(canvas, seed, nameHue, k) {
    canvas.width = W; canvas.height = H;
    var rng = mulberry32(seed >>> 0);
    var ramt = k.ramt;
    function jit(s) { return (rng() * 2 - 1) * ramt * s; }
    function clampf(x, a, b) { return x < a ? a : (x > b ? b : x); }
    var pscale = k.pscale > 0 ? k.pscale : 1;
    _aa = Math.max(k.aa, 0) * PXU;

    // ===== DRAW 1: the working set =====
    //  A name draws a few palette entries, then everything else is chosen
    //  from that set by CONTRAST rather than at random.
    var nWork = clampf(Math.round(k.hues > 0 ? k.hues : 5), 3, 10);

    //  the GROUND. Biased to the light neutrals -- that is what gives the
    //  references their air, and it is the single biggest difference from
    //  v8.5, where the ground was always a saturated hue.
    //  Weighted toward a BRIGHT ground far more than the first pass, which
    //  put a neutral under 46% of names and left the set looking washed.
    var gRoll = rng();
    var groundIdx = gRoll < 0.30 ? LIGHT_NEUTRAL[Math.floor(rng() * LIGHT_NEUTRAL.length) % LIGHT_NEUTRAL.length]
                  : gRoll < 0.74 ? BRIGHT[Math.floor(rng() * BRIGHT.length) % BRIGHT.length]
                  : gRoll < 0.86 ? DARK_NEUTRAL[Math.floor(rng() * DARK_NEUTRAL.length) % DARK_NEUTRAL.length]
                  :                CHROMATIC[Math.floor(rng() * CHROMATIC.length) % CHROMATIC.length];

    //  Build the rest of the set by repeatedly taking the best-scoring
    //  partner for what is already there, with a jitter so it is varied
    //  rather than always the single most extreme pick.
    //
    //  NEUTRALS ARE CAPPED. Even with contrast gated rather than maximised,
    //  an unconstrained set drifts grey, because a neutral clashes with
    //  nothing and so never scores badly. Two at most, the ground included:
    //  the references use cream and grey as a GROUND to sit colour on, not
    //  as the colour itself.
    var MAX_NEUTRAL = 2;
    var work = [groundIdx];
    var nNeutral = PAL[groundIdx].family === 2 ? 1 : 0;

    //  A LEAD COLOUR, DRAWN OUTRIGHT rather than scored. Without this the
    //  greedy builder below converges on whatever pair scores best
    //  globally -- purple and lime are near-complementary and both bright,
    //  so they won for name after name and the whole set went purple. The
    //  scorer's job is to find partners that WORK; deciding what the wing
    //  is ABOUT is the name's job.
    var leadRoll = rng();
    var lead0 = Math.floor(leadRoll * BRIGHT.length) % BRIGHT.length;
    for (var lo = 0; lo < BRIGHT.length; lo++) {
      var cand0 = BRIGHT[(lead0 + lo) % BRIGHT.length];
      if (cand0 !== groundIdx && pairScore(groundIdx, cand0) >= 0) { work.push(cand0); break; }
    }
    for (var wi = 1; wi < nWork; wi++) {
      var bestI = -1, bestS = -1, tie = rng();
      for (var ci = 0; ci < PN; ci++) {
        if (work.indexOf(ci) >= 0) { continue; }
        if (PAL[ci].family === 2 && nNeutral >= MAX_NEUTRAL) { continue; }
        var sc = 0, ok = true;
        for (var wj = 0; wj < work.length; wj++) {
          var ps = pairScore(work[wj], ci);
          if (wj === 0 && ps < 0) { ok = false; break; }           // must work against the GROUND
          sc += ps < 0 ? -0.35 : ps;
        }
        if (!ok) { continue; }
        //  a wide jitter on purpose -- a tight one lets the same handful of
        //  top-scoring partners reappear on every wing
        sc = sc / work.length + ((ci * 7 + tie * 31) % 1) * 0.55;
        if (sc > bestS) { bestS = sc; bestI = ci; }
      }
      if (bestI < 0) { break; }
      if (PAL[bestI].family === 2) { nNeutral++; }
      work.push(bestI);
    }
    //  The BODY has to read as a silhouette against a WHITE SKY, so it can
    //  never be a pale neutral -- but "darkest chromatic in the set" is
    //  also wrong: deep blue has the lowest luminance of any hue here, so
    //  it won every time and most butterflies came out navy. Collect every
    //  member that is chromatic enough and dark enough, then DRAW one.
    var bodyPool = [];
    for (var bi = 0; bi < work.length; bi++) {
      var p = PAL[work[bi]];
      if (p.chroma > 0.25 && p.lum < 0.45) { bodyPool.push(work[bi]); }
    }
    var bodyRoll = rng();
    var bodyIdx;
    if (bodyPool.length) {
      bodyIdx = bodyPool[Math.floor(bodyRoll * bodyPool.length) % bodyPool.length];
    } else {
      var fall = [];
      for (var ai = 0; ai < CHROMATIC.length; ai++) {
        if (PAL[CHROMATIC[ai]].lum < 0.45) { fall.push(CHROMATIC[ai]); }
      }
      bodyIdx = fall[Math.floor(bodyRoll * fall.length) % fall.length];
      if (work.indexOf(bodyIdx) < 0) { work.push(bodyIdx); }
    }

    function pickWork(against) {
      //  best partner within the working set, jittered. pairScore already
      //  favours colour over neutrals, so this does not need its own rule.
      var bI = work[0], bS = -1, tb = rng();
      for (var i = 0; i < work.length; i++) {
        var s2 = pairScore(against, work[i]);
        if (s2 < 0) { continue; }
        s2 += ((i * 5 + tb * 17) % 1) * 0.34;
        if (s2 > bS) { bS = s2; bI = work[i]; }
      }
      return bI;
    }

    // ===== DRAW 2: an optional full-wing pattern behind everything =====
    //  A patterned ground carries the wing on its own when the shapes
    //  happen to fall outside the silhouette, so it earns its keep more
    //  often than the first pass allowed.
    var bgPatOn = rng() < 0.55;
    var bgMarkIdx = pickWork(groundIdx);
    var BG = makePattern(rng, jit, clampf, pscale, k.style, 0.30 + rng() * 0.22);

    // ===== DRAW 3: 1-3 big shapes =====
    var nShapes = k.shapes > 0 ? clampf(Math.round(k.shapes), 1, 5)
                               : (rng() < 0.18 ? 1 : (rng() < 0.66 ? 2 : 3));
    //  LEGIBILITY AT WING SCALE. The painted silhouette is small on
    //  screen, so three patterned shapes over a patterned ground is mush
    //  however bold each one is. Cap how many shapes may carry a pattern:
    //  one if the ground is already patterned, two otherwise.
    var patBudget = bgPatOn ? 1 : 2;
    var SH = [];
    for (var si = 0; si < nShapes; si++) {
      var kindRoll = rng();
      var sk = kindRoll < 0.62 ? 0 : (kindRoll < 0.86 ? 1 : 2);    // circle-dominant, as in the references
      var patRoll = rng();
      var patOn = patRoll < 0.58 && patBudget > 0;
      if (patOn) { patBudget--; }
      var aIdx = pickWork(groundIdx);
      var bIdx = pickWork(aIdx);
      //  BLEND MODE, drawn jointly with the ground's lightness. difference
      //  against a light ground darkens and against black returns the
      //  source unchanged, so choosing it independently would make half of
      //  them vanish.
      var groundLight = PAL[groundIdx].lum > 0.30;
      var bRoll = rng();
      var mode = k.blend >= 0 ? k.blend
               : (bRoll < 0.40 ? 0
                : bRoll < (groundLight ? 0.74 : 0.60) ? 1          // difference
                : bRoll < 0.84 ? (groundLight ? 2 : 3)             // multiply on light, screen on dark
                : bRoll < 0.93 ? 4 : 0);
      var S = {
        kind: sk, mode: mode, pat: patOn,
        aIdx: aIdx, bIdx: bIdx,
        //  placed and sized against the WING region, not the frame
        cx: WX0 - 0.10 + rng() * (WX1 - WX0 + 0.20),
        cy: WY0 - 0.15 + rng() * (WY1 - WY0 + 0.30),
        r: 0.22 + rng() * 0.28,                                    // big, but not so big one shape is the whole wing
        P: makePattern(rng, jit, clampf, pscale, k.style, 0.28 + rng() * 0.26)
      };
      if (sk === 2) {                                              // band
        var ba = rng() * Math.PI;
        S.ca = Math.cos(ba); S.sa = Math.sin(ba);
        S.half = 0.09 + rng() * 0.24;
        //  offset measured so the band actually crosses the wing region
        S.d = (WCX * S.ca + WCY * S.sa) + (rng() * 2 - 1) * 0.5;
      } else if (sk === 1) {                                       // shard
        var np = 3 + Math.floor(rng() * 3);
        var a0 = rng() * TAU, pts = [];
        for (var pi = 0; pi < np; pi++) {
          var ang = a0 + (pi / np) * TAU + (rng() * 2 - 1) * 0.5;
          var rad = S.r * (0.55 + rng() * 0.75);
          pts.push([S.cx + Math.cos(ang) * rad, S.cy + Math.sin(ang) * rad]);
        }
        S.pts = pts;
      }
      SH.push(S);
    }

    // ===== DRAW 4: optional orbital linework =====
    var lineOn = rng() < 0.25;
    var LINES = [];
    if (lineOn) {
      var nL = 2 + Math.floor(rng() * 3);
      var lIdx = pickWork(groundIdx);
      var lcx = WX0 + rng() * (WX1 - WX0), lcy = WY0 + rng() * (WY1 - WY0);
      for (var li = 0; li < nL; li++) {
        var la = rng() * Math.PI;
        LINES.push({
          cx: lcx + jit(0.10), cy: lcy + jit(0.16),
          a: 0.20 + rng() * 0.30, b: 0.14 + rng() * 0.40,
          ca: Math.cos(la), sa: Math.sin(la),
          w: (1.2 + rng() * 1.4) * PXU
        });
      }
      LINES.idx = lIdx;
    }
    //  -- all PRNG draws done; everything below is pure maths --

    //  ---- LEGIBILITY GUARD ----
    //  A blend mode can land on the ground colour it is blending with, and
    //  then the shape is invisible however big it is. `difference` against
    //  a near-white shifts a mid grey to another mid grey; `multiply` with
    //  a pale colour barely moves anything. The ink guard below cannot see
    //  this -- the shape IS covering the wing, it just cannot be told
    //  apart. So check what each mode actually produces against the ground
    //  and fall back to `normal` when the result does not read. No rng.
    var gTest = PAL[groundIdx].rgb;
    for (var lg = 0; lg < SH.length; lg++) {
      var Sl = SH[lg];
      var reads = false;
      for (var cIdx = 0; cIdx < 2 && !reads; cIdx++) {
        var srcT = PAL[cIdx === 0 ? Sl.aIdx : Sl.bIdx].rgb;
        if (cIdx === 1 && !Sl.pat) { break; }
        var out = [blend(Sl.mode, gTest[0], srcT[0]),
                   blend(Sl.mode, gTest[1], srcT[1]),
                   blend(Sl.mode, gTest[2], srcT[2])];
        var lo = relLum(out), lg2 = PAL[groundIdx].lum;
        var cr2 = (Math.max(lo, lg2) + 0.05) / (Math.min(lo, lg2) + 0.05);
        var dr = out[0] - gTest[0], dg = out[1] - gTest[1], db = out[2] - gTest[2];
        var dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (cr2 > 1.55 || dist > 0.30) { reads = true; }
      }
      if (!reads) { Sl.mode = 0; }                                 // normal always reads
    }

    //  ---- INK GUARD ----
    //  The failure mode is every shape landing off the visible silhouette,
    //  leaving one flat block of ground once the wing crops it. Measured
    //  over the WING REGION, not the frame -- sampling the whole 1x2 slice
    //  scores paint that will never be seen and passes wings that are, in
    //  practice, blank. Grow and re-centre the shapes until the region
    //  carries a real composition. No rng, so determinism is untouched.
    function inkOf() {
      var n = 0, hit = 0;
      for (var yy = 0; yy < 22; yy++) {
        for (var xx = 0; xx < 10; xx++) {
          var px = WX0 + ((xx + 0.5) / 10) * (WX1 - WX0);
          var py = WY0 + ((yy + 0.5) / 22) * (WY1 - WY0);
          var any = 0;
          for (var s = 0; s < SH.length; s++) { if (shapeAt(SH[s], px, py) > 0.5) { any = 1; break; } }
          hit += any; n++;
        }
      }
      return hit / n;
    }
    for (var ig = 0; ig < 7 && inkOf() < 0.40; ig++) {
      for (var gs = 0; gs < SH.length; gs++) {
        var S3 = SH[gs];
        var ncx = WCX + (S3.cx - WCX) * 0.74, ncy = WCY + (S3.cy - WCY) * 0.74;
        if (S3.kind === 1) {
          for (var pj = 0; pj < S3.pts.length; pj++) {
            S3.pts[pj][0] = ncx + (S3.pts[pj][0] - S3.cx) * 1.22;
            S3.pts[pj][1] = ncy + (S3.pts[pj][1] - S3.cy) * 1.22;
          }
        }
        S3.cx = ncx; S3.cy = ncy;
        S3.r *= 1.22;
        if (S3.kind === 2) { S3.half *= 1.22; S3.d = WCX * S3.ca + WCY * S3.sa + (S3.d - (WCX * S3.ca + WCY * S3.sa)) * 0.74; }
      }
    }

    var gRGB = PAL[groundIdx].rgb, bgRGB = PAL[bgMarkIdx].rgb;
    var img = canvas.getContext('2d').createImageData(W, H);
    var data = img.data;

    for (var row = 0; row < H; row++) {
      var v = H === 1 ? 0 : row / (H - 1);
      var y = v * VASP;
      for (var col = 0; col < W; col++) {
        var x = W === 1 ? 0 : col / (W - 1);
        var idx = row * W + col;

        // -- 1. the ground, optionally patterned --
        var r = gRGB[0], g = gRGB[1], b = gRGB[2];
        if (bgPatOn && patternAt(BG, x, y) > 0.5) { r = bgRGB[0]; g = bgRGB[1]; b = bgRGB[2]; }

        // -- 2. the shapes, each through its own blend mode --
        for (var sj = 0; sj < SH.length; sj++) {
          var S2 = SH[sj];
          var cov = shapeAt(S2, x, y);
          if (cov <= 0.002) { continue; }
          var src = PAL[S2.aIdx].rgb;
          if (S2.pat && patternAt(S2.P, x, y) > 0.5) { src = PAL[S2.bIdx].rgb; }
          var nr = blend(S2.mode, r, src[0]);
          var ng = blend(S2.mode, g, src[1]);
          var nb = blend(S2.mode, b, src[2]);
          if (cov >= 0.998) { r = nr; g = ng; b = nb; }
          else { r += (nr - r) * cov; g += (ng - g) * cov; b += (nb - b) * cov; }
        }

        // -- 3. the orbital linework, straight over the top --
        if (lineOn) {
          for (var lj = 0; lj < LINES.length; lj++) {
            if (ringLine(LINES[lj], x, y) > 0.5) {
              var lc = PAL[LINES.idx].rgb;
              r = lc[0]; g = lc[1]; b = lc[2];
              break;
            }
          }
        }

        var o = idx * 4;
        data[o]     = Math.round(clamp01(r) * 255);
        data[o + 1] = Math.round(clamp01(g) * 255);
        data[o + 2] = Math.round(clamp01(b) * 255);
        data[o + 3] = 255;
      }
    }
    canvas.getContext('2d').putImageData(img, 0, 0);

    _info = {
      ground: PAL[groundIdx].hex, body: PAL[bodyIdx].hex,
      shapes: SH.map(function (s) { return ['circle', 'shard', 'band'][s.kind] + '/' + BLENDS[s.mode]; }).join(' '),
      bgPattern: bgPatOn ? STYLES[BG.kind] : 'none',
      lines: lineOn ? LINES.length : 0,
      hues: work.length, ink: +inkOf().toFixed(3),
      minContrast: +(function () {
        var m = 99;
        for (var i = 0; i < SH.length; i++) { var c = contrast(groundIdx, SH[i].aIdx); if (c < m) { m = c; } }
        return SH.length ? m : 0;
      })().toFixed(2)
    };
    _bodyIdx = bodyIdx;
    return canvas;
  }

  //  one pattern record. Scale comes from a REPEAT COUNT, so the geometry
  //  always crosses whatever it fills; the count is bold (2-14) because
  //  hard edges alias.
  function makePattern(rng, jit, clampf, pscale, force, duty) {
    var PBAG = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4];
    var kRoll = PBAG[Math.floor(rng() * PBAG.length) % PBAG.length];
    var kind = STYLES.indexOf(force) >= 0 ? STYLES.indexOf(force) : kRoll;
    var ang = rng() * Math.PI;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    //  2-9, not 2-14. The wing silhouette is SMALL on screen, and a
    //  fourteen-repeat checker on it is mush rather than a pattern.
    var reps = 2 + Math.floor(rng() * 8);
    var sc;
    if (kind === 0)      { sc = (Math.abs(ca) + Math.abs(sa) * VASP) / reps; }
    else if (kind === 1) { sc = (Math.abs(ca) + Math.abs(sa) * VASP) / (reps + 1); }
    else if (kind === 2) { sc = 1.0 / (reps + 1); }
    else if (kind === 3) { sc = 1.1 / (reps + 1); }
    else                 { sc = 1; }
    sc = sc / pscale;
    var minSc = MINS[kind] * PXU;
    if (sc < minSc) { sc = minSc; }
    return {
      kind: kind, sc: sc, ca: ca, sa: sa, duty: duty,
      ox: 0.20 + rng() * 0.60, oy: (0.20 + rng() * 0.60) * VASP,
      rad: 0.24 + rng() * 0.16,
      rays: 5 + Math.floor(rng() * 10)                             // capped: dense rays vanish at wing scale
    };
  }

  // ---------- THREE wrapper + LRU ----------
  var _info = null, _bodyIdx = 0;

  function srgb(tex) { if (THREE.SRGBColorSpace) { tex.colorSpace = THREE.SRGBColorSpace; } return tex; }
  function texFromCanvas(canvas) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return srgb(t);
  }

  var MAX = 0;
  var cache = [];

  function knobs() {
    return {
      ramt: CFG.wingColRandAmt, style: CFG.wingColStyle, hues: CFG.wingColHues,
      shapes: CFG.wingColShapes, blend: BLENDS.indexOf(CFG.wingColBlend),
      pscale: CFG.wingColPatternScale, aa: CFG.wingColAA
    };
  }
  function keyFor(values) {
    var k = knobs();
    return seedFor(values) + '|' + k.ramt + '|' + k.style + '|' + k.hues + '|' +
           k.shapes + '|' + k.blend + '|' + k.pscale + '|' + k.aa;
  }

  function build(values) {
    if (!MAX) { MAX = (CFG.maxCollected || 12) + 4; }
    var key = keyFor(values);
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].key === key) { var hit = cache.splice(i, 1)[0]; cache.push(hit); return hit; }
    }
    var seed = seedFor(values), raw = nameHueFor(values);
    var rec;
    if (cache.length >= MAX) {
      rec = cache.shift();
      rec.key = key;
      render(rec.canvas, seed, raw, knobs());
      rec.tex.needsUpdate = true;
      cache.push(rec);
    } else {
      var canvas = document.createElement('canvas');
      render(canvas, seed, raw, knobs());
      rec = { key: key, canvas: canvas, tex: texFromCanvas(canvas) };
      cache.push(rec);
    }
    //  css is the BODY's exact colour (collection.js reads it verbatim);
    //  hue is the same colour's hue angle, which Reveal.setName and the
    //  name tag still need.
    rec.css = PAL[_bodyIdx].hex;
    rec.hue = PAL[_bodyIdx].hue;
    return rec;
  }

  function stats() {
    return { unique: cache.length, max: MAX, approxMB: +((cache.length * W * H * 4) / 1048576).toFixed(2) };
  }

  return {
    W: W, H: H, STYLES: STYLES, BLENDS: BLENDS, PALETTE: PAL_HEX,
    forEntry: function (entry) { return build(entry.values); },
    forValues: function (values) { return build(values); },
    render: render, seedFor: seedFor, nameHueFor: nameHueFor, stats: stats,
    info: function () { return _info; },
    bodyHex: function () { return PAL[_bodyIdx].hex; }
  };
})();
