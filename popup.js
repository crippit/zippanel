// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('statusText');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValueDisplay = document.getElementById('opacityValue');
    const textSizeInput = document.getElementById('textSizeInput');
    const textSizeValueDisplay = document.getElementById('textSizeValue');

    let isCurrentlyEnabled = true; 

    function updateButtonUI(enabled) {
        isCurrentlyEnabled = enabled;
        if (toggleButton) {
            toggleButton.textContent = enabled ? "Disable Overlay Globally" : "Enable Overlay Globally";
            toggleButton.style.backgroundColor = enabled ? "#dc3545" : "#28a745"; // Bootstrap danger/success colors
        }
        if (statusText) {
            statusText.textContent = `Overlay is currently: ${enabled ? "Enabled" : "Disabled"}`;
        }
    }

    function updateStyleControlsUI(settings) {
        if (opacitySlider && settings.opacity !== undefined) {
            opacitySlider.value = settings.opacity;
            if (opacityValueDisplay) opacityValueDisplay.textContent = parseFloat(settings.opacity).toFixed(2);
        }
        if (textSizeInput && settings.textSize !== undefined) {
            textSizeInput.value = settings.textSize;
            if (textSizeValueDisplay) textSizeValueDisplay.textContent = settings.textSize;
        }
    }

    chrome.runtime.sendMessage({ message: "getOverlayState" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error getting initial state:", chrome.runtime.lastError.message);
            if (toggleButton) toggleButton.textContent = "Error Loading State";
            if (statusText) statusText.textContent = "Status: Error";
            updateStyleControlsUI({ opacity: 0.85, textSize: 18 }); // Fallback UI
            return;
        }
        if (response) {
            console.log("Popup: Initial state received:", response);
            updateButtonUI(response.enabled);
            updateStyleControlsUI(response);
        } else {
            console.warn("Popup: Invalid response for getOverlayState. Defaulting UI.");
            updateButtonUI(true);
            updateStyleControlsUI({ opacity: 0.85, textSize: 18 });
        }
    });

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            const newState = !isCurrentlyEnabled;
            console.log("Popup: Button clicked. New state to set:", newState);

            chrome.runtime.sendMessage({ message: "setOverlayState", enabled: newState }, (response) => {
                if (chrome.runtime.lastError || !response || response.status !== "Global overlay state updated successfully") {
                    console.error("Popup: Error setting state or no confirmation:", chrome.runtime.lastError || "No/Invalid response");
                    chrome.runtime.sendMessage({ message: "getOverlayState" }, (refreshResponse) => {
                        if (refreshResponse) { updateButtonUI(refreshResponse.enabled); updateStyleControlsUI(refreshResponse); }
                    });
                    return;
                }
                console.log("Popup: Background confirmed state update. New state:", newState);
                updateButtonUI(newState);
            });
        });
    }

    if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
            const newOpacity = parseFloat(e.target.value);
            if (opacityValueDisplay) opacityValueDisplay.textContent = newOpacity.toFixed(2);
            chrome.runtime.sendMessage({ type: "STYLE_UPDATE", setting: "opacity", value: newOpacity });
        });
    }

    if (textSizeInput) {
        textSizeInput.addEventListener('input', (e) => {
            const newTextSize = parseInt(e.target.value, 10);
            if (isNaN(newTextSize) || newTextSize < 10 || newTextSize > 48) {
                if (textSizeValueDisplay) textSizeValueDisplay.textContent = textSizeInput.value; // Show current input even if invalid for a moment
                return; 
            }
            if (textSizeValueDisplay) textSizeValueDisplay.textContent = newTextSize;
            chrome.runtime.sendMessage({ type: "STYLE_UPDATE", setting: "textSize", value: newTextSize });
        });
    }
});