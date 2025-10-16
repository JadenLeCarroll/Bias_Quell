// content.js

// --- CONFIGURATION ---
const REWRITE_CONTEXT = "You are an extremely vigilant bias detection engine. Analyze the input sentence and produce a rewritten version that is strictly objective. You MUST make a change if any subjective language, emotional adjectives, or absolute terms (e.g., 'always', 'never') are found.";
const TARGET_SELECTORS = ['p', 'li', 'h2', 'h3', 'h4', 'article', 'section', 'div[role="main"]'];
const HIGHLIGHT_COLOR = '#ffffe0';

// CRITICAL YIELD SETTINGS
const AI_BATCH_SIZE = 15;
const YIELD_TIME_MS = 50;

let rewriter = null;
let proofreader = null;
let originalTextMap = new Map();

// --- UTILITY: SLEEP FUNCTION ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. INITIALIZE ALL AI APIS ---
async function initializeAIAPIs() {
    if (!rewriter && 'Rewriter' in self) {
        try {
            rewriter = await Rewriter.create({});
        } catch (e) {
            console.error("Bias Quell: Failed to create Rewriter session.", e);
            return false;
        }
    }
    if (!proofreader && 'Proofreader' in self) {
        try {
            proofreader = await Proofreader.create({});
        } catch (e) {
            console.warn("Bias Quell: Failed to create Proofreader session.", e);
            proofreader = null;
        }
    }
    return true;
}
initializeAIAPIs();

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
    if (!(await initializeAIAPIs())) return 0;

    let rewriteCount = 0;
    let processedSinceYield = 0;

    const elementsToProcess = document.querySelectorAll(TARGET_SELECTORS.join(','));
    console.log(`[Bias Quell] 🔎 Found ${elementsToProcess.length} potential elements to process on this page.`);

    for (const element of elementsToProcess) {
        if (processedSinceYield >= AI_BATCH_SIZE) {
            await sleep(YIELD_TIME_MS);
            processedSinceYield = 0;
        }

        if (element.textContent.trim().length < 15) continue;
        if (originalTextMap.has(element)) continue;

        const originalText = element.textContent.trim();

        try {
            const neutralText = await rewriter.rewrite(originalText, {
                context: REWRITE_CONTEXT,
                tone: 'neutral',
                length: 'as-is',
                format: 'as-is',
            });
            processedSinceYield++;

            let finalOutput = neutralText;

            if (proofreader) {
                const proofreadResult = await proofreader.proofread(finalOutput);
                if (typeof proofreadResult === 'string') {
                    finalOutput = proofreadResult;
                }
            }

            const finalNeutralText = finalOutput.trim();

            if (finalNeutralText !== originalText) {
                originalTextMap.set(element, originalText);
                element.textContent = finalNeutralText;
                element.style.backgroundColor = HIGHLIGHT_COLOR;
                setupHoverEvents(element, originalText);
                rewriteCount++;
            }

        } catch (error) {
            console.warn(`[Bias Quell] ⚠️ Failed to process one text block (Continuing loop) - ${error.message}`);
        }
    }

    return rewriteCount;
}

// --- 4. REVERSION LOGIC ---
function revertChanges() {
    originalTextMap.forEach((originalText, element) => {
        element.textContent = originalText;
        element.style.backgroundColor = 'transparent';
        element.removeEventListener('mouseenter', element.onmouseenter);
        element.removeEventListener('mouseleave', element.onmouseleave);
        element.onmouseenter = null;
        element.onmouseleave = null;
    });
    originalTextMap.clear();
}

// --- 5. MESSAGE LISTENER (Triggered by Background Script) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_FULL_QUELL") {
        console.log("[Bias Quell] ✅ Message received from service worker:", request);

        (async () => {
            let count = 0;
            try {
                if (request.isActive) {
                    count = await quellBiasOnPage();
                    console.log(`[Bias Quell] ✅ Quell finished. Total changes made: ${count}. Sending response.`);
                    sendResponse({ success: true, changesMade: count, action: 'ACTIVATED' });
                } else {
                    revertChanges();
                    console.log("[Bias Quell] ✅ Changes reverted. Sending response.");
                    sendResponse({ success: true, changesMade: 0, action: 'DEACTIVATED' });
                }
            } catch (error) {
                console.error("[Bias Quell] ❌ CRITICAL ERROR in content script:", error);
                sendResponse({ success: false, error: "Critical execution error in Content Script." });
            }
        })();
        return true;
    }
});