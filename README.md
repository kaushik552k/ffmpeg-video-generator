# MP4 Video Generator — POC
> **FFmpeg + Puppeteer** backend service: accepts a JSON composition object → returns an MP4 video file.

## How it works

```
JSON Input
  ↓
Puppeteer renders text layers → transparent PNGs (full CSS support)
  ↓
FFmpeg composites video + text PNGs → encodes H.264 MP4
  ↓
MP4 Output
```

## Quick Start

```bash
# 1. Install dependencies (downloads Puppeteer's Chrome automatically)
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Run the server
npm run dev
```

## API

### POST /api/render
Submit a render job.

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d @sample-input.json
```

**Response:**
```json
{ "jobId": "abc-123", "message": "Render started..." }
```

### GET /api/render/:jobId/status
Poll for job progress.

```bash
curl http://localhost:3000/api/render/abc-123/status
```

**Response:**
```json
{
  "jobId": "abc-123",
  "status": "completed",
  "progress": 100,
  "downloadUrl": "/api/render/abc-123/download"
}
```

### GET /api/render/:jobId/download
Download the rendered MP4 file.

```bash
curl -O -J http://localhost:3000/api/render/abc-123/download
```

## Dynamic Text

Use `{{variableName}}` in your JSON text fields. Pass replacements in `dynamicFields`:

```json
{
  "composition": { ... },
  "dynamicFields": {
    "dynamicText": "Hello World!",
    "userName": "Kaushik"
  }
}
```

## Direct Test (no server)

```bash
npm run test:render
```

Renders the sample JSON directly and saves the MP4 to `./output/`.

## Project Structure

```
src/
  renderer/
    textRenderer.ts    ← Puppeteer: text → transparent PNG
    videoCompositor.ts ← FFmpeg: composite + encode
    renderPipeline.ts  ← Orchestrator
  server/
    app.ts             ← Express routes
    server.ts          ← Entry point
  shared/
    types.ts           ← TypeScript types + Zod schemas
    utils.ts           ← Helpers
  test/
    testRender.ts      ← Standalone test
sample-input.json      ← Example JSON input
```
