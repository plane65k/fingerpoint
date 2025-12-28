# FingerPoint Gesture Control Chrome Extension

A Chrome Extension that allows users to control the entire browser using hand gestures based on MediaPipe Hands.

## Features

- **Index Finger Cursor Tracking**: Move your index finger to control a red circular cursor on the screen.
- **Pinch Click Detection**: Pinch your index finger and thumb together to simulate a click at the cursor position.
- **Long-Press Menu**: Hold a pinch for 1.5 seconds to open a floating menu with settings and close options.
- **Two-Finger Scroll**: Keep both index and middle fingers straight and move your hand up or down to scroll the page.

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the `fingerpoint` directory.

## Usage

1. Click the FingerPoint extension icon in the toolbar.
2. Click "Enable Control".
3. Allow camera access when prompted.
4. Use the gestures described above to interact with any webpage.

## Technical Details

- **Manifest V3**: Compliant with the latest Chrome Extension standards.
- **MediaPipe Hands**: Uses Google's MediaPipe library for real-time hand landmark detection.
- **Content Scripts**: Injects gesture detection and UI elements into every webpage.
- **Cooldowns**: Implements an 800ms cooldown between clicks to prevent accidental multiple clicks.

## File Structure

- `manifest.json`: Extension configuration.
- `popup.html/js`: Extension popup UI and logic.
- `content-script.js`: Main logic for UI injection and gesture handling.
- `gesture-controller.js`: Wrapper class for MediaPipe Hands and gesture recognition.
- `background.js`: Service worker for installation and state management.
- `styles.css`: Styling for the cursor, logs, and menu.
- `hands.js`: Local copy of MediaPipe Hands library.
