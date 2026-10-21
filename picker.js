(() => {
  "use strict";
  if (location.origin !== "https://meet.google.com") return;
  const key = "__meetPersonFloatV1";
  if (window[key]) {
    window[key].showPicker();
    return;
  }

  let picker = null;
  let floating = null;
  let opening = false;

  // Match the selected Meet identity, never the current active speaker or a reused video node.
  function participant(video) {
    return video.closest("[data-participant-id]")?.getAttribute("data-participant-id") || null;
  }

  function videosFor(id) {
    return [...document.querySelectorAll("video")].filter(video => participant(video) === id);
  }

  function dismissPicker() {
    if (!picker) return;
    clearInterval(picker.timer);
    document.removeEventListener("keydown", picker.onKey, true);
    picker.host.remove();
    picker = null;
  }

  function stopFloating() {
    if (floating && !floating.closed) floating.close();
  }

  async function openPerson(id) {
    if (opening) return;
    if (!window.documentPictureInPicture) {
      picker.message.textContent = "This needs desktop Chrome 116 or newer with picture-in-picture enabled.";
      return;
    }
    opening = true;
    try {
      stopFloating();
      // Called directly by the tile click, preserving Chrome's required user gesture.
      const pip = await window.documentPictureInPicture.requestWindow({ width: 384, height: 278 });
      floating = pip;
      dismissPicker();
      const doc = pip.document;
      doc.title = "Selected person · Meet";
      doc.head.innerHTML = `<meta name="color-scheme" content="dark"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; height: 100%; background: #101721; color: #eff5fb; font: 13px system-ui, sans-serif; }
        body { display: flex; flex-direction: column; }
        header { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #192330; gap: 8px; }
        header span { font-size: 12px; font-weight: 600; }
        button { border: 1px solid #506175; border-radius: 6px; background: transparent; color: inherit; padding: 5px 9px; cursor: pointer; }
        main { flex: 1; min-height: 0; position: relative; display: grid; place-items: center; }
        video { width: 100%; height: 100%; object-fit: contain; }
        #status { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; background: #101721; line-height: 1.6; }
        #status[hidden] { display: none; }
      </style>`;
      doc.body.innerHTML = `<header><span>Selected person</span><button type="button">Close</button></header>
        <main><video autoplay muted playsinline aria-label="Selected participant video"></video><div id="status" role="status">Waiting for this person's video…</div></main>`;
      const mirror = doc.querySelector("video");
      mirror.muted = true;
      const status = doc.getElementById("status");
      doc.querySelector("button").addEventListener("click", () => pip.close());
      let currentSource = null;
      let currentTracks = [];
      let disposed = false;

      function unavailable(message) {
        status.textContent = message;
        status.hidden = false;
        if (mirror.srcObject) {
          mirror.srcObject = null;
          mirror.load();
        }
        currentSource = null;
        currentTracks = [];
      }

      function sync() {
        if (disposed) return;
        const matches = videosFor(id);
        if (matches.length !== 1) {
          unavailable(matches.length > 1
            ? "This person has multiple video tiles. Return to Meet and choose again when only their camera tile is visible."
            : "Waiting for this person's video. If needed, return to Meet and pin their tile.");
          return;
        }
        const source = matches[0];
        const stream = source.srcObject;
        const tracks = stream instanceof MediaStream ? stream.getVideoTracks().filter(track => track.readyState === "live") : [];
        if (!tracks.length || tracks.every(track => !track.enabled || track.muted)) {
          unavailable("This person's camera is off or their video is unavailable.");
          return;
        }
        const changed = source !== currentSource || tracks.length !== currentTracks.length || tracks.some((track, i) => track !== currentTracks[i]);
        if (changed) {
          currentSource = source;
          currentTracks = tracks;
          // Share video tracks without moving Meet's element or copying meeting audio.
          mirror.srcObject = new MediaStream(tracks);
          status.textContent = "Connecting to this person's video…";
          status.hidden = false;
          mirror.play().catch(() => {
            if (!disposed) {
              status.textContent = "Click here to resume this person's video.";
              status.hidden = false;
            }
          });
        }
      }

      mirror.addEventListener("playing", () => { status.hidden = true; });
      mirror.addEventListener("waiting", () => { status.textContent = "Waiting for video…"; status.hidden = false; });
      status.addEventListener("click", () => { mirror.play().catch(() => {}); });
      // Run in the visible PiP window, not the backgrounded Meet document.
      const timer = pip.setInterval(sync, 300);
      const observer = new MutationObserver(sync);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-participant-id"] });
      const onPageHide = () => pip.close();
      window.addEventListener("pagehide", onPageHide, { once: true });
      pip.addEventListener("pagehide", () => {
        disposed = true;
        pip.clearInterval(timer);
        observer.disconnect();
        mirror.srcObject = null;
        window.removeEventListener("pagehide", onPageHide);
        if (floating === pip) floating = null;
        // Never stop tracks: Meet owns them and still needs them for the call.
      }, { once: true });
      sync();
    } catch (error) {
      showPicker();
      picker.message.textContent = `Could not open the floating window: ${error.message}. Click the person's tile to retry.`;
    } finally {
      opening = false;
    }
  }

  function showPicker() {
    dismissPicker();
    const host = document.createElement("div");
    host.id = "meet-person-float-picker";
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      * { box-sizing: border-box; font-family: system-ui, sans-serif; }
      .tile { position: fixed; border: 3px solid #99e6c1; border-radius: 12px; background: #102b1d33; color: #fff; cursor: pointer; pointer-events: auto; display: grid; place-items: center; }
      .tile:hover, .tile:focus-visible { background: #102b1d88; outline: 3px solid white; }
      .tile span { background: #10271e; color: #c8ffe4; padding: 11px 16px; border-radius: 9px; font-size: 14px; font-weight: 650; }
      .panel { position: fixed; left: 20px; bottom: 92px; max-width: min(440px, calc(100vw - 40px)); padding: 18px; border: 1px solid #4b6158; border-radius: 14px; background: #14221f; color: white; box-shadow: 0 10px 40px #0008; pointer-events: auto; }
      strong { font-size: 17px; }
      p { margin: 10px 0 14px; font-size: 13px; line-height: 1.5; }
      .panel button { padding: 7px 12px; border: 1px solid #729283; border-radius: 7px; background: transparent; color: white; cursor: pointer; }
    </style><div class="tiles"></div><section class="panel" role="dialog" aria-label="Choose a person">
      <strong>Choose a person to keep in view</strong><p role="status"></p><button type="button">Cancel</button>
    </section>`;
    document.documentElement.append(host);
    const layer = shadow.querySelector(".tiles");
    const message = shadow.querySelector("p");
    const buttons = new Map();
    function refresh() {
      const visible = new Set();
      for (const video of document.querySelectorAll("video")) {
        const id = participant(video);
        const rect = video.getBoundingClientRect();
        if (!id || rect.width < 48 || rect.height < 48 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth || getComputedStyle(video).visibility === "hidden") continue;
        // Ambiguous identities are not safe to follow when Meet rebuilds its layout.
        if (videosFor(id).length !== 1) continue;
        visible.add(video);
        let button = buttons.get(video);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "tile";
          button.innerHTML = "<span>Float this person ↗</span>";
          button.addEventListener("click", () => {
            // Recheck the live identity in case Meet reused the node after rendering the picker.
            if (participant(video) === id && videosFor(id).length === 1) openPerson(id);
            else refresh();
          });
          layer.append(button);
          buttons.set(video, button);
          button.dataset.participant = id;
        } else if (button.dataset.participant !== id) {
          button.remove();
          buttons.delete(video);
          continue;
        }
        Object.assign(button.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [video, button] of buttons) {
        if (!visible.has(video)) { button.remove(); buttons.delete(video); }
      }
      message.textContent = visible.size
        ? "Click a highlighted video. Drag the floating window by its title bar and resize it from an edge. Press Esc to cancel."
        : "No selectable camera tiles found. Join a call, make the person's camera tile visible, and pin it in Meet if needed.";
    }
    const onKey = event => { if (event.key === "Escape") { event.stopPropagation(); dismissPicker(); } };
    document.addEventListener("keydown", onKey, true);
    shadow.querySelector(".panel button").addEventListener("click", dismissPicker);
    picker = { host, message, onKey, timer: setInterval(refresh, 500) };
    refresh();
    shadow.querySelector(".tile, .panel button")?.focus();
  }

  window[key] = { showPicker, stopFloating };
  showPicker();
})();
