function createTextPrompt(freeText) {

  // Create the prompt using the filtered values
  const prompt = `In the 1960s, ${freeText}, Asian, Singapore, viewed from the back or side, fun, happiness, lively, nostalgia, soft light bloom, photorealism, color film photography, 35mm lens, Cinestill 800T, Super 8 film, bokeh, 8k, award-winning, cinematic`;

  return prompt;
}

module.exports = createTextPrompt;
