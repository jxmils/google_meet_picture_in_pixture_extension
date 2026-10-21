(() => {
  "use strict";
  if (location.origin !== "https://meet.google.com") return;
  const key = "__meetPersonFloatV4";
  if (window[key]) {
    window[key].showPicker();
    return;
  }
  window.__meetPersonFloatV3?.stopFloating();
  window.__meetPersonFloatV1?.stopFloating();
  window.__meetPersonFloatV2?.stopFloating();
  document.getElementById("meet-person-float-picker")?.remove();

  let picker = null;
  let floating = null;
  let opening = false;

  // Match the selected Meet identity, never the current active speaker or a reused video node.
  function participant(video) {
    return video.closest("[data-participant-id]")?.getAttribute("data-participant-id") || null;
  }

  function videoTracks(video) {
    const stream = video.srcObject;
    return stream && typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
  }

  function notice(message) {
    if (!picker) return;
    picker.notice = message;
    picker.message.textContent = message;
  }

  function dismissPicker() {
    if (!picker) return;
    clearInterval(picker.timer);
    window.removeEventListener("resize", picker.refresh);
    document.removeEventListener("scroll", picker.refresh, true);
    document.removeEventListener("keydown", picker.onKey, true);
    picker.host.remove();
    picker = null;
  }

  function stopFloating() {
    return floating?.stop();
  }

  async function openPerson(source, id) {
    if (opening) return;
    if (!document.pictureInPictureEnabled) {
      notice("Chrome's video picture-in-picture is unavailable. Check that picture-in-picture is allowed for Meet.");
      return;
    }
    if (!source.isConnected || participant(source) !== id) {
      notice("Meet changed this video tile. Click the person's current video again.");
      return;
    }
    if (source.readyState < 1 || !videoTracks(source).some(track => track.readyState === "live" && track.enabled)) {
      notice("This person's video is still loading or their camera is off. Wait for their picture, then click again.");
      return;
    }
    if (floating?.source === source && document.pictureInPictureElement === source) {
      dismissPicker();
      return;
    }
    opening = true;
    const wasDisabled = source.disablePictureInPicture;
    let cleanup = null;
    try {
      // Do not await closing the previous window: Chrome replaces it itself.
      // Keep this request in the original click's transient user activation.
      source.disablePictureInPicture = false;
      // Native video PiP has no HTML header or website title bar. Chrome owns its
      // hover controls and window frame. Keep Meet's original element and tracks.
      notice("Opening the floating video…");
      await source.requestPictureInPicture();
      dismissPicker();
      let disposed = false;
      let timer = null;
      let observer = null;
      cleanup = () => {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        observer?.disconnect();
        source.removeEventListener("leavepictureinpicture", cleanup);
        window.removeEventListener("pagehide", stop);
        if (wasDisabled && !source.disablePictureInPicture) source.disablePictureInPicture = true;
        if (floating?.source === source) floating = null;
        // No pause, DOM moves, srcObject writes, or track.stop(): Meet owns playback.
      };
      const stop = () => {
        cleanup();
        if (document.pictureInPictureElement === source) return document.exitPictureInPicture().catch(() => {});
      };
      floating = { source, stop };
      function guardIdentity() {
        const tracks = videoTracks(source);
        if (!source.isConnected || participant(source) !== id || !tracks.some(track => track.readyState === "live" && track.enabled)) {
          // Close rather than accidentally follow a recycled active-speaker tile.
          stop();
        }
      }
      source.addEventListener("leavepictureinpicture", cleanup, { once: true });
      window.addEventListener("pagehide", stop, { once: true });
      observer = new MutationObserver(guardIdentity);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-participant-id"] });
      timer = setInterval(guardIdentity, 300);
      guardIdentity();
    } catch (error) {
      cleanup?.();
      if (wasDisabled) source.disablePictureInPicture = true;
      showPicker();
      const messages = {
        NotAllowedError: "Chrome needs a fresh click to open the floating video. Click 'Float this person' again.",
        InvalidStateError: "This video is still loading. Wait for the person's picture, then click again.",
        SecurityError: "Chrome is blocking picture-in-picture for this page. Check Meet's site permissions."
      };
      notice(messages[error.name] || `Could not open the floating video: ${error.message}. Click the person's tile to retry.`);
    } finally {
      opening = false;
    }
  }

  function showPicker() {
    dismissPicker();
    const host = document.createElement("div");
    host.id = "meet-person-float-picker";
    host.setAttribute("popover", "manual");
    host.style.cssText = "all:initial;position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;background:transparent;overflow:visible;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host::backdrop { background: transparent; pointer-events: none; }
      * { box-sizing: border-box; font-family: system-ui, sans-serif; }
      .tile { position: fixed; border: 3px solid #99e6c1; border-radius: 12px; background: #102b1d33; color: #fff; cursor: pointer; pointer-events: auto; display: grid; place-items: center; }
      .tile:hover, .tile:focus-visible { background: #102b1d88; outline: 3px solid white; }
      .tile span { background: #10271e; color: #c8ffe4; padding: 11px 16px; border-radius: 9px; font-size: 14px; font-weight: 650; }
      .panel { position: fixed; left: 20px; bottom: 92px; max-width: min(440px, calc(100vw - 40px)); padding: 18px; border: 1px solid #4b6158; border-radius: 14px; background: #14221f; color: white; box-shadow: 0 10px 40px #0008; pointer-events: auto; }
      strong { font-size: 17px; }
      p { margin: 10px 0 14px; font-size: 13px; line-height: 1.5; }
      .panel button { padding: 7px 12px; border: 1px solid #729283; border-radius: 7px; background: transparent; color: white; cursor: pointer; }
    `;
    const layer = document.createElement("div");
    layer.className = "tiles";
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Choose a person");
    const title = document.createElement("strong");
    title.textContent = "Choose a person to keep in view";
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    panel.append(title, message, cancel);
    shadow.append(style, layer, panel);
    (document.fullscreenElement || document.documentElement).append(host);
    // A top-layer popover stays above Meet's fullscreen and layered layouts.
    try { host.showPopover(); } catch { host.removeAttribute("popover"); }
    const buttons = new Map();
    let pressed = null;
    function refresh() {
      // Do not replace a pressed button between pointerdown and click.
      if (pressed || picker?.host !== host) return;
      const visible = new Set();
      for (const video of document.querySelectorAll("video")) {
        const id = participant(video);
        const rect = video.getBoundingClientRect();
        if (!id || rect.width < 48 || rect.height < 48 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth || getComputedStyle(video).visibility === "hidden") continue;
        visible.add(video);
        let button = buttons.get(video);
        if (button && button.dataset.participant !== id) {
          button.remove();
          buttons.delete(video);
          button = null;
        }
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "tile";
          const label = document.createElement("span");
          label.textContent = "Float this person ↗";
          button.append(label);
          button.addEventListener("pointerdown", () => { pressed = button; });
          button.addEventListener("pointercancel", () => { pressed = null; refresh(); });
          button.addEventListener("click", event => {
            pressed = null;
            // Open the exact clicked element. Hidden copies and camera/share tiles
            // with the same participant ID must not veto a valid choice.
            const bounds = video.getBoundingClientRect();
            const moved = event.detail > 0 && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
            if (!video.isConnected || participant(video) !== id || moved) {
              notice("Meet changed this video tile. Click the person's current video again.");
              refresh();
              return;
            }
            openPerson(video, id);
          });
          layer.append(button);
          buttons.set(video, button);
          button.dataset.participant = id;
        }
        Object.assign(button.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [video, button] of buttons) {
        if (!visible.has(video)) { button.remove(); buttons.delete(video); }
      }
      if (picker.notice) return;
      message.textContent = visible.size
        ? "Click a highlighted video. Drag the floating video to move it and resize it from an edge. Press Esc to cancel."
        : "No selectable camera tiles found. Join a call, make the person's camera tile visible, and pin it in Meet if needed.";
    }
    const onKey = event => { if (event.key === "Escape") { event.stopPropagation(); dismissPicker(); } };
    document.addEventListener("keydown", onKey, true);
    shadow.querySelector(".panel button").addEventListener("click", dismissPicker);
    const releasePress = () => setTimeout(() => { pressed = null; refresh(); }, 0);
    host.addEventListener("pointerup", releasePress);
    window.addEventListener("resize", refresh);
    document.addEventListener("scroll", refresh, true);
    picker = { host, message, onKey, refresh, notice: null, timer: setInterval(refresh, 150) };
    refresh();
    shadow.querySelector(".tile, .panel button")?.focus();
  }

  window[key] = { showPicker, stopFloating, dismissPicker };
  showPicker();
})();
