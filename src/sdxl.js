const { GoogleAuth } = require('google-auth-library'); // Import GoogleAuth
const fetch = require("node-fetch"); // Ensure node-fetch is available for fetch calls

let credentials = null;
let googleAuthClient = null; // Declare a variable for the GoogleAuth client

try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    console.log('sdxl.js: Successfully parsed Google Cloud credentials for potential use.');

    // Initialize GoogleAuth client with explicit credentials
    googleAuthClient = new GoogleAuth({
      projectId: process.env.GCP_PROJECT_ID, // Ensure this is set in your environment
      credentials: credentials,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',            // General cloud access
        'https://www.googleapis.com/auth/generative-language'       // Specific scope for Generative Language API (for Imagen)
        // If you use other Google Cloud APIs that need explicit scopes within sdxl.js, add them here
      ],
    });
    console.log('sdxl.js: GoogleAuth client initialized with explicit credentials.');

  } else {
    console.warn('sdxl.js: GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set. Attempting default Application Default Credentials (ADC).');
    // If not set, GoogleAuth will fall back to App Runner's instance role credentials (if configured)
    googleAuthClient = new GoogleAuth({
      projectId: process.env.GCP_PROJECT_ID,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/generative-language'
      ],
    });
    console.log('sdxl.js: GoogleAuth client initialized with default ADC.');
  }
} catch (error) {
  console.error('sdxl.js ERROR: Error parsing Google Cloud credentials or initializing GoogleAuth:', error);
  // It's crucial to throw or handle this error, as the app cannot proceed without proper authentication setup.
  // For now, we'll let it try to proceed, but expect errors for Google Cloud API calls that rely on it.
}

class ImageFilterError extends Error {
  constructor(message, originalEngine, filteredReason) {
    super(message);
    this.name = 'ImageFilterError';
    this.originalEngine = originalEngine;
    this.filteredReason = filteredReason;
  }
}

/**
 * Helper function to obtain a Google Cloud access token using the initialized GoogleAuth client.
 * @returns {Promise<string>} The access token string.
 * @throws {Error} If the GoogleAuth client is not initialized or fails to get a token.
 */
async function getGoogleAccessToken() {
  if (!googleAuthClient) {
    console.error("sdxl.js: getGoogleAccessToken called but googleAuthClient is null.");
    throw new Error("GoogleAuth client not initialized. Cannot obtain access token.");
  }
  try {
    console.log("sdxl.js: Attempting to get access token from GoogleAuth client...");
    const accessToken = await googleAuthClient.getAccessToken();
    console.log("sdxl.js: Raw accessToken object from getAccessToken():", accessToken);

    if (!accessToken || typeof accessToken !== 'string' || accessToken.length === 0) {
      console.error("sdxl.js: getAccessToken returned no token or invalid token property.");
      throw new Error("Failed to obtain access token from GoogleAuth client.");
    }
    console.log("sdxl.js: Successfully obtained access token.");
    return accessToken; // Return the token string directly
  } catch (error) {
    console.error("sdxl.js: Error getting Google Access Token directly from GoogleAuth:", error);
    // Re-throw the original error to preserve the stack trace from google-auth-library
    throw error;
  }
}

async function processPromptAndGenerateImage(prompt, engine, triedEngines = []) {
  const currentTriedEngines = [...triedEngines, engine];

  console.log(`sdxl.js: Attempting to generate image with engine: ${engine} (Tried: ${currentTriedEngines.join(', ')})`);
  console.log(`sdxl.js: Prompt: "${prompt}"`);

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

    console.log(`[DEBUG] Final URL for ${engine}:`, config.url);
    console.log(`sdxl.js: Request body sent to ${engine} API:`, JSON.stringify(config.body, null, 2));


    const response = await fetch(config.url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(config.body),
    });

    // NEW DEBUG LOG: Log the raw response status
    console.log(`sdxl.js: ${engine.toUpperCase()} API Raw Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${engine.toUpperCase()} API responded with status: ${response.status}, ${text}`);
    }

    const data = await response.json();
    console.log(`sdxl.js: Raw data received from ${engine} API:`, JSON.stringify(data, null, 2)); // <-- Keep this log
    return extractImageUrl(data, engine);

  } catch (error) {
    // --- NEW FALLBACK LOGIC ---
    if (error instanceof ImageFilterError) {
      console.warn(`sdxl.js: Content filtered by ${engine}. Attempting fallback...`);
      // Define a preferred fallback order. You can customize this.
      const fallbackOrder = ["imagen4", "flux1", "sdxl"]; // Example: Imagen first, then SDXL, then Flux1

      const availableFallbackEngines = fallbackOrder.filter(
        (fallbackEngine) => !currentTriedEngines.includes(fallbackEngine)
      );

      if (availableFallbackEngines.length > 0) {
        const nextEngine = availableFallbackEngines[0];
        console.log(`sdxl.js: Switching to fallback engine: ${nextEngine}`);
        // Recursively call with the next engine and updated triedEngines list
        return processPromptAndGenerateImage(prompt, nextEngine, currentTriedEngines);
      } else {
        // No more fallback engines available
        console.error(`sdxl.js: All configured engines (${fallbackOrder.join(', ')}) failed or filtered for prompt: "${prompt}".`);
        throw new Error(`Image generation failed for prompt: "${prompt}". All attempts filtered or failed. Last filter reason: ${error.filteredReason || 'N/A'}`);
      }
    } else {
      // Re-throw other types of errors immediately
      console.error(`Error generating image from ${engine.toUpperCase()}:`, error);
      throw error;
    }
    // --- END NEW FALLBACK LOGIC ---
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
    // Configuration for Google's Imagen (imagen-3.0-generate-002) model
    if (!process.env.GCP_PROJECT_ID) {
      throw new Error("GCP_PROJECT_ID environment variable is not set. Required for Imagen API calls.");
    }
    return {
      // getToken is a function that will be called by processPromptAndGenerateImage
      getToken: getGoogleAccessToken,
      url: `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-4.0-ultra-generate-preview-06-06:predict`,
      headers: (token) => ({ // headers is a function that takes the token and returns the headers object
        "Authorization": `Bearer ${token}`, // Use the obtained access token
        "Content-Type": "application/json; charset=utf-8",
      }),
      body: {
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1, // Request one image
          safetySetting: "block_only_high",
          includeRaiReason: true,
          aspectRatio: "16:9",
          enhancePrompt: true,
        },
      },
    };
  } else {
    throw new Error("Invalid engine specified");
  }
}

// Helper to extract image URL based on response structure
function extractImageUrl(data, engine) {
  console.log(`sdxl.js: extractImageUrl received data for ${engine}:`, JSON.stringify(data, null, 2));

  if (engine === "sdxl" && data.artifacts && data.artifacts.length > 0) {
    return { image_url: `data:image/png;base64,${data.artifacts[0].base64}` };
  } else if (engine === "flux1" && data.output && data.output.length > 0) {
    return { image_url: data.output[0] };
  } else if (engine === "imagen4") {
    // --- NEW LOGIC FOR IMAGEN4 FILTERING ---
    if (data.predictions && data.predictions.length > 0 && data.predictions[0].raiFilteredReason) {
      const filterReason = data.predictions[0].raiFilteredReason;
      console.error(`sdxl.js: IMAGEN4 response indicates content was filtered: ${filterReason}`);
      // Throw a specific error type to be caught by processPromptAndGenerateImage for fallback
      throw new ImageFilterError(`IMAGEN4 content filtered: ${filterReason}`, engine, filterReason);
    } else if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64Encoded) {
      // Imagen response includes mimeType and base64 encoded bytes
      return { image_url: `data:${data.predictions[0].mimeType};base64,${data.predictions[0].bytesBase64Encoded}` };
    }
    // --- END NEW LOGIC ---
  }

  // Fallback for unexpected or missing data structure
  console.error(`sdxl.js: Failed to parse image URL from ${engine.toUpperCase()} response. Unexpected data structure:`, JSON.stringify(data, null, 2));
  throw new Error(`Failed to parse image URL from ${engine.toUpperCase()} response`);
}

module.exports = processPromptAndGenerateImage;
