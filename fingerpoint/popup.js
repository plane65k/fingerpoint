document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const statusText = document.getElementById('status-text');
  const statusIndicator = document.getElementById('status-indicator');
  const cameraStatus = document.getElementById('camera-status');
  const cameraStatusText = document.getElementById('camera-status-text');
  const errorContainer = document.getElementById('error-container');

  const getSync = (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
  const setSync = (obj) => new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
  const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const setLocal = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

  const queryTabs = (query) => new Promise((resolve) => chrome.tabs.query(query, resolve));

  const sendMessageToTab = (tabId, message) =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });

  // Load current state
  const { enabled = false } = await getSync(['enabled']);
  await updateCameraStatus();
  updateUI(enabled);

  // Listen for camera status updates from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'cameraConnected') {
      updateCameraStatusUI('connected');
      clearError();
    } else if (request.action === 'cameraError') {
      showError(request.error);
      updateCameraStatusUI('denied');

      setSync({ enabled: false }).then(() => {
        updateUI(false);
      });
    }
  });

  toggleBtn.onclick = async () => {
    const result = await getSync(['enabled']);
    const newState = !result.enabled;

    clearError();

    if (newState) {
      console.log('🎥 User clicked Enable Control');
      updateCameraStatusUI('pending');
      cameraStatusText.textContent = 'Camera: Requesting...';

      try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        console.log('🎥 Sending requestCamera message to tab', tab.id);

        const permResult = await sendMessageToTab(tab.id, { action: 'requestCamera' });

        if (permResult?.success) {
          console.log('✅ Camera granted, enabling gestures');

          await setSync({ enabled: true });
          updateUI(true);
          updateCameraStatusUI('connected');
          sendToggleToTabs(true);
        } else {
          const message = permResult?.message || 'Camera permission denied or unavailable';
          console.error('❌ Camera permission denied or error:', message);

          updateCameraStatusUI('denied');
          cameraStatusText.textContent = `Camera: ${message}`;
          showError(message);

          if (permResult?.errorType === 'NotAllowedError') {
            addRetryButton();
          }

          await setSync({ enabled: false });
          updateUI(false);
        }
      } catch (err) {
        console.error('❌ Camera permission request failed:', err);

        updateCameraStatusUI('denied');
        cameraStatusText.textContent = `Camera: ${err.message}`;
        showError(err.message);

        await setSync({ enabled: false });
        updateUI(false);
      }
    } else {
      await setSync({ enabled: false });
      updateUI(false);
      sendToggleToTabs(false);
    }
  };

  async function updateCameraStatus() {
    const result = await getLocal(['cameraPermission']);

    if (result.cameraPermission) {
      updateCameraStatusUI(result.cameraPermission);
    } else {
      updateCameraStatusUI('prompt');
    }
  }

  function updateCameraStatusUI(state) {
    cameraStatus.className = 'camera-status ' + state;
    const indicator = cameraStatus.querySelector('.status-indicator');

    indicator.classList.remove(
      'status-connected',
      'status-disconnected',
      'status-pending',
      'status-denied'
    );

    switch (state) {
      case 'granted':
      case 'connected':
        indicator.classList.add('status-connected');
        cameraStatusText.textContent = 'Camera: Connected ✓';
        break;
      case 'denied':
        indicator.classList.add('status-denied');
        cameraStatusText.textContent = 'Camera: Denied ✗';
        break;
      case 'prompt':
      case 'pending':
        indicator.classList.add('status-pending');
        cameraStatusText.textContent = 'Camera: Checking...';
        break;
      default:
        indicator.classList.add('status-disconnected');
        cameraStatusText.textContent = 'Camera: ' + state;
    }
  }

  function showError(message) {
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
  }

  function clearError() {
    errorContainer.innerHTML = '';
  }

  function addRetryButton() {
    const btn = document.createElement('button');
    btn.className = 'permission-btn';
    btn.textContent = 'Request Permission Again';
    btn.onclick = async () => {
      btn.remove();
      await resetPermissionAndRetry();
    };
    errorContainer.appendChild(btn);
  }

  async function resetPermissionAndRetry() {
    await setLocal({ cameraPermission: 'prompt' });
    toggleBtn.click();
  }

  function updateUI(isEnabled) {
    if (isEnabled) {
      statusText.textContent = 'Enabled';
      statusText.style.color = '#28a745';
      statusIndicator.className = 'status-indicator status-connected';
      toggleBtn.textContent = 'Disable Control';
      toggleBtn.className = 'toggle-btn btn-off';
    } else {
      statusText.textContent = 'Disabled';
      statusText.style.color = '#dc3545';
      statusIndicator.className = 'status-indicator status-disconnected';
      toggleBtn.textContent = 'Enable Control';
      toggleBtn.className = 'toggle-btn btn-on';
    }
  }

  function sendToggleToTabs(isEnabled) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle', enabled: isEnabled }, () => {
          // Ignore tabs that can't receive messages (chrome://, webstore, etc.)
          if (chrome.runtime.lastError) return;
        });
      });
    });
  }
});
