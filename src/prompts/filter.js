const allPromptPhrases = require('../promptCategories.json');

// Main filtering function
function filterPromptData(ocrText, freeText) {
  const ocrChunks = ocrText.split('\n');

  let filteredWildcard = null;
  let matchedPhrases = [];

  console.log('--- Debugging OCR chunks ---');
  for (let i = 0; i < ocrChunks.length; i++) {
    const chunk = ocrChunks[i].trim();

    console.log(`Chunk [${i}]: "${chunk}"`);
    
    if (chunk.toUpperCase() === 'WILDCARD' && i + 1 < ocrChunks.length) {
      filteredWildcard = ocrChunks[i + 1].trim();
      console.log(`  -> Found WILDCARD: "${filteredWildcard}"`);
      continue;
    }

    if (allPromptPhrases.includes(chunk)) {
      console.log(`  -> Matched phrase: "${chunk}"`);
      matchedPhrases.push(chunk); // Preserve original casing
    } else {
      console.log(`  -> No match found for: "${chunk}"`);
    }
  }

  console.log('--- Matched phrases:', matchedPhrases);
  console.log('--- Wildcard:', filteredWildcard);
  console.log('--- Free text:', freeText);

  return {
    wildcard: filteredWildcard || '',
    freeText: freeText || '',
    matchedPhrases
  };
}

module.exports = filterPromptData;

