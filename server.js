const path = require("path");
const vision = require("@google-cloud/vision");
const { Storage } = require("@google-cloud/storage");
const fastify = require("fastify")({ logger: true });
const fs = require("fs");
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);
const filterPromptData = require("./src/prompts/filter");
const createPrompt = require("./src/prompts/createPrompt");
const createTextPrompt = require("./src/prompts/createTextPrompt");
const processPromptAndGenerateImage = require("./src/sdxl");

let userAgentInfo;

// Set up Google Cloud Vision client
const client = new vision.ImageAnnotatorClient();

// Initialize Google Cloud Storage client
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

async function uploadToGCS(fileBuffer, destinationPath) {
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    // Upload the file
    await file.save(fileBuffer);

    console.log(`File uploaded to GCS: ${destinationPath}`);

    // Make the file public
    await file.makePublic();

    // Return the public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
    console.log(`Generated public URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading to GCS or making file public:', error);
    throw error;
  }
}

const Airtable = require("airtable");

// Set up Airtable configuration
const base = new Airtable({ apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base("appudv8E66pNtEcgz");

// Logging function for Airtable
const fetch = require("node-fetch");

async function logToAirtable({ generationId, username, uploadedImageUrl, freeText, ocrText, generatedImageUrl, input, prompt, engine, ipAddress, userAgentInfo }) {
  console.log("=========logging to airtable");
  try {
    
    // Log metadata to Airtable
    const response = await fetch("https://api.airtable.com/v0/appudv8E66pNtEcgz/Generated%20Images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
         fields: {
          'Generation ID': generationId,
          'Username' : username,
          'Uploaded Image': uploadedImageUrl, // Store as a URL
          'Free Text' : freeText,
          'OCR Text' : ocrText,
          'Generated Image': generatedImageUrl, // Store as a URL
          'Input': input,
          'Prompt': prompt,
          'Engine': engine,
          'IP Address': ipAddress,
          'Timestamp': new Date().toISOString(),
          'User Agent Info': userAgentInfo,
        },
      }),
    });

    const airtableResponse = await response.json();

    if (!response.ok) {
      throw new Error(
        `Error logging to Airtable: ${airtableResponse.error?.message || response.statusText}`
      );
    }

    console.log("Data logged to Airtable successfully:", airtableResponse);
  } catch (error) {
    console.error("Error logging data to Airtable:", error);
  }
}


// Enable multipart form-data parsing
fastify.register(require("@fastify/multipart"), {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Serve static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// Templating engine
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

// Home page route
fastify.get("/", function (request, reply) {
  let params = {};
  return reply.view("/src/pages/index.hbs", params);
});

// How to Use page route
fastify.get("/how-to-use", function (request, reply) {
  return reply.view("/src/pages/how-to-use.hbs");
});


// Separate OCR handling function
async function handleOCR(fileBuffer, freeText, filename) {
  if (!fileBuffer) {
    // If no image data, skip OCR and create prompt directly from freeText
    const filteredPromptData = { freeText };
    const prompt = createTextPrompt(freeText);
    return {
      ocrText: "",
      filteredPromptData,
      prompt,
    };
  }
  
  const filePath = path.join(__dirname, "uploads", filename);

  // Save the uploaded image temporarily
  await writeFile(filePath, fileBuffer);

  // Perform OCR using Google Cloud Vision API
  const [result] = await client.textDetection(filePath);
  const detections = result.textAnnotations;

  // Clean up: delete the uploaded image after processing
  fs.unlinkSync(filePath);

  // If no text detected, throw an error
  if (detections.length === 0) {
    throw new Error("No text detected in the image");
  }

  const ocrText = detections[0].description;
  console.log("OCR TEXT: " + ocrText);
  const filteredPromptData = filterPromptData(ocrText, freeText);

  // Concatenate the free text to the prompt
  const prompt = createPrompt(filteredPromptData);

  return {
    ocrText,
    filteredPromptData,
    prompt,
  };
}


// Separate image generation function
async function handleImageGeneration(prompt, engine) {
  return await processPromptAndGenerateImage(prompt, engine);
}

// A map to track the status of image generation
const imageStatusMap = new Map();

// API to handle image upload and OCR
fastify.post("/api/generate-image/:engine", async (req, reply) => {
  try {
    const { engine } = req.params;

    if (!["sdxl", "flux1", "imagen4"].includes(engine)) {
      return reply.status(400).send({ error: "Invalid engine specified" });
    }

    const parts = await req.parts();

    let fileBuffer = null;
    let freeText = "";
    let username = "Guest"; // Default value if username is not provided

    for await (const part of parts) {
      if (part.file) {
        fileBuffer = await part.toBuffer();
      } else if (part.fieldname === "freeText") {
        freeText = part.value || "";
      } else if (part.fieldname === "username") {
        username = part.value || "Guest"; // Capture username from the request
      }
    }

    if (!fileBuffer && !freeText) {
      return reply.status(400).send({ error: "No file or free text provided" });
    }

    const userAgent = req.headers["user-agent"] || "Unknown";
    const UAParser = require("ua-parser-js");
    const parser = new UAParser(userAgent);
    const userAgentInfo = Object.values(parser.getResult()).join(", ");

    const generationId = Date.now().toString();
    imageStatusMap.set(generationId, { status: "processing", generatedImageUrl: null });
    console.log("Initial imageStatusMap:", Array.from(imageStatusMap.entries()));

    let uploadedImageUrl = null;
    let ocrText = "";
    let filteredPromptData = {};
    let prompt = "";

    // Handle image upload and OCR
    if (fileBuffer) {
      uploadedImageUrl = await uploadToGCS(fileBuffer, `uploaded/${generationId}.png`);
      const ocrResult = await handleOCR(fileBuffer, freeText, `${generationId}.png`);
      ocrText = ocrResult.ocrText;
      filteredPromptData = ocrResult.filteredPromptData;
      prompt = ocrResult.prompt;
    } else {
      // Handle free text only
      const ocrResult = await handleOCR(null, freeText, null);
      filteredPromptData = ocrResult.filteredPromptData;
      prompt = ocrResult.prompt;
    }

    console.log("Prompt generated:", prompt);

    // Generate the image
    processPromptAndGenerateImage(prompt, engine)
      .then(async (imageResponse) => {
        if (imageResponse && imageResponse.image_url) {
          let generatedImageUrl;
          if (engine === "sdxl") {
            const generatedImageBuffer = Buffer.from(imageResponse.image_url.split(",")[1], "base64");
            generatedImageUrl = await uploadToGCS(generatedImageBuffer, `generated/${generationId}.png`);
          } else {
            // Handle Replicate (flux1): Fetch the image from the URL and upload to GCS
            const response = await fetch(imageResponse.image_url);
            if (!response.ok) {
              throw new Error(`Failed to fetch image from URL: ${imageResponse.image_url}`);
            }
            const generatedImageBuffer = await response.buffer();
            generatedImageUrl = await uploadToGCS(generatedImageBuffer, `generated/replicate_${generationId}.jpg`);
          }

          await logToAirtable({
            generationId,
            username: username,
            uploadedImageUrl,
            freeText,
            ocrText: ocrText,
            generatedImageUrl,
            input: Object.values(filteredPromptData).join(", "),
            prompt,
            engine,
            ipAddress: req.headers["x-forwarded-for"] || req.ip,
            userAgentInfo,
          });

          imageStatusMap.set(generationId, { status: "completed", generatedImageUrl });
          console.log("Updated imageStatusMap after completion:", Array.from(imageStatusMap.entries()));
        } else {
          imageStatusMap.set(generationId, { status: "failed", generatedImageUrl: null });
        }
      })
      .catch((err) => {
        console.error(`Image generation failed for ID ${generationId}:`, err);
        imageStatusMap.set(generationId, { status: "failed", generatedImageUrl: null });
      });

    reply.send({
      filteredPrompt: Object.values(filteredPromptData).join(", "),
      imageGenerationId: generationId,
      uploadedImageUrl,
    });
  } catch (err) {
    console.error("Error during OCR or image generation:", err);
    reply.status(500).send({ message: "Error processing image", error: err.message });
  }
});



// API to check the status of image generation
fastify.get("/api/image-status/:id", async (req, reply) => {
  const { id } = req.params;
  console.log("Checking image status for ID:", id);
  console.log("Current imageStatusMap:", Array.from(imageStatusMap.entries()));

  if (!imageStatusMap.has(id)) {
    console.log("ID not found in imageStatusMap:", id);
    return reply.status(404).send({ message: "Image generation ID not found" });
  }

  const statusData = imageStatusMap.get(id);
  console.log("Found status data for ID:", id, statusData);

  reply.send(statusData);
});


// Start the server
fastify.listen({ port: process.env.PORT || 3000, host: "0.0.0.0" }, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});