document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const statusText = document.getElementById('status-text');

  // Load current state
  chrome.storage.sync.get(['enabled'], (result) => {
    const enabled = result.enabled || false;
    updateUI(enabled);
  });

  toggleBtn.onclick = () => {
    chrome.storage.sync.get(['enabled'], (result) => {
      const newState = !result.enabled;
      chrome.storage.sync.set({ enabled: newState }, () => {
        updateUI(newState);
        sendMessageToTabs(newState);
      });
    });
  };

  function updateUI(enabled) {
    if (enabled) {
      statusText.textContent = 'Enabled';
      statusText.style.color = '#28a745';
      toggleBtn.textContent = 'Disable Control';
      toggleBtn.className = 'toggle-btn btn-off';
    } else {
      statusText.textContent = 'Disabled';
      statusText.style.color = '#dc3545';
      toggleBtn.textContent = 'Enable Control';
      toggleBtn.className = 'toggle-btn btn-on';
    }
  }

  function sendMessageToTabs(enabled) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle', enabled }).catch(err => {
          // Tab might not have content script injected yet or is restricted
          console.log(`Could not send message to tab ${tab.id}: ${err.message}`);
        });
      });
    });
  }
});
