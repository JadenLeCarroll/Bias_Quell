const articleText = await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action: "getPageText" }, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(response?.text || "");
    });
});
