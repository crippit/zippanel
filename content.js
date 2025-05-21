// content.js

console.log("My Custom Overlay: content.js loaded for URL:", window.location.href);

let overlayPanel = null;
let currentTargetCaptionElement = null;
let captionContentObserver = null;
let mainElementPresenceObserver = null;
let isOverlayGloballyEnabled = true;
let isThisTabTheSource = false;

let currentOverlayOpacity = 0.85; // Default matching background.js
let currentOverlayTextSize = 18;  // Default matching background.js

function applyOverlayStyles() {
    if (!overlayPanel) return;
    overlayPanel.style.backgroundColor = `rgba(0, 0, 0, ${currentOverlayOpacity})`;
    overlayPanel.style.fontSize = `${currentOverlayTextSize}px`;
    console.log(`My Custom Overlay: Styles applied - Opacity: ${currentOverlayOpacity}, Text Size: ${currentOverlayTextSize}px to panel:`, overlayPanel);
}

function createOverlayPanel() {
    console.log("My Custom Overlay: createOverlayPanel() called.");
    if (overlayPanel) return;
    overlayPanel = document.createElement('div');
    overlayPanel.id = 'custom-zip-caption-overlay';
    overlayPanel.textContent = "Waiting for captions...";
    if (document.body) {
        document.body.appendChild(overlayPanel);
        console.log("My Custom Overlay: overlayPanel appended to document.body.");
    } else {
        console.error("My Custom Overlay: document.body not found!");
        return;
    }
    updateOverlayVisibilityDOM();
}

function updateOverlayVisibilityDOM() {
    console.log("My Custom Overlay: updateOverlayVisibilityDOM() called. Global state isOverlayGloballyEnabled:", isOverlayGloballyEnabled);
    if (!overlayPanel) {
        console.warn("My Custom Overlay: updateOverlayVisibilityDOM - overlayPanel is null! Attempting to create.");
        createOverlayPanel();
        if (!overlayPanel) return;
    }
    
    overlayPanel.style.display = isOverlayGloballyEnabled ? 'block' : 'none';
    console.log("My Custom Overlay: overlayPanel display set to:", overlayPanel.style.display);

    if (isOverlayGloballyEnabled) {
        applyOverlayStyles(); // Apply current styles
        startMainElementPresenceObserver();
        requestCurrentSharedCaptions();
    } else {
        stopMainElementPresenceObserver();
        stopCaptionContentObserver();
        isThisTabTheSource = false;
        if (overlayPanel) overlayPanel.textContent = "Overlay disabled.";
    }
}

function requestCurrentSharedCaptions() {
    if (!isOverlayGloballyEnabled || !overlayPanel) return;
    console.log("My Custom Overlay: Requesting initial/current shared captions from background.");
    chrome.runtime.sendMessage({ message: "GET_CURRENT_SHARED_CAPTIONS" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("My Custom Overlay: Error getting initial shared captions:", chrome.runtime.lastError.message);
            if (overlayPanel) overlayPanel.textContent = "Error loading captions."; // Update UI on error
            return;
        }
        if (response && typeof response.text === 'string') {
            console.log("My Custom Overlay: Received initial shared captions for display:", response.text);
            if (!isThisTabTheSource || (overlayPanel.textContent !== response.text && response.text !== "")) {
                 if (overlayPanel.textContent !== response.text) {
                    overlayPanel.textContent = response.text || "Waiting for captions...";
                    overlayPanel.scrollTop = overlayPanel.scrollHeight;
                    console.log("My Custom Overlay: Overlay panel updated with initial SHARED CAPTION text from background.");
                 }
            }
        } else if (overlayPanel) {
            // If response.text is not a string (e.g. undefined if latestCaptionText is empty from fresh start)
            overlayPanel.textContent = "Waiting for captions...";
        }
    });
}

function startMainElementPresenceObserver() {
    if (mainElementPresenceObserver) {
        checkForExistingCaptionElement();
        return;
    }
    const parentToObserve = document.body;
    console.log("My Custom Overlay: Starting mainElementPresenceObserver to watch for 'div.recognized-text'.");

    mainElementPresenceObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let foundElement = null;
                        if (node.matches && node.matches('div.recognized-text')) {
                            foundElement = node;
                        } else if (node.querySelector) {
                            foundElement = node.querySelector('div.recognized-text');
                        }
                        if (foundElement) {
                            handleCaptionElementFound(foundElement);
                        }
                    }
                });
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node === currentTargetCaptionElement || (node.contains && node.contains(currentTargetCaptionElement))) {
                            stopCaptionContentObserver();
                            currentTargetCaptionElement = null;
                            isThisTabTheSource = false;
                            if (overlayPanel && isOverlayGloballyEnabled) requestCurrentSharedCaptions();
                        }
                    }
                });
            }
        }
    });
    mainElementPresenceObserver.observe(parentToObserve, { childList: true, subtree: true });
    checkForExistingCaptionElement();
}

function checkForExistingCaptionElement() {
    if (!isOverlayGloballyEnabled) return;
    const existingElement = document.querySelector('div.recognized-text');
    if (existingElement) {
        if (existingElement !== currentTargetCaptionElement) {
            handleCaptionElementFound(existingElement);
        }
    } else if (currentTargetCaptionElement) {
        stopCaptionContentObserver();
        currentTargetCaptionElement = null;
        isThisTabTheSource = false;
        if (overlayPanel && isOverlayGloballyEnabled) requestCurrentSharedCaptions();
    }
}

function handleCaptionElementFound(element) {
    if (currentTargetCaptionElement === element && captionContentObserver) return;
    stopCaptionContentObserver();
    currentTargetCaptionElement = element;
    isThisTabTheSource = true;
    console.log("My Custom Overlay: This tab is NOW A SOURCE. Element:", currentTargetCaptionElement);
    if (overlayPanel) overlayPanel.textContent = 'Local caption source found. Capturing...';
    startCaptionContentObserver();
    if (currentTargetCaptionElement.textContent) {
        const currentText = currentTargetCaptionElement.textContent;
        if (overlayPanel) {
            overlayPanel.textContent = currentText;
            overlayPanel.scrollTop = overlayPanel.scrollHeight;
        }
        chrome.runtime.sendMessage({ type: "NEW_CAPTION_TEXT_FROM_SOURCE", text: currentText });
    } else if (overlayPanel) {
        overlayPanel.textContent = 'Local source found, waiting for its text...';
    }
}

function stopMainElementPresenceObserver() {
    if (mainElementPresenceObserver) {
        mainElementPresenceObserver.disconnect();
        mainElementPresenceObserver = null;
        console.log("My Custom Overlay: Main element presence observer stopped.");
    }
}

function startCaptionContentObserver() {
    if (captionContentObserver || !currentTargetCaptionElement) return;
    console.log("My Custom Overlay: Attaching CaptionContentObserver to:", currentTargetCaptionElement);
    captionContentObserver = new MutationObserver(mutationsList => {
        // console.log("My Custom Overlay (Source Tab): CaptionContentObserver fired!"); // Less verbose default
        const newCaptionText = currentTargetCaptionElement.textContent;
        if (overlayPanel && isThisTabTheSource && overlayPanel.textContent !== newCaptionText) {
            overlayPanel.textContent = newCaptionText;
            overlayPanel.scrollTop = overlayPanel.scrollHeight;
        }
        if (isThisTabTheSource) {
            chrome.runtime.sendMessage({ type: "NEW_CAPTION_TEXT_FROM_SOURCE", text: newCaptionText });
        }
    });
    const config = { childList: true, characterData: true, subtree: true, attributes: false };
    try {
        captionContentObserver.observe(currentTargetCaptionElement, config);
    } catch (e) { console.error('My Custom Overlay: Error starting CaptionContentObserver:', e); }
}

function stopCaptionContentObserver() {
    if (captionContentObserver) {
        captionContentObserver.disconnect();
        captionContentObserver = null;
        console.log('My Custom Overlay: CaptionContentObserver stopped.');
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`My Custom Overlay: Message received in content.js: ${request.message}`, request);
    if (request.message === "updateOverlayVisibility") {
        isOverlayGloballyEnabled = request.visible;
        updateOverlayVisibilityDOM();
        sendResponse({ status: `Visibility set to ${isOverlayGloballyEnabled} in content script for ${window.location.href}` });
    } else if (request.message === "DISPLAY_SHARED_CAPTION") {
        console.log(`My Custom Overlay: RX SHARED CAPTION%c\n  - Text: "${request.text}"\n  - Current Overlay: "${overlayPanel ? overlayPanel.textContent : 'N/A'}"\n  - Panel Exists: ${!!overlayPanel}\n  - Globally Enabled: ${isOverlayGloballyEnabled}\n  - Is This Tab Source: ${isThisTabTheSource}`, "font-weight:bold; color:blue;", "font-weight:normal; color:black;");
        if (overlayPanel && isOverlayGloballyEnabled) {
            if (!isThisTabTheSource) {
                console.log("My Custom Overlay: This is NOT a source tab, proceeding to update shared caption.");
                if (overlayPanel.textContent !== request.text) {
                    overlayPanel.textContent = request.text || "Waiting for captions...";
                    overlayPanel.scrollTop = overlayPanel.scrollHeight;
                    console.log("My Custom Overlay: Overlay panel updated with SHARED CAPTION text from background.");
                } else {
                    console.log("My Custom Overlay: Shared caption text is identical to current overlay text on this non-source tab. No DOM update.");
                }
            } else { // This is the source tab receiving its own broadcast
                 console.log("My Custom Overlay: This is source tab. Shared caption received. Local text should be primary or already updated.");
                 // Optionally, ensure sync if text is different and local update somehow missed.
                 // if (overlayPanel.textContent !== request.text && request.text && request.text.trim() !== "") {
                 //    overlayPanel.textContent = request.text;
                 //    overlayPanel.scrollTop = overlayPanel.scrollHeight;
                 //    console.log("My Custom Overlay (Source Tab): Synced with broadcasted text.");
                 // }
            }
        } else {
            console.log("My Custom Overlay: Received SHARED CAPTION, but panel/global state prevents display. Panel:", !!overlayPanel, "Enabled:", isOverlayGloballyEnabled);
        }
    } else if (request.message === "APPLY_STYLE_UPDATE") {
        console.log("My Custom Overlay: Received APPLY_STYLE_UPDATE", request);
        if (request.setting === "opacity") {
            currentOverlayOpacity = parseFloat(request.value);
        } else if (request.setting === "textSize") {
            currentOverlayTextSize = parseInt(request.value, 10);
        }
        applyOverlayStyles();
    }
    return true;
});

// --- Initial Setup ---
console.log("My Custom Overlay: Initial setup starting...");
createOverlayPanel();

console.log("My Custom Overlay: Requesting initial overlay state (including styles) from background script...");
chrome.runtime.sendMessage({ message: "getOverlayState" }, (response) => {
    if (chrome.runtime.lastError) {
        console.error("My Custom Overlay: Error getting initial state & styles:", chrome.runtime.lastError.message);
        // Defaults for isOverlayGloballyEnabled, currentOverlayOpacity, currentOverlayTextSize are already set
    } else if (response) {
        isOverlayGloballyEnabled = response.enabled !== undefined ? response.enabled : isOverlayGloballyEnabled;
        currentOverlayOpacity = response.opacity !== undefined ? response.opacity : currentOverlayOpacity;
        currentOverlayTextSize = response.textSize !== undefined ? response.textSize : currentOverlayTextSize;
        console.log("My Custom Overlay: Received initial state & styles from background. Enabled:", isOverlayGloballyEnabled, "Opacity:", currentOverlayOpacity, "TextSize:", currentOverlayTextSize);
    } else {
        console.warn("My Custom Overlay: Invalid or no response from background for getOverlayState. Using defaults.");
    }
    updateOverlayVisibilityDOM();
});