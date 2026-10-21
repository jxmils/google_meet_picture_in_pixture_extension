(() => {
  "use strict";
  if (location.origin !== "https://meet.google.com") return;
  const key = "__meetPersonFloatV3";
  if (window[key]) {
    window[key].showPicker();
    return;
  }
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
    return floating?.stop();
  }

  async function openPerson(id) {
    if (opening) return;
    if (!document.pictureInPictureEnabled) {
      picker.message.textContent = "Chrome's video picture-in-picture is unavailable. Check that picture-in-picture is allowed for Meet.";
      return;
    }
    const matches = videosFor(id);
    const source = matches.length === 1 ? matches[0] : null;
    if (!source || source.readyState < 2 || !source.srcObject?.getVideoTracks().some(track => track.readyState === "live" && track.enabled && !track.muted)) {
      picker.message.textContent = "This person's video is not ready. Make sure their camera is on, pin their tile in Meet, then try again.";
      return;
    }
    opening = true;
    const wasDisabled = source.disablePictureInPicture;
    let cleanup = null;
    try {
      await stopFloating();
      source.disablePictureInPicture = false;
      // Native video PiP has no HTML header or website title bar. Chrome owns its
      // hover controls and window frame. Keep Meet's original element and tracks.
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
        const matches = videosFor(id);
        const tracks = source.srcObject?.getVideoTracks() || [];
        if (!source.isConnected || participant(source) !== id || matches.length !== 1 || matches[0] !== source || !tracks.some(track => track.readyState === "live" && track.enabled && !track.muted)) {
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
      picker.message.textContent = `Could not open the floating video: ${error.message}. Click the person's tile to retry.`;
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
    const style = document.createElement("style");
    style.textContent = `
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
    document.documentElement.append(host);
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
          const label = document.createElement("span");
          label.textContent = "Float this person ↗";
          button.append(label);
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
        ? "Click a highlighted video. Drag the floating video to move it and resize it from an edge. Press Esc to cancel."
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
