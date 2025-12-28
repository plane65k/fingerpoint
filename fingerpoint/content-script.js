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

  let controller = new GestureController();
  let cursorEl = null;
  let logEl = null;
  let menuEl = null;

  function initUI() {
    // Cursor
    cursorEl = document.createElement('div');
    cursorEl.id = 'fp-cursor';
    document.body.appendChild(cursorEl);

    // Logs
    logEl = document.createElement('div');
    logEl.id = 'fp-log-container';
    document.body.appendChild(logEl);

    // Hold Menu
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
      logEl.style.display = (state.enabled && state.debug) ? 'block' : 'none';
      log(`🐞 Debug logs: ${state.debug ? 'ON' : 'OFF'}`);
    };

    // Make menu draggable
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
    if (logEl) {
      const entry = document.createElement('div');
      entry.textContent = `${new Date().toLocaleTimeString().split(' ')[0]} ${msg}`;
      logEl.prepend(entry);
      if (logEl.childNodes.length > 50) logEl.lastChild.remove();
    }
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
    if (el) {
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

  async function toggle(enabled) {
    state.enabled = enabled;
    if (enabled) {
      await controller.init();
      await controller.start();
      controller.enable();
      cursorEl.style.display = 'block';
      if (state.debug) logEl.style.display = 'block';
      log('🟢 Control Enabled');
    } else {
      controller.disable();
      controller.stop();
      if (cursorEl) cursorEl.style.display = 'none';
      if (logEl) logEl.style.display = 'none';
      if (menuEl) menuEl.style.display = 'none';
      log('🔴 Control Disabled');
    }
  }

  // Messaging from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      toggle(request.enabled);
      sendResponse({ status: 'ok' });
    } else if (request.action === 'getStatus') {
      sendResponse({ enabled: state.enabled });
    }
  });

  // Handle page unload
  window.addEventListener('unload', () => {
    controller.stop();
  });

  // Init
  initUI();
  
  // Load initial state
  chrome.storage.sync.get(['enabled'], (result) => {
    if (result.enabled) {
      toggle(true);
    }
  });

  log('📡 FingerPoint Content Script Loaded');
})();
