// background.js

let latestCaptionText = ""; // Store the latest caption text globally

const defaultSettings = {
    overlayEnabled: true,
    overlayOpacity: 0.85, 
    overlayTextSize: 18  
};

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.storage.local.set(defaultSettings, () => {
            console.log('My Custom Overlay (Background): Default settings saved on install.');
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("My Custom Overlay (Background): Message received:", request, "from sender:", sender.tab ? sender.tab.id : "popup/background");

    if (request.message === "setOverlayState") {
        chrome.storage.local.set({ overlayEnabled: request.enabled }, () => {
            if (chrome.runtime.lastError) {
                console.error("My Custom Overlay (Background): Error setting overlay state in storage:", chrome.runtime.lastError);
                sendResponse({ status: "Error setting state", error: chrome.runtime.lastError.message });
                return;
            }
            console.log(`My Custom Overlay (Background): Global overlay state saved as ${request.enabled}. Broadcasting visibility...`);
            broadcastOverlayState(request.enabled);
            if (request.enabled) {
                broadcastCaptionText(latestCaptionText); 
            }
            sendResponse({ status: "Global overlay state updated successfully" });
        });
        return true; 
    } else if (request.message === "getOverlayState") {
        chrome.storage.local.get(['overlayEnabled', 'overlayOpacity', 'overlayTextSize'], (result) => {
            if (chrome.runtime.lastError) {
                console.error("My Custom Overlay (Background): Error getting state from storage:", chrome.runtime.lastError);
                sendResponse({ ...defaultSettings, error: chrome.runtime.lastError.message });
                return;
            }
            const settings = {
                enabled: result.overlayEnabled !== undefined ? result.overlayEnabled : defaultSettings.overlayEnabled,
                opacity: result.overlayOpacity !== undefined ? result.overlayOpacity : defaultSettings.overlayOpacity,
                textSize: result.overlayTextSize !== undefined ? result.overlayTextSize : defaultSettings.overlayTextSize
            };
            console.log("My Custom Overlay (Background): Returning current state:", settings);
            sendResponse(settings);
        });
        return true;
    } else if (request.type === "NEW_CAPTION_TEXT_FROM_SOURCE") {
        console.log("My Custom Overlay (Background): Received new caption text from source:", request.text);
        latestCaptionText = request.text;
        console.log("My Custom Overlay (Background): Value of latestCaptionText just before broadcast:", latestCaptionText, "(Type:", typeof latestCaptionText, ")");
        broadcastCaptionText(latestCaptionText);
    } else if (request.message === "GET_CURRENT_SHARED_CAPTIONS") {
        console.log("My Custom Overlay (Background): Sending current latest shared caption:", latestCaptionText);
        sendResponse({ text: latestCaptionText });
        return true; 
    } else if (request.type === "STYLE_UPDATE") {
        console.log(`My Custom Overlay (Background): Relaying style update: ${request.setting} = ${request.value}`);
        let settingToSave = {};
        if (request.setting === "opacity") settingToSave.overlayOpacity = request.value;
        if (request.setting === "textSize") settingToSave.overlayTextSize = request.value;

        chrome.storage.local.set(settingToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("My Custom Overlay (Background): Error saving style update to storage:", chrome.runtime.lastError);
            } else {
                 console.log("My Custom Overlay (Background): Style update saved to storage.", settingToSave);
            }
        });

        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error("My Custom Overlay (Background): Error querying tabs for style broadcast:", chrome.runtime.lastError);
                return;
            }
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        message: "APPLY_STYLE_UPDATE",
                        setting: request.setting,
                        value: request.value
                    }).catch(e => { /* console.warn(`Could not send style update to tab ${tab.id}: ${e.message}`); */ });
                }
            });
        });
    }
});

function broadcastOverlayState(enabled) {
    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("My Custom Overlay (Background): Error querying tabs for state broadcast:", chrome.runtime.lastError);
            return;
        }
        console.log(`My Custom Overlay (Background): Inside broadcastOverlayState. Broadcasting visibility: ${enabled} to ${tabs.length} tabs.`);
        tabs.forEach(tab => {
            if (tab.id) {
                console.log(`My Custom Overlay (Background): Attempting to send updateOverlayVisibility (visible: ${enabled}) to tab ${tab.id}`);
                chrome.tabs.sendMessage(tab.id, { message: "updateOverlayVisibility", visible: enabled })
                  .then(response => {
                     if (response && response.status) {
                        // console.log(`My Custom Overlay (Background): Tab ${tab.id} acknowledged visibility update: ${response.status}`);
                     }
                  })
                  .catch(error => { /* console.warn(`Could not send visibility to tab ${tab.id}. Error: ${error.message}.`); */ });
            }
        });
    });
}

function broadcastCaptionText(text) {
    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("My Custom Overlay (Background): Error querying tabs for caption broadcast:", chrome.runtime.lastError);
            return;
        }
        console.log(`My Custom Overlay (Background): Broadcasting caption text to all tabs: "${text}" (Length: ${text ? text.length : 'N/A'})`);
        tabs.forEach(tab => {
            if (tab.id) {
                // console.log(`My Custom Overlay (Background): Attempting to send DISPLAY_SHARED_CAPTION with text "${text}" to tab ${tab.id}`);
                chrome.tabs.sendMessage(tab.id, { message: "DISPLAY_SHARED_CAPTION", text: text })
                  .catch(error => { /* console.warn(`Could not send caption text to tab ${tab.id}: ${error.message}`); */ });
            }
        });
    });
}

console.log("My Custom Overlay (Background): Service worker started/restarted.", new Date().toLocaleTimeString());