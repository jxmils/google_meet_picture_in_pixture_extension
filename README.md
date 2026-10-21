# Meet Person Float

Choose a Google Meet participant from a searchable list and open their video in a movable, resizable, always-on-top window. Version 1.1.0 adds the **1** keyboard picker and **Alt+Shift+1** Chrome shortcut. The floating video uses Chrome's native video picture-in-picture, with no custom header or persistent document-window address bar. Chrome owns its hover controls.

## Install or update

1. Unzip the package and keep the extracted folder somewhere permanent.
2. In the Chrome profile where you use Meet, open `chrome://extensions`.
3. Enable **Developer mode** and choose **Load unpacked**. Select the folder containing `manifest.json`.
4. If updating an existing copy, replace its files and click its reload arrow. Approve the added **meet.google.com** site access if Chrome asks. Alternatively, remove the old copy and load the new folder.
5. Pin **Meet Person Float** through Chrome's puzzle-piece menu if desired.

No extension account or Web Store publication is needed. Installation applies to that Chrome profile.

## Keyboard picker

- On newly opened Meet pages, click the meeting page and press **1** to open the searchable participant list. It does not intercept typing in chat, search boxes, or rich-text editors.
- In a call that was already open when the extension was installed or updated, press **Alt+Shift+1** once, or click the extension → **Choose a person**. This activates the picker in the existing page without refreshing or leaving the call. Plain **1** then works there too.
- Click a person's name or focus their row and press **Enter** to open their floating video. You can also click a highlighted camera tile.
- Press **Esc** or **Cancel** to close the list. Drag the floating video to move it; drag its edges to resize. Keep the Meet tab open while switching tabs, using other apps, or minimizing the main Chrome window.
- Only currently visible camera tiles are listed. Pin a missing person's tile in Meet first. Names are read from Meet's tile labels; if no name can be read, a numbered video label is shown. Repeated tiles for the same participant have a video number to distinguish them.
- If the Chrome shortcut is unassigned or conflicts with another extension, open `chrome://extensions/shortcuts` and assign **Open the Google Meet participant list**. The shortcut works while Chrome has focus. On Mac, Alt means Option.

## If Windows or a work laptop refuses the floating video

The list opens inside the Meet page; it does not require a separate popup. The floating video uses native picture-in-picture. A browser or workplace restriction can still prevent that native window from opening. The extension cannot force Chrome or Windows to allow it and does not change company policies or browser security settings.

When a request is rejected, the list stays available and shows the error name and message, including `NotAllowedError`, `SecurityError`, or `NotSupportedError`. A loading video can be retried after its picture appears. If the error persists on a managed laptop, provide that message to IT so they can check whether that Chrome session allows picture-in-picture. A new selection shortcut cannot override such a restriction.

## Permissions and privacy

API permissions are `activeTab` and `scripting`. Version 1.1.0 also declares site access and an automatic content script **only for `https://meet.google.com/*`**, so the plain **1** shortcut works before clicking the toolbar icon. Chrome may describe that site permission as reading and changing data on Meet. The extension does not run on other websites.

Participant labels stay in the page. There are no analytics, external dependencies, network requests, recording, or persistent participant storage. The extension uses Meet's existing video element without creating duplicate playback or stopping call tracks. Meeting audio and camera/microphone controls remain with Meet. A video's disabled-picture-in-picture hint is temporarily cleared for an explicit selection and restored when the floating video closes. No additional Windows camera, microphone, screen-recording, Accessibility, or administrator permission is requested.

## Limitations

- This changes your local view, not other participants' meeting layouts. Whole-display sharing can include the floating window; choose a tab or specific application window to keep it out of a presentation and confirm the preview.
- Chrome 116+ on desktop is required. OS fullscreen apps, virtual desktops, managed settings, and minimizing every application window can affect visibility. Closing Meet or quitting Chrome closes its floating video.
- The exact selected video element and participant ID are tracked. If it is removed, reassigned to another identity, or has no enabled live video track, the floating video closes instead of following another speaker. Pin the person and choose again if needed.
- Meet must provide the stream. The extension cannot force Google's servers to send a paused video. Meet's internal page structure and participant-label markup may change and require updates.
- Camera tiles need `data-participant-id`. Camera-off avatars and unsupported tiles cannot supply a floating video. Select a camera rather than a shared screen.
- If Meet's own automatic picture-in-picture replaces the chosen video, adjust Meet's **Settings → General → Automatic picture-in-picture**. Chrome permits one picture-in-picture window at a time.

## Verification

Thirty-three browser checks passed in Chrome for Testing 153.0.8010.12 on macOS, using synthetic Meet-shaped tiles and real local video streams under enforced Trusted Types. Checks cover automatic content-script injection, plain **1**, named filtering, keyboard selection, ignoring text input, command registration and the service-worker command handler through real extension APIs, restriction feedback, native video PiP, minimization, duplicate/changed/moving tiles, retries, fullscreen, fallback positioning, and cleanup.

These checks do not establish behavior on the user's managed Windows laptop, Windows OS-level shortcut delivery, the toolbar permission flow, every live Meet rollout, or continued video delivery from Google's servers. The browser shortcut is registered in the test browser; the command handler is invoked through the worker to test its logic and injection separately from OS key delivery.

To run the checks with Node.js:

```sh
npm install
npx playwright install chromium
npm test
```

Tests use and remove a disposable browser profile. On Linux without a desktop, use `xvfb-run npm test`. Set `CHROME_EXECUTABLE` to use an existing Chrome for Testing binary. No Node.js, npm, or build step is needed to use the extension.

References: [Chrome keyboard commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [content-script site access](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts), and [native picture-in-picture](https://developer.chrome.com/blog/watch-video-using-picture-in-picture).
