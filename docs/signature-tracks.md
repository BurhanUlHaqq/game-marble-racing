# ZeeRush signature tracks

The default show draws a seeded permutation of the ten courses for each rotation. The last course in one rotation and the first course in the next have different IDs. Championship scores and marble identities carry across courses. Each course has a named landmark, two physical routes, and a merged finish. The 12-second pick window, five-second countdown, eight-second celebration and five-second results use the normal show lifecycle.

## Start and preview

```sh
npm ci
npm run build
npm run serve
```

Use the [broadcast source](http://127.0.0.1:4287/) at 1920×1080 in OBS or Streamlabs. The frame-rate target is 60 FPS on capable hardware. Audio starts automatically where the browser allows autoplay. When the capture browser requires an audio gesture, click once inside the source’s interaction window. Set `track=classic` for the original generator or `track=rotate` for the signature rotation. [Capture setup](streaming.md)

### Course previews

Each link selects six marbles and a course seed. The current round number comes from the saved championship. A new browser profile begins at round one. The default show generates layouts automatically, and preflight can select a later attempt when a race has too few finishers. [Broadcast URL options](../README.md#broadcast-url-options)

| Course ID | Signature section and finish | Reserve seed and preview |
| --- | --- | --- |
| `paper-moon` | Corrugated cardboard and tape lanes, sorting tray and winner stamp | [postmark-26](http://127.0.0.1:4287/?track=paper-moon&marbles=6&seed=postmark-26) |
| `cedar-creek` | Millwheel, short moving cork scoop and wooden bypass, raised mill flag | [parcel-19](http://127.0.0.1:4287/?track=cedar-creek&marbles=6&seed=parcel-19) |
| `bellflower` | Lower glazed drain line and higher rim, porcelain flower bell | [nightshift-43](http://127.0.0.1:4287/?track=bellflower&marbles=6&seed=nightshift-43) |
| `clockmaker` | Moving distributor gate, three brass chimes and copper bypass, first three arrivals play the finish keys | [gearbox-04](http://127.0.0.1:4287/?track=clockmaker&marbles=6&seed=gearbox-04) |
| `aurora` | Three grippy snow strips on the inside of a banked hairpin, lanterns light in arrival order | [nightshift-43](http://127.0.0.1:4287/?track=aurora&marbles=6&seed=nightshift-43) |
| `cloud-quilt` | Three supported fabric rises and satin ribbon, unfolding rosette | [postmark-26](http://127.0.0.1:4287/?track=cloud-quilt&marbles=6&seed=postmark-26) |
| `truck-art` | Rubber inside line, banked steel outside, original painted enamel and peacock fan | [postmark-26](http://127.0.0.1:4287/?track=truck-art&marbles=6&seed=postmark-26) |
| `fossil-canyon` | Sandstone terraces and cobbles beside a slate ledge, checkpoint mural and dinosaur reveal | [switchback-71](http://127.0.0.1:4287/?track=fossil-canyon&marbles=6&seed=switchback-71) |
| `prism-aquarium` | Stacked dry acrylic channels around coral, fish form the winner’s number | [blue-hour-57](http://127.0.0.1:4287/?track=prism-aquarium&marbles=6&seed=blue-hour-57) |
| `midnight-record` | Felt crossover, rotating vinyl contact region and outer spiral, numbered sleeve and settling tonearm | [switchback-71](http://127.0.0.1:4287/?track=midnight-record&marbles=6&seed=switchback-71) |

## Implementation

| Files | Ownership |
| --- | --- |
| [`signatures.ts`](../src/signatures.ts), [`config.ts`](../src/config.ts), [`hud.ts`](../src/hud.ts) | Stable IDs, seeded rotation, reserve seeds, URL selection and course names |
| [`track.ts`](../src/track.ts), [`progress.ts`](../src/progress.ts), [`physics.ts`](../src/physics.ts), [`calibration.ts`](../src/calibration.ts) | Shared course geometry, physical routes, material contacts, checkpoint validation, recovery and preflight |
| [`surfaces.ts`](../src/surfaces.ts), [`audio.ts`](../src/audio.ts) | Shared physical and visual material definitions, rolling and impact synthesis, arrival cues |
| [`signature-art.ts`](../src/signature-art.ts), [`show-scene.ts`](../src/show-scene.ts), [`camera.ts`](../src/camera.ts), [`main.ts`](../src/main.ts), [`style.css`](../src/style.css) | Procedural props and finish effects, scene staging and disposal, landmark camera and phone-size overlay |
| [`tests/show.test.ts`](../tests/show.test.ts), [`signature-soak.ts`](../scripts/signature-soak.ts), [`signature-browser.mjs`](../scripts/signature-browser.mjs) | Regression tests, physics sampling, browser capture and signal checks |

## Tabletop revision

Standard and Extra courses use shaped channels, layered track edges and timber bents. The new spiral follows a full banked turn with two rolling drops. Its lower exit passes below the upper approach. A separate camera angle shows the stacked route and its foundation as the field enters the turn.

All ten courses traversed the spiral in a 50-race raw Standard sweep with four through eight marbles. The sweep recorded one recovery, nine DNFs, zero jams and zero voids. Legal finishes ranged from 101.9 to 120.4 seconds at the 120-second target. A six-marble Extra case on each course at the 60-second target produced two DNFs and zero jams or voids. [Standard simulation report](../verification-output/signature-soak-50-tabletop.json) · [Short Extra report](../verification-output/signature-soak-10-60-tabletop-extra.json)

All 100 preflight-selected Standard races used the spiral and finished with zero DNFs, recoveries, jams or voids. The sweep covered two seeds at every entrant count on every signature course. Legal finishes ranged from 102.1 to 123.1 seconds at the 120-second target. [Preflight simulation report](../verification-output/signature-selected-100-tabletop.json)

The browser preview covered Paper Moon and Truck Art at 1920×1080 and 640×360. Both six-marble fields finished. The build, lint and all 19 automated tests passed. [Paper Moon spiral](../verification-output/tabletop/paper-moon-spiral-1080p.png) · [Truck Art spiral](../verification-output/tabletop/truck-art-spiral-phone.png) · [Browser report](../verification-output/tabletop/browser.json)

## Earlier obstacle-layout verification

Standard gives every signature course two drops with polished slide surfaces, three alternating grip strips, three rounded bumpers, two moving sweepers, zig-zag bends and two narrowed passages. Extra raises the counts to four grip strips, five bumpers and three sweepers. The fork nose keeps the track supported while the divider rises.

All races in the table used the 120-second pacing target and eight seconds of finish grace. The raw comparison uses the same two seeds and all entrant counts from four through eight. The Extra set uses one seed at all entrant counts.

| Test set | Races | Recoveries | DNFs | Voids | Jams | Legal finish range (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original, matched raw comparison | 100 | 68 | 38 | 0 | 0 | 95.7–114.6 |
| Standard, raw | 100 | 9 | 42 | 0 | 0 | 95.2–112.0 |
| Standard, preflight-selected | 100 | 0 | 0 | 0 | 0 | 94.8–112.5 |
| Extra, raw | 50 | 1 | 15 | 0 | 0 | 95.4–111.2 |

Every upgraded race in this table recorded genuine grip-strip contact. All 100 preflight-selected Standard races used the upgraded layout. The raw tests retain late DNFs, so preflight remains part of normal play. [Standard raw results](../verification-output/signature-soak-100-track-upgrade-final.json) · [Standard preflight results](../verification-output/signature-selected-100-track-upgrade-final.json) · [Extra raw results](../verification-output/signature-soak-50-track-upgrade-extra-final.json)

An additional six-entrant sweep used the Extra preset on each course. All ten preflight-selected races finished with zero recoveries, DNFs, voids and jams. A raw sweep using the 60-second Standard target produced one DNF and zero voids. [Extra preflight sweep](../verification-output/signature-selected-10-track-upgrade-extra.json) · [Short Standard sweep](../verification-output/signature-soak-10-60-track-upgrade.json)

Chromium showed the three new sectors at 1920×1080 and 640×360, kept all six finishers through results, and applied Extra at the next grid. With autoplay allowed it produced audio before any click. With autoplay blocked, clicking **Enable sound** produced audio. The mute setting returned a silent signal. [Browser results](../verification-output/track-upgrade/browser.json) · [Drop slides](../verification-output/track-upgrade/brake-1080p.png) · [Bumper chicane](../verification-output/track-upgrade/cushions-1080p.png) · [Narrow sweeper run](../verification-output/track-upgrade/sweepers-1080p.png)

```sh
npm run soak:signatures -- --obstacles=standard --tag=track-upgrade
npm run soak:signatures -- --obstacles=standard --preflight --tag=track-upgrade
npm run soak:signatures -- --obstacles=extra --seeds=postmark-26 --tag=track-upgrade-extra
```

## Original layout verification

The matrix used the production Rapier simulation at 60 steps per second with the 120-second pacing target and eight seconds of finish grace. Each raw course row combines four seeds at all five roster sizes. Each preflight row combines two seeds at all five roster sizes. Times run from release and span the earliest first finisher through the latest legal finisher. A gate or scoop jam counts a stall within three course units of that device after 3.2 seconds without enough legal progress.

| Course | Raw finish range (s) | Raw recoveries | Raw DNFs | Raw voids | Raw jams | Preflight finish range (s) | Preflight recoveries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Paper Moon | 98.3–108.2 | 1 | 3 | 0 | 0 | 98.3–105.8 | 0 |
| Cedar Creek | 93.8–106.8 | 27 | 16 | 0 | 2 | 94.3–106.8 | 2 |
| Bellflower | 94.4–110.2 | 4 | 14 | 0 | 0 | 95.4–110.3 | 0 |
| Clockmaker | 101.4–115.7 | 15 | 16 | 0 | 0 | 101.0–115.5 | 0 |
| Aurora | 96.9–110.1 | 3 | 0 | 0 | 0 | 97.2–110.1 | 0 |
| Cloud Quilt | 104.7–114.6 | 2 | 1 | 0 | 0 | 105.2–114.6 | 0 |
| Truck Art | 99.2–117.3 | 33 | 14 | 0 | 0 | 98.5–112.4 | 0 |
| Fossil Canyon | 98.5–113.6 | 2 | 3 | 0 | 0 | 99.9–108.0 | 0 |
| Prism Aquarium | 94.8–106.2 | 33 | 10 | 0 | 0 | 95.7–106.2 | 0 |
| Midnight Record | 95.7–111.5 | 14 | 5 | 0 | 0 | 98.7–114.6 | 0 |

All 600 entrants in the 100 preflight races finished. Those races had two recoveries and zero voids or jams. The 200 unfiltered races had 82 DNFs among 1,200 entrants. The worker’s course selection matters for unattended playback. At the default target the raw races resolved in 106.1 seconds on average.

The test suite verifies equal legal checkpoint credit on both branches and rejects crossing attempts above the track. All 80 isolated branch traversals exited legally. Cedar’s scoop path needed recovery in two of the isolated trials. Each branch produced winners on every course across the raw seed matrix. Several individual seeds sent the entire field down one branch. Branch times depend on layout, contact and entry speed, and the short line retains a time advantage on some courses. The rotation preflight favors healthy races with traffic on both branches.

The ten reserve seeds completed 50 races with 4–8 entrants, zero recoveries, zero DNFs, zero voids and zero jams at the default target. Legal times spanned 95.0–110.1 seconds. At the 60-second target, ten six-marble reserve races returned legal times of 66.9–79.4 seconds, one recovery and four DNFs. At the 180-second target, the equivalent ten races returned legal times of 141.9–175.0 seconds, seven recoveries and seven DNFs. Both extreme-target sets had zero voids and jams. [60-second results](../verification-output/signature-reserve-10-60.json) · [180-second results](../verification-output/signature-reserve-10-180.json)

The single-marble incline test held the body, initial pose, grade and five-second interval constant. Cardboard reached 3.94 units/s and tape reached 4.19 units/s. Felt reached 3.87 units/s, glaze reached 4.21 units/s and snow reached 3.36 units/s. [Raw matrix and incline data](../verification-output/signature-soak-200.json) · [Preflight matrix](../verification-output/signature-selected-100.json) · [Reserve matrix](../verification-output/signature-reserve-50.json)

## Browser and audio verification

All ten courses reached the podium with six finishers in Chromium. The review covered a landmark, the finish approach and the official podium for each course at 1920×1080 and 640×360. The capture harness advanced the simulation clock to collect these shots. The timed runs below used the normal browser clock. [1080p review, courses 1–5](../verification-output/signature-browser/review-1080p-0.png) · [1080p review, courses 6–10](../verification-output/signature-browser/review-1080p-1.png) · [Phone review, courses 1–5](../verification-output/signature-browser/review-phone-0.png) · [Phone review, courses 6–10](../verification-output/signature-browser/review-phone-1.png)

| Timed Chromium run | Final rolling FPS | p95 frame time | Internal resolution at end | Observed outcome |
| --- | ---: | ---: | --- | --- |
| 117.3 s at 1920×1080 | 60.0 | 16.8 ms | 1920×1080 | Midnight Record finished, showed the results and advanced to Fossil Canyon |
| 44.3 s at 3840×2160 | 58.6 | 16.8 ms | 3705×2084 | Prism Aquarium ran for 36.1 seconds after release |

Both runs used an Intel Arc 140T GPU and recorded zero page errors and failed requests. The 4K viewport started at native rendering resolution and used adaptive rendering during the sample. The 1080p timed run preceded the final landmark framing adjustment in Truck Art and Midnight Record. The visual review includes that adjustment. [1080p run](../verification-output/browser-signature-real-1080p/report.json) · [4K run](../verification-output/browser-signature-real-4k/report.json) · [4K race frame](../verification-output/browser-signature-real-4k/race-crystal.png)

The signal check measured an active Web Audio output and at least one marble-to-marble collision event and rolling surface contact on every course. The maximum measured output peak was 0.271 relative to full scale. Nine captures reported at least two rolling materials. Prism used acrylic in the sampled race. Subjective listening and capture or encoding in OBS or Streamlabs remain unverified. [Per-course screenshots and signal reports](../verification-output/signature-browser/)

## Reproduce verification

```sh
npm test
npm run soak:signatures -- --obstacles=original --seeds=postmark-26,nightshift-43,switchback-71,blue-hour-57
npm run soak:signatures -- --obstacles=original --preflight
npm run soak:signatures -- --obstacles=original --reserve
npm run soak:signature-browser
```

Type checking, lint, production build and all 16 automated tests passed.
