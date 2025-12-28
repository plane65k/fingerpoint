chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: false });
  console.log('👋 FingerPoint Extension Installed');
});

// We can handle tab updates to ensure the state is consistent, 
// though the content script already checks storage on load.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    chrome.storage.sync.get(['enabled'], (result) => {
      if (result.enabled) {
        chrome.tabs.sendMessage(tabId, { action: 'toggle', enabled: true }).catch(() => {
          // Content script might not be ready yet
        });
      }
    });
  }
});
