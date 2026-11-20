# Capture the show

Start the production server as described in the [README](../README.md). In the capture application, use a **Browser** or **Browser Source** pointed at **http://127.0.0.1:4287/**. Bind the server to loopback and run it on the capture computer.

| Capture viewport | Browser Width | Browser Height | Source frame rate |
| --- | ---: | ---: | --- |
| 1080p | 1920 | 1080 | Target 60 FPS |
| 4K | 3840 | 2160 | 30 or 60 FPS according to measured capture performance |

For a native 4K picture, set both the Browser Source and the base canvas to **3840 × 2160**, and use the default High quality. High preserves the source’s physical pixels up to 4K. Match the output resolution to the base canvas for a 4K recording. Select 30 or 60 FPS according to the capture host’s measured frame time. For an adaptive render, append `?quality=medium` to the source URL.

## OBS Studio

1. In **Sources**, add **Browser** and leave **Local file** off. Paste the capture URL. Set **Width** and **Height** from the table. Enable **Use custom frame rate** and set **FPS** to 60 when the capture host can maintain it.
2. Leave **Shutdown source when not visible** unchecked. Checking it unloads the page when you hide the source or change scenes.
3. Leave **Refresh browser source when scene becomes active** unchecked. Checking it loads the page again when the scene becomes active, interrupting an in-progress race.
4. Enable **Control audio via OBS** to route the source into the OBS mixer. The show starts audio automatically when its browser context allows it. If a browser profile requires a gesture, click anywhere once inside the source’s **Interact** window to enable audio for that loaded page.
5. Verify that the source meter responds during countdown and rolling. If you monitor the source, avoid also capturing the monitoring device on another mixer channel. Make a local recording to verify that the game audio appears once and that race graphics fit.

[OBS Browser Source properties](https://obsproject.com/kb/browser-source) · [OBS browser plugin labels](https://github.com/obsproject/obs-browser/blob/master/data/locale/en-US.ini)

## Streamlabs Desktop

1. Add a **Browser Source** and paste the same local URL and dimensions. Streamlabs documents **Shutdown source when not visible** and **Refresh browser when scene becomes active**. Leave both unchecked for continuity. For global capture frame rate, use **Settings → Video → FPS**. Use a per-source 60 FPS override if your installed Browser Source exposes a frame rate setting.
2. Audio starts automatically when the browser permits it. If the mixer stays silent, right-click the source, choose **Interact** and click once inside the show.
3. Verify that the browser audio reaches one mixer input. If your version routes it to the output device, choose that device for **Desktop Audio** on Windows and confirm the meter responds. Use the audio routing available to your installed version on macOS and verify it in a local recording.

[Streamlabs Browser Source interaction and continuity labels](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop) · [Streamlabs video and audio setup](https://streamlabs.com/content-hub/post/quick-start-guide-setting-up-streamlabs-desktop-for-streaming)

## Continuity and audio

- Leave the production server and capture process running. Keep the capture host awake and use a visible, active browser source. OS sleep, browser visibility throttling, and a suspended graphics context can interrupt frame delivery. During a long suspension, the game caps physics catch-up and resolves the current phase at its wall-clock deadline when execution resumes.
- A reload abandons any uncommitted race and starts the next grid. Committed points and championship progress persist for that origin and browser profile. The capture source and a regular Chrome tab can have separate storage. Use one primary browser source per storage profile.
- Audio is enabled by default. Append `?mute=1` to the source URL for a silent broadcast.
- The show streams one bundled recording and prepares the next. Selection, racing, the final quarter and celebration have separate rotations. Copy the bundled attribution into the YouTube description. [Music credits](../public/music/credits.txt)
- Use the plain capture URL for continuity across restarts. For 4K capture, validate timing on the actual host while encoding, as 4K viewport support alone does not establish 4K/60 throughput.
