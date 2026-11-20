# Verification report

Tested on November 19, 2026, on Windows build 10.0.26300 with Node 22.16.0 and Chrome 157.0.8103.79. Chrome reported an Intel Arc 140T GPU through ANGLE and Direct3D 11. Browser tests drove the production build on `http://127.0.0.1:4287/`.

## Build and automated checks

- Installed the pinned dependencies, then repeated installation from the lockfile in a clean directory with `npm ci --offline` and the populated package cache.
- Type checking, ESLint, all 11 Node tests, and the Vite production build passed. The development server also served its transformed entry point over loopback.
- The production browser loaded the app, worker, and fonts from loopback. Both JavaScript bundles embed the Rapier WASM bytes. Python 3.14.5 also served the production HTML and worker from the build directory with HTTP 200. Vite reports the expected bundle-size advisory for these artifacts, and Rapier emits an upstream WASM-initialization deprecation warning.
- The automated tests cover configuration, roster sizes and immutability, simultaneous release, phase deadlines, seeded connectors, physical traversal, legal split-route progress, thin-rail CCD, same-step finish order, bounded recovery, voids, DNF scoring, idempotent commits, cup rollover, and storage failure and resumption.

## Seeded physics

The raw pass simulated 100 distinct generated courses at the default 120-second target using seed roots `zeerush-raw-1` through `zeerush-raw-100`. The test cycled through entrant counts 4–8 and all four themes. It ran the same Rapier solver and adjudication used by the browser. [Raw 100-course JSON](../verification-output/physics-100-120.json)

| Raw course timing | Minimum | Median | 90th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| First finisher | 99.789 s | 110.587 s | 116.850 s | 122.723 s |
| Last legitimate finisher | 104.227 s | 115.840 s | 123.055 s | 127.243 s |
| Race resolution | 107.783 s | 118.433 s | 124.083 s | 130.717 s |

The raw pass recorded 9,360 pairwise position changes, 100 recoveries and 229 DNFs in 600 entries, with zero void races. Both split routes were used in 46 races. Racers traversed every mechanism. Peak allocation per physics world was 49 bodies and 83 colliders. These raw candidates bypassed the production preflight acceptance step.

The production-path pass used seed roots `zeerush-stress-1` through `zeerush-stress-100`, including the same preflight selection and bank substitution as the browser. [Preflight 100-race JSON](../verification-output/physics-100-120-preflight.json)

| Preflight-selected timing | Minimum | Median | 90th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| First finisher | 100.230 s | 111.624 s | 116.982 s | 122.506 s |
| Last legitimate finisher | 105.202 s | 117.640 s | 123.533 s | 127.112 s |
| Race resolution | 106.700 s | 119.500 s | 124.933 s | 128.833 s |

The preflight-selected races recorded 9,627 pairwise position changes, 65 recoveries, 82 DNFs in 600 entries, and zero void races. The finishing window accounted for 81 DNFs. One racer exhausted its recovery allowance. Both branches were used in 42 races. Peak allocation stayed at 49 bodies and 83 colliders. The recorded overtakes count pairwise changes in sampled running order.

| Additional sweep | Races | First finisher range | Last finisher range | Resolution range | Recoveries | DNFs | Voids |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Fallback bank at 120 s](../verification-output/physics-25-120-fallback.json) | 25 | 105.727–118.075 s | 110.917–122.891 s | 113.733–124.350 s | 18 | 51 | 0 |
| [Short target at 60 s](../verification-output/physics-6-60-preflight.json) | 6 | 67.183–77.535 s | 71.547–81.630 s | 71.550–85.533 s | 3 | 4 | 0 |
| [Long target at 180 s](../verification-output/physics-8-180-preflight.json) | 8 | 150.326–164.770 s | 157.204–169.653 s | 157.217–169.667 s | 6 | 7 | 0 |

All five fallback seeds were tested at each entrant count. The bank prioritizes timely recovery and a legitimate finisher. Some trailing racers in the bank missed the finishing window. The short and long targets control course generation, so their measured resolution ranges vary around the settings.

## Unattended 1080p soak

The production show ran for 1,200.328 seconds from navigation at a 1920 × 1080 viewport with the default timings and six marbles. It completed eight races, cycled through all four themes twice, and began the second cup after Orange Spark won the first. It ended on the eighth results screen. The test kept audio gated and delivered zero page errors or failed requests. All seven requested resources returned HTTP 200 from loopback. [Full run JSON](../verification-output/browser-release/report.json)

| Race | Course seed | Winner | First crossing | Last crossing | Resolved | Recoveries | DNFs |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `zeerush/1/2` | Sunny | 111.791 s | 116.749 s | 116.750 s | 1 | 0 |
| 2 | `zeerush/2/1` | Sunny | 111.800 s | 117.682 s | 119.800 s | 0 | 1 |
| 3 | `zeerush/3/0` | Purple Pulse | 116.210 s | 122.002 s | 124.217 s | 1 | 1 |
| 4 | `zeerush/4/1` | Purple Pulse | 111.545 s | 117.565 s | 117.567 s | 1 | 0 |
| 5 | `zeerush/5/3` | Orange Spark | 110.707 s | 118.413 s | 118.700 s | 1 | 1 |
| 6 | `zeerush/6/2` | Green Comet | 110.050 s | 116.987 s | 118.050 s | 1 | 1 |
| 7 | `zeerush/7/0` | Blue Bolt | 107.055 s | 112.555 s | 115.050 s | 0 | 1 |
| 8 | `bank/3` | Red Rocket | 109.241 s | 115.683 s | 115.683 s | 0 | 0 |

The run recorded 1,916 pairwise position changes and zero voids. The eighth course came from the worker's preflight-validated bank. The preparation watchdog made zero substitutions. The phase log measured about 12.015 seconds for each selection, 5.016 for each countdown, 4.949–7.999 for finishing, 8.015 for each celebration, and 5.016 for each complete results screen. The first two finishers in race one were separated by about 0.12 seconds.

After 200 seconds, sampled rolling FPS had a median of 59.14 and a range of 56.82–60.01. The final rolling sample covered 3,600 frames with a mean frame interval of 17.60 ms, a 95th percentile of 16.90 ms, and a maximum of 783.20 ms. The internal buffer ranged from 1785 × 1004 to 1920 × 1080 in phase samples. Those samples showed 47 bodies, 81 colliders, 9–42 geometries, 11–21 textures, and 16–87 draw calls. These are sampled counts for the active show.

## Audio, resizing, and recovery

- A 140.23-second production browser test enabled audio through the operator control and exercised Balanced and ASMR during active racing. It sampled 504 waveform windows from the actual audio graph. The highest peak was 0.294 of full scale. The test exercised countdown, racing, finishing, celebration, results, and music rollover, and observed audio in both presets. [Audio test JSON](../verification-output/browser-audio/report.json)
- A 395.18-second audio-enabled run completed four races and loaded all four arrangements. Across 1,647 waveform windows, the highest peak was 0.369 of full scale. The audio graph maintained eight rolling voices, twelve effect voices, and at most two simultaneous music tracks during theme changes. It reported zero page errors. [Extended audio JSON](../verification-output/browser-audio-long/report.json)
- During that test, the browser resized to a 3840 × 2160 viewport with a matching internal buffer, then returned to 1920 × 1080. A roster edit left six racers active in the current race and produced eight cards and racers in the next lineup. [Eight-marble lineup](../verification-output/browser-audio/grid-rainbow.png)
- A separate production test forced one WebGL context loss and observed one restoration. The race continued through at least 11.15 seconds of simulated action with zero page errors. [Context restoration JSON](../verification-output/browser-restore/report.json)
- With the preflight worker request blocked and local storage forced to throw, the show selected `bank/0` and released all four racers on schedule. A 1280 × 800 browser displayed a 1280 × 720 capture region with operator controls hidden and audio still gated. [Fallback browser JSON](../verification-output/fallback-browser/report.json)
- A separate eight-marble run observed the full on-screen 5–4–3–2–1 sequence and the GO banner. [Countdown browser JSON](../verification-output/countdown-browser.json)
- A 121.32-second browser run at a 3840 × 2160 viewport completed one short-target race. Its final rolling frame sample averaged 22.89 ms (43.70 FPS), with a 50.00 ms 95th percentile. Adaptive rendering started at 3840 × 2160 internally, reached 2419 × 1360 when under load, and finished at 3033 × 1706. It ran concurrently with the 1080p soak and reported zero page errors and failed requests. [4K browser JSON](../verification-output/browser-4k/report.json)

## Visual review

Visual checks used images from the running browser. Iteration fixed the clipped launch sign, poor readability of numbers facing away from the lineup camera, the overlaid podium deck, and the orientation of the progress map.

- [Prepare and operator controls](../verification-output/browser-audio/prepare.png), [starting grid](../verification-output/browser-release/grid-workshop.png), [countdown](../verification-output/browser-release/countdown.png)
- [Overtake](../verification-output/browser-release/overtake.png), [split and merge](../verification-output/browser-release/split-merge.png), [checkpoint recovery](../verification-output/browser-release/recovery.png)
- [Close finish](../verification-output/browser-release/close-finish.png), [podium](../verification-output/browser-release/podium.png), [official results](../verification-output/browser-release/results.png), [next race](../verification-output/browser-release/next-round.png)
- [Wooden Workshop](../verification-output/browser-release/grid-workshop.png), [Rainbow Toy Room](../verification-output/browser-release/grid-rainbow.png), [Crystal Garden](../verification-output/browser-release/grid-crystal.png), [Cozy Night Lights](../verification-output/browser-release/grid-night.png)

## Verification limits

The YouTube watch page and metadata endpoint both returned cache misses in the available browsing environment. Playback could not be inspected. The implementation used the supplied game brief. [Reference watch page](https://www.youtube.com/watch?v=a82LFqLx_hs)

Audio verification measured the rendered Web Audio signal. Subjective listening for the two mixes, track transitions, and repeated collisions remains unverified. OBS Studio and Streamlabs Desktop setup used vendor documentation. End-to-end capture and encoding in those applications, sustained 4K/60, and runs longer than the reported soaks remain unverified.

## Smoothness update

Before-and-after tests used the same eight-marble opening course (`zeerush/1/0`) in headless Chrome on the Intel Arc 140T, with audio and screenshot capture disabled. Each sample covered roughly the first 14 seconds of racing. The 4K tests used adaptive internal resolution. [Raw comparison JSON](../verification-output/smoothness-review.json)

| Capture | Prepare-to-lineup callback | In-race p99 frame interval | In-race frames over 50 ms |
| --- | ---: | ---: | ---: |
| 1080p High, previous build | 931.1 ms | 17.0 ms | 2 of 856 |
| 1080p High, updated build | 59.9 ms | 16.9 ms | 0 of 866 |
| 4K High, previous build | 225.8 ms | 66.7 ms | 22 of 572 |
| 4K High, updated build | 31.2 ms | 16.9 ms | 0 of 864 |
| 4K Medium, updated build | 34.9 ms | 16.9 ms | 0 of 868 |

The updated 1080p test recorded a 101.2 ms warm-up callback during preparation, before the lineup was shown. The 4K High render buffers at the end of the samples were 3302 × 1857 for the previous build and 3167 × 1781 for the update. These short browser samples leave capture-application and sustained 4K performance unmeasured.

A six-marble replay of `zeerush/1/2` produced 83 running-order changes and 11 lead changes when sampling raw order at 12 Hz. The stabilized display applied 22 order changes and 5 lead changes in that replay. The 14 automated tests include near-tie handling and finish ordering, render-scale continuity, and camera path interpolation.

In a separate 1280 × 720 browser test, the previous and updated builds produced identical placements and crossing times for all eight racers on `zeerush/1/0`. The updated build staged the following lineup within one frame of entering its preparation phase, then completed `zeerush/2/3` with eight finishers and zero page errors. [Race comparison JSON](../verification-output/smoothness-races/report.json) · [Second lineup](../verification-output/smoothness-races/second-lineup.png) · [Second results](../verification-output/smoothness-races/second-results.png)

The context-loss test recorded one loss and one restoration during racing, then continued to 13.4 simulated seconds with zero page errors. With the worker request blocked and the parallel shader compile extension hidden, a separate four-marble browser test entered racing on the fallback course `bank/0`. [Context test JSON](../verification-output/browser-smoothness-context/report.json)
