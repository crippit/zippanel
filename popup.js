// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('statusText');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValueDisplay = document.getElementById('opacityValue');
    const textSizeInput = document.getElementById('textSizeInput');
    const textSizeValueDisplay = document.getElementById('textSizeValue');
    const popoutButton = document.getElementById('popoutButton'); 

    let isCurrentlyEnabled = true; // Local cache of the overlay enabled state
    // We don't strictly need to cache displayMode here as the button click always sends OPEN_POPOUT_WINDOW

    // Function to update main toggle button text and style based on state
    function updateToggleButtonUI(enabled) {
        isCurrentlyEnabled = enabled; // Update local cache
        if (toggleButton) {
            toggleButton.textContent = enabled ? "Disable Overlay Globally" : "Enable Overlay Globally";
            toggleButton.style.backgroundColor = enabled ? "#dc3545" : "#28a745"; // Bootstrap-like danger/success colors
        }
        if (statusText) {
            statusText.textContent = `Overlay is currently: ${enabled ? "Enabled" : "Disabled"}`;
        }
    }

    // Function to update style controls (opacity, text size)
    function updateStyleControlsUI(settings) {
        if (opacitySlider && settings.opacity !== undefined) {
            opacitySlider.value = settings.opacity;
            if (opacityValueDisplay) opacityValueDisplay.textContent = parseFloat(settings.opacity).toFixed(2);
        } else if (opacitySlider) { // Fallback if setting is undefined
            opacitySlider.value = 0.85; // Default
             if (opacityValueDisplay) opacityValueDisplay.textContent = (0.85).toFixed(2);
        }

        if (textSizeInput && settings.textSize !== undefined) {
            textSizeInput.value = settings.textSize;
            if (textSizeValueDisplay) textSizeValueDisplay.textContent = settings.textSize;
        } else if (textSizeInput) { // Fallback
            textSizeInput.value = 18; // Default
            if (textSizeValueDisplay) textSizeValueDisplay.textContent = 18;
        }
    }

    // Function to update the pop-out button text
    function updatePopoutButtonUI(displayMode) {
        if (popoutButton) {
            popoutButton.textContent = (displayMode === "popout") ? "Focus Pop-out Window" : "Pop-out Overlay";
        }
    }

    // Get initial state (including ALL settings) from background script when popup opens
    console.log("Popup: Requesting initial state from background.");
    chrome.runtime.sendMessage({ message: "getOverlayState" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error getting initial state:", chrome.runtime.lastError.message);
            if (toggleButton) toggleButton.textContent = "Error Loading State";
            if (statusText) statusText.textContent = "Status: Error";
            // Set controls to default visual state on error
            updateStyleControlsUI({ opacity: 0.85, textSize: 18 }); 
            updatePopoutButtonUI("in-page");
            return;
        }

        // This is the 'if (response)' block you were asking about:
        if (response) {
            console.log("Popup: Initial state received:", response);
            updateToggleButtonUI(response.enabled);
            updateStyleControlsUI(response); // Handles opacity and textSize from response
            updatePopoutButtonUI(response.displayMode); // Handles displayMode from response
        } else {
            console.warn("Popup: Invalid or no response for getOverlayState. Defaulting UI.");
            updateToggleButtonUI(true); // Default to enabled
            updateStyleControlsUI({ opacity: 0.85, textSize: 18 }); // Default styles
            updatePopoutButtonUI("in-page"); // Default mode
        }
    });

    // Add click listener to the main toggle button
    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            const newState = !isCurrentlyEnabled; // Toggle based on the locally cached enabled state
            console.log("Popup: Toggle button clicked. Current enabled state:", isCurrentlyEnabled, "New state to set:", newState);

            chrome.runtime.sendMessage({ message: "setOverlayState", enabled: newState }, (responseFromSet) => {
                if (chrome.runtime.lastError || !responseFromSet || responseFromSet.status !== "Global overlay state updated successfully") {
                    console.error("Popup: Error setting overlay enabled state or no confirmation:", chrome.runtime.lastError || "No/Invalid response from background");
                    // Attempt to refresh UI with actual current state on error
                    chrome.runtime.sendMessage({ message: "getOverlayState" }, (refreshResponse) => {
                        if (refreshResponse) {
                            updateToggleButtonUI(refreshResponse.enabled);
                            // Note: displayMode might also change if disabling led to popout closing
                            updatePopoutButtonUI(refreshResponse.displayMode);
                        }
                    });
                    return;
                }
                console.log("Popup: Background confirmed overlay enabled state update. New state:", newState);
                updateToggleButtonUI(newState);
                // If disabling, and popout was active, its closure will trigger a mode update.
                // If enabling, the mode doesn't change automatically here, user uses popout button.
            });
        });
    }

    // Add event listener for the popoutButton
    if (popoutButton) {
        popoutButton.addEventListener('click', () => {
            console.log("Popup: Pop-out button clicked.");
            // This message always requests to open or focus the popout.
            // Background will handle setting displayMode to "popout".
            chrome.runtime.sendMessage({ type: "OPEN_POPOUT_WINDOW" }); 
            window.close(); // Close the popup itself after requesting pop-out
        });
    }

    // Event listener for opacity slider
    if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
            const newOpacity = parseFloat(e.target.value);
            if (opacityValueDisplay) opacityValueDisplay.textContent = newOpacity.toFixed(2);
            chrome.runtime.sendMessage({ type: "STYLE_UPDATE", setting: "opacity", value: newOpacity });
        });
    }

    // Event listener for text size input
    if (textSizeInput) {
        textSizeInput.addEventListener('input', (e) => { 
            const newTextSize = parseInt(e.target.value, 10);
            if (isNaN(newTextSize) || newTextSize < 10 || newTextSize > 48) {
                if (textSizeValueDisplay) textSizeValueDisplay.textContent = textSizeInput.value; 
                return; 
            }
            if (textSizeValueDisplay) textSizeValueDisplay.textContent = newTextSize;
            chrome.runtime.sendMessage({ type: "STYLE_UPDATE", setting: "textSize", value: newTextSize });
        });
    }
});