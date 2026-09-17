// ============================================================
//  name-dna.js  --  a spelled name -> four generator values
// ============================================================
//  The Outline's one open question: the generator takes a fixed set of
//  four values, names are any length, and the mapping between them has
//  to be
//
//    STABLE      the same name always grows the same butterfly, so a
//                visitor who comes back finds theirs unchanged, and so
//                the piece can be judged before an exhibition rather
//                than re-rolled in front of one;
//    WELL SPREAD  short and long names alike land far apart -- "ANNA",
//                "ANA" and "NANA" must be three visibly different
//                butterflies, not three neighbours.
//
//  A string hash is exactly that mapping. `xmur3` seeds a generator
//  from the whole name; four draws off it give four decorrelated
//  values. The mix is a full avalanche per step and does not care how
//  long the input was, so a two-letter name spreads across the range
//  as well as a twelve-letter one. Changing a single letter -- or
//  swapping two -- changes the seed completely, so anagrams diverge.
//
//  The values come out in -1..1, the capture convention the rest of
//  the system already speaks (DNA.capture / the TouchDesigner data).
//  DNA.toDials maps that onto the roll chains with a WRAP, not a
//  clamp -- the chains are cyclic -- so a uniform hash sits on it
//  cleanly with nothing piling up at the ends.
//
//  This is NOT keyboard.js's `dialsForLetter`. That hashes a letter's
//  INDEX (0..25) so the twenty-six keys look like twenty-six different
//  butterflies; this hashes the whole spelled NAME, for the one
//  butterfly the visitor takes away.
// ============================================================
var NameDNA = (function () {
  'use strict';

  //  The keyboard can only ever produce A-Z (keyboard.js restricts
  //  `typed` to letters and upper-cases them), so this is really just
  //  defensive: upper-case, drop anything else, and an empty result is
  //  handled by the caller (app.js -- today it simply does nothing, the
  //  same as pressing Finish with no name).
  function clean(name) {
    return String(name == null ? '' : name).toUpperCase().replace(/[^A-Z]/g, '');
  }

  //  xmur3 -- a small, well-mixed string-seed hash. Returns a function
  //  that yields a fresh uint32 each call. Standard construction: fold
  //  every char in with a multiply and a rotate, then avalanche hard on
  //  the way out.
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  //  A cleaned name -> four values in -1..1, or null if nothing was
  //  spelled. Pure: same string in, same four numbers out, on any
  //  machine.
  function toValues(name) {
    var s = clean(name);
    if (!s) { return null; }
    var rng = xmur3(s);
    var out = [];
    for (var i = 0; i < 4; i++) {
      out.push((rng() / 4294967296) * 2 - 1);   // uint32 -> 0..1 -> -1..1
    }
    return out;
  }

  return { toValues: toValues, clean: clean };
})();
