// ============================================================
//  config.js  --  the numbers the piece is built from
// ============================================================
//  v3 has no dev panel on purpose. Everything that would have been a
//  slider in v2 is a constant here instead, so there is one place to
//  change the piece and nothing to open in a headset.
//
//  The twenty-six keys ARE v2's swarm: the same circling flight, the
//  same flap-glide, the same scatter. They are not parked on a panel.
//  A letter rides under each one and faces the camera, so the keyboard
//  is something you read off a room full of moving butterflies rather
//  than off a grid.
//
//  Only the name field and the two buttons are fixed in place, in
//  front of the visitor where they can always be found.
// ============================================================
var CFG = {
  eyeY: 1.60,               // the scene's camera height

  // ---- the swarm ----
  //  Same shape of distribution as v2, pulled in: these have to be
  //  catchable, so the far end of the radius band is closer and the
  //  small end of the size band is bigger than the ambient swarm's.
  //  Close. The visitor should be able to reach a butterfly by leaning,
  //  not by walking -- an exhibition floor is not big and a headset
  //  guardian is smaller still. radMin is the near edge of the orbit and
  //  sits just outside the floating UI, so nothing flies through it.
  //  Sizes come down with the radius: a butterfly at 1 m at v2's size
  //  band fills the view.
  //  v9 LOWERED hgtMax, 2.30 -> 1.95. The keyboard is now a LOW dome and
  //  the collection is a high one above it (colHgt* below), so a visitor
  //  looking up past the letters is looking at nothing but their own
  //  butterflies. At 2.30 the top of the letter band reached 19.3 deg of
  //  elevation at its nearest -- deep inside the collection's old span --
  //  and every collected butterfly had letters in front of it from
  //  somewhere. This is the only number in the keyboard's own flight that
  //  v9 moves.
  sizeMin:   0.45, sizeRange: 0.60, sizeExp: 1.4,
  radMin:    1.00, radMax:    2.40,
  hgtMin:    1.00, hgtMax:    1.95,

  //  How far the noise pushes a butterfly off its nominal orbit. v2 cut
  //  these hard after "they wobble too much"; 1.0 is that calm baseline
  //  and it scales all three noise amplitudes at once.
  wander:    1.0,

  //  THE PITCH LAG, in milliseconds. v10.3.
  //
  //  The flight's nose-up/nose-down pitch is derived from how fast the
  //  butterfly is climbing: `-atan2(dy, hSpeed) * 0.25`, straight off the
  //  frame's own travel. But `dy` also carries the PER-WINGBEAT BODY BOB,
  //  which is added to pos.y a few lines earlier and runs at the wingbeat's
  //  own 3-4 Hz. So the butterfly was pitching nose-up and nose-down once
  //  per flap -- a fore-and-aft shake, at the fastest rate anything on the
  //  butterfly moves, and unsmoothed where the yaw and the bank both have a
  //  lag on them.
  //
  //  MEASURED in the running scene, over six seconds of flight, sampling
  //  model.rotation.z every frame on five keys:
  //
  //    oscillation rate     3.1-3.8 turns/s -- each key's own flapSpeed
  //                         (2.97-3.76 Hz) to two decimal places
  //    pitch travel         18-53 deg/s
  //
  //  For scale, the flight's own tuned wobble rate is 0.35 deg/s. This term
  //  was never in that measurement because it arrives through a derivative.
  //
  //  The BOB IS NOT THE THING TO CUT -- it is already down from 0.030 to
  //  0.010 * size, and the shake is not the bob, it is the bob differ-
  //  entiated. A first-order lag on the pitch, the same shape the bank
  //  already uses, takes the 3-4 Hz out and leaves the climb-and-dive
  //  pitch untouched: the path noise runs at 0.010-0.045 Hz, so a lag of a
  //  seventh of a second is nothing to it. Measured across the same five
  //  keys:
  //
  //    | lag | pitch travel | vs raw |
  //    | raw | 18-53 deg/s  |        |
  //    | 60  | 12-34        | -35%   |
  //    | 150 | 6-16         | -70%   |
  //    | 420 | 2-6          | -89%   |
  //
  //  150 is the value taken: the shake calms right down while the pitch is
  //  still visibly working with the flight. Raise it toward 420 to take out
  //  what is left; drop it to 0 for v10.2's flight exactly.
  //
  //  Why the shake was worse on some butterflies than others: hSpeed is the
  //  denominator, so the SLOWER a butterfly flies, the bigger the pitch
  //  swing the same bob produces. Raw peak-to-peak ran 4.4 deg on one key
  //  and 14.3 on another.
  pitchEase: 150,

  //  HOW FAR AROUND THE VISITOR THE KEYBOARD GOES, in radians.
  //
  //  2*PI is v2's swarm: every butterfly orbits the full circle, which is
  //  what this is asked to look like. Worth knowing before an exhibition:
  //  a full circle means only about a quarter of the alphabet is in front
  //  of you at any moment, so spelling a name involves turning around to
  //  hunt for a letter.
  //
  //  Set this to something under 2*PI -- 3.4 (about 195 degrees) is a good
  //  first try -- and the butterflies sweep back and forth across an arc
  //  in front of the visitor instead of circling. Same flight, same noise,
  //  same everything else; all 26 letters stay findable without turning.
  arcSpan:   Math.PI * 2,
  arcRate:   0.11,          // sweeps per second, when the arc is not full

  //  How much of the wing to present, in radians: 0 = body face-on and
  //  wings edge-on, PI/2 = the reverse. See presentRoll() in keyboard.js
  //  -- this is the only departure from v2's flight, and 0 restores it.
  readRoll:  0.84,

  // ---- the letter under each butterfly ----
  //  Angular, like v2's id labels: scaled by distance from the camera
  //  so a letter across the room stays as readable as one in your face,
  //  clamped at both ends so a near one is not enormous.
  letterAngular: 0.075,     // world height per metre of distance
  letterMin:     0.075,
  letterMax:     0.42,

  // ---- selection ----
  //  A pointing ray is the main way in -- most of the swarm is further
  //  than an arm. The tolerance is a CONE, not a fixed radius: a fixed
  //  radius makes a butterfly four metres away almost unhittable, and a
  //  wide fixed radius makes a near one grab everything around it.
  //  Tightened when the swarm came closer: separation holds neighbours
  //  about 0.6 m apart, so slack much past a quarter of that stops
  //  feeling like aiming.
  pickBase:    0.16,        // metres of slack, close in
  pickAngle:   0.055,       // radians the cone opens by, further out
  touchRadius: 0.16,        // fingertip this close beats any ray pick
  rayMax:      8.0,
  pinchOn:     0.033,       // metres, thumb tip to index tip: pinch closes
  pinchOff:    0.050,       // and opens again (hysteresis, not one value)

  //  v6.1: the cone above is already tuned right up against a hard ceiling
  //  (neighbours sit ~0.6 m apart; slack past a quarter of that turns them
  //  into one blob -- see the note further down). So easier selection comes
  //  from calming the SIGNAL feeding the cone, not widening the cone:
  //
  //  shoulderDown/shoulderOut place the ray's ORIGIN, not its aim. v6 cast
  //  from the index knuckle through the fingertip -- a ~3cm baseline, so a
  //  few millimetres of finger curl during a pinch swung the aim by tens
  //  of degrees. This mirrors Meta's own hand-pointing model (the ray
  //  Quest's system UI casts): anchor the ray near the SHOULDER instead,
  //  aimed through the hand. There is no tracked shoulder joint, so
  //  interact.js:shoulderOf() estimates one each tick from the camera
  //  pose -- down by shoulderDown, out by shoulderOut along the camera's
  //  flattened (yaw-only) right axis, mirrored per hand. A ~60-80cm
  //  baseline means the same finger curl swings the aim by a couple of
  //  degrees, often less than the cone's own slack.
  //
  //  aimSmoothTau damps residual raw joint jitter out of the fingertip the
  //  ray is aimed through, so a hover does not flicker on and off a target
  //  it is plainly sitting on.
  //
  //  pickGraceMs covers what the shoulder anchor does not fully remove:
  //  a pinch's rising edge with nothing picked that exact frame still
  //  activates whatever this hand had hot within this many milliseconds --
  //  butterflies only, never the two controls, which are fixed in place,
  //  easier to hit anyway, and where a wrong guess (an accidental
  //  accept/delete) costs more than a missed letter.
  shoulderDown: 0.20,       // metres, estimated shoulder below the headset
  shoulderOut:  0.18,       // metres, estimated shoulder out from centre
  aimSmoothTau: 0.07,       // seconds, EMA time constant on the hand ray
  pickGraceMs:  180,        // ms, how long a hover is "rescued" after loss

  //  v6.1 round 2 -- the shoulder ray above cut most of the pinch-commit
  //  perturbation, but three things remained on-headset: neighbouring
  //  butterflies (~0.6 m apart, so their cones genuinely overlap) still
  //  got confused for each other, the two controls still got triggered by
  //  a reach that only grazed them, and the pinch itself sometimes never
  //  registered at all. None of this is fixed by shrinking the shared
  //  cone further -- that ceiling is exactly the one described above --
  //  so this round adds MEMORY (hover doesn't flicker between two
  //  candidates that are both technically in range) and shrinks two
  //  SPECIFIC targets (the controls) rather than the shared budget.
  //
  //  hoverLockMargin/hoverLockMs: once a hand's pointer has a hovered
  //  butterfly, a challenger only steals it by clearly beating its score
  //  (hoverLockMargin, a fraction of the tolerance width) or by being the
  //  SAME better challenger for hoverLockMs running. A target the ray has
  //  plainly left (score >= 1) releases with no delay either way -- the
  //  lock only ever resists switching inside a genuine overlap band.
  //  interact.js:pickFlySticky().
  hoverLockMargin: 0.22,    // score units (0..1), see pickFlySticky()
  hoverLockMs:      250,    // ms a sustained challenger takes to win anyway

  //  panelPickShrink/panelPickBase/panelTouchRadius: the controls' own
  //  RADIUS (their visual size), not just the cone's slack, turned out to
  //  be the dominant term in their tolerance -- both blobs are already
  //  bigger than a typical butterfly's own pick radius. panelPickShrink
  //  scales the accept/delete PICK radius down (keyboard.js:targets(),
  //  visual size untouched); panelPickBase/panelTouchRadius are the
  //  controls-only versions of pickBase/touchRadius above. Together a
  //  control's total tolerance drops below a typical butterfly's, so "the
  //  controls win" only fires when one is genuinely, deliberately aimed
  //  at -- not softened, just evaluated against a smaller target.
  panelPickShrink:  0.55,   // multiplies a control's own pick radius
  panelPickBase:    0.06,   // metres, controls-only version of pickBase
  panelTouchRadius: 0.08,   // metres, controls-only version of touchRadius

  //  pinchSmoothTau, and pinchOn/pinchOff above widened by 5mm each (was
  //  0.028/0.045): rig.pinch (hands.js) is raw and unsmoothed, and Quest
  //  hand tracking is noisiest right as fingers occlude each other --
  //  exactly at a real pinch. Smoothing alone can't fix a signal that's
  //  systematically a little wide right at occlusion, so it's paired with
  //  widening pinchOn; the gap between the two thresholds (their
  //  hysteresis) is kept the same width as before, only shifted.
  //  pinchSmoothTau is about half aimSmoothTau -- long enough to bridge
  //  one bad sample, short enough that activation still feels immediate.
  //  v11 -- HOW LONG A STATIONARY MOUSE CURSOR STAYS A POINTER.
  //
  //  On a desktop the cursor does not go away when you stop using it. It
  //  sits wherever it was left, and the swarm keeps flying under it -- so
  //  a cursor parked anywhere over the room hovered a fresh butterfly
  //  every couple of seconds, and every one of those hovers was read as
  //  the visitor being present. The quiet clock was knocked back to zero
  //  forever and a desktop session could never time out. Measured before
  //  this: 34 s of a parked cursor, quietT never once reached 2 s.
  //
  //  A hand does not have this problem, which is why it went unnoticed --
  //  lower your hands and hand-tracking simply stops reporting a pointer.
  //  This is the desktop's equivalent: a cursor that has not moved for
  //  this long is not pointing at anything, so it picks nothing, hovers
  //  nothing and counts as nobody. Any movement, or a click, brings it
  //  back on the very next frame.
  //
  //  It also fixes something that was always wrong to look at: a
  //  highlight sitting under an abandoned cursor, following whichever
  //  butterfly happened to drift through it.
  //
  //  Must stay well under guideQuietMs or the clock still cannot run.
  mouseIdleMs: 2000,        // ms of a motionless cursor before it stops pointing

  pinchSmoothTau: 0.035,    // seconds, EMA time constant on rig.pinch

  //  v6.1 round 3 -- two things remained after round 2: the pinch still
  //  sometimes didn't register at all, and it was still too easy to
  //  accidentally select a neighbour.
  //
  //  trackLossGraceMs found the real cause of the first: on a SINGLE
  //  untracked frame, tick() used to fully reset closed/smPinch/pinchInit/
  //  lockId/etc -- and Quest hand tracking commonly loses confidence for a
  //  frame or two exactly as fingers occlude each other, i.e. exactly at a
  //  real pinch. A dropout this short now just hides the line and holds
  //  every pinch/lock/aim value exactly where it was, so a pinch already
  //  in progress survives the blip instead of being discarded by it. Only
  //  a dropout that outlasts this window does the original full reset.
  //
  //  touchDwellMs closes the other gap round 2 didn't touch: pickTouch()
  //  still won outright over the now-stabilised ray/hover-lock on a
  //  SINGLE frame of proximity, with no memory at all -- so a hand simply
  //  passing near a neighbour on the way to the real target could steal
  //  the pick instantly. A touch now has to be the same nearest target
  //  continuously for this long before it's allowed to override the ray.
  //  Shorter than hoverLockMs since physical proximity is already a
  //  stronger intent signal -- this only needs to filter a pass-through,
  //  not damp genuine ambiguity.
  //
  //  pinchOn/pinchOff are deliberately NOT widened again this round:
  //  that would make an accidental touch more likely to read as a
  //  deliberate pinch, working directly against the second complaint.
  trackLossGraceMs: 200,    // ms, a dropout this short holds state, not resets it
  touchDwellMs:      120,   // ms a touch must stay on one target before it can win

  // ---- feedback ----
  hiScale:     1.45,        // a highlighted butterfly grows to this
  captureTime: 0.55,        // seconds to fly into the hand
  goneTime:    0.40,        // seconds off, before it rejoins the swarm
  returnTime:  0.60,        // seconds to fade back in, flying in from outside
  flashTime:   0.15,        // v6.1: seconds, the ray line's catch-flash decay

  //  v6.1: exhibition feedback flagged the swarm's motion as a motion-
  //  sickness risk. Rather than slow everyone all the time -- v6's cruising
  //  flight is already tuned and tested on-headset -- only a butterfly
  //  being reached for (and its near neighbours, tapering with distance)
  //  eases into a calmer flight, and back out once nothing is pointed
  //  there. This also makes 1-2 above work better: a target that is barely
  //  moving while hot is far easier for a damped ray to stay locked onto,
  //  and far more forgiving of the pinch-commit perturbation.
  slowHot:     0.25,        // time-scale for the butterfly directly hot
  slowRadius:  1.10,        // metres, falloff for neighbours of a hot one
  slowEase:    0.35,        // seconds, how gradually speed eases in/out

  //  v6.1 round 2 -- slowHot/slowRadius retuned calmer and wider, plus
  //  this new curve exponent, so the immediate neighbourhood's own flight
  //  noise (a contributor to accidental hover-lock challenges) settles
  //  down without flattening every nearby butterfly toward the hot one's
  //  own speed. That would backfire: a near-stationary neighbour is an
  //  EASIER accidental ray target than one still visibly drifting, so the
  //  contrast between "the hot one" and "everything else nearby" has to
  //  stay clear. Biases the falloff to stay close to slowHot near the
  //  target and drop off more steeply near slowRadius's edge, instead of
  //  smoothstep's roughly-linear middle -- see updateSlowField().
  slowFalloffPow: 1.6,

  // ---- the UI, fixed in front of the visitor ----
  //  No panel, no box. The name is loose letters hanging in the air and
  //  the two controls are shapes, not labelled rectangles -- the piece is
  //  a room full of butterflies and a chrome dialog in the middle of it
  //  reads as a different application. Nothing here is centred on anything
  //  else, and there is no frame to centre it in: the name and the two
  //  shapes are all that is fixed in the room.
  panelR:      0.80,        // metres in front

  nameX:       0.045,       // off-centre, on purpose
  nameY:       -0.235,
  nameTilt:    -0.055,      // the whole line hung on a slope
  nameSize:    0.105,
  nameSpacing: 0.072,
  nameTrack:   0.80,        // under 1 = the letters nearly touch
  nameMaxW:    1.02,
  nameBob:     0.006,
  nameBobRate: 0.28,
  nameFlyTime: 0.65,        // seconds for a caught letter to reach the name

  //  THE TWO SHAPES. Was "much bigger than v4's" here on purpose; v6.1
  //  round 3 walks that back -- "it takes up a lot of the space" -- to
  //  essentially v4's own shipped size (blobW 0.155/blobH 0.140), rather
  //  than an arbitrary guess. Each still hung at its own tilt and cant so
  //  neither sits square to the visitor. This also tightens the pick
  //  radius further on top of round 2's panelPickShrink (radius is
  //  derived from these), which only helps the accidental-selection fix.
  //  Pulled in much past this the six lobes merge back into one blob-lump
  //  -- an on-headset judgement call, not something arithmetic settles.
  blobY:       -0.435,
  blobW:       0.160,       // was 0.200; one lobe's radius, cluster ~2.9x this across
  blobH:       0.140,       // was 0.176
  ctlGap:      0.82,        // between the two, centre to centre
  blobPulse:   0.045,       // depth of the breathing
  blobDrift:   0.022,       // how far a shape floats from where it hangs

  //  The press bounce. Under-damped on purpose: the kick is a velocity,
  //  so the shape shoots past its resting size, comes back past it, and
  //  rings down over about a second.
  ctlSpring:   150,         // stiffness
  ctlDamp:     0.86,        // per frame at 60fps; under 1 = it rings
  ctlKick:     7.5,         // the impulse a press adds to the velocity

  //  v6.1 round 3 -- "there needs to be confirmation the green button was
  //  pressed." Both buttons already get ctlKick's bounce; accept gets a
  //  bigger one on top (~1.77x peak vs an ordinary press's ~1.36x, same
  //  ~80ms tempo -- bigger in amplitude, not a different animation
  //  language), and the same kick also pulses the caught name itself
  //  (keyboard.js:accept()/tickUI()) -- the thing actually being
  //  confirmed, not just the button. Delete's press is unchanged.
  acceptConfirmKick: 16,    // roughly 2x ctlKick, accept only

  maxName:     16,          // longest name the field will take

  //  v8.1 -- A SAFETY NET, no longer the timing. The keyboard now resets
  //  off 'reveal:launch' (collection.js fires it the frame the butterfly
  //  takes off; keyboard.js flies the caught name apart, then resets), so
  //  this no longer has to be hand-kept equal to a sum of the beat
  //  durations -- a number that went stale every time the reveal was
  //  retuned. It only fires if no butterfly ever arrives at all: an empty
  //  name the seam refuses, or a backgrounded tab whose render loop is
  //  throttled so collection.js's queue never drains. Generous on purpose.
  acceptResetDelay: 20000,  // ms (v8.1: was 5600 -- see above; reset() is idempotent, so whichever path fires first wins)

  //  v8.1 -- the caught name's exit. At the launch instant the visitor's
  //  name is in two places at once: hanging in front of them where they
  //  spelled it, and lit under the butterfly. The front one bursts apart;
  //  the butterfly's stays. v8.2: it bursts DOWNWARD, blasted away by the
  //  butterfly shooting up, on an accelerating fall -- and it lingers long
  //  enough to still be falling as the butterfly soars, so there is no
  //  dead gap before it joins the kaleidoscope.
  //
  //  v8.2 also fixes the intermittent "name vanishes early" bug: the reset
  //  that disposed these sprites used to be a wall-clock setTimeout that
  //  raced the sim-clock fly-out, and lost on any frame drop. The exit now
  //  completes itself (keyboard.js: _nameExiting), and reset() follows it.
  nameExitTime: 2.0,        // seconds for a name letter to burst away and fade (sim time, not wall clock)
  nameExitDrop: 1.30,       // metres it falls over that -- accelerating, like blast wash (name group's own space; the tilt is slight)
  nameExitSpread: 0.55,     // metres it also fans horizontally as it goes

  // ---- the collection (v7) ----
  //  The butterflies grown from visitors' names. NOT the keyboard: they
  //  cannot be caught, they carry a name rather than a letter, and they
  //  accumulate for the whole run of the exhibition. They fly the same
  //  flight as the keys but in their OWN, wider shell -- further out and
  //  taller -- so the kaleidoscope reads as the room around you and the
  //  keyboard stays the near, actionable layer in front.
  maxCollected: 12,         // most shown at once; the rest stay in storage.
                            //  Ceiling ~36: Wings.MAX_UNIQUE is 64 and the 26
                            //  keys hold 26 of those texture slots for good, so
                            //  past ~36 a live wing could be redrawn under it.
  //  v9 MOVED THE WHOLE BAND: closer and much higher. It used to sit
  //  entirely INSIDE the letters' angular span -- letters ran -31 to +35
  //  degrees of elevation from the eye and the collection -17 to +28 -- so
  //  from where the visitor stands every collected butterfly had letters in
  //  front of it, and the pick could not get past them. Now the letters are
  //  a low dome (hgtMax 1.95, ceiling 19.3 deg) and the collection a high
  //  one at 19-42 deg. Closer and higher work TOGETHER: at 1.7 m out it
  //  takes only 2.2 m of height to clear the letters, where at the old
  //  2.6 m it would have taken 2.9.
  //
  //  The radius overlaps the keyboard's 1.0-2.4 on purpose -- the two are
  //  separated in HEIGHT, not in plan, which is what puts them at different
  //  ELEVATIONS rather than merely at different depths along the same ray.
  //
  //  Apparent size is checked, not assumed: at these distances a collected
  //  butterfly spans 4-18 degrees of view against the keys' own 4-21, so
  //  bringing them in does not make them the biggest thing in the room and
  //  colSize* does not need to move.
  colRadMin:   1.7, colRadMax: 3.0,    // horizontal orbit -- overlaps the keyboard's in plan, sits above it
  colHgtMin:   2.2, colHgtMax: 3.1,    // a high dome, entirely above the letters. Top stays under a real 3 m ceiling, for passthrough
  colSizeMin:  0.6, colSizeRange: 0.9, // a touch bigger than the keys, to carry the distance

  //  "Here's your butterfly" -- the beat a just-grown butterfly runs
  //  before it joins the kaleidoscope. Only the butterfly just committed
  //  does this; replayed ones spawn straight into their orbit.
  presentDist:   0.80,      // metres in front of the visitor -- inside the keyboard's 1.0 orbit, clearly the foreground
  presentRise:   0.06,      // metres above the eye line
  presentSize:   0.78,      // held at a comfortable size here, whatever its orbit size will be

  // ---- THE REVEAL (v7.2 shape, v8.1 art direction) ----
  //  v7.2 established the two things that still hold: the butterfly hovers
  //  FLAT -- wings square to the visitor like a pinned specimen -- and then
  //  leaves into the part of the kaleidoscope the visitor is looking at.
  //  The flight's presentRoll geometrically CANNOT reach that flat aspect
  //  (there the body axis points at the visitor, so the wing plane never
  //  faces them -- measured, it never tops ~0.18), so the held beats orient
  //  the model with a direct look-at instead (collection.js:_flatQuat --
  //  wing normal -> camera, head -> DOWN). Held aspect ~= 0.99.
  //
  //  v8.1 gives that arc a SHAPE. One movement became eight beats:
  //
  //    arrive  rises into the spot in front of the visitor
  //    settle  held flat, breathing; the name tag writes on underneath
  //    greet   three deliberate deep flutters -- gestures, not a wingbeat
  //    still   EVERYTHING STOPS. The centre of the whole moment.
  //    coil    anticipation: dips, wings drawn up, scale contracts
  //    launch  a hard downstroke and it shoots up, barrel-rolling,
  //            shedding letters; the room is shoved outward
  //    soar    decelerates and curves out to its orbit, roll unwinding
  //    orbit   the ambient flight, handed off exactly (unchanged)
  //
  //  ~12.5 s all told, against v7.2's 8.4. The still beat is load-bearing:
  //  in a scene where every object is always moving, stopping is the
  //  strongest device available, and it is what stops the launch reading
  //  as a lerp. All of these are on-headset judgement calls.
  //  Naming: present* is WHERE it presents (a place, unchanged since v7),
  //  reveal* is WHEN -- the eight beat durations and everything that
  //  shapes them. v7.2's presentArrive/presentHold/presentJoin are gone;
  //  revealArrive/revealSettle and revealLaunch+revealSoar replace them.
  //  See collection.js:tickArrive .. tickSoar, and reveal.js.
  //  v8.2: after ACCEPT there is a held breath -- `charge` -- before
  //  anything at all appears. The butterfly is invisible (scale 0, alpha 0)
  //  for the whole of it; the only thing carrying the beat is the room
  //  going quiet and the name still hanging in front of the visitor. Then
  //  the bloom brings the butterfly in, scaling up FROM NOTHING with the
  //  letter burst. Lengthen revealCharge for a longer wait.
  revealCharge:  1.8,       // seconds of anticipation between ACCEPT and the bloom -- nothing visible happens

  revealArrive:  0.9,       // seconds of the bloom -- the overshoot scale-up from 0 (v8.2)
  //  v8.2: the arrival is a bloom, not a rise and not a fade. The butterfly
  //  scales up from 0, past full size on a half-sine overshoot hump, and
  //  settles exactly onto full, wings flinging open out of the loaded pose,
  //  while a ring of the visitor's own letters bursts outward.
  revealPopOver:      0.42,  // overshoot hump past full size mid-bloom, as a fraction (lands back exactly on full at the end)
  revealArriveBurst:  15,    // letters flung outward as it blooms
  revealArriveBurstSpd: 1.05,// metres/sec they are thrown
  revealSettle:  1.8,       // seconds held flat and breathing after it arrives
  revealGreet:   1.8,       // seconds of the greeting flutters
  revealStill:   0.8,       // seconds of complete stillness before the coil
  revealCoil:    0.4,       // seconds of anticipation -- the dip before the launch
  revealLaunch:  1.1,       // seconds of the upward shot
  revealSoar:    2.7,       // seconds from the top of the shot out to its orbit

  //  The breath, during arrive/settle. bm.flap's two pivots mirror, so the
  //  wing tips rise and fall TOGETHER -- it reads as the wings easing open
  //  and shut a little, not as a wingbeat. (The flight beats at ~1.0 rad,
  //  18-27 rad/s.)
  revealFlapAmp:  0.11,     // dihedral of the breath, radians
  revealFlapRate: 1.9,      // radians/sec of that breath -- about 0.3 Hz

  //  THE GREETING. Three deep flutters with a flat pause between each --
  //  the pause is what makes them read as deliberate gestures aimed at the
  //  visitor rather than as a faster breath. Each beat occupies
  //  revealGreetBeat of a (revealGreet / revealGreetBeats) slot; the
  //  remainder holds still. The amplitude sits between the breath (0.11)
  //  and the flight beat (0.9-1.3): unmistakably bigger than breathing,
  //  and slow enough to be read as one movement rather than a blur.
  revealGreetBeats: 3,      // how many
  revealGreetBeat:  0.38,   // seconds of movement in each 0.60 s slot -- the rest is the pause
  revealGreetAmp:   0.85,   // radians of dihedral at the top of a flutter
  revealGreetLift:  0.02,   // metres the body rises on the stroke -- a wingbeat lifts it

  //  THE COIL. Classic anticipation: it goes down before it goes up. All
  //  three are small; overdone this reads as a flinch rather than a
  //  gathering. revealCoilFlap is NEGATIVE because negative is wings-up in
  //  bm.flap's convention (the glide pose is -1.0), so the coil draws them
  //  up and the launch opens with a hard downstroke.
  revealCoilDip:    0.08,   // metres it sinks
  revealCoilFlap:  -1.05,   // radians -- wings drawn up together, ready
  revealCoilSquash: 0.93,   // scale multiplier at the bottom of the dip

  //  THE LAUNCH. Vertical dominates: the rise is front-loaded (ease-out
  //  quint) so it reads as a shot rather than a ride, and the horizontal
  //  barely moves -- soar does that. The barrel roll is about the BODY
  //  axis, which flashes the wings edge-on twice a turn; at this speed
  //  that reads as a tumble, and it decays to EXACTLY zero by the end of
  //  soar so the handoff into the flight stays continuous.
  revealLaunchRise: 1.60,   // metres it gains, most of it in the first third
  revealLaunchLean: 0.25,   // metres it drifts toward its orbit slot, so soar does not start from a standstill
  revealSpinTurns:  2,      // full rolls about the body axis across launch + soar. MUST BE A WHOLE NUMBER -- the total lands on the model as turns x 2PI, which is the identity rotation only if it is an integer, and tickSoar's handoff depends on that. See collection.js:spinAt
  revealShock:      4.0,    // the takeoff shoves every other butterfly outward. Same impulse shape as a fast hand (keyboard.js's repulsors). 0 disables

  //  Leaving. aimJoin biases the orbit slot it flies to into the visitor's
  //  gaze, so they watch it JOIN the others rather than peel away behind
  //  them; from there it drifts freely, which is the kaleidoscope.
  revealJoinLift: 0.18,     // metres the soar arcs upward at its midpoint (v8.1: was 0.35 -- the launch does that job now)
  revealJoinBank: 0.22,     // radians of bank rolled in through the turn away and back out, peaks mid-departure
  revealJoinArc:  1.05,     // radians forward of the visitor's gaze to bias the orbit entry point (which side follows c.speed)

  //  THE NAME TAG, arriving. v7.2 had it up from the first frame; v8.1 had
  //  it write on during `settle`. v8.2: it stays hidden through the ENTIRE
  //  reveal and only fades in once the butterfly has joined the
  //  kaleidoscope (tickOrbit) -- the reveal is about the butterfly, and
  //  the label is what it becomes once it is one of the many. Replayed
  //  butterflies are labelled from the first frame, as before.
  revealTagFade: 0.8,       // seconds it takes to fade in, once orbiting

  //  ISOLATION -- the room recedes around the hero. v8's VERSION.md posed
  //  this as an open on-headset question ("does the keyboard need to dim
  //  during it?"); this is the answer. Two channels, because dimming alone
  //  leaves 26 butterflies still darting about behind the one thing the
  //  visitor is meant to be looking at:
  //
  //    revealDim   opacity multiplier on everything that is NOT the hero
  //    revealSlow  a ceiling on the keys' timeScale -- it rides the slow
  //                field keyboard.js already runs for a reached-for
  //                butterfly, so it is eased, tested on-headset, and free
  //
  //  Down gently and back up SLOWER: the room recedes without vanishing and
  //  returns without a second event.
  //
  //  v8.2: the floor was 0.28, then 0.42, on the belief that a lower value
  //  "jumped" back rather than fading. That jump was really the alphaTest
  //  cull in bfly-model.js:setOpacity -- opacity under 0.5 discarded the
  //  whole silhouette, so the room vanished and snapped back regardless of
  //  this number. With that fixed the fade is smooth all the way down, so
  //  the floor is now a deliberate deep recede to 0.10: the room drops
  //  right back and the hero owns the space, still eased over
  //  revealDimIn / revealDimOut so the eye reads it as one move. The hero
  //  is also isolated by MOTION (it moves deliberately while the keys crawl
  //  at revealSlow and the rest drifts). 0 would be a scene change; 0.10
  //  keeps the room faintly there.
  revealDim:     0.10,      // opacity the rest of the room falls to during a reveal
  revealSlow:    0.35,      // time-scale ceiling on the 26 keys while the hero is up
  revealDimIn:   1.5,       // seconds to recede, from 'keyboard:accepted'
  revealDimOut:  3.5,       // seconds to come back, once the hero reaches its orbit (v8.2: was 2.5 -- slower reads as a deliberate fade, not a jump)

  //  THE WAKE. The launch sheds the visitor's own letters, which fall and
  //  fade behind it. Letters and not sparks because everything in this
  //  piece is a letter (the numerals went in v6, the satellites in v6.2)
  //  and because there is no post-processing here to make a spark out of
  //  -- see "Flat" in CLAUDE.md. They FALL rather than rise: they are ink.
  //  They are shed in world space and do not follow the butterfly, which
  //  is what makes it a wake rather than a tail.
  revealBurst:     8,       // letters thrown outward at the launch instant
  revealTrailGap:  0.055,   // seconds between shed letters after that
  revealTrailTail: 0.9,     // seconds into the soar that shedding stops
  revealTrailLife: 1.9,     // seconds a shed letter lives
  revealTrailFall: 0.55,    // metres/sec^2 it sinks -- gentle; this is ink, not gravity
  revealTrailDrag: 1.4,     // per second the throw bleeds off
  revealTrailSpin: 3.4,     // v8.2: max radians/sec a shed letter tumbles -- it rotates as well as translates, and the spin bleeds off on the same drag

  //  v8 -- the per-name procedural base-colour texture on the grown
  //  butterfly's wings (js/wing-colour.js, a faithful-LOOK port of
  //  existing_work/td_py/wingbasecolour_script.py). COLLECTION ONLY -- the
  //  26 keys stay flat. This is the one deliberate exception to "Flat"
  //  (see CLAUDE.md), for the hero butterfly.
  //
  //  v8.5 REBUILT it. v8 -> v8.4 painted a gradient membrane with markings
  //  on top and always read as a wash; v8.5 paints FLAT GRAPHIC DESIGN --
  //  an organic field partitions the wing into 3-6 regions, each takes one
  //  flat colour and one hard-edged pattern (stripes / checker / grid /
  //  dots / rings / clover / confetti), all bent by one shared warp, with
  //  translucent overprint shapes laid across the lot.
  //
  //  THE PALETTE IS THE KEYBOARD'S. Every colour on the wing is one of the
  //  twenty-six the letter butterflies wear -- keyboard.js:buildKeys's own
  //  wheel, at bflySat, with tonal structure from the letterLit/bflyLit/
  //  ghostLit lightness band alone. No harmony rule, no neutrals, no black:
  //  numerous bright colours at once. Same name -> same texture, any
  //  machine. See "The base-colour generator".
  // ---- v8.7: how big a wing is on the butterfly ------------------
  //  The wing plane's chord, relative to the body plane. Cut from v8.6's
  //  0.85 because the fit stage below draws the wing 1.77x bigger in AREA
  //  inside the same slice -- measured across every wing live in the scene,
  //  not off the generator. 0.64 puts the painted wing back at its v8.6
  //  area in metres, so the room is no busier than it was. Raise it to make
  //  every butterfly bigger without touching the shapes.
  //
  //  This, NOT sizeMin / colSizeMin, is the knob for overall butterfly
  //  scale after v8.7 -- see the long note in js/bfly-model.js. Those set
  //  `size`, which is the unit the pick radius, the wingbeat bob and
  //  tagBodyDrop are all quoted in; this one is pure geometry.
  wingPlane:     0.64,

  // ---- v10.3: where along the body the wings hinge ---------------
  //  Through v10.2 the wing pivots sat at the model's y = 0, and the body
  //  plane's -s*0.63 shift lands y = 0 on texture row 41 of BODY_ALPHA --
  //  the body's BELLY, the line the legs hang off. So every butterfly,
  //  the twenty-six keys included, hinged its wings under the abdomen and
  //  the near wing lay across the body instead of on it, which in profile
  //  read as the wings having slipped down.
  //
  //  THE HINGE GOES ON THE BODY, NOT ON TOP OF IT. The first pass put it
  //  on the body's top CONTOUR (row 11, 0.088) and that is too high, for a
  //  reason that is not in the body mask at all: THE PAINTED WING DOES NOT
  //  REACH THE PLANE'S ROOT EDGE. Measured over the wing textures live in
  //  the scene, the paint touches u = 0 across only 0-6.6% of the along-
  //  body span, and the median row's paint starts 11-18 px into the
  //  slice's 128 -- 9-14% of the wing's outward extent, and a DIFFERENT
  //  amount for every wing. With the hinge buried in the body that inset
  //  was absorbed by the silhouette and invisible. With the hinge on the
  //  top contour it became a gap between wing and back that varied from
  //  butterfly to butterfly: the geometric hinge is identical for all of
  //  them, the apparent one was not.
  //
  //  So the number is set from where the PAINT lands, not where the plane
  //  edge is, and the two routes agree:
  //
  //    the inset. Median first-inked u = 14 px of 128 -> 0.070 s outward.
  //    In flight the wings are held up (flap -0.5 mean, -1.0 gliding), and
  //    a rotation about the hinge lifts that point by 0.070 * sin(0.5) =
  //    0.034 s. The body's top contour at the thorax is row 12 = 0.0849 s,
  //    so the hinge wants to sit 0.0849 - 0.034 = 0.051 s.
  //
  //    the picture. 0.051 s is texture row 23.5 -- on the body, in its top
  //    third, level with where the FRONT LEGS attach. Which is where a
  //    butterfly's wings do attach, and is what it was asked for.
  //
  //  Quoted in units of bfly-model's build scale, like wingPlane, so it
  //  survives any change to `size`.
  //
  //  RAISE THE WINGS, do not drop the body. The two are equivalent in
  //  profile and completely different everywhere else: the body carries the
  //  legs a perched butterfly stands on (perchLegDrop, and the whole of
  //  v9.2's nose-up solve), and CFG.tagBodyDrop is quoted against the
  //  silhouette's bottom, which is the body's. Moving the pivots leaves
  //  both untouched. It is also free in the reveal's flat pose, where the
  //  model's local +Y points at the visitor -- the wings move toward them
  //  and not one pixel across the view.
  wingRise:      0.051,

  // ---- v8.7: the wing SHAPE's fit in its slice -------------------
  //  Not the colour and not the generator: the wing's outline is built
  //  exactly as it always was, then measured and placed in the frame.
  //  See "THE FIT STAGE" in js/wing-gen.js for the numbers. Setting
  //  wingFitFill and wingFitSeam to 0 gives v8.6's wings back.
  wingFitFill:   0.80,   // 0..1 of the per-wing headroom to take. This is the knob that lifts the SMALL wings: headroom runs 1.09x on the wings that already fill the slice up to 2.20x on the ones that do not
  wingFitSeam:   1.00,   // 0..1, how far to slide the fore/hind seam onto the middle of the wing. Where most of the headroom comes from; at 0 the scale is limited by whichever of fore/hind reaches further
  wingFitGain:   1.05,   // flat multiplier on top of the fill, for the overall lift. Still hard-clamped by the headroom, so it can never push a wing off the slice
  wingFitMargin: 2.0,    // pixels of slice left clear on every side. The outline is exact, scallops included, so this is only mip headroom -- it keeps a wing that now reaches the edge from smearing along it in the lower mip levels. Costs 0.6 points of fill against 1px

  wingColRandAmt:  0.29,    // scales the jitter draws (shape placement wobble, linework spread). 0 = pure formula; only the palette picks, the pattern and the shapes vary
  wingColStyle:    'random', // v8.6: the pattern kind used by shapes and the optional background. 'random' (per-name pick) | stripes | checker | dots | rings | sunburst
  wingColHues:     6,       // v8.6: how many palette entries a name draws into its working set. Everything after the ground is chosen from it BY MEASURED CONTRAST, not at random
  wingColShapes:   0,       // v8.6: how many big overlay shapes. 0 = per-name, 1-3; 1-5 forces it
  wingColBlend:    'random', // v8.6: force the shapes' blend mode. 'random' (per-name, drawn jointly with the ground's lightness) | normal | difference | multiply | screen | exclusion
  wingColPatternScale: 1.0, // v8.6: multiplier on the pattern frequency. >1 = finer. Repeat counts are already bold (2-14) and features stay floored at MINS px, so this cannot alias the texture
  wingColAA:       0,       // v8.6: antialias half-width in PIXELS. 0 = fully hard edges, as the reference graphics. ~0.5 softens every edge in one place if the stair-stepping reads badly in the headset

  //  The name under each collected butterfly. Every letter its own small
  //  angle, rise and colour (tagJitter scales the first two; 0 is a tidy
  //  line). v7.1: it hangs RIGHT under the body, tight against it -- its
  //  visible top edge sits just under the butterfly's PAINTED silhouette,
  //  whatever the butterfly's size. The wing/body planes have a lot of
  //  transparent margin, so tagBodyDrop is where the actual drawn shape
  //  reaches (about -0.135 of the model's size below its centre, measured
  //  across flap and roll), NOT the plane's geometric edge. Angular-scaled
  //  so a far name stays as readable as a near one -- never faded out; the
  //  name is the record of the visitor and should always be legible.
  tagShow:     true,
  tagAngular:  0.085,       // world height per metre of distance
  tagMin:      0.050,
  tagMax:      0.340,
  tagBodyDrop: -0.135,      // per unit model size: where the painted silhouette bottom sits, and the name's top with it. less negative = tighter / into the body
  tagJitter:   0.75,        // per-letter angle + rise; higher = wilder

  // ============================================================
  //  v9 -- CALLING A COLLECTED BUTTERFLY OVER
  // ============================================================
  //  The kaleidoscope stops being scenery. Pinch one of the butterflies
  //  circling the room the same way you pinch a letter, and it leaves its
  //  orbit and comes to you. What happens when it gets there is entirely
  //  up to what your hands are doing:
  //
  //    a flat palm, turned up, held up   it LANDS on it, for perchDwell
  //    anything else                     it HOVERS in front of you,
  //                                      for hoverDwell, and then goes
  //    the palm turns, drops, or closes  it goes, immediately
  //
  //  Nothing here is a mode and nothing is announced. The whole grammar
  //  is "hold your hand out and it will come to it", which is what people
  //  already do around butterflies.
  //
  //  See collection.js:tickSummon / tickHover / tickPerch / tickLeave,
  //  and hands.js:palmPose for the posture itself.

  // ---- selecting one ----
  //  The same 0.20 * size sphere the keys use (keyboard.js:targets), so a
  //  collected butterfly is neither easier nor harder to hit than a letter
  //  -- it is just further away, which the pick CONE already accounts for.
  //
  //  PRIORITY, not tolerance, is what keeps the two apart: the collection
  //  is the LAST layer the ray is tested against (interact.js), after the
  //  two controls and after the 26 keys. The kaleidoscope orbits at 2.6-4.3 m
  //  and the keyboard at 1.0-2.4 m, directly in front of it, so without
  //  that a ray aimed through a letter at a butterfly behind it would
  //  summon the butterfly instead of catching the letter. Widening or
  //  tightening cones cannot fix that -- one is literally behind the other.
  colPickRadius: 0.20,      // multiplies the butterfly's own size
  colHiScale:    1.20,      // how much a highlighted one grows (the keys use hiScale 1.45; these are bigger already)
  summonMax:     1,         // how many can be called over at once. Calling another sends the first one home

  //  THE KEY LAYER'S VETO IS A MARGIN, NOT AN ABSOLUTE (v9, second pass).
  //
  //  The first pass made the ladder absolute: any key inside its own cone
  //  beat any collected butterfly, however badly aimed the key was and
  //  however precisely the butterfly was. That is unarguable when one is
  //  directly behind the other -- but it is far too strong the rest of the
  //  time, because A KEY'S CONE IS ENORMOUS IN ANGULAR TERMS. Measured:
  //
  //      key at 1.0 m, size 1.05  ->  0.37 m of tolerance = 20.3 deg
  //      key at 1.5 m             ->                        13.9 deg
  //      key at 2.4 m, size 0.45  ->                         5.9 deg
  //
  //  Raising the collection out of the letters' band (colHgt* above) buys
  //  a geometric gap of a fraction of a degree at the very bottom of the
  //  new band -- nothing against a cone 6 to 20 degrees wide. The bands
  //  fix the common case; this fixes the rest.
  //
  //  So: the key still wins ties and near-ties, and a key actually aimed at
  //  scores near 0 and cannot be beaten. A collected butterfly only takes
  //  the pick when its score is better by this much -- i.e. when the
  //  visitor is plainly aimed at IT and merely grazing the letter. Scores
  //  are 0 (dead centre) to 1 (the edge of the cone), so 0.45 is most of
  //  the width: the letter has to be a clear near-miss.
  colBeatsKey: 0.45,        // score units (0..1). 0 restores the absolute veto; 1 lets the collection win almost anything

  // ---- it flies over ----
  //  SLOWLY, which was the brief. summonSpeed is a cruise, not a lerp:
  //  a lerp toward a moving target is fastest when it is furthest away
  //  and creeps at the end, which is exactly backwards for something
  //  flying to your hand. This holds one speed until it is close, then
  //  eases down over the last summonEase metres so it arrives settled
  //  rather than stopping dead.
  //
  //  The sway is what stops the approach reading as a dolly move. It is
  //  added as a VELOCITY (amplitude x rate x cos), not as a position
  //  offset, so it can never step when it fades out near the target.
  //  Measured over the whole orbit band: a butterfly 3.7 m out reaches
  //  you in about 5 s at these numbers, the furthest (~5 m) in about 6.5.
  //  At the first pass (0.55 / 0.16 / 1.00 m) the same trip took 8 s --
  //  the crawl over the last metre dominated it -- which is past
  //  deliberate and into waiting.
  summonSpeed:     0.75,    // metres/sec, cruising in
  summonSpeedNear: 0.22,    // metres/sec, at the very end
  summonEase:      0.60,    // metres over which it eases from one to the other
  summonSway:      0.09,    // metres of side-to-side drift on the way in
  summonBob:       0.05,    // metres of rise and fall with it
  summonSwayRate:  1.5,     // radians/sec of both
  summonArrive:    0.085,   // metres from the target that counts as there
  summonGiveUp:    30,      // seconds before it gives up and goes home -- a safety net for a palm that is never quite reachable

  // ---- no hand: it hovers in front of you ----
  //  Deliberately NOT the reveal's flat pinned-specimen pose (that is the
  //  hero's moment and should stay the hero's), but the same idea: it
  //  holds station in front of the visitor, wings working, and drifts a
  //  little so it reads as hovering rather than parked. It follows the
  //  head, so turning away does not lose it.
  //  IT FLIES. The first pass held it in the reveal's dead-flat
  //  pinned-specimen pose, wings spread square to the visitor, and it read
  //  as a diagram of a butterfly rather than a butterfly. That pose belongs
  //  to the hero's moment and now stays there. Here it flies: the ordinary
  //  flight wingbeat, the body following its heading, presentRoll keeping
  //  the wing readable, and a slow wander left-right / up-down about the
  //  held spot -- it is WAITING in front of you, not posing.
  //
  //  The wander is the same fbm noise the butterfly already flies its orbit
  //  with, at its own frequencies x hoverRate, so no two wait the same way
  //  and none of it is periodic.
  //
  //  ABOVE the eye line, not below it. The name field hangs at nameY
  //  -0.235 and the two controls at blobY -0.435, on a panel 0.80 m out;
  //  a butterfly holding station at 0.62 m and BELOW the eye line sits
  //  directly in front of both of them. It could never steal their pick
  //  (a summoned butterfly is not a target), but it would cover them.
  //  The reveal used to solve the same problem the same way, with
  //  presentRise alone. v10.3 found that head PITCH defeats it -- looking
  //  down walks the butterfly down the gaze and onto the name -- and gave
  //  the reveal collection.js:presentPoint() instead. hoverRise is
  //  knowingly still on the gaze; see the note on hoverPoint().
  hoverDist:   0.62,        // metres in front -- inside the keyboard's 1.0 orbit
  hoverRise:   0.08,        // metres above the eye line, clear of the name and the controls
  hoverSize:   0.62,        // held at a comfortable size, whatever its orbit size is
  hoverDwell:  7.0,         // seconds it waits for a hand before it goes
  //  SECOND PASS: all of this came down. The first numbers moved too much
  //  and too fast at 0.6 m from a face -- and most of what read as
  //  "radical" was not the drifting at all but the HEADING, which chased
  //  the wander's travel direction and so swung a full 180 degrees every
  //  time the wander reversed. It now holds a steady heading instead (see
  //  hoverSwayYaw), and the drift is roughly half what it was, half as
  //  fast, with nearly twice the lag.
  hoverSpanX:  0.14,        // metres it wanders side to side -- the widest axis, so the movement still reads as flight
  hoverSpanY:  0.09,        // metres up and down
  hoverSpanZ:  0.06,        // metres toward and away from the visitor -- least, or it keeps changing size
  hoverRate:   9,           // multiplies the butterfly's OWN orbit noise frequencies (0.010-0.045). Was 20; a full wander now takes 3-6 s
  hoverEase:   0.40,        // seconds of lag onto the wandering point. This is the damping: raise it to calm the movement without making it smaller

  //  THE HEADING IS HELD, NOT CHASED. It used to turn to follow its own
  //  travel direction, the way the orbit does -- but the orbit travels in
  //  one direction for many seconds, while a hovering butterfly reverses
  //  every couple, so the body swung 180 degrees each time and read as
  //  frantic. Measured: 4.6 radians of yaw in 3.3 seconds.
  //
  //  So it holds a heading BROADSIDE to the visitor and sways gently about
  //  it. Broadside, not facing them: with the body axis pointed at the
  //  visitor the wing plane can never face them either (the same geometry
  //  that made the reveal need _flatQuat -- aspect never tops ~0.18), so
  //  facing them square is the one heading at which the butterfly is an
  //  edge-on twig. Broadside is what every orbiting butterfly already does.
  hoverSwayYaw: 0.30,       // radians it sways either side of that heading -- about 17 degrees
  hoverTurn:    0.9,        // seconds the yaw takes to ease onto it. Long, so the sway is a drift rather than a turn
  hoverSettle: 0.7,         // seconds the wander ramps in over, as it arrives. Without it the target jumps on the first frame of the hover and it lunges at the visitor's face at 1.0 m/s

  // ---- a hand: it lands on it ----
  //  perchSize is the one number to move if it looks wrong in the
  //  headset: at 0.50 the model is about 18 cm across the wings against a
  //  ~9 cm palm, which is a big butterfly on a hand and reads as one. The
  //  body is lifted perchLift off the palm plane so it sits ON the hand
  //  rather than in it.
  //
  //  perchFollow is a LAG, not a snap: hands are never still, and a
  //  butterfly rigidly welded to a jittering palm looks like a decal. A
  //  50 ms lag is short enough that it never appears to slide off.
  //  BROADSIDE, not head-on (v9, second pass). The body is a single plane
  //  through the body axis, so pointing the head at the visitor puts them
  //  looking straight down its length and the body disappears -- all you
  //  see is two wings and nothing joining them. Turned across the view you
  //  see it in profile, with a wing to each side.
  //
  //  Drawn fresh each time it lands, magnitude between the two, and the
  //  SIDE it turns to is drawn too -- both directions read equally as
  //  broadside, and a fixed one made every landing identical. To pin it,
  //  set both to the same number.
  perchYawMin: 60,          // DEGREES (not radians -- the rest of this file is radians; these two are not)
  perchYawMax: 70,
  perchSize:   0.50,

  //  IT STANDS ON ITS LEGS. perchLift used to be the whole story -- 18 mm
  //  between the model's ORIGIN and the palm -- but the origin is the wing
  //  hinge, and the body sprite hangs below it: body, then the legs. So the
  //  butterfly was planted wings-deep in the hand with every leg buried,
  //  about 52 mm of it at perchSize.
  //
  //  AND IT STANDS NOSE-UP, because the legs are not all the same length
  //  (v9.2). BODY_ALPHA is drawn as a body in FLIGHT, seen side-on: the
  //  front legs hang long and forward, the hind pair is short and swept
  //  back. Decode it, threshold at the material's own alphaTest of 0.5, and
  //  label the four leg strands -- their tips sit at, along the body from
  //  the wing hinge (head is -x):
  //
  //      front   x -0.0575   y -0.1145
  //      mid     x -0.0301   y -0.1407     <- the lowest, and all v9.1 used
  //      hind    x +0.0892   y -0.0964
  //      hind    x +0.1171   y -0.0915
  //
  //  Held level on the deepest of those, the hind tips float 22 and 25 mm
  //  over the palm at perchSize and the tail end of the butterfly visibly
  //  does not rest on the hand. THE FOUR TIPS ARE NOT COLLINEAR (the mid
  //  pair hangs 15 mm below the line through the other two), so no rigid
  //  pose lands all four and the choice is which error to spend:
  //
  //      pitch  legDrop  the four leg tips, mm off the hand at perchSize
  //      0.000   0.1406   +15.1   +2.0   +24.1   +26.6       v9.1
  //      0.205   0.1145    +9.1   -6.6    +3.0    +2.5       HERE
  //      0.323   0.1239   +18.8   +2.0    +4.1    +2.0
  //
  //  (as shipped, so perchLift's 2 mm of clearance is in those numbers;
  //  negative is a tip inside the hand. tools/reach/test-palm.js prints
  //  the middle row from the running component every time it runs.)
  //
  //  0.205 rad (11.8 deg) is the least-squares line through the four tips.
  //  It puts the hind pair down within a millimetre -- which is the whole
  //  complaint -- and buys that with the mid pair 8.6 mm into the hand,
  //  where a leg tip reads as contact; a leg tip ABOVE a hand reads as
  //  floating, which is the error worth avoiding. The lower hull (0.323)
  //  is the no-penetration answer and lands three of the four exactly, but
  //  11.8 deg reads as a butterfly settling and 18.5 deg as one rearing.
  //  Move perchPitch there if the sunk pair shows on a headset.
  //
  //  The pitch is about the wing SPAN axis (model local Z), so the wings
  //  stay level across the palm and only tip fore-and-aft: the span axis
  //  is still exactly in the palm plane at any perchYaw, and the wing
  //  normal comes off the palm normal by cos(perchPitch) = 0.979 and no
  //  more. Body clearance was re-checked over every painted pixel after
  //  the tilt: body 22 mm off the palm, abdomen tip 29 mm.
  //
  //  perchLegDrop is now the drop of that CONTACT LINE below the origin,
  //  measured perpendicular to it -- same meaning, same units (per unit
  //  model size, like tagBodyDrop), so it still scales with the butterfly
  //  and perchLift still sits on top of it.
  perchPitch:   0.205,      // radians of nose-up tilt about the wing span axis, so the short hind legs reach the palm
  perchLegDrop: 0.1145,     // per unit model size: how far the legs' contact line sits below the model origin
  perchLift:   0.002,       // metres of clearance between that contact line and the palm. Negative sinks it in
  perchFollow: 0.05,        // seconds of lag following the hand
  perchDwell:  12.0,        // seconds it stays, if the hand stays
  perchSettle: 0.30,        // seconds of folding its wings down as it touches
  perchRest:  -0.30,        // radians of dihedral at rest -- negative is wings UP in bm.flap's convention

  //  The flutters. A resting butterfly is not a still butterfly: it opens
  //  and shuts its wings every few seconds. Without this it reads as a
  //  sticker on your palm. The interval is jittered per flutter so two
  //  butterflies never sync up.
  perchFlutterEvery: 2.4,   // seconds between flutters, x0.6-1.5
  perchFlutterFor:   0.55,  // seconds each one lasts
  perchFlutterAmp:   0.75,  // radians at the top of one

  // ---- and it goes back ----
  //  Home is its own orbit, rejoined at the nearest point on its own ring
  //  rather than wherever its phase happens to have travelled to -- so it
  //  flies OUT and away, not across the room. leaveArc biases that entry
  //  point a little way round in the direction it already travels, which
  //  turns a radial exit into a curve.
  leaveTime: 3.0,           // seconds from wherever it is back onto its orbit
  leaveLift: 0.30,          // metres it arcs upward at the midpoint of that
  leaveBank: 0.22,          // radians of bank through the turn away, peaking mid-departure
  leaveArc:  0.55,          // radians round its own ring, ahead of the point it left from

  // ---- the posture that means "land here" (hands.js:palmPose) ----
  //  Every one of these is a threshold on a measurement, and all four
  //  geometric ones are quoted in PALM WIDTHS or as dot products, never
  //  in centimetres -- a child's hand and an adult's have to read the
  //  same. Typical values, measured off the joint model:
  //
  //    extension   ~1.9 palm widths flat, ~1.0 in a fist
  //    offset      ~0.2 flat, 0.5-0.75 curled
  //
  //  so palmFlatExtend at 1.45 sits in the middle of a wide gap and is
  //  the test doing the work; palmFlatOffset is a lenient backstop against
  //  a cupped hand, not a demand for a rigid salute.
  //
  //  palmUpDot 0.62 is about 52 degrees off vertical -- generous, because
  //  nobody holds their hand perfectly level and the failure mode of a
  //  tight threshold is an interaction that mysteriously does not work.
  //
  //  palmRaiseBelowEye is measured from the HEADSET, not the floor:
  //  visitors are different heights and may be seated. 0.50 m under the
  //  eye line is about chest height -- a deliberate offer, not a hand
  //  that happens to be resting palm-up on a knee.
  palmUpDot:         0.62,  // dot(palm normal, world up)

  //  v10 -- EITHER FACE. true: the offer is a hand held out FLAT AND
  //  HORIZONTAL, either way up, and the butterfly lands on whichever side
  //  points at the sky (the back of the hand, when the palm is turned
  //  down). false: v9.2's palm-up-only rule exactly.
  //
  //  The narration asks for the palm turned DOWN, and under the old rule
  //  a visitor who followed it exactly got the hover-then-leave branch --
  //  the interaction read as broken to the people doing as they were
  //  told. Accepting either is also strictly more forgiving, which is the
  //  argument for it on its own: the pose is still gated by palmFlat
  //  (fingers extended, so a pinching hand never qualifies) and
  //  palmRaised (held up near the headset).
  palmEitherFace: true,
  palmFlatExtend:    1.45,  // mean fingertip-to-wrist distance, in palm widths
  palmFlatOffset:    0.62,  // mean fingertip distance off the palm plane, in palm widths
  palmRaiseBelowEye: 0.50,  // metres under the headset the palm may be and still count as raised
  palmHoldMs:        220,   // ms the whole pose must hold before it is an offer
  palmGraceMs:       320,   // ms it must be gone before the offer is withdrawn (a tracking dropout is not a withdrawn hand)

  //  THE DESKTOP STAND-IN. Hand tracking cannot be reproduced on a
  //  desktop and the landing is most of what v9 is, so SPACE toggles a
  //  synthetic palm this far in front of and below the camera. It is a
  //  real offer as far as everything downstream is concerned, and it is
  //  refused inside an XR session. hands.js:Hands.
  palmSimOut:  0.42,        // metres in front of the camera
  palmSimDrop: 0.40,        // metres below it

  // ---- palette ----
  //  Fully saturated, always. The scene is white, so the butterflies carry
  //  all the colour and carry it at full strength -- v2's 72%/63% was
  //  tuned against a black void and washes out completely against white.
  bflySat:     100,         // per cent
  bflyLit:     47,
  //  Letters take their butterfly's hue at full chroma but darker: a wing
  //  is a silhouette and a letter is type, and type at the wing's own
  //  lightness is unreadable on white for a good third of the wheel.
  letterLit:   36,
  //  the letter cut out of the wing, filled rather than left open
  cutLit:      46,
  //  the ghost trailing each letter, in its own ink
  ghostLit:    52,

  // ---- v10: the session, and the voice that runs it ----
  //  guide.js turns the run into a SESSION: a start the visitor presses,
  //  two spoken beats, and an end that hands over to the next person.
  //  None of it touches the collection -- the kaleidoscope is the
  //  exhibition's accumulation and no session may reset it.
  //
  //  ENDING IS NON-DESTRUCTIVE (an empty keyboard is reset, a perched
  //  butterfly flies home, the flower comes back), which is what lets
  //  these timers be SHORT. An exhibition floor hands the headset over
  //  fast; a visitor ended early presses start again and loses nothing.
  //
  //  ...and the quiet clock is FROZEN whenever the visitor cannot act --
  //  through the reveal (~14 s of watching by design), through a
  //  butterfly coming over or sitting on a hand (perchDwell alone is
  //  12 s), and through a cue that is still teaching them something. That
  //  is the other half of what makes 30 s safe rather than a hair
  //  trigger. See guide.js's header.
  //  FIFTEEN SECONDS from the last thing a visitor did to the room
  //  resetting: the nudge at 10 s, and the farewell -- which is what
  //  actually clears the room (toFarewell -> clearRoom) -- at 15 s. The
  //  start flower is back about 1.2 s after that, guideFarewellMin.
  //
  //  v11 briefly raised these to 20000/10000, on the grounds that both
  //  beats are silent (nudge and farewell are null in voCues, so from
  //  inside the headset the room appears to reset itself for no reason)
  //  and that clearRoom() calls keyboard.reset(), so a half-spelled name
  //  goes with it. Asked for at 15 s and set back -- noted here rather
  //  than argued again.
  //
  //  NOTE these numbers were never the reason a desktop session would not
  //  time out. That was CFG.mouseIdleMs above: a parked cursor kept the
  //  clock pinned at zero, so no value here could ever be reached.
  //
  //  The clock is FROZEN (not reset) through the reveal, through a
  //  butterfly coming over or sitting on a hand, and through a cue that is
  //  still teaching them something -- so these are ten seconds of a
  //  visitor who could be acting and is not.
  guideQuietMs:     10000,  // ms of no interaction -> the nudge
  guideQuietGrace:   5000,  // ...then this much more -> the farewell, which CLEARS THE ROOM. Any activity cancels
  guideMaxMs:      480000,  // hard cap on one session. An exhibition backstop, nothing more
  guideDoffMs:       2000,  // ms of XR visibility 'hidden' that counts as the headset coming off

  //  How far into the welcome track the room comes live. 0 = at once: a
  //  visitor who already knows what to do is never blocked, and the
  //  narration is guidance rather than a gate. Move it onto the second
  //  where the instruction actually lands once the track is cut.
  guideUnlockAt:      0,    // seconds
  guideWelcomeMax:   60,    // seconds -- a stalled track can never hold the room
  guideFarewellMin:  1.2,   // seconds the farewell beat lasts even with no track behind it
  guideFarewellMax:   20,   // seconds -- and can never last longer than this

  //  The longest a cue is allowed to freeze the quiet clock. A track that
  //  stalls mid-fetch never fires 'ended' and never reports itself
  //  paused, and without this one bad file holds a session open until
  //  guideMaxMs. Well past any plausible narration length.
  guideTalkMax:       90,   // seconds

  guideCtlFade:     0.50,   // seconds: accept/delete fading out between sessions
  guideFlowerFade:  0.70,   // seconds: the start flower fading in and out

  //  THE START FLOWER. UI.blob(), the same six-lobed cluster the two
  //  controls are, at its own hue and clearly bigger than either -- and
  //  in idle it is the only pickable thing in the room, so pointing
  //  anywhere lights up one shape and nothing else.
  guideBlobX:        0.00,  // panel centre -- CFG.panelPos(x, y)
  guideBlobY:       -0.30,  // between the name field (-0.235) and the controls (-0.435)
  guideBlobK:        1.60,  // multiplies blobW/blobH -- accept is 1.26, delete 1.02
  guideBlobSeed:     1.80,  // the lobe phase; deliberately neither control's (0.9 / 2.7)
  guideBlobHue:       212,  // neither accept's 142 nor delete's 356
  guideBlobLit:        44,  // per cent, at rest
  guideBlobLitHot:     34,  // ...and pointed at. Same narrow band the controls use
  guideBlobTilt:    -0.18,  // in the plane
  guideBlobCant:     0.10,  // and out of it

  //  THE CUE TABLE. name -> file, relative to index.html. A cue with no
  //  entry (or a null one) is a SILENT NO-OP that still reports itself
  //  finished, so the guide runs end to end with whatever subset of the
  //  tracks exists. Drop the files into audio/ and name them here;
  //  nothing else changes.
  //
  //  Prefer .m4a / .mp3 over .wav: these are served over TLS to a headset
  //  on the LAN and a 30 s stereo wav is about 5 MB.
  //
  //  THE OPENING IS THREE RECORDINGS, not one -- see voIntro below. They
  //  play back to back with voGap between, and everything downstream
  //  treats the whole run as a single cue: the room does not unlock early
  //  and the quiet clock does not start counting mid-sentence.
  voCues: {
    //  "Welcome to Kalei Identity."
    welcome:  'audio/welcome.mp3',
    //  "Catch butterflies one at a time to spell your name. This will
    //   build the genetic code of your own butterfly."
    spell:    'audio/spell.mp3',
    //  "Start by pinching a selected butterfly to attract it towards you."
    pinch:    'audio/pinch.mp3',
    //  "Now, find your butterfly in the kaleidoscope. Select it and hold
    //   out your palm ... flat in front of you to interact with it."
    //  Fires on 'reveal:joined' -- the frame their butterfly's soar hands
    //  off onto the orbit -- and only for the FIRST of a session.
    recall:   'audio/recall.mp3',

    //  NOT RECORDED. Both are optional and the session runs without them:
    //  the nudge asks "still there?" 30 s into a quiet stretch, and the
    //  farewell plays as the room hands over. With no farewell track the
    //  end is silent and the start flower coming back is the whole signal,
    //  which works -- but a short "thank you, please pass the headset on"
    //  is the one line an exhibition floor would most want next.
    nudge:    null,
    farewell: null
  },

  //  THE OPENING, in order. Played as one sequence when the start flower
  //  is pressed. Reorder or shorten it here -- it is a content decision,
  //  not a code one.
  voIntro: ['welcome', 'spell', 'pinch'],
  voGap:   0.45,            // seconds of silence between two cues in a sequence

  //  v10.4. A BEAT between pressing the start flower and the first word.
  //  The press has its own sound now (the select click), and starting the
  //  narration on the same frame put "Welcome to Kalei Identity" on top of
  //  it -- the confirmation that the button worked and the first line of
  //  the piece arriving together, so neither reads. Long enough for the
  //  click to finish and the flower to bounce, short enough that nothing
  //  feels broken. The room is pickable throughout: the welcome state
  //  holds across this pause, so it cannot fall through to live early.
  voIntroDelay: 0.90,       // seconds

  // ---- v10.4: the room's sound, which is not the narration ----
  //  Three different shapes of playback, all driven by js/sfx.js: a bed
  //  that never stops, wingbeats that come and go, and a click on every
  //  activation. Masters are in sounds/sfx/; these are the AAC copies.
  sfx: {
    music:  'audio/sfx/bg_music.m4a',   // 2:21, the bed. Loops for the whole day.
    wing1:  'audio/sfx/wing1.m4a',      // 5.0 s
    wing2:  'audio/sfx/wing2.m4a',      // 2.25 s
    select: 'audio/sfx/select.m4a'      // 1.85 s, mono
  },
  //  Which entries above are wingbeats. Add a third recording by
  //  dropping the file in, naming it in sfx above, and listing it here.
  sfxWings: ['wing1', 'wing2'],

  //  THE LEVELS ARE MEASURED, not guessed -- see the table at the top of
  //  sfx.js. The wingbeats are recorded 15-18 dB under the bed, so they
  //  run at full and the BED is the one pulled down. To make the room
  //  louder or quieter, move sfxMusicGain.
  sfxMusicGain:     0.50,
  //  The recording starts loud and ends in near-silence, so the loop
  //  seam is covered by fading the head up rather than by crossfading
  //  two copies. currentTime resets on loop, so one envelope is both the
  //  opening fade-in and every seam after it.
  sfxMusicFadeIn:   3.00,   // seconds
  sfxMusicFadeOut:  2.50,   // seconds, off the end of the track

  sfxWingGain:      1.00,
  sfxWingFade:      0.60,   // seconds, up at the head and down at the tail
  sfxWingGapMin:    4.00,   // seconds of quiet between two wingbeats...
  sfxWingGapMax:   14.00,   // ...picked uniformly in this band
  sfxWingFirstGap:  2.00,   // and before the first one

  sfxSelectGain:    0.90,
  //  Voices in the click pool. The recording runs 1.85 s and a visitor
  //  spelling a name presses faster than that, so retriggering ONE
  //  element would cut every second press dead.
  sfxSelectVoices:     4,

  //  The bed and the wingbeats drop to this while the narration speaks,
  //  and ease back over sfxDuckFade. The piece talking always wins.
  sfxDuck:          0.35,
  sfxDuckFade:      0.50    // seconds
};

CFG.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// --- normalized roll -> live value, exactly v2's mapping -------------
CFG.sizeFor   = function (t) { return CFG.sizeMin + CFG.sizeRange * Math.pow(t, CFG.sizeExp); };
CFG.radiusFor = function (t) { return CFG.radMin + (CFG.radMax - CFG.radMin) * t; };
CFG.heightFor = function (t) { return CFG.hgtMin + (CFG.hgtMax - CFG.hgtMin) * t; };

// --- the collection's own bands (v7), same shape of mapping ----------
CFG.colRadiusFor = function (t) { return CFG.colRadMin + (CFG.colRadMax - CFG.colRadMin) * t; };
CFG.colHeightFor = function (t) { return CFG.colHgtMin + (CFG.colHgtMax - CFG.colHgtMin) * t; };
CFG.colSizeFor   = function (t) { return CFG.colSizeMin + CFG.colSizeRange * Math.pow(t, CFG.sizeExp); };

// Anything mounted flat on the panel, at (x, y) in front of the visitor.
CFG.panelPos = function (x, y) {
  return new THREE.Vector3(x, CFG.eyeY + y, -CFG.panelR);
};
