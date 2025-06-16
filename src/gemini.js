const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');

// Make fetch and Headers available globally
global.fetch = fetch;
global.Headers = fetch.Headers;


// Initialize Vertex with your Cloud project and location
const genAI = new GoogleGenAI(process.env.GOOGLE_API_KEY);

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

async function generateGuidingQuestions(prompt) {
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

        const response = await genAI.models.generateContent(req);
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