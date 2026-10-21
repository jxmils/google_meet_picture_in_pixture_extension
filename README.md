# Meet Person Float

A personal Chrome extension for Google Meet. Choose one person's camera tile and open it in a movable, resizable, always-on-top video window. Version 1.0.3 uses Chrome's native **video** picture-in-picture: no custom header, browser tabs, address bar, or persistent `meet.google.com` document-window header. Chrome controls may appear when you hover; extensions cannot style or permanently hide browser-owned controls.

## Install in your Chrome profile

1. Download this repository using **Code → Download ZIP** and unzip it. Keep the extracted folder somewhere permanent.
2. In the Chrome profile where you use Meet, open `chrome://extensions`.
3. Enable **Developer mode**, then click **Load unpacked**.
4. Select the extracted folder containing `manifest.json`.
5. Use Chrome's puzzle-piece menu to pin **Meet Person Float** to the toolbar.

No Web Store publication or Google account sign-in is required for the extension. Loading it installs it in that Chrome profile only; repeat installation for any additional profile you want to use.

### Updating during a call

Replace the files in the folder you originally loaded, then click the extension's reload arrow at `chrome://extensions`. Alternatively, remove the old extension and load the freshly extracted folder. Return to your existing Meet tab, click **Choose a person**, and select their video again. Refreshing the meeting page or leaving the call is not required.

## Use it

1. Join a call at `https://meet.google.com` and make the person's camera tile visible. Pin their tile in Meet to help keep their video available.
2. Click the extension icon → **Choose a person** → **Float this person** on their video.
3. Drag the floating video to move it; drag an edge to resize. Leave the Meet tab open. You can switch tabs, work in another app, or minimize the main Chrome window.
4. To switch people, return to Meet and choose again. Chrome's native close control stops floating the video without ending your call.

Disable Meet's own **Settings → General → Automatic picture-in-picture** if it replaces this extension's floating video. Chrome permits only one picture-in-picture window at a time.

## Screen sharing and limitations

- This changes your local view. It does not change other participants' own meeting layouts.
- A full-display screen share can include the floating video. Share a specific tab or application window if you want to keep it out of the presentation; confirm the sharing preview.
- The native video window has no persistent document header. Chrome owns its hover controls, borders, placement, and resize behavior; the extension cannot remove every browser or OS affordance.
- Desktop Chrome 116+ is required. OS full-screen apps, virtual desktops, and minimizing every application window can affect visibility. Closing Meet or quitting Chrome closes its floating video.
- The extension follows the exact video tile you clicked and checks its participant identity. Hidden copies or other tiles for the same participant do not prevent selection. If the original video tile disappears, is reassigned to another identity, or has no enabled live video track, the floating video closes. It does not automatically substitute another speaker or reopen itself. Pin the person's tile and choose them again if needed.
- Meet must still supply that person's stream. The extension cannot force Google's servers to deliver a paused stream. Meet's internal page structure may change in future and require an extension update.
- Camera tiles need a `data-participant-id`. Unsupported tiles are omitted from the picker. Select the person's camera, not their shared screen; camera-off avatars are not supported.

## Privacy

Only `activeTab` and `scripting` permissions are requested. The extension runs on Google Meet when you click its button. It has no analytics, external dependencies, network requests, recording, or persistent participant storage. It uses Meet's existing video element without creating additional playback or stopping meeting tracks. Meeting audio and camera/microphone controls remain with Meet. A video's disabled-picture-in-picture hint is temporarily cleared for your explicit selection and restored when the floating video closes.

## Verification

Twenty-four browser checks passed in Chrome for Testing 153.0.8010.12 on macOS. Tests enforce Trusted Types, use synthetic Meet-shaped participant tiles, and provide real local video streams. They cover native video PiP, minimization, identity changes, hidden/visible duplicate tiles, readiness and persistent error feedback, retrying rejected requests, temporary track mutes, switching without an exit wait, layout changes during clicks, fullscreen selection, top-layer fallback, and cleanup. The hidden-duplicate regression fails against version 1.0.2 and passes against version 1.0.3. The minimized-window check verifies native PiP remains active with a live source; it does not prove Google's servers will continue sending a live meeting stream. The toolbar permission flow and current live Meet rollout still need a live-call check after installation.

To run the browser checks, install Node.js, then run:

```sh
npm install
npx playwright install chromium
npm test
```

Tests open a disposable Chrome profile and remove it afterward. On a Linux machine without a desktop session, run `xvfb-run npm test`. Set `CHROME_EXECUTABLE` to use an existing Chrome for Testing binary. No build step or npm installation is needed to use the extension itself.

Version 1.0.1 fixed the picker failing silently under Trusted Types enforcement. Version 1.0.2 preserved that fix and replaced the document window with native video PiP. Version 1.0.3 fixes intermittent selection: it requests PiP directly within the click, follows the exact video element, keeps errors visible for retry, and protects selection during layout changes and fullscreen use.

See the [Picture-in-Picture specification](https://www.w3.org/TR/picture-in-picture/) and [Meet's picture-in-picture guide](https://support.google.com/meet/answer/13665919?hl=en).
