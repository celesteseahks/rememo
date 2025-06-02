const { GoogleAuth } = require("google-auth-library");

async function getGoogleAccessToken() {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

const fetch = require("node-fetch");

async function processPromptAndGenerateImage(prompt, engine) {
  try {
    const config = configureEngine(engine, prompt);

    let headers = config.headers;
    if (typeof headers === "function") {
      const token = await config.getToken();
      headers = await headers(token);
    }

    if (!config.url || typeof config.url !== "string" || !config.url.startsWith("https://")) {
      throw new Error(`[ERROR] Invalid URL: ${config.url}`);
    }
    
    console.log("[DEBUG] Final URL:", config.url);
    
    const response = await fetch(config.url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(config.body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${engine.toUpperCase()} API responded with status: ${response.status}, ${text}`);
    }

    const data = await response.json();
    return extractImageUrl(data, engine);
  } catch (error) {
    console.error(`Error generating image from ${engine.toUpperCase()}:`, error);
    throw error;
  }
}

// Helper to configure engine-specific details
function configureEngine(engine, prompt) {
  if (engine === "sdxl") {
    return {
      url: "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.STABILITY_KEY}`,
      },
      body: {
        steps: 40,
        width: 1152,
        height: 896,
        cfg_scale: 5,
        samples: 1,
        style_preset: "photographic",
        text_prompts: [
          { text: prompt, weight: 1 },
          {
            text: "identifiable human faces, text, words, numbers, modern buildings, Marina Bay Sands, Esplanade, Art Science Museum, Gardens by the Bay, supertrees, clear human faces",
            weight: -1,
          },
        ],
      },
    };
  } else if (engine === "flux1") {
    return {
      url: "https://api.replicate.com/v1/predictions",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: {
        version: "2fe1d4f56115fe7bf4d6d4f9384f93003cc444fca0781007870ad35f19179121",
        input: {
          width: 1440,
          height: 900,
          prompt: "OLDSG " + prompt,
          aspect_ratio: "custom",
          output_format: "jpg",
          guidance_scale: 2,
          output_quality: 100,
          num_inference_steps: 30,
        },
      },
    };
  } else if (engine === "imagen4") {
    return {
      getToken: getGoogleAccessToken,
      url: `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-4.0-generate-preview-05-20:predict`,
      headers: (token) => ({
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      }),
      body: {
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1
        },
      },
    };
  } else {
    throw new Error("Invalid engine specified");
  }
}

// Helper to extract image URL based on response structure
function extractImageUrl(data, engine) {
  if (engine === "sdxl" && data.artifacts && data.artifacts.length > 0) {
    return { image_url: `data:image/png;base64,${data.artifacts[0].base64}` }; // SDXL format
  } else if (engine === "flux1" && data.output && data.output.length > 0) {
    return { image_url: data.output[0] }; // Use the first item in the output array
  } else if (engine === "imagen4" && data.predictions && data.predictions.length > 0) {
  return {
    image_url: `data:${data.predictions[0].mimeType};base64,${data.predictions[0].bytesBase64Encoded}`,
  };
} else {
    throw new Error(`Failed to parse image URL from ${engine.toUpperCase()} response`);
  }
}

module.exports = processPromptAndGenerateImage;



