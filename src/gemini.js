const { GoogleGenAI } = require('@google/genai');
const { GoogleAuth } = require('google-auth-library');
const fetch = require('node-fetch');

// Make fetch and Headers available globally
global.fetch = fetch;
global.Headers = fetch.Headers;

let googleAuthCredentials; // This will hold the parsed JSON credentials
let googleAuthClient;     // This will hold the initialized GoogleAuth client

// --- Centralized Credential Parsing ---
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
        googleAuthCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        console.log('Successfully parsed Google Cloud credentials from environment variable GOOGLE_APPLICATION_CREDENTIALS_JSON');

        // Initialize GoogleAuth client with the parsed credentials
        // Define scopes as needed for Vision AI, Generative AI, etc.
        googleAuthClient = new GoogleAuth({
            credentials: googleAuthCredentials,
            scopes: [
                'https://www.googleapis.com/auth/cloud-platform', // General Google Cloud access
                // Add more specific scopes if necessary, e.g.,
                // 'https://www.googleapis.com/auth/cloud-vision',
                // 'https://www.googleapis.com/auth/generative-language'
            ],
        });
        console.log('GoogleAuth client initialized with explicit credentials.');

    } catch (error) {
        console.error('Error parsing Google Cloud credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON:', error);
        // It's crucial to throw or handle this error, as the app cannot proceed without credentials
        throw new Error('Invalid Google Cloud credentials JSON in environment variable.');
    }
} else {
    console.warn('GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set. Attempting default ADC via instance role.');
    // If not set, GoogleAuth will fall back to App Runner's instance role credentials (if configured)
    googleAuthClient = new GoogleAuth({
        scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
        ],
    });
}
// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GCP_PROJECT_ID,
    location: 'global',
    auth: googleAuthClient
});
const model = 'gemini-2.5-flash-preview-05-20';

// Set up generation config
const generationConfig = {
    maxOutputTokens: 65535,
    temperature: 1,
    topP: 1,
    seed: 0,
    safetySettings: [
        {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
        },
        {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
        },
        {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
        },
        {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
        }
    ],
};

async function generateGuidingQuestions(prompt, imageUrl) {
    try {
        const req = {
            model: model,
            contents: [{
                role: 'user',
                parts: [{
                    text: `As a seasoned reminiscence therapy facilitator with a background in psychology, gerontology and occupational therapy, generate 5 open-ended questions to help guide the conversation about this memory. 
    The memory is described as: "${prompt}"
    
    Consider:
    1. Emotional aspects of the memory
    2. Sensory details (sights, sounds, smells)
    3. Social connections and relationships
    4. Cultural and historical context
    5. Personal significance
    
    Format the questions to be gentle, open-ended, and encouraging of detailed responses. Keep them simple and easy to understand. Start from the tangible and work your way up to the abstract to build upon personal significance. 
    Do not focus on styling details like 'In the 1960s, Singapore, viewed from the back or side, fun, happiness, lively, nostalgia, soft light bloom, photorealism, color film photography, 35mm lens, Cinestill 800T, Super 8 film, bokeh, 8k, award-winning, cinematic'
    Return ONLY the questions, one per line, without any additional text, numbering, or formatting.`
                }]
            }],
            config: generationConfig,
        };

        const response = await ai.models.generateContent(req);
        const fullResponse = response.text;

        // Format the questions into a clean list
        const formattedQuestions = fullResponse
            .split('\n')
            .filter(line => {
                // Remove empty lines, markdown formatting, and focus notes
                const cleanLine = line.trim();
                return cleanLine.length > 0 &&
                    !cleanLine.startsWith('*') &&
                    !cleanLine.startsWith('**') &&
                    !cleanLine.startsWith('Here are') &&
                    !cleanLine.startsWith('Focus:');
            })
            .map(line => {
                // Remove quotes and any remaining markdown
                return line.replace(/^["']|["']$/g, '')
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .trim();
            });

        console.log("Cleaned questions:", formattedQuestions);
        return formattedQuestions;
    } catch (error) {
        console.error('Error generating guiding questions:', error);
        throw error;
    }
}

module.exports = {
    generateGuidingQuestions
}; 