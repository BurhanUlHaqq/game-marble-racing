# Architecture and tuning

## Round ownership

`main.ts` owns one active physics world and one queued course plan. An independent Vite module worker runs the same fixed-step simulation used by the show to accept or reject generated courses. Candidate acceptance uses completion time, finishing count, and recovery count across the entire field. The renderer gets its racer poses from the live physics world.

While the active course is on air, `show-scene.ts` assembles at most one queued scene in short frame slices. Preparation and post-race phases precompile the queued scene's racing and podium shader variants, then warm the initial draw and shadow pass in a clipped render. The next lineup activates the staged scene and releases the retired scene. A context restoration restarts the queued shader preparation.

`lifecycle.ts` uses absolute time boundaries for PREPARE, PICK_MARBLE, COUNTDOWN, RACING, FINISHING, CELEBRATION, RESULTS, and NEXT_ROUND. After the first physical crossing, the next eight seconds or the remaining overall action window determine the grace deadline. The round resolves earlier if all racers are adjudicated. If the worker misses the preparation watchdog, a seeded course from the fallback bank is used.

`signatures.ts` shuffles the ten course IDs in complete cycles and prevents a repeat at the boundary. Classic rotates the four original themes. The camera tracks the interpolated positions of the leaders. Their spread on screen determines how far the camera pulls back to fit a close contest beside the standings. It looks down the track at landmarks, across the steep faces on drops and over the approach to narrow bridges. Racer labels sit above each marble's projected upper edge. The leaderboard holds near-tie swaps briefly and applies official finish order as soon as finishers are registered.

Adaptive rendering responds to sustained missed frames in two-second windows and retains the current scale at round handoff. Stable frame timing allows gradual scale recovery. The operator's quality preset sets the limits and shadow policy.

## Geometry and mechanisms

`track.ts` constructs a downward center path with fixed-width, aligned connectors and a cross-section sample approximately every meter of track. It generates the floor and rail meshes used by both Three.js and Rapier. Classic arranges all fifteen mechanisms in a seeded order. Each signature course uses a compatible subset with a two-channel landmark and a merged finish. The landmark emits mesh bands for each contact material. Aquarium places the crossover channels at separate heights, and checkpoint validation samples their respective surfaces.

| Mechanism | Physical feature |
| --- | --- |
| Banked sweep | Curved, cross-sloped surface that redirects rolling momentum |
| Slalom ramps | Alternating curvature and cross-slope with staggered rubber cylinders |
| Roller waves | Changes in pitch through three wave crests |
| Spiral bowl | Curved bowl-shaped cross section with a downhill outlet |
| Helix descent | One full descending turn with a linked exit |
| Crystal tunnel | Clear arch shell and side walls sharing collision geometry |
| Split and merge | Parallel channels separated by collider dividers with open entry and exit |
| Pegboard | Staggered cylindrical obstacles and a widened passing deck |
| Funnel | Tapered width with two-way passing room at the throat |
| Turntable paddles | Slowly rotating kinematic arms |
| Swing gates | Oscillating kinematic bars |
| Tilting deck | Kinematic plates that protrude above the supporting deck as they tilt |
| Conveyor | Animated tread and equal tangential impulse for every grounded racer within its drive region |
| Air bridge | Short floor gap and downward catch deck with full-width sidewalls |
| Chime alley | Resonant metal-post collisions that trigger material-aware tones |

Standard and Extra layouts on all eleven courses have three rolling plunges and two covered drops. The later covered drop sustains an 80° face before its rounded catch. The generator samples the covered drops along arc length, rotating checkpoint planes, rail clearance and ceiling height with the deck. The lined uphill exits dissipate speed through gravity and rolling resistance. Including the bridge, Standard has three two-abreast passages and Extra has four. These taper in and reopen clear of moving devices. Signature layouts also include a banked bumper chicane and a sweeper run. Signature branches share a deck while the tapered divider rises and separate once the divider can guide the field.

The stacked spiral is a full banked turn with eased entry and exit, softly raised channel edges and two short grades into the lower return. The same carved cross sections produce the floor meshes and collision supports. The camera tracks the marbles from a steady compass heading through the spiral and eases into the exit turn.

To change pacing, start with module length and slope in `track.ts`. `raceTarget` scales length within the tested geometry envelope. Short courses use steeper grades to retain enough length for the helix and jump catch area. Long courses use gentler grades. Actual finishing times vary. Keep the width, gaps, thickness and connector validation coupled between the renderer and collider meshes. Run the seeded soak after changing dimensions, mass, damping, collisions, checkpoint tolerances, or module motion.

## Physics, checkpoints, and finish

- All sphere colliders have radius 0.335, mass 1, friction 0.61 and restitution 0.23. The same gravity, damping, and bounded velocity policy apply to every body. Each occupied lane has a distinct cartoon thrower. Seeded draws assign each lane a release angle and speed. The arm reaches that velocity at the end of the countdown. The live race and preflight both release every marble from its hand on the tick that opens the gate.
- The race clock runs at 60 ticks per second. An airborne sphere sweeps its path against the running surfaces. A fast touchdown splits that tick at the predicted contact time so Rapier resolves the material rebound close to the deck. Kinematic obstacles advance to each solver time, and rendering interpolates the outer tick poses. Sphere CCD remains enabled.
- Upward solver impulses identify load-bearing floor contacts. The strongest support selects the surface. A resistance torque opposes the marble's rolling spin relative to its support, scaled by the measured normal load and the surface. Rapier resolves gravity along the slope and friction at the contact. The ball keeps light air damping during flight. Floor materials set rebound strength up to the marble's restitution, and muted landings on soft materials still carry their measured impact force. The rotating vinyl platter transfers motion through friction at its moving contact surface.
- Marbles launch from a common starting line. Rapier resolves free flight, the first landing and the transition to rolling. During flight a downward ray locates a nearby deck for the contact shadow. The shadow broadens and fades with clearance and disappears over open space.
- Progress requires consecutive forward checkpoint crossings within the corridor. The progress calculation searches only nearby legal segments. The parallel routes use corresponding centerline stations, giving the same progress for the same gate on either route.
- Racer positions are interpolated at finish-plane crossing. Finish order uses the finer crossing timestamp with a deterministic pre-race draw for times indistinguishable at one microsecond. Finished bodies are disabled as they cross. Unfinished racers are ranked behind legitimate finishers by furthest legal distance, then the same tie draw. DNFs carry no finish time.
- `finish-runout.ts` lays out the numbered finish bays and animates the render meshes from their late crossing poses. The race holds the finish camera while the last finishers roll out, then displays the entire finishing order on the podium and its lower rack. Presentation positions stay outside Rapier and scoring.
- Powered surfaces include the conveyor, the scoop and the rotating vinyl contact region. Motion and contact rules apply to every marble. Recovery after a fall, invalid state, or 3.2 seconds without enough progress places a racer at or just behind its last passed checkpoint, with a bounded launch velocity of 1.4 units per second. Recovery inside a signature section samples the occupied branch where available. The race clock keeps running and distance cannot advance through recovery. Three unsuccessful recoveries exhaust the allowance for that racer.

## Statistics and sound

`session.ts` saves settings, an in-progress marker, the last committed record ID, session statistics and cup progress to versioned local storage. An interrupted race increases the abandoned count and advances the race number. The current tab continues with in-memory state if storage fails. Session appearances count lineup participation, including voids. A void awards zero points and does not advance the cup. The cup concludes after five valid races, ranking by points, wins, then podiums. Competitors tied on all three share the title.

Point awards by position are 10, 8, 6, 5, 4, 3, 2, and 1. Session totals survive cup resets. The session caps history at 12 rounds. Race and frame diagnostic buffers have fixed maximum sizes.

`soundtrack.ts` rotates recordings from the local catalog and crossfades two reusable media elements. Playback uses measured cue points and loudness trims. The operator can export the recordings heard during the current show. `audio.ts` supplies four synthesized fallback arrangements, ducks the score for race cues, and mixes eight rolling voices and twelve shared effect voices. Floor contact triggers short, dry rolling taps whose rate follows ground speed. Clockmaker schedules three finish notes from official arrival order. The material catalog in `surfaces.ts` supplies contact sounds, floor grip, bounce, drag and appearance.

## Relevant APIs

The project pins compatible tool and runtime versions in the lockfile. The build uses Rapier's compatibility package, whose JavaScript contains the WASM bytes. There is no runtime WASM or font CDN dependency.

[Rapier rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) · [Rapier collision detection](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js/) · [Rapier WASM packaging](https://rapier.rs/docs/user_guides/javascript/getting_started_js/) · [Three.js](https://threejs.org/docs/) · [Vite](https://vite.dev/guide/)
