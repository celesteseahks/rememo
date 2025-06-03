# Rememo

A web application for reminiscence therapy that visualizes memories using AI image generation.

## Features

- Upload photos of memory cards or type in memory details
- OCR (Optical Character Recognition) to read text from uploaded images
- Multiple AI image generation engines:
  - Stable Diffusion XL (fast, general purpose)
  - Flux.1 (slower, trained on local context)
  - Imagen 4 (experimental)
- Save or print generated images
- Mobile-friendly interface

## Tech Stack

- Node.js with Fastify framework
- Handlebars templating
- Google Cloud Vision API for OCR
- Google Cloud Storage for image storage
- Airtable for logging and analytics
- Docker support

## Setup

1. Clone the repository
2. Create a `.env` file with required credentials:
```
AIRTABLE_PERSONAL_ACCESS_TOKEN=your_token
GCS_BUCKET_NAME=your_bucket
GOOGLE_APPLICATION_CREDENTIALS=path_to_credentials.json
```
3. Install dependencies:
```bash
npm install
```
4. Run the development server:
```bash
npm start
```

Or using Docker:
```bash
docker build -t rememo .
docker run -p 3000:3000 --env-file .env rememo
```

## License

MIT License - See LICENSE file for details 