// popout_caption_window.js
document.addEventListener('DOMContentLoaded', () => {
    const captionDisplay = document.getElementById('popout-caption-display');
    const dockButton = document.getElementById('dockButton');
    
    let currentOpacity = 0.85;
    let currentTextSize = 18;

    function applyStyles() {
        if (!captionDisplay) return;
        // Assuming a black base for RGBA, matching the in-page overlay's CSS.
        captionDisplay.style.backgroundColor = `rgba(0, 0, 0, ${currentOpacity})`;
        captionDisplay.style.fontSize = `${currentTextSize}px`;
        console.log(`Popout: Styles applied - Opacity: ${currentOpacity}, Text Size: ${currentTextSize}px`);
    }

    if (dockButton) {
        dockButton.addEventListener('click', () => {
            console.log("Popout: Dock button clicked. Sending DOCK_OVERLAY message."); // Added log
            chrome.runtime.sendMessage({ type: "DOCK_OVERLAY" }); 
            // Consider closing the window optimistically, or let background handle it
            // window.close(); // If you add this, background might get an error trying to remove an already closed window.
                            // It's cleaner for background to manage window closure.
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("Popout window received message:", request); // Good for debugging all messages

        if (request.message === "DISPLAY_SHARED_CAPTION") {
            if (captionDisplay) {
                const newText = request.text || "Waiting for captions...";
                if (captionDisplay.textContent !== newText) {
                    captionDisplay.textContent = newText;
                    // console.log("Popout: Displayed shared caption:", newText); // Can be noisy
                }
            }
        } else if (request.message === "APPLY_STYLE_UPDATE") {
            if (request.setting === "opacity") {
                currentOpacity = parseFloat(request.value);
            } else if (request.setting === "textSize") {
                currentTextSize = parseInt(request.value, 10);
            }
            applyStyles();
        } else if (request.message === "INIT_POPOUT") {
            console.log("Popout: Received INIT data:", request);
            if (request.settings) {
                currentOpacity = request.settings.opacity !== undefined ? parseFloat(request.settings.opacity) : currentOpacity;
                currentTextSize = request.settings.textSize !== undefined ? parseInt(request.settings.textSize, 10) : currentTextSize;
            }
            if (captionDisplay) {
                 const initialText = request.initialText || "Waiting for captions...";
                 captionDisplay.textContent = initialText;
                 console.log("Popout: Initial text set:", initialText);
            }
            applyStyles(); // Apply initial styles
        }
    });
    console.log("Popout window script loaded.");
    console.log("Popout window script loaded. Waiting for INIT message or other messages.");
    // Note: The background script will proactively send an INIT_POPOUT message when this window is created.
});