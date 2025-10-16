// popup.js

// --- CONFIGURATION ---

// System Prompt: Defines the model's new role (Bias Quell) and enforces structured output.
const SYSTEM_PROMPT = "You are a bias analysis and rewriting expert named Bias Quell. Your task is to analyze the user's text (and image, if provided) for implicit bias, subjective language, or unfair framing. Your response MUST contain a neutral, objective rewrite of the input text, focusing only on factual language. Provide a highly focused, structured response in JSON format. ONLY output the JSON object.";

// JSON Schema: Defines the exact data structure the model MUST return (Now only 'quelled_text').
const JSON_SCHEMA = {
    type: 'object',
    properties: {
        quelled_text: { 
            type: 'string', 
            description: 'The rewritten, neutral, and objective version of the user\'s input text.' 
        },
        analysis_summary: {
            type: 'string',
            description: 'A brief summary of the bias found (e.g., subjective adjectives, emotional framing).'
        }
    },
    required: ['quelled_text', 'analysis_summary'] // Requesting two fields for a richer output
};


// --- GLOBAL AI INSTANCES AND STATE ---
let session = null; 


// --- UTILITY FUNCTION: FORMAT RAW JSON OUTPUT ---

/**
 * Takes the raw JSON string output and formats it into a human-readable, professional string.
 * It now only formats the neutral, quelled text and the analysis summary.
 */
function formatCreativeResponse(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        if (!data || !data.quelled_text || !data.analysis_summary) {
            // Check for the expected fields
            return "Error: Could not parse expected data (quelled_text or analysis_summary field missing).";
        }

        let formattedOutput = "★ **BIAS QUELL ANALYSIS** ★\n";
        formattedOutput += "=======================================\n\n";
        
        // 1. Analysis Summary
        formattedOutput += "**Bias Summary:**\n";
        formattedOutput += `${data.analysis_summary}\n\n`; 
        
        // 2. Quelled Output (The rewritten text)
        formattedOutput += "**Neutral Rewrite:**\n";
        formattedOutput += `${data.quelled_text}\n`; 

        formattedOutput += "\n=======================================";

        return formattedOutput;

    } catch (e) {
        console.error("Formatting Error:", e);
        return `Error: Model output was not valid JSON. Please check the raw output:\n\n${jsonString}`;
    }
}


// --- MAIN LOGIC ---

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENT REFERENCES ---
    const errorMessage = document.getElementById("error-message");
    const promptInput = document.getElementById("prompt-input");
    const submitButton = document.getElementById("submit-button");
    const responseArea = document.getElementById("response-area");
    const imageInput = document.getElementById("image-input");
    const imagePreview = document.getElementById("image-preview");
    const imageDropZone = document.getElementById("image-drop-zone");
    

    // --- 1. INITIAL API CHECK AND SESSION SETUP ---
    if (!('LanguageModel' in self)) { 
        errorMessage.style.display = "block";
        errorMessage.textContent = `Error: Required AI API (LanguageModel) not supported.`;
        submitButton.disabled = true;
        return;
    }
    
    const updateSession = async () => {
        try {
            if (session) session.destroy();
            
            // Create LanguageModel Session (for Prompt API - Multimodal)
            session = await LanguageModel.create({
                initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
                expectedInputs: [
                    { type: 'text' }, 
                    { type: 'image' } 
                ],
            });
            console.log("AI session created.");
        } catch (e) {
            errorMessage.style.display = "block";
            errorMessage.textContent = `Error creating AI session: ${e.message}. Check Chrome flags and disk space.`;
            submitButton.disabled = true;
        }
    };

    await updateSession();

    // --- 2. IMAGE HANDLER (PREVIEW & DRAG-AND-DROP) ---
    
    const handleFileSelection = (files) => {
        const file = files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
                responseArea.textContent = 'Image selected. Enter text to analyze.';
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.style.display = 'none';
            imagePreview.src = '#';
        }
    };

    // A. Standard File Input Event Listener
    imageInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files); 
    });

    // B. Drag and Drop Logic
    
    // Prevent default browser behavior for drag events targeting the drop zone
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        imageDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Visual feedback on drag enter
    imageDropZone.addEventListener('dragenter', () => {
        imageDropZone.style.borderColor = '#4285f4';
        imageDropZone.style.backgroundColor = '#e6e6e6';
    }, false);
    
    // Visual feedback on drag leave (or drop is complete)
    ['dragleave', 'drop'].forEach(eventName => {
        imageDropZone.addEventListener(eventName, () => {
            imageDropZone.style.borderColor = '#aaa';
            imageDropZone.style.backgroundColor = '#f0f0f0';
        }, false);
    });

    // Handle the file drop event
    imageDropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            const newFileList = new DataTransfer();
            newFileList.items.add(files[0]);

            imageInput.files = newFileList.files;
            handleFileSelection(newFileList.files); 
        }
    }, false);

    // Make the drop zone clickable
    imageDropZone.addEventListener('click', () => {
        imageInput.click();
    });


    // --- 3. PROMPTING LOGIC (CORE MULTIMODAL GENERATION) ---
    const promptModel = async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        const imageFile = imageInput.files[0]; 

        if ((!prompt && !imageFile) || !session) {
             responseArea.textContent = "Please provide text to analyze and/or an image for context.";
             return;
        }

        responseArea.innerHTML = "Analyzing bias and generating rewrite...";
        submitButton.disabled = true;

        try {
            // Build the explicit content array
            const userMessageContent = [];

            // 1. Image part (if available)
            if (imageFile) {
                userMessageContent.push({
                    type: 'image',
                    value: imageFile 
                });
            }
            
            // 2. Text part (if available)
            if (prompt) {
                 userMessageContent.push({
                    type: 'text',
                    value: prompt 
                });
            }

            const messageArray = [{ role: 'user', content: userMessageContent }];

            // Call the Prompt API with the JSON constraint
            const stream = await session.promptStreaming(messageArray, {
                responseConstraint: JSON_SCHEMA
            });

            let result = '';
            responseArea.textContent = ''; 

            for await (const chunk of stream) {
                result += chunk;
                responseArea.textContent = result;
            }
            
            // Final Step: Format the raw JSON into human-readable and insert into the DOM
            responseArea.innerHTML = formatCreativeResponse(result);

        } catch (error) {
            responseArea.textContent = `Error during generation: ${error.message}`;
        } finally {
            submitButton.disabled = false;
        }
    };

    // --- 4. ATTACH LISTENERS FOR MAIN ACTIONS ---
    submitButton.addEventListener("click", promptModel);

    promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            promptModel(e);
        }
    });
});