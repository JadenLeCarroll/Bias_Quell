// background.js

// 1. Initialize the global state: Bias Quell is OFF by default.
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ isQuellActive: false });
});

// 2. Listener that routes the TOGGLE STATE request from the Popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "REQUEST_TOGGLE_STATE") {
        // Guarantee a response is sent.
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
            
            // 2. Find the active tab and tell the content script to run its main function
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 3. Send message and await response from content.js with the changesMade count
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
                // Failure: Content script communication failed (e.g., page reloaded or script threw an error)
                 sendResponse({ success: false, error: `Content Script Error: ${error.message}` });
            }
        })();
        return true;
    }
});