// background.js

let latestCaptionText = "";
let popoutWindowId = null;

const defaultSettings = {
    overlayEnabled: true,
    overlayOpacity: 0.85,
    overlayTextSize: 18,
    overlayDisplayMode: "in-page"
};

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        chrome.storage.local.get(null, (currentStorage) => {
            const newStorage = { ...defaultSettings, ...currentStorage };
            chrome.storage.local.set(newStorage, () => {
                console.log('My Custom Overlay (Background): Default/updated settings ensured in storage.');
            });
        });
    }
});

function createAndTrackPopoutWindow() {
    const windowOptions = {
        url: chrome.runtime.getURL("popout_caption_window.html"),
        type: "popup",
        width: 500,
        height: 100,
        focused: true,
    };
    console.log("My Custom Overlay (Background): Attempting to create popout window with options:", windowOptions);

    chrome.windows.create(windowOptions, (newWindow) => {
        if (chrome.runtime.lastError) {
            console.error("My Custom Overlay (Background): CRITICAL ERROR creating popout window:", chrome.runtime.lastError.message);
            popoutWindowId = null;
            chrome.storage.local.set({ overlayDisplayMode: "in-page" }, () => broadcastModeUpdate("in-page"));
            return;
        }
        if (newWindow) {
            popoutWindowId = newWindow.id;
            console.log("My Custom Overlay (Background): Pop-out window CREATED successfully. Window ID:", popoutWindowId);
            setTimeout(() => {
                if (newWindow.tabs && newWindow.tabs[0] && newWindow.tabs[0].id) {
                    const tabIdForPopout = newWindow.tabs[0].id;
                    chrome.storage.local.get(['overlayOpacity', 'overlayTextSize', 'overlayEnabled', 'overlayDisplayMode'], (settingsResult) => {
                        let settingsForPopout;
                        if (chrome.runtime.lastError) {
                            console.error("My Custom Overlay (Background): Error getting settings for INIT_POPOUT, using defaults:", chrome.runtime.lastError.message);
                            settingsForPopout = { ...defaultSettings };
                        } else {
                            settingsForPopout = {
                                opacity: settingsResult.overlayOpacity !== undefined ? settingsResult.overlayOpacity : defaultSettings.overlayOpacity,
                                textSize: settingsResult.overlayTextSize !== undefined ? settingsResult.overlayTextSize : defaultSettings.overlayTextSize,
                                enabled: settingsResult.overlayEnabled !== undefined ? settingsResult.overlayEnabled : defaultSettings.overlayEnabled,
                                displayMode: settingsResult.overlayDisplayMode !== undefined ? settingsResult.overlayDisplayMode : defaultSettings.overlayDisplayMode
                            };
                        }
                        console.log("My Custom Overlay (Background): Attempting to send INIT_POPOUT to new window's tab:", tabIdForPopout);
                        chrome.tabs.sendMessage(tabIdForPopout, {
                            message: "INIT_POPOUT",
                            settings: settingsForPopout,
                            initialText: latestCaptionText
                        })
                        .then((response) => { /* console.log("My Custom Overlay (Background): INIT_POPOUT message acknowledged by popout.", response); */ })
                        .catch(e => console.warn("My Custom Overlay (Background): Error sending INIT_POPOUT message to popout tab:", e.message));
                    });
                } else {
                    console.warn("My Custom Overlay (Background): New popout window or its tab not found for sending INIT message.");
                }
            }, 300);
        } else {
            console.error("My Custom Overlay (Background): chrome.windows.create callback without a window object and no error.");
            popoutWindowId = null;
            chrome.storage.local.set({ overlayDisplayMode: "in-page" }, () => broadcastModeUpdate("in-page"));
        }
    });
}

function openOrFocusPopoutWindow() {
    console.log("My Custom Overlay (Background): openOrFocusPopoutWindow called. Current popoutWindowId:", popoutWindowId);
    if (popoutWindowId !== null) {
        chrome.windows.get(popoutWindowId, { populate: true }, (foundWindow) => {
            if (chrome.runtime.lastError || !foundWindow) {
                console.log("My Custom Overlay (Background): Popout window ID", popoutWindowId, "not found or error. Creating new.");
                popoutWindowId = null;
                createAndTrackPopoutWindow();
            } else {
                console.log("My Custom Overlay (Background): Focusing existing pop-out window:", popoutWindowId);
                chrome.windows.update(popoutWindowId, { focused: true });
                if (foundWindow.tabs && foundWindow.tabs[0] && foundWindow.tabs[0].id) {
                     chrome.storage.local.get(['overlayOpacity', 'overlayTextSize', 'overlayEnabled', 'overlayDisplayMode'], (settingsResult) => {
                        const currentSettings = {
                            opacity: settingsResult.overlayOpacity !== undefined ? settingsResult.overlayOpacity : defaultSettings.overlayOpacity,
                            textSize: settingsResult.overlayTextSize !== undefined ? settingsResult.overlayTextSize : defaultSettings.overlayTextSize,
                            enabled: settingsResult.overlayEnabled !== undefined ? settingsResult.overlayEnabled : defaultSettings.overlayEnabled,
                            displayMode: settingsResult.overlayDisplayMode !== undefined ? settingsResult.overlayDisplayMode : defaultSettings.overlayDisplayMode
                        };
                        chrome.tabs.sendMessage(foundWindow.tabs[0].id, {
                            message: "INIT_POPOUT", // Resend init to refresh its content and style
                            settings: currentSettings,
                            initialText: latestCaptionText
                        }).catch(e => console.warn("My Custom Overlay (Background): Error re-sending INIT_POPOUT on focus:", e.message));
                    });
                }
            }
        });
    } else {
        console.log("My Custom Overlay (Background): No existing pop-out window ID. Calling createAndTrackPopoutWindow.");
        createAndTrackPopoutWindow();
    }
}

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popoutWindowId) {
        console.log("My Custom Overlay (Background): Pop-out caption window (ID:", windowId, ") was closed.");
        popoutWindowId = null;
        chrome.storage.local.set({ overlayDisplayMode: "in-page" }, () => {
            console.log("My Custom Overlay (Background): Pop-out closed, mode set to in-page in storage.");
            broadcastModeUpdate("in-page");
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("My Custom Overlay (Background): Message received:", request, "from sender tab ID:", sender.tab ? sender.tab.id : "popup/background");
    let isAsyncResponse = false;

    if (request.type === "OPEN_POPOUT_WINDOW") {
        console.log("My Custom Overlay (Background): Handling OPEN_POPOUT_WINDOW action.");
        chrome.storage.local.set({ overlayDisplayMode: "popout" }, () => {
            broadcastModeUpdate("popout");
            openOrFocusPopoutWindow();
        });
    } else if (request.type === "DOCK_OVERLAY") {
        console.log("My Custom Overlay (Background): Handling DOCK_OVERLAY action.");
        if (popoutWindowId !== null) {
            chrome.windows.get(popoutWindowId, {}, (foundWindow) => {
                if (foundWindow) {
                    chrome.windows.remove(popoutWindowId, () => {
                        if (chrome.runtime.lastError) console.error("Error closing popout on dock:", chrome.runtime.lastError.message);
                        // onRemoved listener handles mode update
                    });
                } else {
                    popoutWindowId = null; // Already closed
                    chrome.storage.local.set({ overlayDisplayMode: "in-page" }, () => broadcastModeUpdate("in-page"));
                }
            });
        } else {
            chrome.storage.local.set({ overlayDisplayMode: "in-page" }, () => broadcastModeUpdate("in-page"));
        }
    } else if (request.message === "setOverlayState") {
        isAsyncResponse = true;
        const newEnabledState = request.enabled;
        chrome.storage.local.set({ overlayEnabled: newEnabledState }, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ status: "Error", error: chrome.runtime.lastError.message }); return;
            }
            broadcastOverlayState(newEnabledState);
            if (newEnabledState) {
                broadcastCaptionText(latestCaptionText);
            } else {
                if (popoutWindowId !== null) {
                    chrome.windows.get(popoutWindowId, {}, (foundWindow) => {
                        if (foundWindow) chrome.windows.remove(popoutWindowId);
                    });
                }
                if (popoutWindowId === null) { // Ensure mode is in-page if popout wasn't open
                     chrome.storage.local.set({ overlayDisplayMode: "in-page" });
                }
            }
            sendResponse({ status: "Global overlay state updated successfully" });
        });
    } else if (request.message === "getOverlayState") {
        isAsyncResponse = true;
        chrome.storage.local.get(['overlayEnabled', 'overlayOpacity', 'overlayTextSize', 'overlayDisplayMode'], (result) => {
            if (chrome.runtime.lastError) {
                sendResponse({ ...defaultSettings, error: chrome.runtime.lastError.message }); return;
            }
            const settings = {
                enabled: result.overlayEnabled !== undefined ? result.overlayEnabled : defaultSettings.overlayEnabled,
                opacity: result.overlayOpacity !== undefined ? result.overlayOpacity : defaultSettings.overlayOpacity,
                textSize: result.overlayTextSize !== undefined ? result.overlayTextSize : defaultSettings.overlayTextSize,
                displayMode: result.overlayDisplayMode !== undefined ? result.overlayDisplayMode : defaultSettings.overlayDisplayMode
            };
            sendResponse(settings);
        });
    } else if (request.type === "NEW_CAPTION_TEXT_FROM_SOURCE") {
        latestCaptionText = request.text;
        // console.log("BG: Value of latestCaptionText just before broadcast:", latestCaptionText); // Debug
        broadcastCaptionText(latestCaptionText);
    } else if (request.message === "GET_CURRENT_SHARED_CAPTIONS") {
        isAsyncResponse = true;
        sendResponse({ text: latestCaptionText });
    } else if (request.type === "STYLE_UPDATE") {
        let settingToSave = {};
        if (request.setting === "opacity") settingToSave.overlayOpacity = request.value;
        if (request.setting === "textSize") settingToSave.overlayTextSize = request.value;
        chrome.storage.local.set(settingToSave, () => {
             if (chrome.runtime.lastError) console.error("BG: Error saving style update:", chrome.runtime.lastError);
             else console.log("BG: Style update saved:", settingToSave);
        });
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) { /* ... */ return; }
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { message: "APPLY_STYLE_UPDATE", setting: request.setting, value: request.value })
                    .catch(e => { /* ignore */ });
                }
            });
        });
    } else {
        console.warn("My Custom Overlay (Background): Received unknown message structure:", request);
    }
    return isAsyncResponse;
});

function broadcastOverlayState(enabled) {
    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) { console.error("BG: Error querying tabs for state broadcast:", chrome.runtime.lastError); return; }
        console.log(`My Custom Overlay (Background): Broadcasting overlay visibility: ${enabled} to ${tabs.length} tabs.`);
        tabs.forEach(tab => {
            if (tab.id) {
                // console.log(`My Custom Overlay (Background): Attempting to send updateOverlayVisibility (visible: ${enabled}) to tab ${tab.id}`);
                chrome.tabs.sendMessage(tab.id, { message: "updateOverlayVisibility", visible: enabled })
                  .then(response => { /* if (response) console.log(`BG: Tab ${tab.id} ack visibility: ${response.status}`); */ })
                  .catch(error => { /* console.warn(`BG: Could not send visibility to tab ${tab.id}. Error: ${error.message}.`); */ });
            }
        });
    });
}

function broadcastCaptionText(text) {
    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) { console.error("BG: Error querying tabs for caption broadcast:", chrome.runtime.lastError); return; }
        console.log(`My Custom Overlay (Background): Broadcasting caption text to all tabs: "${text}" (Length: ${text ? text.length : 'N/A'})`);
        tabs.forEach(tab => {
            if (tab.id) {
                let targetType = "regular tab";
                if (popoutWindowId !== null && tab.windowId === popoutWindowId) {
                    targetType = "POP-OUT WINDOW'S TAB";
                }
                // console.log(`My Custom Overlay (Background): Attempting to send DISPLAY_SHARED_CAPTION to ${targetType} ${tab.id} with text "${text}"`);
                chrome.tabs.sendMessage(tab.id, { message: "DISPLAY_SHARED_CAPTION", text: text })
                  .catch(error => { /* console.warn(`BG: Could not send caption text to tab ${tab.id} (${targetType}): ${error.message}`); */ });
            }
        });
    });
}

function broadcastModeUpdate(mode) {
    console.log(`My Custom Overlay (Background): Broadcasting mode update: ${mode}`);
    chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) { console.error("BG: Error querying tabs for MODE_UPDATE broadcast", chrome.runtime.lastError); return; }
        tabs.forEach(tab => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { message: "MODE_UPDATE", displayMode: mode })
                .catch(e => { /* console.warn(`Could not send MODE_UPDATE to tab ${tab.id}: ${e.message}`); */ });
            }
        });
    });
}

console.log("My Custom Overlay (Background): Service worker started/restarted.", new Date().toLocaleTimeString());