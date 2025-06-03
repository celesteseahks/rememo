const { generateGuidingQuestions } = require('./src/gemini');

async function testGemini() {
    try {
        const prompt = "father playing badminton in the 1960s in Singapore";
        console.log("Testing with prompt:", prompt);

        const questions = await generateGuidingQuestions(prompt);
        console.log("\nGenerated Questions:");
        questions.forEach((q, i) => console.log(`${i + 1}. ${q}`));
    } catch (error) {
        console.error("Error:", error);
    }
}

testGemini(); 