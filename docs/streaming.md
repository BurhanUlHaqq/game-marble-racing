# Capture the show

Start the production server as described in the [README](../README.md). In the capture application, use a **Browser** or **Browser Source** pointed at **http://127.0.0.1:4287/**. Bind the server to loopback and run it on the capture computer.

| Capture viewport | Browser Width | Browser Height | Source frame rate |
| --- | ---: | ---: | --- |
| 1080p | 1920 | 1080 | Target 60 FPS |
| 4K | 3840 | 2160 | Target 60 FPS on hardware tested at this viewport |

Match the scene's base canvas to the source dimensions and fit the source to the canvas. If frame time is high, open **Settings** and change **Quality** to **Medium** or **Low**, then measure again. A 30 FPS source is also usable. Capture dimensions describe the output frame. Internal resolution is the WebGL buffer size, which adapts to rendering cost. Actual FPS is measured independently in the settings panel.

## OBS Studio

1. In **Sources**, add **Browser** and leave **Local file** off. Paste the capture URL. Set **Width** and **Height** from the table. Enable **Use custom frame rate** and set **FPS** to 60 when the capture host can maintain it.
2. Leave **Shutdown source when not visible** unchecked. Checking it unloads the page when you hide the source or change scenes.
3. Leave **Refresh browser source when scene becomes active** unchecked. Checking it loads the page again when the scene becomes active, interrupting an in-progress race.
4. Enable **Control audio via OBS** to route the source into the OBS mixer. The show starts audio automatically when its browser context allows it. If it shows **Enable sound**, use the source’s **Interact** window to click that button or press **A**. The same loaded source must remain active for that gesture to persist.
5. Verify that the source meter responds during countdown and rolling. If you monitor the source, avoid also capturing the monitoring device on another mixer channel. Make a local recording to verify that the game audio appears once and that race graphics fit.

[OBS Browser Source properties](https://obsproject.com/kb/browser-source) · [OBS browser plugin labels](https://github.com/obsproject/obs-browser/blob/master/data/locale/en-US.ini)

## Streamlabs Desktop

1. Add a **Browser Source** and paste the same local URL and dimensions. Streamlabs documents **Shutdown source when not visible** and **Refresh browser when scene becomes active**. Leave both unchecked for continuity. For global capture frame rate, use **Settings → Video → FPS**. Use a per-source 60 FPS override if your installed Browser Source exposes a frame rate setting.
2. If the source shows **Enable sound**, right-click it and choose **Interact**. Click **Enable sound** or press **A**.
3. Verify that the browser audio reaches one mixer input. If your version routes it to the output device, choose that device for **Desktop Audio** on Windows and confirm the meter responds. Use the audio routing available to your installed version on macOS and verify it in a local recording.

[Streamlabs Browser Source interaction and continuity labels](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop) · [Streamlabs video and audio setup](https://streamlabs.com/content-hub/post/quick-start-guide-setting-up-streamlabs-desktop-for-streaming)

## Continuity and audio

- Leave the production server and capture process running. Keep the capture host awake and use a visible, active browser source. OS sleep, browser visibility throttling, and a suspended graphics context can interrupt frame delivery. During a long suspension, the game caps physics catch-up and resolves the current phase at its wall-clock deadline when execution resumes.
- A reload abandons any uncommitted race and starts the next grid. Committed points and championship progress persist for that origin and browser profile. The capture source and a regular Chrome tab can have separate storage. Use one primary browser source per storage profile.
- The show advances while audio is disabled. The **Balanced** preset mixes music under the action. **ASMR** lowers music during races and leaves the rolling, contact, and mechanism sounds prominent. Check both at the capture application's output level.
- The default soundtrack streams one local recording and prepares one upcoming cue. Selection, racing, the final quarter and celebration have separate rotations. Open **Show settings → Music library and credits** for the full YouTube attribution before going live. **Download played-track credits** exports the titles heard since the show was opened. **Original synthesized score** is also available in the soundtrack selector. [Music credits](../public/music/credits.txt)
- Use the plain capture URL for continuity across restarts. For 4K capture, validate timing on the actual host while encoding, as 4K viewport support alone does not establish 4K/60 throughput.
