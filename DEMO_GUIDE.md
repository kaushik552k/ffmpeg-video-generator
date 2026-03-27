# 🎬 MP4 Video Generator — Demo Guide

> **Purpose**: Step-by-step demo reference for the team.  
> **Stack**: Node.js 24 · TypeScript · FFmpeg · Puppeteer · Express  
> **License Cost**: $0 (fully open-source)  
> **Repo**: https://github.com/kaushik552k/ffmpeg-video-generator

---

## 1. What We Built

A **backend service** that converts a **JSON composition object** into an **MP4 video**, without any paid licensing (no Remotion, no Lambda).

### How It Works (3 steps)

```
JSON Input
    │
    ├─► Text/List/Table/Image layers
    │       └─► Puppeteer (headless Chrome) renders each as a transparent PNG
    │
    ├─► Video layers
    │       └─► Downloaded from S3/CDN to local disk
    │
    └─► FFmpeg composes everything into a final H.264 MP4
            • Positions each PNG at exact x/y coordinates + time window
            • Applies per-frame animations (fade, slide, zoom) via math expressions
            • Passes through audio with volume control
```

### Why NOT Remotion?

| | FFmpeg + Puppeteer (Ours) | Remotion |
|---|---|---|
| **License** | ✅ $0 | ❌ $100/month |
| **Rendering** | Puppeteer renders each layer **once** | Chrome re-renders **every frame** (30×/sec) |
| **Speed** | 40s for 30s video | ~120-180s for 30s video |
| **Animations** | FFmpeg native math (near-zero cost) | React state → DOM repaint per frame |
| **RAM per worker** | ~400 MB | ~1–2 GB |

---

## 2. Project Structure

```
src/
  renderer/
    textRenderer.ts      ← Puppeteer: renders Text, List, Table, Image → transparent PNG
    videoCompositor.ts   ← FFmpeg: builds filtergraph, composites, encodes MP4
    animationBuilder.ts  ← Generates per-frame FFmpeg math for fade/slide/zoom
    renderPipeline.ts    ← Orchestrator: download + render + composite in parallel
  server/
    app.ts               ← Express API routes
    server.ts            ← Entry point
  shared/
    types.ts             ← Zod schemas + TypeScript types
    utils.ts             ← Helpers
    downloader.ts        ← Pre-downloads remote video sources to disk
  test/
    testRender.ts        ← Full CLI test (no server needed)
    testBenchmark10.ts   ← 10-layer benchmark (with/without animations)
```

---

## 3. Setup (One Time)

```bash
# Clone the repo
git clone https://github.com/kaushik552k/ffmpeg-video-generator.git
cd mp4-video-generator

# Install dependencies
# This auto-downloads: Puppeteer's Chrome binary + FFmpeg binary
npm install

# Copy environment config
cp .env.example .env
```

**`.env` file:**
```
PORT=3000
OUTPUT_DIR=./output
TEMP_DIR=./tmp
FFMPEG_PRESET=ultrafast
```

---

## 4. Demo Option A — CLI Test (No Server)

**Quickest way to see it work. Renders a 30-second video with all 5 layer types.**

```bash
npx tsx src/test/testRender.ts
```

**What you'll see:**
```
🎬 Starting full demo render (all layer types)...

[Pipeline] Job demo_xxxxx: { video: 1, overlay: 5, cpus: 8 }
[Pipeline] Downloading video 0: https://uat-visuals-pub.s3...
[Pipeline] Video 0 downloaded in 8.2s
[Pipeline] Rendering overlay layers (parallel)...
[LayerRenderer] Rendering text layer: txt_heading
[LayerRenderer] Rendering list layer: list_features
...
[Pipeline] PNGs rendered in 6.1s
[Pipeline] Starting FFmpeg composite...
[Pipeline] FFmpeg done in 26.8s

✅ Render complete!
   Output: C:\...\output\demo_xxxxx.mp4
   Size:   5013.4 KB
```

**Open `output/demo_*.mp4` to watch the result.**

---

## 5. Demo Option B — Live API

### Step 1: Start the Server

```bash
npm run dev
```
```
Server running on http://localhost:3000
```

### Step 2: Submit a Render Job

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d @sample-input.json
```

**Response:**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "message": "Render job queued"
}
```

### Step 3: Poll Status

```bash
curl http://localhost:3000/api/render/a1b2c3d4-e5f6-.../status
```

**Response (while rendering):**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "status": "rendering",
  "progress": 55
}
```

**Response (done):**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "status": "completed",
  "progress": 100,
  "downloadUrl": "/api/render/a1b2c3d4-e5f6-.../download"
}
```

### Step 4: Download the MP4

```bash
curl -O -J http://localhost:3000/api/render/a1b2c3d4-e5f6-.../download
```

### Health Check

```bash
curl http://localhost:3000/api/health
# { "status": "ok" }
```

---

## 6. JSON Schema — Supported Layer Types

Every layer goes inside `trackItemsMap`. The `tracks` array controls z-order (bottom → top).

### Video Layer
```json
"vid_bg": {
  "type": "video",
  "id": "vid_bg",
  "display": { "from": 0, "to": 30000 },
  "details": {
    "src": "https://your-s3-bucket.com/video.mp4",
    "left": "640px", "top": "360px",
    "width": 640, "height": 360,
    "transform": "scale(3)",
    "opacity": 100,
    "volume": 80
  }
}
```

### Text Layer
```json
"txt_title": {
  "type": "text",
  "id": "txt_title",
  "display": { "from": 0, "to": 8000 },
  "animation": {
    "in":  { "type": "fadeIn",      "duration": 800 },
    "out": { "type": "slideOutLeft","duration": 500 }
  },
  "details": {
    "text": "{{title}}",
    "left": "160px", "top": "80px",
    "width": 800, "height": 120,
    "fontFamily": "Roboto-Bold",
    "fontUrl": "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
    "fontSize": 64,
    "color": "#ffffff",
    "opacity": 100,
    "backgroundColor": "transparent"
  }
}
```

### List Layer
```json
"lst_bullets": {
  "type": "list",
  "id": "lst_bullets",
  "display": { "from": 2000, "to": 10000 },
  "details": {
    "left": "160px", "top": "220px",
    "width": 700, "height": 350,
    "listStyle": "disc",
    "items": ["Point one {{val}}", "Point two", "Point three"],
    "fontSize": 32, "color": "#ffffff",
    "opacity": 100, "backgroundColor": "rgba(0,0,0,0.3)"
  }
}
```

### Table Layer
```json
"tbl_stats": {
  "type": "table",
  "id": "tbl_stats",
  "display": { "from": 10000, "to": 20000 },
  "details": {
    "left": "160px", "top": "200px",
    "width": 800, "height": 300,
    "headers": ["Metric", "Q1", "Q2"],
    "rows": [
      ["Revenue", "$10M", "{{q2Revenue}}"],
      ["Users",   "50K",  "75K"]
    ],
    "fontSize": 26, "color": "#ffffff",
    "opacity": 100, "backgroundColor": "transparent"
  }
}
```

### Image Layer
```json
"img_logo": {
  "type": "image",
  "id": "img_logo",
  "display": { "from": 0, "to": 30000 },
  "details": {
    "src": "https://example.com/logo.png",
    "left": "1650px", "top": "40px",
    "width": 120, "height": 120,
    "borderRadius": 60,
    "opacity": 100
  }
}
```

---

## 7. Dynamic Fields (`{{variable}}` Replacement)

Send `dynamicFields` alongside the composition to inject values at render time:

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "composition": { ... },
    "dynamicFields": {
      "title": "Q3 Business Review",
      "q2Revenue": "$14.5M",
      "val": "Grew 40% YoY"
    }
  }'
```

All `{{title}}`, `{{q2Revenue}}` placeholders in text, list items, and table cells are replaced before rendering.

---

## 8. Supported Animations

Add `"animation"` to any **text, list, table, or image** layer:

```json
"animation": {
  "in":  { "type": "fadeIn",        "duration": 800  },
  "out": { "type": "slideOutLeft",  "duration": 500  }
}
```

| Type | Effect |
|---|---|
| `fadeIn` / `fadeOut` | Opacity 0→1 / 1→0 |
| `slideInLeft` / `slideOutLeft` | Slide from/to left of screen |
| `slideInRight` / `slideOutRight` | Slide from/to right of screen |
| `slideInTop` / `slideOutTop` | Slide from/to top of screen |
| `slideInBottom` / `slideOutBottom` | Slide from/to bottom of screen |
| `zoomIn` / `zoomOut` | Scale + fade effect |

> **How animations work**: Puppeteer renders each layer **once** as a static PNG. FFmpeg evaluates per-frame math equations during encoding to simulate the animation — no per-frame Puppeteer rendering.

---

## 9. Benchmark Results

| Test | Time | Output Size |
|---|---|---|
| 5 layers (video + text + list + table + image) — with animations — unoptimized | 148.6s | 1.2 MB |
| 5 layers — with animations — **optimized** | **62.1s** | 1.2 MB |
| 10 text layers — **static** | **36.1s** | 5.0 MB |
| 10 text layers — **animated** | **58.3s** | 5.5 MB |

**Key optimizations applied:**
1. Pre-download remote videos to disk (was the #1 bottleneck — streaming S3 over HTTPS in FFmpeg)
2. Parallel Puppeteer PNG rendering (`Promise.all`, CPU-core-count concurrency)
3. Removed `format=rgba` pixel conversion on video layers (memory bandwidth fix)
4. `ultrafast` H.264 preset + multi-threaded encoding

---

## 10. Scale Projection for 30 Lakh (3M) Videos

At **40s per video** (current benchmark):

| Workers | Videos/day | Days to render 30L videos |
|---|---|---|
| 1 | 2,160 | ~1,389 days ❌ |
| 10 | 21,600 | ~139 days ⚠️ |
| 100 | 2,16,000 | **~14 days** ✅ |
| 500 | 10,80,000 | **~3 days** 🚀 |

**With GPU encoding** (planned — NVENC/QSV, ~8-12s per video instead of 40s):

| Workers | Videos/day | Days for 30L |
|---|---|---|
| 100 | ~8,64,000 | **~3.5 days** 🚀🚀 |

Workers scale horizontally via Docker: `docker-compose --scale worker=100`

---

## 11. What's Next (Planned)

| Feature | Status |
|---|---|
| ✅ All 5 layer types (video/text/list/table/image) | Done |
| ✅ FFmpeg-native animations (fade/slide/zoom) | Done |
| ✅ Dynamic field replacement (`{{variable}}`) | Done |
| ✅ Volume control, audio passthrough | Done |
| ✅ Parallel rendering + asset pre-download | Done |
| 🔲 BullMQ + Redis job queue (for 100+ workers) | Next |
| 🔲 Docker + docker-compose (worker scaling) | Next |
| 🔲 GPU encoding (NVENC/QSV) — 5× encode speedup | Next |
| 🔲 S3 output + signed URL in response | Next |
