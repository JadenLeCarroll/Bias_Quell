document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENT REFERENCES ---
    const errorMessage = document.getElementById("error-message");
    const submitButton = document.getElementById("submit-button");
    const responseArea = document.getElementById("response-area");

    // --- 1. INITIAL SETUP ---
    if (!('Rewriter' in self)) {
        errorMessage.style.display = "block";
        errorMessage.textContent = `Error: Required AI APIs not detected in popup context.`;
        submitButton.disabled = true;
        return;
    }

    // Function to update the button and status text based on state
    const renderState = (isActive, changesMade = 0) => {
        submitButton.disabled = false; 
        errorMessage.style.display = "none";
        errorMessage.textContent = "";

        if (isActive) {
            submitButton.classList.remove('off');
            submitButton.classList.add('on');
            submitButton.textContent = "Bias Quell is ACTIVE (Click to Turn Off)";
            responseArea.innerHTML = `
                ✅ **BIAS QUELL ACTIVE.**
                <hr style="border: 0; border-top: 1px solid #ddd; margin: 8px 0;">
                **Summary:** ${changesMade} text blocks were processed and neutralized on this page. Hover over the yellow-highlighted text to see the original biased version.
            `;
        } else {
            submitButton.classList.remove('on');
            submitButton.classList.add('off');
            submitButton.textContent = "Activate Bias Quell (Off)";
            responseArea.textContent = "Feature currently inactive. Click 'Activate' to neutralize bias on this page.";
        }
    };

    // --- INITIAL STATE CHECK ---
    submitButton.disabled = true; 
    
    chrome.runtime.sendMessage({ action: "REQUEST_TOGGLE_STATE" }, (response) => {
        submitButton.disabled = false; 

        if (chrome.runtime.lastError) {
            console.warn("Bias Quell:", chrome.runtime.lastError.message);
            renderState(false); 
            return;
        }
        
        if (response && response.hasOwnProperty('isQuellActive')) {
            renderState(response.isQuellActive);
        } else {
            renderState(false);
        }
    });

    // --- 2. TOGGLE LOGIC ---
    submitButton.addEventListener("click", async (e) => {
        e.preventDefault(); 

        const wasActive = submitButton.classList.contains('on');
        const newState = !wasActive;

        submitButton.disabled = true;
        errorMessage.style.display = "none";
        errorMessage.textContent = "";
        responseArea.textContent = newState ? "Activating and scanning page..." : "Deactivating feature, reverting changes...";

        try {
            chrome.runtime.sendMessage({
                action: "TOGGLE_QUELL",
                newState: newState
            }, (response) => {
                
                if (chrome.runtime.lastError) {
                    errorMessage.style.display = "block";
                    errorMessage.textContent = `Action failed: ${chrome.runtime.lastError.message}`;
                    renderState(!newState); 
                    return;
                }

                if (response && response.success) {
                    renderState(newState, response.changesMade);
                } else {
                    // Display the specific error relayed from background/content script
                    errorMessage.style.display = "block";
                    errorMessage.textContent = `Action failed: ${response?.error || "Unknown communication error."}`;
                    renderState(!newState); 
                }
            });
        } catch (error) {
            errorMessage.style.display = "block";
            errorMessage.textContent = `Toggle Error: ${error.message}`;
            submitButton.disabled = false;
        }
    });
});