// content.js (Final Optimized Version)

// --- CONFIGURATION ---
const REWRITE_CONTEXT = "You are an extremely vigilant bias detection engine. Rewrite the input text to be strictly objective, removing subjective language, emotional adjectives, and absolute terms. Only make a change if bias is detected.";
// Reduced selectors for speed
const TARGET_SELECTORS = ['p', 'li', 'h2', 'h3']; 
const MIN_TEXT_LENGTH = 30; // Increased minimum length for efficiency
const BATCH_SIZE = 15; // Number of elements to process concurrently
const HIGHLIGHT_COLOR = '#ffffe0'; 

let rewriter = null;
let originalTextMap = new Map(); 

// --- 1. INITIALIZE AI API (Called only on user click) ---
async function initializeRewriter() {
    if (!('Rewriter' in self)) {
        return false;
    }
    
    if (!rewriter) {
        try {
            rewriter = await Rewriter.create({});
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

// --- 3. MAIN REWRITING LOGIC (CONCURRENT BATCHING) ---
async function quellBiasOnPage() {
    let rewriteCount = 0;
    const elementsToProcess = Array.from(document.querySelectorAll(TARGET_SELECTORS.join(',')));
    const elementsForBatching = [];

    // Filter elements first to build the full array for processing
    for (const element of elementsToProcess) {
        const originalText = element.textContent.trim();
        if (originalText.length >= MIN_TEXT_LENGTH && !originalTextMap.has(element)) {
            elementsForBatching.push(element);
        }
    }

    console.log(`Bias Quell: Found ${elementsForBatching.length} elements ready for rewriting.`);

    // Process elements in batches using Promise.all
    for (let i = 0; i < elementsForBatching.length; i += BATCH_SIZE) {
        const batch = elementsForBatching.slice(i, i + BATCH_SIZE);
        
        // Create an array of Promises for the current batch
        const rewritePromises = batch.map(element => {
            const originalText = element.textContent.trim();
            
            return rewriter.rewrite(originalText, {
                context: REWRITE_CONTEXT,
                tone: 'neutral',
                length: 'as-is',
                outputLanguage: 'en' 
            })
            .then(neutralText => ({ element, originalText, finalNeutralText: neutralText.trim() }))
            .catch(error => {
                console.warn(`Bias Quell: Skipping one block due to API error.`, error.message);
                return { element, skip: true };
            });
        });

        // Wait for all promises in the current batch to resolve
        const results = await Promise.all(rewritePromises);
        
        // Apply changes to the DOM
        for (const result of results) {
            if (result.skip || result.finalNeutralText === result.originalText) {
                continue;
            }
            
            // SUCCESS: Make the DOM change
            originalTextMap.set(result.element, result.originalText); 
            result.element.textContent = result.finalNeutralText;
            result.element.style.backgroundColor = HIGHLIGHT_COLOR;
            setupHoverEvents(result.element, result.originalText);
            rewriteCount++;
        }
        
        // A brief yield to let the browser breathe after applying changes
        if (i + BATCH_SIZE < elementsForBatching.length) {
            await new Promise(resolve => setTimeout(resolve, 5));
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
            const newElement = element.cloneNode(true); 
            newElement.textContent = originalText; 
            newElement.style.backgroundColor = 'transparent'; 
            element.parentNode.replaceChild(newElement, element);
        }
    });
    
    originalTextMap.clear(); 
    // Setting rewriter to null ensures initialization runs again on next click (user gesture)
    rewriter = null; 
    console.log("Bias Quell: Reverted all changes.");
}

// --- 5. MESSAGE LISTENER (The main entry point) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_FULL_QUELL") {
        (async () => {
            try {
                if (request.isActive) {
                    // Initialize APIs on user click
                    const apiSuccess = await initializeRewriter();
                    if (!apiSuccess) {
                         // Send failure message back if initialization failed
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