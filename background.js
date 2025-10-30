// background.js

// 1. Initialize the global state: Bias Quell is OFF by default.
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ isQuellActive: false });
});

// 2. Listener that routes the TOGGLE STATE request from the Popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "REQUEST_TOGGLE_STATE") {
        chrome.storage.local.get('isQuellActive', (data) => {
            sendResponse({ isQuellActive: data.isQuellActive || false }); 
        });
        return true; // Indicates asynchronous response
    }
    
    // 3. Listener to tell the content script to re-process the page
    if (request.action === "TOGGLE_QUELL") {
        (async () => {
            const newState = request.newState;

            // 1. Update state first
            await chrome.storage.local.set({ isQuellActive: newState });
            
            // 2. Find the active tab
            let tab;
            try {
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) throw new Error("No active tab found.");
            } catch (error) {
                sendResponse({ success: false, error: `Tab access failed: ${error.message}` });
                return;
            }
            
            // 3. Send message and await response from content.js
            try {
                const contentResponse = await chrome.tabs.sendMessage(tab.id, {
                    action: "RUN_FULL_QUELL",
                    isActive: newState
                });
                
                // Success: Send the final result back to the popup
                sendResponse({ 
                    success: true, 
                    changesMade: contentResponse.changesMade, 
                    action: newState ? 'ACTIVATED' : 'DEACTIVATED' 
                });
            } catch (error) {
                // Failure: Content script communication failed (e.g., script threw an error, or permission denied)
                 sendResponse({ success: false, error: `Content Script Communication Error: ${error.message}` });
            }
        })();
        return true;
    }
});