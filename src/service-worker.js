// service-worker.js

const SYSTEM_PROMPT = "You are a program called Bias Quell that is used to remove bias from financial and political articles by analyzing the input and presenting a neutral, fact-based summary. Do not use flowery language or opinion.";
const MENU_SELECTION_ID = "biasQuellSelection";
const MENU_ARTICLE_ID = "biasQuellArticle";

// --- Utility Functions (Same as before) ---
async function sendMessageToTab(tabId, action, data = {}) {
    await chrome.tabs.sendMessage(tabId, { action, ...data });
}
function sendError(tabId, message) {
    sendMessageToTab(tabId, "display_error", { message });
}
function sendStatus(tabId, message) {
    sendMessageToTab(tabId, "status_update", { message });
}
function sendResult(tabId, originalText, finalText) {
    sendMessageToTab(tabId, "display_result", { originalText, finalText });
}

// 3. The core AI workflow function (now slightly simplified, accepts text directly)
async function processTextWithAI(tabId, rawText) {
    let promptSession = null;
    let rewriterSession = null;

    try {
        if (rawText.length < 50) {
            throw new Error("Text is too short. Please select or extract substantial article content.");
        }
        
        // --- Phase 1: Bias Quell (LanguageModel API) ---
        sendStatus(tabId, "Phase 1/2: Initializing Bias Quell AI model...");
        
        promptSession = await LanguageModel.create({
            initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
        });

        const prompt = `Rewrite the following text to remove all political and financial bias, presenting only the verifiable facts:\n\n---\n${rawText}`;
        
        sendStatus(tabId, "Phase 1/2: Analyzing article for facts (Prompt API)...");
        
        const stream = await promptSession.promptStreaming(prompt);
        let cleanFacts = '';
        for await (const chunk of stream) {
            cleanFacts += chunk;
        }
        
        // --- Phase 2: Polishing (Rewriter API) ---
        sendStatus(tabId, "Phase 2/2: Polishing and formatting facts (Rewriter API)...");

        rewriterSession = await Rewriter.create({ 
            tone: 'more-formal', 
            length: 'shorter' 
        });

        const rewriteStream = await rewriterSession.rewriteStreaming(cleanFacts);
        let finalRewrittenText = '';
        for await (const chunk of rewriteStream) {
            finalRewrittenText += chunk;
        }

        // --- Finalize ---
        sendResult(tabId, rawText, finalRewrittenText);

    } catch (error) {
        console.error("AI Pipeline Failed:", error);
        sendError(tabId, `AI Processing failed. Error: ${error.message}`);
    } finally {
        if (promptSession) promptSession.destroy();
        if (rewriterSession) rewriterSession.destroy();
    }
}


// --- Event Handlers ---

// Create the two context menu items
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: MENU_SELECTION_ID,
        title: "Bias Quell: Process Selection",
        contexts: ["selection"] 
    });
    chrome.contextMenus.create({
        id: MENU_ARTICLE_ID,
        title: "Bias Quell: Process Full Article (Readability)",
        contexts: ["all"] // Appears anywhere
    });
});

// Listener for the context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_SELECTION_ID && info.selectionText) {
        // 1. Selection Mode: Text is available immediately in info.selectionText
        await processTextWithAI(tab.id, info.selectionText);

    } else if (info.menuItemId === MENU_ARTICLE_ID) {
        // 2. Full Article Mode: We need to ask the Content Script for the text
        try {
            sendStatus(tab.id, "Attempting to extract full article with Readability...");

            // Message the content script to execute the Readability function
            const response = await chrome.tabs.sendMessage(tab.id, { action: "extract_full_article" });

            if (response && response.text) {
                await processTextWithAI(tab.id, response.text);
            } else {
                throw new Error("Readability could not detect the main article content.");
            }
        } catch (e) {
            sendError(tab.id, `Extraction failed: ${e.message}. The page may not be a standard article.`);
        }
    }
});