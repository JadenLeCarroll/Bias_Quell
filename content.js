// content.js

// --- CONFIGURATION ---
const REWRITE_CONTEXT = "You are an extremely vigilant bias detection engine. Analyze the input sentence and produce a rewritten version that is strictly objective. You MUST make a change if any subjective language, emotional adjectives, or absolute terms (e.g., 'always', 'never') are found.";
const TARGET_SELECTORS = ['p', 'h1', 'h2', 'h3', 'li'];
const HIGHLIGHT_COLOR = '#ffffe0'; 

let rewriter = null; 
let proofreader = null; 
let originalTextMap = new Map(); 

// --- 1. INITIALIZE ALL AI APIS ---
async function initializeAIAPIs() {
    if (!rewriter && 'Rewriter' in self) {
        try {
            rewriter = await Rewriter.create({});
        } catch (e) {
            console.error("Bias Quell: Failed to create Rewriter session.", e);
        }
    }
    if (!proofreader && 'Proofreader' in self) {
        try {
            proofreader = await Proofreader.create({});
        } catch (e) {
             console.warn("Bias Quell: Failed to create Proofreader session.", e);
        }
    }
    return rewriter !== null; // Return true only if the essential Rewriter is ready
}
initializeAIAPIs();

// --- 2. HOVER FEEDBACK FUNCTIONS (Unchanged) ---
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
    // Wait for the Rewriter to be initialized before starting the loop
    if (!(await initializeAIAPIs())) return 0; 
    
    let rewriteCount = 0; 
    const elementsToProcess = document.querySelectorAll(TARGET_SELECTORS.join(','));

    for (const element of elementsToProcess) { 
        if (element.children.length > 0 || element.textContent.trim().length < 20) continue; 
        if (originalTextMap.has(element)) continue;
        
        const originalText = element.textContent.trim();
        originalTextMap.set(element, originalText);

        try {
            // Stage 1: Rewriter API (Bias Quell)
            const neutralText = await rewriter.rewrite(originalText, {
                context: REWRITE_CONTEXT, 
                tone: 'neutral', 
                length: 'as-is',
                format: 'as-is',
            });
            
            let finalOutput = neutralText;
            
            // Stage 2: Proofreader API (Quality Check)
            if (proofreader) {
                finalOutput = await proofreader.proofread(finalOutput);
            }
            
            // Stage 3: In-place DOM update
            const finalNeutralText = finalOutput.trim();
            if (finalNeutralText !== originalText) { 
                element.textContent = finalNeutralText;
                element.style.backgroundColor = HIGHLIGHT_COLOR;
                setupHoverEvents(element, originalText);
                rewriteCount++;
            }
            
        } catch (error) {
            console.warn("Bias Quell: Failed to process element:", element, error);
            // Revert element state on error
            element.textContent = originalTextMap.get(element);
            element.style.backgroundColor = 'transparent'; 
            originalTextMap.delete(element); 
        }
    }
    
    return rewriteCount; 
}

// --- 4. REVERSION LOGIC (Unchanged) ---
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

// --- 5. MESSAGE LISTENER (The Communication Fix) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_FULL_QUELL") {
        (async () => {
            let count = 0;
            try {
                if (request.isActive) {
                    count = await quellBiasOnPage();
                    sendResponse({ success: true, changesMade: count, action: 'ACTIVATED' });
                } else {
                    revertChanges();
                    sendResponse({ success: true, changesMade: 0, action: 'DEACTIVATED' });
                }
            } catch (error) {
                // Return failure message if the whole process threw an unhandled error
                console.error("Bias Quell: Critical Content Script Error:", error);
                sendResponse({ success: false, error: "Critical execution error in Content Script." });
            }
        })();
        return true; 
    }
});