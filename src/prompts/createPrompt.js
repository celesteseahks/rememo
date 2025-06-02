// createPrompt.js

function createPrompt(filteredValues) {
  const { matchedPhrases = [], wildcard = '', freeText = '' } = filteredValues;

  // Join matched phrases into a single string
  const joinedPhrases = matchedPhrases.join(', ');

  // Create the prompt using the filtered values
  const prompt = `In the 1960s, ${joinedPhrases}${wildcard ? ', ' + wildcard : ''}${freeText ? ', ' + freeText : ''}, Singapore, viewed from the back or side, fun, happiness, lively, nostalgia, soft light bloom, photorealism, color film photography, 35mm lens, Cinestill 800T, Super 8 film, bokeh, 8k, award-winning, cinematic`;

  return prompt;
}

module.exports = createPrompt;
