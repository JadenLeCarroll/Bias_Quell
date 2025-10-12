// Listens for messages from side panel to return page text
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getPageText") {
        const text = document.body ? document.body.innerText : "";
        sendResponse({ text });
    }
});