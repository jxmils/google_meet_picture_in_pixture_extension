(() => {
  "use strict";
  if (location.origin !== "https://meet.google.com") return;
  const key = "__meetPersonFloatV5";
  if (window[key]) return;
  window.__meetPersonFloatV4?.dismissPicker();
  window.__meetPersonFloatV4?.stopFloating();
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
      notice("Chrome has picture-in-picture disabled or unavailable for this page. The list can open, but the extension cannot override browser or workplace restrictions. On a managed laptop, ask IT to check picture-in-picture availability.");
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
        SecurityError: "Chrome is blocking picture-in-picture for this page. This extension cannot override that restriction. On a managed laptop, ask IT to check it.",
        NotSupportedError: "This Chrome session does not support floating video, or the feature is disabled. On a managed laptop, ask IT to check picture-in-picture availability."
      };
      notice(`${messages[error.name] || "Chrome could not open the floating video. Try selecting the person again."} (${error.name}: ${error.message})`);
    } finally {
      opening = false;
    }
  }

  function nameFor(video, index) {
    const tile = video.closest("[data-participant-id]");
    const nodes = [tile, tile?.querySelector("[data-participant-name]"), tile?.querySelector("[data-self-name]")];
    for (const node of nodes) {
      if (!node) continue;
      for (const attr of ["data-participant-name", "data-self-name"]) {
        const value = node.getAttribute(attr)?.trim();
        if (value && !/^(true|false)$/i.test(value)) return value.slice(0, 100);
      }
    }
    // Meet does not publish a stable name API. Read the tile's visible label,
    // excluding video and control text, without changing the live call DOM.
    if (tile) {
      const copy = tile.cloneNode(true);
      copy.querySelectorAll("video, canvas, button, svg, [role=button], [aria-hidden=true]").forEach(node => node.remove());
      const label = copy.textContent.replace(/\b(mic_off|mic|more_vert|keep|push_pin|volume_off|videocam_off)\b/g, " ").replace(/\s+/g, " ").trim();
      if (label) return label.slice(0, 100);
    }
    return `Video ${index + 1}`;
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
      .panel { position: fixed; right: 20px; top: 20px; width: 350px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px); overflow: auto; padding: 18px; border: 1px solid #4b6158; border-radius: 14px; background: #14221f; color: white; box-shadow: 0 10px 40px #0008; pointer-events: auto; }
      strong { font-size: 17px; }
      p { margin: 10px 0 14px; font-size: 13px; line-height: 1.5; }
      .panel button { padding: 9px 12px; border: 1px solid #729283; border-radius: 7px; background: transparent; color: white; cursor: pointer; }
      input { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 7px; border: 1px solid #729283; background: #0e1916; color: white; font-size: 14px; }
      .people { display: grid; gap: 7px; max-height: 40vh; overflow: auto; margin-bottom: 12px; }
      .person { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; }
      .person:hover, .person:focus-visible { background: #28483c; }
      .person[hidden] { display: none; }
      .state { color: #b4d2c4; font-size: 11px; flex: none; }
      .help { color: #bad3c6; font-size: 11px; }
    `;
    const layer = document.createElement("div");
    layer.className = "tiles";
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Choose a person");
    const title = document.createElement("strong");
    title.textContent = "Choose a person";
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Find a person";
    search.setAttribute("aria-label", "Find a person");
    const people = document.createElement("div");
    people.className = "people";
    people.setAttribute("role", "group");
    people.setAttribute("aria-label", "Available participant videos");
    const help = document.createElement("p");
    help.className = "help";
    help.textContent = "1 opens this list. Esc closes it. Only camera tiles currently visible in Meet are listed; pin a missing person's tile in Meet first.";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    panel.append(title, message, search, people, help, cancel);
    shadow.append(style, layer, panel);
    (document.fullscreenElement || document.documentElement).append(host);
    try { host.showPopover(); } catch { host.removeAttribute("popover"); }
    const choices = new Map();
    let pressed = null;

    function bindChoice(button, video, id, checkPosition) {
      button.type = "button";
      button.dataset.participant = id;
      button.addEventListener("pointerdown", () => { pressed = button; });
      button.addEventListener("pointercancel", () => { pressed = null; refresh(); });
      button.addEventListener("click", event => {
        pressed = null;
        const bounds = video.getBoundingClientRect();
        const moved = checkPosition && event.detail > 0 && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
        if (!video.isConnected || participant(video) !== id || moved) {
          notice("Meet changed this video tile. Choose the person's current video again.");
          refresh();
          return;
        }
        openPerson(video, id);
      });
    }

    function refresh() {
      if (pressed || picker?.host !== host) return;
      const visible = new Set();
      const counts = new Map();
      const videos = [...document.querySelectorAll("video")];
      let matching = 0;
      for (const [index, video] of videos.entries()) {
        const id = participant(video);
        const rect = video.getBoundingClientRect();
        if (!id || rect.width < 48 || rect.height < 48 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth || getComputedStyle(video).visibility === "hidden") continue;
        visible.add(video);
        const number = (counts.get(id) || 0) + 1;
        counts.set(id, number);
        let choice = choices.get(video);
        if (choice && choice.id !== id) {
          choice.overlay.remove(); choice.row.remove(); choices.delete(video); choice = null;
        }
        if (!choice) {
          const overlay = document.createElement("button");
          overlay.className = "tile";
          const caption = document.createElement("span");
          caption.textContent = "Float this person ↗";
          overlay.append(caption);
          const row = document.createElement("button");
          row.className = "person";
          const label = document.createElement("span");
          const state = document.createElement("span");
          state.className = "state";
          row.append(label, state);
          bindChoice(overlay, video, id, true);
          bindChoice(row, video, id, false);
          layer.append(overlay); people.append(row);
          choice = { id, overlay, row, label, state, name: "", updated: 0 };
          choices.set(video, choice);
        }
        if (Date.now() - choice.updated > 1000) {
          choice.name = nameFor(video, index);
          choice.updated = Date.now();
        }
        const label = choice.name + (number > 1 ? ` · Video ${number}` : "");
        choice.label.textContent = label;
        choice.row.setAttribute("aria-label", `Float ${label}`);
        choice.state.textContent = video.readyState >= 1 && videoTracks(video).some(track => track.readyState === "live" && track.enabled) ? "Ready" : "Loading / camera off";
        choice.row.hidden = !label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
        if (!choice.row.hidden) matching++;
        Object.assign(choice.overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [video, choice] of choices) {
        if (!visible.has(video)) { choice.overlay.remove(); choice.row.remove(); choices.delete(video); }
      }
      if (picker.notice) return;
      message.textContent = !visible.size ? "No camera tiles found. Join the call and pin the person you want in Meet." : !matching ? "No matching visible videos. Try another name." : "Click a name below or a highlighted video to float it.";
    }
    const onKey = event => { if (event.key === "Escape") { event.stopPropagation(); dismissPicker(); } };
    document.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", dismissPicker);
    search.addEventListener("input", refresh);
    host.addEventListener("pointerup", () => setTimeout(() => { pressed = null; refresh(); }, 0));
    window.addEventListener("resize", refresh);
    document.addEventListener("scroll", refresh, true);
    picker = { host, message, onKey, refresh, notice: null, timer: setInterval(refresh, 150) };
    refresh();
    search.focus();
  }

  function onShortcut(event) {
    if (event.key !== "1" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing) return;
    if (event.composedPath().some(node => node instanceof Element && (node.matches("input, textarea, select, [role=textbox]") || node.isContentEditable))) return;
    event.preventDefault();
    event.stopPropagation();
    showPicker();
  }
  document.addEventListener("keydown", onShortcut, true);
  const destroy = () => {
    dismissPicker(); stopFloating();
    document.removeEventListener("keydown", onShortcut, true);
    delete window[key];
  };
  window[key] = { showPicker, stopFloating, dismissPicker, destroy };
})();
