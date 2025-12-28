// Listen for camera request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'requestCamera') return;

  console.log('🎥 Content script received requestCamera message');

  if (!navigator.mediaDevices?.getUserMedia) {
    const message = 'getUserMedia is not available in this context';
    console.error('❌ 🎥 Camera permission error:', message);

    chrome.storage.local.set({ cameraPermission: 'denied' }, () => {
      sendResponse({ success: false, message, errorType: 'NotSupportedError' });
    });

    return true;
  }

  console.log('🎥 Calling getUserMedia()');

  navigator.mediaDevices
    .getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    })
    .then((stream) => {
      console.log('✅ Camera permission GRANTED');
      stream.getTracks().forEach((track) => track.stop());

      chrome.storage.local.set({ cameraPermission: 'granted' }, () => {
        sendResponse({ success: true, message: 'Camera permission granted' });
      });
    })
    .catch((error) => {
      console.error('❌ Camera permission error:', error.name, error.message);

      let message = 'Camera access denied';
      if (error.name === 'NotFoundError') {
        message = 'No camera found';
      } else if (error.name === 'NotReadableError') {
        message = 'Camera in use by another app';
      } else if (error.name === 'NotAllowedError') {
        message = 'Permission denied by user';
      }

      chrome.storage.local.set({ cameraPermission: 'denied' }, () => {
        sendResponse({ success: false, message, errorType: error.name });
      });
    });

  return true;
});

(async () => {
  const GESTURE_CONTROLLER_URL = chrome.runtime.getURL('gesture-controller.js');
  let GestureController;
  try {
    const module = await import(GESTURE_CONTROLLER_URL);
    GestureController = module.GestureController;
  } catch (err) {
    console.error('❌ Failed to load GestureController', err);
    return;
  }

  const state = {
    enabled: false,
    debug: true
  };

  const controller = new GestureController();
  let controllerInitialized = false;

  let cursorEl = null;
  let logEl = null;
  let menuEl = null;
  let cameraBannerEl = null;

  async function waitForBody() {
    if (document.body) return;

    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function initUI() {
    cursorEl = document.createElement('div');
    cursorEl.id = 'fp-cursor';
    document.body.appendChild(cursorEl);

    logEl = document.createElement('div');
    logEl.id = 'fp-log-container';
    document.body.appendChild(logEl);

    menuEl = document.createElement('div');
    menuEl.id = 'fp-hold-menu';
    menuEl.innerHTML = `
      <h2>FingerPoint Menu</h2>
      <div class="menu-buttons">
        <button id="fp-settings-toggle">Toggle Debug Logs</button>
        <button id="fp-close-menu" class="close-btn">Close</button>
      </div>
    `;
    document.body.appendChild(menuEl);

    document.getElementById('fp-close-menu').onclick = () => {
      menuEl.style.display = 'none';
    };
    document.getElementById('fp-settings-toggle').onclick = () => {
      state.debug = !state.debug;
      logEl.style.display = state.enabled && state.debug ? 'block' : 'none';
      log(`🐞 Debug logs: ${state.debug ? 'ON' : 'OFF'}`);
    };

    cameraBannerEl = document.createElement('div');
    cameraBannerEl.id = 'fp-camera-banner';
    cameraBannerEl.innerHTML = `
      <span>📷 Camera Permission Required</span>
      <button id="fp-request-permission">Request Permission</button>
    `;
    cameraBannerEl.style.display = 'none';
    document.body.appendChild(cameraBannerEl);

    document.getElementById('fp-request-permission').onclick = async () => {
      console.log('🎥 User clicked Request Permission banner');

      const result = await controller.requestPermissionAgain();
      if (result.success) {
        cameraBannerEl.style.display = 'none';
        log('✅ Camera permission granted');

        if (state.enabled) {
          await startRuntime();
        }
      } else {
        log(`❌ ${result.error}`);
      }
    };

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    menuEl.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      offset.x = e.clientX - menuEl.offsetLeft;
      offset.y = e.clientY - menuEl.offsetTop;
    };

    document.onmousemove = (e) => {
      if (isDragging) {
        menuEl.style.left = `${e.clientX - offset.x}px`;
        menuEl.style.top = `${e.clientY - offset.y}px`;
        menuEl.style.transform = 'none';
      }
    };

    document.onmouseup = () => {
      isDragging = false;
    };
  }

  function log(msg) {
    console.log(`[FingerPoint] ${msg}`);
    if (!logEl) return;

    const entry = document.createElement('div');
    entry.textContent = `${new Date().toLocaleTimeString().split(' ')[0]} ${msg}`;
    logEl.prepend(entry);
    if (logEl.childNodes.length > 50) logEl.lastChild.remove();
  }

  function updateCursor(x, y) {
    if (!cursorEl) return;
    const px = x * window.innerWidth;
    const py = y * window.innerHeight;
    cursorEl.style.left = `${px}px`;
    cursorEl.style.top = `${py}px`;
    cursorEl.style.display = 'block';
  }

  function simulateClick(x, y) {
    const px = x * window.innerWidth;
    const py = y * window.innerHeight;
    const el = document.elementFromPoint(px, py);
    if (!el) return;

    log(`🖱️ Clicking on: ${el.tagName}`);
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: px,
      clientY: py
    };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function handleScroll(dy) {
    const scrollAmount = dy * window.innerHeight * 2;
    window.scrollBy(0, scrollAmount);
  }

  controller.onGesture = (event) => {
    if (!state.enabled) return;

    switch (event.type) {
      case 'move':
        updateCursor(event.x, event.y);
        break;
      case 'click':
        log('👆 Pinch Click');
        simulateClick(event.x, event.y);
        break;
      case 'long-press':
        log('⚖️ Long Press Menu');
        menuEl.style.display = 'flex';
        break;
      case 'scroll':
        handleScroll(event.dy);
        break;
      case 'no-hand':
        if (cursorEl) cursorEl.style.display = 'none';
        break;
    }
  };

  async function ensureControllerInitialized() {
    if (controllerInitialized) return;
    await controller.init();
    controllerInitialized = true;
  }

  async function startRuntime() {
    if (!state.enabled) return;
    if (document.visibilityState !== 'visible') return;

    try {
      await ensureControllerInitialized();
      await controller.refreshPermissionState();

      if (controller.getPermissionState() !== 'granted') {
        if (cameraBannerEl) cameraBannerEl.style.display = 'flex';

        const error = 'Camera permission required';
        log(`❌ ${error}`);
        state.enabled = false;
        chrome.runtime.sendMessage({ action: 'cameraError', error });
        return;
      }

      await controller.start();
      controller.enable();

      if (cursorEl) cursorEl.style.display = 'block';
      if (logEl) logEl.style.display = state.debug ? 'block' : 'none';
      if (cameraBannerEl) cameraBannerEl.style.display = 'none';

      log('🟢 Control Enabled');
      chrome.runtime.sendMessage({ action: 'cameraConnected' });
    } catch (err) {
      console.error('❌ Failed to start gesture control:', err);
      log(`❌ ${err.message}`);
      state.enabled = false;
      chrome.runtime.sendMessage({ action: 'cameraError', error: err.message });
    }
  }

  function stopRuntime() {
    controller.disable();
    controller.stop();

    if (cursorEl) cursorEl.style.display = 'none';
    if (logEl) logEl.style.display = 'none';
    if (menuEl) menuEl.style.display = 'none';
    if (cameraBannerEl) cameraBannerEl.style.display = 'none';

    log('🔴 Control Disabled');
  }

  async function toggle(enabled) {
    state.enabled = enabled;

    if (enabled) {
      log('🎥 Starting gesture control...');
      await startRuntime();
      return;
    }

    stopRuntime();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      toggle(request.enabled);
      sendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'getStatus') {
      sendResponse({
        enabled: state.enabled,
        cameraStatus: controller.getPermissionState()
      });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!state.enabled) return;

    if (document.visibilityState === 'visible') {
      startRuntime();
    } else {
      controller.disable();
      controller.stop();
      if (cursorEl) cursorEl.style.display = 'none';
      if (logEl) logEl.style.display = 'none';
    }
  });

  window.addEventListener('unload', () => {
    controller.stop();
  });

  await waitForBody();
  initUI();

  chrome.storage.sync.get(['enabled'], (result) => {
    if (result.enabled) {
      state.enabled = true;
      startRuntime();
    }
  });

  log('📡 FingerPoint Content Script Loaded');
})();
