const button = document.getElementById("choose");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || new URL(tab.url).origin !== "https://meet.google.com") {
      throw new Error("Open your Google Meet call in this tab first.");
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["picker.js"]
    });
    const [check] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        window.__meetPersonFloatV5?.showPicker();
        return Boolean(document.getElementById("meet-person-float-picker")?.shadowRoot?.querySelector(".panel"));
      }
    });
    if (!check?.result) throw new Error("The picker could not be displayed. Check that the latest extension is loaded, then try again.");
    window.close();
  } catch (error) {
    status.textContent = error.message || "Could not open the picker. Refresh Meet and try again.";
    button.disabled = false;
  }
});
