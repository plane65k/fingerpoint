document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const statusText = document.getElementById('status-text');
  const statusIndicator = document.getElementById('status-indicator');
  const cameraStatus = document.getElementById('camera-status');
  const cameraStatusText = document.getElementById('camera-status-text');
  const errorContainer = document.getElementById('error-container');

  // Load current state
  chrome.storage.sync.get(['enabled'], async (result) => {
    const enabled = result.enabled || false;
    await updateCameraStatus();
    updateUI(enabled);
  });

  // Listen for camera status updates from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'cameraConnected') {
      updateCameraStatusUI('connected');
    } else if (request.action === 'cameraError') {
      showError(request.error);
      updateCameraStatusUI('denied');
      // Disable control if camera fails
      chrome.storage.sync.set({ enabled: false });
      updateUI(false);
    }
  });

  toggleBtn.onclick = async () => {
    chrome.storage.sync.get(['enabled'], async (result) => {
      const newState = !result.enabled;
      
      if (newState) {
        // When enabling, request camera permission first
        console.log('🎥 Requesting camera permission from popup...');
        updateCameraStatusUI('pending');
        cameraStatusText.textContent = 'Camera: Requesting...';
        
        try {
          const permResult = await requestCameraPermission();
          
          if (permResult.success) {
            // Permission granted, enable control
            chrome.storage.sync.set({ enabled: true }, () => {
              updateUI(true);
              sendMessageToTabs(true);
            });
          } else {
            // Permission denied
            updateCameraStatusUI('denied');
            cameraStatusText.textContent = `Camera: ${permResult.error}`;
            showError(permResult.error);
            
            // Add retry button if permission was denied
            if (permResult.name === 'NotAllowedError') {
              addRetryButton();
            }
          }
        } catch (err) {
          console.error('❌ Camera permission error:', err);
          updateCameraStatusUI('denied');
          cameraStatusText.textContent = `Camera: ${err.message}`;
          showError(err.message);
        }
      } else {
        // Disable control
        chrome.storage.sync.set({ enabled: false }, () => {
          updateUI(false);
          sendMessageToTabs(false);
        });
      }
    });
  };

  async function requestCameraPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      
      // Stop the test stream since content script will create its own
      stream.getTracks().forEach(track => track.stop());
      
      // Store permission state
      await new Promise((resolve) => {
        chrome.storage.local.set({ cameraPermission: 'granted' }, resolve);
      });
      
      console.log('✅ Camera permission granted');
      return { success: true };
    } catch (err) {
      console.error(`❌ Camera permission denied: ${err.name}`);
      
      // Store permission state
      await new Promise((resolve) => {
        chrome.storage.local.set({ cameraPermission: 'denied' }, resolve);
      });

      // Handle specific error types
      let errorMessage = 'Camera access denied';
      if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera in use by another app';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = 'Permission denied by user';
      }
      
      console.error(`🎥 ${errorMessage}: ${err.message}`);
      return { success: false, error: errorMessage, name: err.name };
    }
  }

  async function updateCameraStatus() {
    // Check stored permission state
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['cameraPermission'], resolve);
    });
    
    if (result.cameraPermission) {
      updateCameraStatusUI(result.cameraPermission);
    } else {
      updateCameraStatusUI('prompt');
    }
  }

  function updateCameraStatusUI(state) {
    cameraStatus.className = 'camera-status ' + state;
    const indicator = cameraStatus.querySelector('.status-indicator');
    
    // Remove all status classes
    indicator.classList.remove('status-connected', 'status-disconnected', 'status-pending', 'status-denied');
    
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
    // Reset stored permission to prompt
    await new Promise((resolve) => {
      chrome.storage.local.set({ cameraPermission: 'prompt' }, resolve);
    });
    
    // Click toggle again to retry
    toggleBtn.click();
  }

  function updateUI(enabled) {
    if (enabled) {
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
