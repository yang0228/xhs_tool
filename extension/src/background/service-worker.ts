/// <reference types="chrome" />

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Listen for messages from side panel and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle messages here as needed
  // For now, most communication is direct between sidepanel and content scripts

  if (message.type === "SCRAPE_PAGE") {
    // Forward to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        sendResponse(response);
      });
    });
    return true; // Keep channel open for async response
  }

  return false;
});

// On install, set default settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["settings"], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          backendUrl: "http://localhost:8000/api",
          aiModel: "claude-sonnet-4-20250514",
        },
      });
    }
  });
});

console.log("XHS Tool service worker started");
