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

## Operator controls

Open **Settings** in the show header or press **O**. Press **Escape** to close the panel. Sound starts by default where the browser permits autoplay. If the browser asks for a gesture, select **Enable sound** or press **A**. Use the browser source’s interaction window when streaming. For a clean feed, hide the Settings button in **Presentation** and reopen the panel with **O**.

| Section | Controls |
| --- | --- |
| Race generation | Automatic random or a repeatable seed, shuffled signature rotation or a specific course, obstacle density, theme and music, roster and entrant count, fixed or random pacing |
| Roster | Six entrants by default, fixed or random identities, and a fixed count or a configurable random range from 4–8 |
| Show timing | Selection, countdown, post-finish grace, celebration, results, and championship scoring |
| Presentation and audio | Render quality, HUD detail, settings button, starting grid announcer, mix, volume and mute |

Each entrant has its own cartoon animal at the starting line. The animal wears the marble’s color and holds its numbered marble while the announcer invites viewers to pick a winner. All the animals throw together on “Go!” Each marble leaves its paw at a different angle and speed, then lands on the track and rolls into the race. A race seed reproduces the cast and throws.

Short selection windows use just the opening question. The voice plays through the show’s effects channel and briefly lowers the background music. To run a voice-free broadcast, turn off **Starting grid announcer** under **Audio**. The bundled recording was rendered with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M).

Automatic random generation creates a new course layout and lane draw each race. The session retains its randomized sequence and points between visits. In **Repeatable seed**, the same seed, settings and race number reproduce the preflight inputs. The pacing target is approximate, with a configurable range of 60–180 seconds. Generation, timing and HUD changes take effect at the next grid. Audio mix, render quality, and Settings button visibility take effect immediately. The championship setting applies at the next scoring commit.

The plain show URL is enough for normal operation. Shared preview links can still load a particular setup for replay and diagnostics. Applying the panel settings saves them in the browser and clears those overrides from the current URL. Use the [plain show URL](http://127.0.0.1:4287/) as your capture source.

The opening shot shows each cartoon host holding a marble and follows the field as they throw. During the race the camera moves closer to a lone leader and pulls back for nearby rivals. It follows the leaders to the checkered stripe, then holds their numbered finish bays as they roll in. All finishers appear on the podium through results. The official clock and standings use the finish-line crossing.

On every signature course and Procedural Classic, **Standard** has three passages wide enough for two marbles side by side. **Extra** has four. Both levels have five descents with uphill exits. Three taper into narrower runs or alternate grip strips before reopening for overtakes. The other two are wide, covered chutes. The first reaches 55–65° on Standard or 66–74° on Extra. The second reaches 80°. Both have a rounded catch and a lined uphill exit that sheds speed before the next turn. Both levels include a round roller, angled fins and a padded swinging gate. Extra pairs hurdles with a recovery straight between stations. The signature courses also have moving sweepers and a banked spiral. **Original layout** selects the earlier track recipe. Reserve courses use the selected obstacle level.

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
