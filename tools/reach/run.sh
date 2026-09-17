#!/bin/sh
# ============================================================
#  tools/reach/run.sh  --  v9's harness for the reach interaction
# ============================================================
#  Runs the whole call-a-butterfly-over arc headless, under
#  JavaScriptCore (every Mac has one; there is no node on this
#  machine). Nothing renders -- the scene's own flight code is driven
#  against a maths-only THREE stub -- so this checks BEHAVIOUR, not
#  pixels, which is exactly the half that cannot be eyeballed:
#
#    test-palm.js    hands.js:palmPose against a synthetic hand. The
#                    handedness of the palm normal is the one bug that
#                    would leave one hand permanently unusable and the
#                    other permanently offering, and it is invisible
#                    without a headset.
#    test-flight.js  collection.js's four new states end to end:
#                    summon -> perch, summon -> hover -> leave, a hand
#                    withdrawn mid-perch, summonMax, a 300 ms frame,
#                    and the handoff back onto the orbit.
#    test-guide.js   v10's session: the idle lockout (a full room, one
#                    pickable thing), the quiet clock and the three
#                    things that freeze it, the handover, and the fact
#                    that the whole arc completes with NO audio present.
#    test-pick.js    interact.js's three-layer ladder. The load-bearing
#                    case is a ray aimed through a KEY at a collected
#                    butterfly directly behind it: the key must win, or
#                    spelling a name breaks.
#    test-sfx.js     v10.4's sound: the bed's envelope reaching ZERO at
#                    the loop seam (there is no crossfade -- that is the
#                    whole mechanism), one wingbeat at a time from both
#                    recordings, the duck going down under the narration
#                    AND coming back, and the click pool overlapping
#                    rather than cutting itself off. The only suite here
#                    that stands an audio element up; every other one
#                    checks the opposite, that the piece runs with none.
#

#  Run it after touching hands.js, interact.js, guide.js, sfx.js or
#  collection.js's states. It is fast (a second or so) and needs nothing installed.
#
#      sh tools/reach/run.sh
# ============================================================
cd "$(dirname "$0")" || exit 1

JSC=$(command -v jsc)
[ -x "$JSC" ] || JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
if [ ! -x "$JSC" ]; then
  echo "no JavaScriptCore found -- expected jsc on PATH or at"
  echo "  /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
  exit 1
fi

fail=0
for t in test-palm test-flight test-pick test-guide test-sfx; do
  echo "======== $t ========"
  #  run ONCE and inspect that run -- each suite drives thousands of
  #  simulated frames, and running them twice to check the exit and then
  #  the text would double the wait for no information
  out=$("$JSC" "$t.js" 2>&1) || fail=1
  echo "$out"
  case $out in *FAILED*) fail=1 ;; esac
done
echo
[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "*** SOMETHING FAILED ***"
exit $fail
