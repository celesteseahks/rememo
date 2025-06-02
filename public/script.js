document.addEventListener("DOMContentLoaded", function () {
  const generateButton = document.getElementById("generateButton");
  const retryButton = document.getElementById("retryButton");
  const newImageButton = document.getElementById("newImageButton");
  const fileInput = document.getElementById("imageInput");
  const cameraButton = document.getElementById("cameraButton");
  const inputSection = document.getElementById("inputSection");
  const loadingPage = document.getElementById("loadingPage");
  const imageSection = document.getElementById("imageSection");
  const ocrResult = document.getElementById("ocrResult");
  const generatedImage = document.getElementById("generatedImage");
  const engineInputs = document.getElementsByName("engine");
  const saveButton = document.getElementById("saveButton");
  const printButton = document.getElementById("printButton");
  const greetingMessage = document.getElementById("greetingMessage");
  const usernameInput = document.getElementById("usernameInput");

  // Get the username from the URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get("username") || "Guest";

  // Determine the appropriate greeting based on the time of day
  const currentHour = new Date().getHours();
  let timeOfDayGreeting = "Hello";
  if (currentHour < 12) {
    timeOfDayGreeting = "Good morning";
  } else if (currentHour < 18) {
    timeOfDayGreeting = "Good afternoon";
  } else {
    timeOfDayGreeting = "Good evening";
  }

  // Update the greeting message
  usernameInput.value = username;
  greetingMessage.textContent = `${timeOfDayGreeting}, ${username}!`;
  
  let lastImageGenerationId = null;
  let lastInputData = null;

  // Camera button state
  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) {
      cameraButton.classList.add("taken");
      cameraButton.innerHTML = '<i class="fas fa-check"></i> Photo Taken';
    } else {
      cameraButton.classList.remove("taken");
      cameraButton.innerHTML = '<i class="fas fa-camera"></i> Take Photo';
    }
  });

  // Generate button click event
  generateButton.addEventListener("click", function () {
    const file = fileInput.files[0];
    let selectedEngine = "sdxl";
    for (const input of engineInputs) {
      if (input.checked) {
        selectedEngine = input.value;
        break;
      }
    }

    // Capture the free-text input
    const freeTextInput = document.getElementById("freeText").value;
    const username = document.getElementById("usernameInput").value;

    // Check if no image and no free text is provided
    if (!file && !freeTextInput) {
      alert("You have not selected any cards or typed in any details. Please try again.");
      return;
    }

    // Check if no image but free text is provided
    if (!file) {
      const proceedWithoutImage = confirm(
        "You have not selected any cards. Do you want to proceed with just the text?"
      );
      if (!proceedWithoutImage) {
        return;
      }
    }

    // Hide input section and show loading page
    inputSection.classList.add("hidden");
    loadingPage.classList.remove("hidden");

    const formData = new FormData();
    if (file) formData.append("image", file);
    formData.append("engine", selectedEngine);
    formData.append("freeText", freeTextInput);
    formData.append("username", username);

    // Save last input data for retry functionality
    lastInputData = { engine: selectedEngine, freeText: freeTextInput, file };

    // Step 1: Send file to server for OCR
    fetch(`/api/generate-image/${selectedEngine}`, {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        // Store the last generation ID for retry functionality
        lastImageGenerationId = data.imageGenerationId;

        // Display the OCR result
        if (data.filteredPrompt) {
          ocrResult.textContent = data.filteredPrompt;
        }

        // Step 2: Wait for the image to be generated
        pollForImage(data.imageGenerationId);
      })
      .catch((err) => {
        loadingPage.classList.add("hidden");
        inputSection.classList.remove("hidden");
        alert(`Error: ${err.message}`);
      });
  });

  // Retry button: Re-run the image generation with the same prompt
  retryButton?.addEventListener("click", function () {
    if (!lastInputData) {
      alert("No previous input available. Please generate an image first.");
      return;
    }

    // Hide image section and show loading page
    imageSection.classList.add("hidden");
    loadingPage.classList.remove("hidden");

    const formData = new FormData();
    if (lastInputData.file) formData.append("image", lastInputData.file);
    formData.append("engine", lastInputData.engine);
    formData.append("freeText", lastInputData.freeText);
    formData.append("username", username);

    fetch(`/api/generate-image/${lastInputData.engine}`, {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        lastImageGenerationId = data.imageGenerationId;
        pollForImage(data.imageGenerationId);
      })
      .catch((err) => {
        loadingPage.classList.add("hidden");
        imageSection.classList.remove("hidden");
        alert(`Error: ${err.message}`);
      });
  });

  // New Image button: Reload the page for a fresh input
  newImageButton?.addEventListener("click", function () {
    location.reload();
  });

  saveButton?.addEventListener("click", function () {
    const link = document.createElement("a");
    link.href = generatedImage.src;
    link.download = "generated_image.png";
    link.click();
  });

  printButton?.addEventListener("click", function () {
    const imageURL = generatedImage.src;

    if (navigator.canShare && navigator.canShare({ files: [] })) {
      fetch(imageURL)
        .then((response) => response.blob())
        .then((blob) => {
          const file = new File([blob], "generated_image.png", { type: blob.type });

          navigator
            .share({
              title: "Print this image",
              files: [file],
              text: "Here is an image to print using your Instax Print app:",
            })
            .then(() => console.log("Print dialog launched successfully."))
            .catch((error) => console.error("Error sharing for printing:", error));
        })
        .catch((err) => console.error("Failed to fetch image for sharing:", err));
    } else {
      alert(
        "Your browser does not support direct printing functionality. Please download the image and print it manually."
      );
    }
  });

  // Function to poll the server for image generation
  function pollForImage(imageGenerationId) {
    const interval = setInterval(() => {
      fetch(`/api/image-status/${imageGenerationId}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Status: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (data.status === "completed") {
            clearInterval(interval);
            loadingPage.classList.add("hidden");
            imageSection.classList.remove("hidden");
            generatedImage.src = data.generatedImageUrl;

            // Show the newImageButton and retryButton
            newImageButton.classList.remove("hidden");
            retryButton.classList.remove("hidden");
          } else if (data.status === "failed") {
            clearInterval(interval);
            throw new Error("Image generation failed.");
          }
        })
        .catch((err) => {
          clearInterval(interval);
          loadingPage.classList.add("hidden");
          inputSection.classList.remove("hidden");
          alert(`Error: ${err.message}`);
        });
    }, 2000);
  }
});
