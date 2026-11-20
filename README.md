# ZeeRush Marble Race Show

An autonomous 3D tabletop marble championship for a local browser source. Pick a color and number during the lineup, watch the gate drop, then follow the race through the podium and results. The show shuffles all ten signature courses before starting each new cycle. [Course previews and verification](docs/signature-tracks.md)

## Run the show

Use Node.js **22.12 or later**, npm, and a browser with WebGL 2. The build includes the fonts, the Rapier WASM engine, and the original visual and sound generators.

**Windows PowerShell**

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run serve
```

**Linux and macOS**

```sh
npm ci
npm run build
npm run serve
```

Open **[http://127.0.0.1:4287/](http://127.0.0.1:4287/)**. Keep the server running while capturing the show. The port is intentionally fixed so that the browser source retains its URL and browser storage.

The Windows workspace also contains the portable Node and npm tools used for verification. If Node is absent from your PowerShell PATH, serve the included [production build](dist/index.html) with these commands.

```powershell
$env:Path = "$(Resolve-Path '.tooling/node/bin');$env:Path"
node .tooling/npm/bin/npm-cli.js run serve
```

Any HTTP server can serve `dist` at its document root. With Python 3 installed, use the following command.

```sh
python -m http.server 4287 --bind 127.0.0.1 --directory dist
```

On Windows, `py` can replace `python` when the launcher detects an installed Python interpreter.

## Broadcast URL options

The plain show URL runs unattended with six marbles, sound on and native-resolution High quality. Set any of these six options in the browser source URL and reload it to start the next grid with that setup.

| URL option | Values | Default |
| --- | --- | --- |
| `track` | `rotate`, `classic`, or a [signature course ID](docs/signature-tracks.md) | `rotate` shuffles the ten signature courses |
| `marbles` | An integer from 4 to 8, or `random` to draw a new roster and count each round | `6` |
| `raceTarget` | Approximate winner time in seconds from 60 to 180, or `random` for a new 90–140 second target each round | `120` |
| `seed` | Text for a repeatable sequence of layouts, lane draws and throws | The session gets a random seed and each round gets a new layout |
| `quality` | `high` for native pixels up to 3840 × 2160, `medium` for adaptive resolution, or `low` for a lighter render | `high` |
| `mute` | `1` for silence or `0` for music, the announcer and race sounds | `0` |

For example, run [Cedar Creek with eight marbles in High quality](http://127.0.0.1:4287/?track=cedar-creek&marbles=8&quality=high) or [rotate courses with a random roster and pace](http://127.0.0.1:4287/?marbles=random&raceTarget=random). Championship points and the round number persist across reloads.

At the grid, each cartoon animal holds its own numbered marble as the announcer invites viewers to pick a winner. All the animals release together on “Go!” Their wind-ups determine each marble’s launch angle, speed and spin. Each animal reacts to its own marble’s first landing. Music lowers under the invitation. [Announcer voice model](https://huggingface.co/hexgrad/Kokoro-82M)

The camera follows close battles and steep drops, then pulls back to show chasing marbles and track landmarks. After the first arrival it can follow the remaining field and return for the next crossing. Finishers roll into individual bays. The ceremony and results show every entrant, with the first three finishers on the podium and a front row for the rest. The official standings use the crossing times. A marble that misses the finishing window appears as DNF.

On every signature course and Procedural Classic, **Standard** has three passages wide enough for two marbles side by side. **Extra** has four. Both levels have five descents with uphill exits. Three taper into narrower runs or alternate grip strips before reopening for overtakes. The other two are wide, covered chutes. The first reaches 55–65° on Standard or 66–74° on Extra. The second reaches 80°. Both have a rounded catch and a lined uphill exit that sheds speed before the next turn. Both levels include a round roller, angled fins and a padded swinging gate. Extra pairs hurdles with a recovery straight between stations. The signature courses also have moving sweepers and a banked spiral. The broadcast uses Standard obstacles.

## Development and verification

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run serve
npm run soak -- 100 zeerush-raw 120
npm run soak:signatures -- --seeds=postmark-26,nightshift-43,switchback-71,blue-hour-57
npm run soak:signatures -- --preflight
npm run soak:signatures -- --reserve
npm run soak:signature-browser
npm run soak -- 100 zeerush-stress 120 --preflight
npm run soak -- 25 zeerush-fallback 120 --fallback
npm run soak:browser -- 1200 clean
npm run soak:browser -- 140 audio
npm run soak:browser -- 34 restore
```

Use `npm.cmd` in PowerShell. Browser tests require a Chromium installation and a running production server. Set `ZEERUSH_CHROME` to its executable path when automatic detection does not find it. Set `ZEERUSH_CAPTURE_URL` to override the loopback address. JSON reports and screenshots go to `verification-output/`.

- [OBS Studio and Streamlabs Desktop setup](docs/streaming.md)
- [Architecture and tuning](docs/architecture.md)
- [Assets and dependency licenses](docs/licenses.md)
- [Verification results](docs/verification.md)
