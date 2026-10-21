# Meet Person Float

A personal Chrome extension for Google Meet. Click one person's camera tile to open their video in a movable, resizable, always-on-top window. Keep the call open while you switch tabs, work in other apps, or minimize the main Chrome window.

## Install in your Chrome profile

1. Download this repository using **Code → Download ZIP** and unzip it. Keep the extracted folder somewhere permanent.
2. In the Chrome profile where you use Meet, open `chrome://extensions`.
3. Enable **Developer mode**, then click **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Use Chrome's puzzle-piece menu to pin **Meet Person Float** to the toolbar.

No Web Store publication or Google account sign-in is required for the extension. Loading it installs it in that Chrome profile only; repeat installation for any additional profile you want to use.

### Updating during a call

Version 1.0.1 fixes the picker failing silently when a page enforces Trusted Types. Replace the files in the folder you originally loaded, then click the extension's reload arrow at `chrome://extensions`. Alternatively, remove the old extension and load the freshly extracted folder. Return to the existing Meet tab and click **Choose a person** again. Refreshing the meeting page or leaving the call is not required.

## Use it

1. Join a call at `https://meet.google.com` and make the person's camera tile visible. Pin their tile in Meet to help keep their video available.
2. Click the extension icon → **Choose a person** → **Float this person** on their video.
3. Drag the floating window by its native title bar; drag an edge to resize. Leave the Meet tab open. You can minimize the main Chrome window.
4. To switch people, return to Meet and choose again. Close the floating window to stop viewing it; this does not end your call.

Disable Meet's own **Settings → General → Automatic picture-in-picture** if it replaces this extension's floating window. Chrome permits only one picture-in-picture window at a time.

## Screen sharing and limitations

- This changes your local view. It does not change what other meeting participants see in their own meeting layout.
- A full-display screen share can include the floating window. Share a specific tab or application window if you want to keep it out of the presentation; confirm the sharing preview.
- Desktop Chrome 116+ is required. OS full-screen applications, virtual desktops, and minimizing every application window can affect floating-window visibility. Closing Meet or quitting Chrome closes its floating window.
- The extension follows Meet's participant ID and mirrors only that participant's video tracks. If their tile disappears, identity becomes ambiguous, or the camera is unavailable, it clears the picture and waits. It does not intentionally substitute another speaker.
- Meet must still supply that person's stream. Pinning their tile can help; this extension cannot force Google's servers to deliver a paused stream. Meet's internal page structure may change in future and require an extension update.
- Camera tiles need a `data-participant-id` and one video element per identity. Unsupported or ambiguous tiles are omitted from the picker. Select the person's camera, not their shared screen; camera-off avatars are not supported.

## Privacy

Only `activeTab` and `scripting` permissions are requested. The extension runs on Google Meet when you click its button. It has no analytics, external dependencies, network requests, recording, or persistent participant storage. It shares existing video tracks locally and leaves meeting audio and camera/microphone controls with Meet.

## Verification

Thirteen browser checks passed in Chrome for Testing 153.0.8010.12 on macOS. Tests enforce Trusted Types, use synthetic Meet-shaped participant tiles, and provide real local video streams. They cover extension loading, selection, native picture-in-picture, background/minimized-window survival, stream replacement, identity reuse, disappearing participants, ambiguous identity, disabled cameras, and cleanup. The minimized-window check verifies the floating window remains open with an active stream; it does not prove Google's servers will continue sending a live meeting stream. These fixtures do not establish compatibility with every live Meet rollout. The toolbar permission flow and a live call should be checked after installation.

To run the browser checks, install Node.js, then run:

```sh
npm install
npx playwright install chromium
npm test
```

Tests open a disposable Chrome profile and remove it afterward. On a Linux machine without a desktop session, run `xvfb-run npm test`. Set `CHROME_EXECUTABLE` to use an existing Chrome for Testing binary. No build step or npm installation is needed to use the extension itself.

See [Google's picture-in-picture API documentation](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) and [Meet's own picture-in-picture guide](https://support.google.com/meet/answer/13665919?hl=en).
