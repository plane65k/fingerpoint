export class GestureController {
  constructor() {
    this.hands = null;
    this.video = null;
    this.onGesture = null;
    this.enabled = false;
    this.isRunning = false;
    this.cameraStream = null;
    this.permissionState = 'prompt'; // 'prompt', 'granted', 'denied'
    this.lastFrameTime = 0;
    this.frameInterval = 1000 / 30; // ~30 FPS

    this.TOUCH_RADIUS = 0.03;
    this.CLICK_COOLDOWN = 800;
    this.LONG_PRESS_TIME = 1500;

    this.lastClickTime = 0;
    this.pinchStartTime = null;
    this.isPinching = false;
    this.isLongPressing = false;

    this.lastPalmY = null;
    this.isScrolling = false;
  }

  async requestCameraPermission() {
    console.log('🎥 Camera request started');
    this.permissionState = 'prompt';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      
      this.cameraStream = stream;
      this.permissionState = 'granted';
      console.log('✅ Camera permission granted');
      
      // Store permission state in chrome.storage.local
      await new Promise((resolve) => {
        chrome.storage.local.set({ cameraPermission: 'granted' }, resolve);
      });
      
      return { success: true, stream };
    } catch (err) {
      console.error(`❌ Camera permission denied: ${err.name}`);
      this.permissionState = 'denied';
      
      // Store permission state in chrome.storage.local
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
        errorMessage = 'Camera permission denied by user';
      }
      
      console.error(`🎥 ${errorMessage}: ${err.message}`);
      return { success: false, error: errorMessage, name: err.name };
    }
  }

  async init() {
    const HandsClass = window.Hands || (typeof Hands !== 'undefined' ? Hands : null);
    if (!HandsClass) {
      throw new Error('MediaPipe Hands library not found. Make sure hands.js is loaded.');
    }
    this.hands = new HandsClass({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults(this.handleResults.bind(this));

    // Create hidden video element for camera stream
    this.video = document.createElement('video');
    this.video.style.display = 'none';
    this.video.muted = true;
    this.video.playsInline = true;
    document.body.appendChild(this.video);

    // Load saved permission state
    await new Promise((resolve) => {
      chrome.storage.local.get(['cameraPermission'], (result) => {
        if (result.cameraPermission) {
          this.permissionState = result.cameraPermission;
        }
        resolve();
      });
    });
  }

  async start() {
    if (this.isRunning) return;

    // Check if we have permission
    if (this.permissionState !== 'granted') {
      const permResult = await this.requestCameraPermission();
      if (!permResult.success) {
        throw new Error(permResult.error);
      }
    }

    try {
      // Use stored stream or get new one
      if (!this.cameraStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        });
        this.cameraStream = stream;
      }

      this.video.srcObject = this.cameraStream;
      await this.video.play();
      this.isRunning = true;
      
      console.log('🚀 GestureController started');
      
      // Start continuous frame processing loop
      this.processVideoFrame();
    } catch (err) {
      console.error('❌ Failed to get webcam access', err);
      this.permissionState = 'denied';
      await new Promise((resolve) => {
        chrome.storage.local.set({ cameraPermission: 'denied' }, resolve);
      });
      throw err;
    }
  }

  async processVideoFrame() {
    if (!this.isRunning) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;

    // Process frame if enough time has passed (~30 FPS)
    if (elapsed >= this.frameInterval) {
      this.lastFrameTime = now;
      
      if (this.enabled && this.video.readyState >= 2) {
        console.log('🎥 Sending frame to MediaPipe');
        await this.hands.send({ image: this.video });
      }
    }

    requestAnimationFrame(() => this.processVideoFrame());
  }

  stop() {
    this.isRunning = false;
    
    // Stop camera stream
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    
    // Clear video srcObject
    if (this.video && this.video.srcObject) {
      this.video.srcObject = null;
    }
    
    console.log('🛑 GestureController stopped');
  }

  enable() {
    this.enabled = true;
    console.log('✅ GestureController enabled');
  }

  disable() {
    this.enabled = false;
    console.log('❌ GestureController disabled');
  }

  handleResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      if (this.onGesture) this.onGesture({ type: 'no-hand' });
      this.isPinching = false;
      this.pinchStartTime = null;
      this.isScrolling = false;
      this.lastPalmY = null;
      console.log('❌ Hand lost');
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    
    // Landmark indices:
    // 0: Palm/Wrist
    // 4: Thumb Tip
    // 8: Index Tip
    // 12: Middle Tip
    // 5: Index MCP
    // 9: Middle MCP

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const palm = landmarks[0];
    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];

    // Log hand detection with key landmarks
    console.log(`🤚 Hand detected! Index: (${indexTip.x.toFixed(3)}, ${indexTip.y.toFixed(3)}), Thumb: (${thumbTip.x.toFixed(3)}, ${thumbTip.y.toFixed(3)}), Palm: (${palm.x.toFixed(3)}, ${palm.y.toFixed(3)})`);

    // 1. Index Finger Cursor Tracking
    // Mirror X-axis
    const cursorX = 1 - indexTip.x;
    const cursorY = indexTip.y;

    if (this.onGesture) {
      this.onGesture({
        type: 'move',
        x: cursorX,
        y: cursorY
      });
    }

    // 2. Pinch Click Detection
    const distancePinch = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
      Math.pow(indexTip.y - thumbTip.y, 2) +
      Math.pow(indexTip.z - thumbTip.z, 2)
    );

    if (distancePinch < this.TOUCH_RADIUS) {
      if (!this.isPinching) {
        this.isPinching = true;
        this.pinchStartTime = Date.now();
      } else {
        // Still pinching, check for long press
        if (!this.isLongPressing && (Date.now() - this.pinchStartTime > this.LONG_PRESS_TIME)) {
          this.isLongPressing = true;
          if (this.onGesture) {
            this.onGesture({ type: 'long-press', x: cursorX, y: cursorY });
          }
        }
      }
    } else {
      if (this.isPinching) {
        // Pinch released
        const pinchDuration = Date.now() - this.pinchStartTime;
        if (!this.isLongPressing && pinchDuration < this.LONG_PRESS_TIME) {
          // It was a click
          const now = Date.now();
          if (now - this.lastClickTime > this.CLICK_COOLDOWN) {
            if (this.onGesture) {
              this.onGesture({ type: 'click', x: cursorX, y: cursorY });
            }
            this.lastClickTime = now;
            console.log('🎯 Gesture: pinch click');
          }
        }
        this.isPinching = false;
        this.pinchStartTime = null;
        this.isLongPressing = false;
      }
    }

    // 4. Two-Finger Scroll Gesture
    // Check if index and middle fingers are straight
    // A simple way: check if tip is significantly further from wrist than MCP
    const indexStraight = this.isFingerStraight(indexTip, indexMCP, palm);
    const middleStraight = this.isFingerStraight(middleTip, middleMCP, palm);

    if (indexStraight && middleStraight && !this.isPinching) {
      if (!this.isScrolling) {
        this.isScrolling = true;
        this.lastPalmY = palm.y;
      } else {
        const deltaY = palm.y - this.lastPalmY;
        if (Math.abs(deltaY) > 0.01) {
          if (this.onGesture) {
            this.onGesture({ type: 'scroll', dy: deltaY });
          }
          this.lastPalmY = palm.y;
          console.log('🎯 Gesture: scroll');
        }
      }
    } else {
      this.isScrolling = false;
      this.lastPalmY = null;
    }
  }

  isFingerStraight(tip, mcp, palm) {
    // Distance from tip to palm vs distance from MCP to palm
    const dTip = Math.sqrt(Math.pow(tip.x - palm.x, 2) + Math.pow(tip.y - palm.y, 2));
    const dMCP = Math.sqrt(Math.pow(mcp.x - palm.x, 2) + Math.pow(mcp.y - palm.y, 2));
    return dTip > dMCP * 1.2; // Threshold to consider it straight
  }

  getPermissionState() {
    return this.permissionState;
  }

  async requestPermissionAgain() {
    this.permissionState = 'prompt';
    await new Promise((resolve) => {
      chrome.storage.local.set({ cameraPermission: 'prompt' }, resolve);
    });
    return this.requestCameraPermission();
  }
}
