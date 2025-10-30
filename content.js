// content.js (Simplified Version)

// --- CONFIGURATION ---
const REWRITE_CONTEXT = "You are an extremely vigilant bias detection engine. Rewrite the input text to be strictly objective, removing subjective language, emotional adjectives, and absolute terms. Only make a change if bias is detected.";
const TARGET_SELECTORS = ['p', 'li', 'h2', 'h3', 'h4'];
const HIGHLIGHT_COLOR = '#ffffe0'; // Yellow highlight

// Small yield to prevent blocking the UI during heavy processing
const YIELD_TIME_MS = 10; 

let rewriter = null;
let originalTextMap = new Map(); 

// --- UTILITY: SLEEP FUNCTION ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. INITIALIZE AI API (Called only on user click) ---
async function initializeRewriter() {
    if (!('Rewriter' in self)) {
        console.error("Bias Quell: Rewriter API not available.");
        return false;
    }
    
    if (!rewriter) {
        try {
            rewriter = await Rewriter.create({});
            console.log("Bias Quell: Rewriter successfully initialized.");
        } catch (e) {
            console.error("Bias Quell: Failed to create Rewriter instance.", e.message);
            return false;
        }
    }
    return true;
}

// --- 2. HOVER FEEDBACK FUNCTIONS ---
function setupHoverEvents(element, originalText) {
    const neutralText = element.textContent;
    element.addEventListener('mouseenter', () => {
        element.textContent = originalText;
        element.style.backgroundColor = '#f8d7da';
    });
    element.addEventListener('mouseleave', () => {
        element.textContent = neutralText;
        element.style.backgroundColor = HIGHLIGHT_COLOR;
    });
}

// --- 3. MAIN REWRITING LOGIC ---
async function quellBiasOnPage() {
    let rewriteCount = 0;
    const elementsToProcess = document.querySelectorAll(TARGET_SELECTORS.join(','));
    console.log(`Bias Quell: Starting scan on ${elementsToProcess.length} elements.`);

    for (const element of elementsToProcess) {
        // Yield occasionally to keep UI responsive
        if (rewriteCount % 10 === 0) { 
            await sleep(YIELD_TIME_MS);
        }

        const originalText = element.textContent.trim();
        
        // Skip short elements or those already quelled
        if (originalText.length < 15 || originalTextMap.has(element)) {
            continue;
        }

        try {
            const neutralText = await rewriter.rewrite(originalText, {
                context: REWRITE_CONTEXT,
                tone: 'neutral',
                length: 'as-is',
                outputLanguage: 'en' 
            });
            
            const finalNeutralText = neutralText.trim();

            if (finalNeutralText !== originalText) {
                // SUCCESS: Make the DOM change
                originalTextMap.set(element, originalText); 
                element.textContent = finalNeutralText;
                element.style.backgroundColor = HIGHLIGHT_COLOR;
                setupHoverEvents(element, originalText);
                rewriteCount++;
                console.log(`Bias Quell: Successfully processed text block #${rewriteCount}.`);
            }
        } catch (error) {
            console.warn(`Bias Quell: Skipping text block due to error.`, error.message);
        }
    }
    console.log(`Bias Quell: Scan finished. Total changes: ${rewriteCount}.`);
    return rewriteCount;
}

// --- 4. REVERSION LOGIC ---
function revertChanges() {
    const elementsToRevert = Array.from(originalTextMap.keys());
    
    elementsToRevert.forEach(element => {
        const originalText = originalTextMap.get(element);
        
        if (element.parentNode) {
            // Restore original text and clear highlight using a clone
            const newElement = element.cloneNode(true); 
            newElement.textContent = originalText; 
            newElement.style.backgroundColor = 'transparent'; 
            element.parentNode.replaceChild(newElement, element);
        }
    });
    
    originalTextMap.clear(); 
    rewriter = null; // Allow re-initialization on next activation
    console.log("Bias Quell: Reverted all changes.");
}

// --- 5. MESSAGE LISTENER (Triggered by Background Script) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_FULL_QUELL") {
        (async () => {
            try {
                if (request.isActive) {
                    // Initialize APIs on user click
                    const apiSuccess = await initializeRewriter();
                    if (!apiSuccess) {
                         sendResponse({ success: false, error: "AI API initialization failed. Check console for details." });
                         return;
                    }

                    const count = await quellBiasOnPage();
                    sendResponse({ success: true, changesMade: count, action: 'ACTIVATED' });
                } else {
                    revertChanges(); 
                    sendResponse({ success: true, changesMade: 0, action: 'DEACTIVATED' });
                }
            } catch (error) {
                console.error("Bias Quell: Critical content script error:", error);
                sendResponse({ success: false, error: `Critical execution error: ${error.message}` });
            }
        })();
        return true; 
    }
});