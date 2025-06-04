const allPromptPhrases = require('../promptCategories.json');

// Main filtering function
function filterPromptData(ocrText, freeText) {
  const ocrChunks = ocrText.split('\n');
  let matchedPhrases = [];

  console.log('--- Debugging OCR chunks ---');
  for (let i = 0; i < ocrChunks.length; i++) {
    const chunk = ocrChunks[i].trim();

    console.log(`Chunk [${i}]: "${chunk}"`);

    if (allPromptPhrases.includes(chunk)) {
      console.log(`  -> Matched phrase: "${chunk}"`);
      matchedPhrases.push(chunk); // Preserve original casing
    } else {
      console.log(`  -> No match found for: "${chunk}"`);
    }
  }

  console.log('--- Matched phrases:', matchedPhrases);
  console.log('--- Free text:', freeText);

  return {
    freeText: freeText || '',
    matchedPhrases
  };
}

module.exports = filterPromptData;

