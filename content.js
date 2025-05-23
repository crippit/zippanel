// content.js

console.log("My Custom Overlay: content.js loaded for URL:", window.location.href);

let overlayPanel = null;
let currentTargetCaptionElement = null;
let captionContentObserver = null;
let mainElementPresenceObserver = null;

// States
let isOverlayGloballyEnabled = true;
let isThisTabTheSource = false;
let currentOverlayDisplayMode = "in-page";

// Style settings
let currentOverlayOpacity = 0.85;
let currentOverlayTextSize = 18;

function applyOverlayStyles() {
    if (!overlayPanel) return;
    overlayPanel.style.backgroundColor = `rgba(0, 0, 0, ${currentOverlayOpacity})`;
    overlayPanel.style.fontSize = `${currentOverlayTextSize}px`;
    console.log(`My Custom Overlay: Styles applied - Opacity: ${currentOverlayOpacity}, Text Size: ${currentOverlayTextSize}px`);
}

function createOverlayPanel() {
    console.log("My Custom Overlay: createOverlayPanel() called.");
    if (overlayPanel) return;
    overlayPanel = document.createElement('div');
    overlayPanel.id = 'custom-zip-caption-overlay';
    overlayPanel.textContent = "Waiting for captions...";
    if (document.body) {
        document.body.appendChild(overlayPanel);
    } else {
        console.error("My Custom Overlay: document.body not found!");
        return;
    }
    // Initial style application and visibility will be handled by updateOverlayVisibilityDOM
    // once all states are fetched.
}

function updateOverlayVisibilityDOM() {
    console.log("My Custom Overlay: updateOverlayVisibilityDOM called. GlobalEnable:", isOverlayGloballyEnabled, "DisplayMode:", currentOverlayDisplayMode);
    if (!overlayPanel) {
        console.warn("My Custom Overlay: updateOverlayVisibilityDOM - overlayPanel is null! Creating it.");
        createOverlayPanel();
        if(!overlayPanel) return;
    }
    
    const shouldShowInPageUI = isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page";
    
    overlayPanel.style.display = shouldShowInPageUI ? 'block' : 'none';
    console.log("My Custom Overlay: In-page overlay UI display set to:", overlayPanel.style.display);

    if (isOverlayGloballyEnabled) {
        // Source detection and style application should happen if globally enabled,
        // regardless of whether this specific tab's in-page UI is visible.
        applyOverlayStyles(); // Apply styles to the (potentially hidden) in-page panel
        startMainElementPresenceObserver(); // Always try to be a source if globally enabled
        
        if (shouldShowInPageUI) { // Only request shared captions if in-page UI is visible for this tab
            requestCurrentSharedCaptions();
        }
    } else { // Overlay feature is globally disabled
        stopMainElementPresenceObserver();
        stopCaptionContentObserver();
        isThisTabTheSource = false;
        if (overlayPanel) overlayPanel.textContent = "Overlay disabled.";
    }
}

function requestCurrentSharedCaptions() {
    // This function is primarily for non-source tabs with visible in-page overlays,
    // or for source tabs to get an initial fill before their own observer kicks in.
    if (!overlayPanel || !isOverlayGloballyEnabled || currentOverlayDisplayMode !== "in-page") {
        return;
    }

    console.log("My Custom Overlay: Requesting initial/current shared captions for in-page overlay.");
    chrome.runtime.sendMessage({ message: "GET_CURRENT_SHARED_CAPTIONS" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("My Custom Overlay: Error getting initial shared captions:", chrome.runtime.lastError.message);
            if (overlayPanel) overlayPanel.textContent = "Error loading captions.";
            return;
        }
        if (response && typeof response.text === 'string') {
            if (!isThisTabTheSource || (overlayPanel.textContent !== response.text && response.text !== "")) {
                 if (overlayPanel.textContent !== response.text) {
                    overlayPanel.textContent = response.text || "Waiting for captions...";
                    overlayPanel.scrollTop = overlayPanel.scrollHeight;
                 }
            }
        } else if (overlayPanel && !isThisTabTheSource) { // If no text from background and not a source
            overlayPanel.textContent = "Waiting for captions...";
        }
    });
}

function startMainElementPresenceObserver() {
    // This observer looks for the caption source div to determine if this tab can BE a source.
    // It should run if the overlay feature is globally enabled.
    if (mainElementPresenceObserver || !isOverlayGloballyEnabled) {
        if (isOverlayGloballyEnabled) checkForExistingCaptionElement();
        return;
    }

    const parentToObserve = document.body;
    console.log("My Custom Overlay: Starting mainElementPresenceObserver for 'div.recognized-text'.");

    mainElementPresenceObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let foundElement = (node.matches && node.matches('div.recognized-text')) ? node : (node.querySelector ? node.querySelector('div.recognized-text') : null);
                        if (foundElement) {
                            handleCaptionElementFound(foundElement);
                        }
                    }
                });
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node === currentTargetCaptionElement || (currentTargetCaptionElement && node.contains && node.contains(currentTargetCaptionElement))) {
                            stopCaptionContentObserver();
                            currentTargetCaptionElement = null;
                            isThisTabTheSource = false;
                            // If in-page UI is active, it might want to refresh shared captions
                            if (isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page" && overlayPanel) {
                                overlayPanel.textContent = "Local caption source lost. Waiting for shared captions...";
                                requestCurrentSharedCaptions();
                            }
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
    // This check should only run if the feature is globally enabled.
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
        if (isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page" && overlayPanel) {
            overlayPanel.textContent = "Local caption source lost. Waiting for shared captions...";
            requestCurrentSharedCaptions();
        }
    }
}

function handleCaptionElementFound(element) {
    // This tab can become a source if the overlay feature is globally enabled.
    if (!isOverlayGloballyEnabled) return;

    if (currentTargetCaptionElement === element && captionContentObserver) return;
    
    stopCaptionContentObserver();
    currentTargetCaptionElement = element;
    isThisTabTheSource = true;
    console.log("My Custom Overlay: This tab is NOW A SOURCE. Element:", currentTargetCaptionElement);
    
    startCaptionContentObserver();
    
    const initialText = currentTargetCaptionElement.textContent;
    if (isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page" && overlayPanel) {
        overlayPanel.textContent = initialText || 'Local source found, waiting for its text...';
        if (initialText) overlayPanel.scrollTop = overlayPanel.scrollHeight;
    }
    if (initialText) { // Send initial text regardless of local UI visibility
        console.log("My Custom Overlay: Sending initial text from newly found source:", initialText);
        chrome.runtime.sendMessage({ type: "NEW_CAPTION_TEXT_FROM_SOURCE", text: initialText });
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
    // This observes the found source element. Should run if this tab is a source and globally enabled.
    if (captionContentObserver || !currentTargetCaptionElement || !isThisTabTheSource || !isOverlayGloballyEnabled) {
        return;
    }
    console.log("My Custom Overlay: Attaching CaptionContentObserver to:", currentTargetCaptionElement);

    captionContentObserver = new MutationObserver(mutationsList => {
        const newCaptionText = currentTargetCaptionElement.textContent;
        // console.log("My Custom Overlay (Source Tab): CaptionContentObserver fired! New text:", newCaptionText);

        // Update local in-page UI only if it's supposed to be visible
        if (isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page" && overlayPanel && overlayPanel.textContent !== newCaptionText) {
            overlayPanel.textContent = newCaptionText;
            overlayPanel.scrollTop = overlayPanel.scrollHeight;
        }
        
        // Always send to background if this is the source tab and feature is enabled
        if (isThisTabTheSource && isOverlayGloballyEnabled) {
            // console.log("My Custom Overlay: Source tab sending new text to background:", newCaptionText);
            chrome.runtime.sendMessage({ type: "NEW_CAPTION_TEXT_FROM_SOURCE", text: newCaptionText });
        }
    });

    const config = { childList: true, characterData: true, subtree: true, attributes: false };
    try {
        captionContentObserver.observe(currentTargetCaptionElement, config);
        console.log('My Custom Overlay: CaptionContentObserver successfully started.');
    } catch (e) {
        console.error('My Custom Overlay: Error starting CaptionContentObserver:', e);
        isThisTabTheSource = false; // If observer fails, this isn't a source
    }
}

function stopCaptionContentObserver() {
    if (captionContentObserver) {
        captionContentObserver.disconnect();
        captionContentObserver = null;
        console.log('My Custom Overlay: CaptionContentObserver stopped.');
    }
    // isThisTabTheSource = false; // Setting this here might be too aggressive if just stopping temporarily
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`My Custom Overlay: Message received in content.js: ${request.message}`, request);
    let isAsyncResponse = false;

    if (request.message === "updateOverlayVisibility") { // From global enable/disable toggle
        isOverlayGloballyEnabled = request.visible;
        updateOverlayVisibilityDOM();
        sendResponse({ status: `Visibility set to ${isOverlayGloballyEnabled}` });
        isAsyncResponse = true;
    } else if (request.message === "MODE_UPDATE") { // From background when popout/dock happens
        currentOverlayDisplayMode = request.displayMode;
        console.log("My Custom Overlay: Mode updated to:", currentOverlayDisplayMode);
        updateOverlayVisibilityDOM();
        sendResponse({ status: `Display mode updated to ${currentOverlayDisplayMode}`});
        isAsyncResponse = true;
    } else if (request.message === "DISPLAY_SHARED_CAPTION") {
        // console.log(`My Custom Overlay: RX SHARED CAPTION: "${request.text}"`);
        // This tab should only display shared captions in its IN-PAGE overlay
        // if its in-page overlay is active AND it's NOT the source.
        if (overlayPanel && isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page" && !isThisTabTheSource) {
            if (overlayPanel.textContent !== request.text) {
                overlayPanel.textContent = request.text || "Waiting for captions...";
                overlayPanel.scrollTop = overlayPanel.scrollHeight;
                // console.log("My Custom Overlay: In-page overlay updated with SHARED CAPTION text from background.");
            }
        }
    } else if (request.message === "APPLY_STYLE_UPDATE") {
        if (request.setting === "opacity") currentOverlayOpacity = parseFloat(request.value);
        else if (request.setting === "textSize") currentOverlayTextSize = parseInt(request.value, 10);
        
        // Apply styles only if the in-page overlay is currently active
        if (isOverlayGloballyEnabled && currentOverlayDisplayMode === "in-page") {
            applyOverlayStyles();
        }
    }
    return isAsyncResponse;
});

// --- Initial Setup ---
console.log("My Custom Overlay: Initial setup starting...");
createOverlayPanel(); // Creates panel and calls updateOverlayVisibilityDOM after state fetch

console.log("My Custom Overlay: Requesting initial states from background script...");
chrome.runtime.sendMessage({ message: "getOverlayState" }, (response) => {
    if (chrome.runtime.lastError) {
        console.error("My Custom Overlay: Error getting initial states:", chrome.runtime.lastError.message);
        // Defaults for states are already set at the top of the script
    } else if (response) {
        isOverlayGloballyEnabled = response.enabled !== undefined ? response.enabled : isOverlayGloballyEnabled;
        currentOverlayOpacity = response.opacity !== undefined ? response.opacity : currentOverlayOpacity;
        currentOverlayTextSize = response.textSize !== undefined ? response.textSize : currentOverlayTextSize;
        currentOverlayDisplayMode = response.displayMode !== undefined ? response.displayMode : currentOverlayDisplayMode;
    } else {
        console.warn("My Custom Overlay: Invalid or no response from background for getOverlayState.");
    }
    console.log("My Custom Overlay: Initial states received/defaulted. Enabled:", isOverlayGloballyEnabled, "Mode:", currentOverlayDisplayMode, "Opacity:", currentOverlayOpacity, "TextSize:", currentOverlayTextSize);
    updateOverlayVisibilityDOM();
});