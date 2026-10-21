async function openParticipantList(tab) {
  if (!tab?.id || !tab.url || new URL(tab.url).origin !== "https://meet.google.com") {
    throw new Error("Open your Google Meet tab before using the participant-list shortcut.");
  }
  await chrome.scripting.executeScript({target: {tabId: tab.id}, world: "MAIN", files: ["picker.js"]});
  const [result] = await chrome.scripting.executeScript({
    target: {tabId: tab.id}, world: "MAIN",
    func: () => {
      window.__meetPersonFloatV5?.showPicker();
      return Boolean(document.getElementById("meet-person-float-picker")?.shadowRoot?.querySelector(".panel"));
    }
  });
  if (!result?.result) throw new Error("Chrome could not display the participant list.");
  await chrome.action.setBadgeText({tabId: tab.id, text: ""});
}

async function handleCommand(command, tab) {
  if (command !== "choose-person") return;
  try {
    if (!tab) [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await openParticipantList(tab);
  } catch (error) {
    const target = tab?.id ? {tabId: tab.id} : {};
    await chrome.action.setBadgeText({...target, text: "!"});
    await chrome.action.setTitle({...target, title: error.message});
  }
}
chrome.commands.onCommand.addListener(handleCommand);
