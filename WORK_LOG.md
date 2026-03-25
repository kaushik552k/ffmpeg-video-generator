# Work Log — MP4 Video Generator

> **Project**: JSON → MP4 backend service using FFmpeg + Puppeteer  
> **Repo**: https://github.com/kaushik552k/ffmpeg-video-generator  
> **Stack**: Node.js 24 · TypeScript · Express · FFmpeg · Puppeteer · BullMQ (planned)  
> **Scale Target**: 30 lakh (3 million) videos

---

## Project Context

A backend service that accepts a JSON composition object (describing video layers, text overlays, bullet lists, tables, images with CSS-style positioning and timing) and renders it into an MP4 video file. Designed for massive scale.

### How the Rendering Works

```
JSON Input
  ↓
Parser separates items by type
  ↓
text/list/table/image → Puppeteer renders as transparent PNGs (with caching)
video → passed directly to FFmpeg
  ↓
FFmpeg builds complex filtergraph:
  - Black canvas at composition size
  - Overlays scaled video at correct position (CSS transform-origin aware)
  - Overlays each PNG at correct position + time window
  - Encodes H.264 MP4 with audio passthrough + volume control
  ↓
MP4 Output
```

---

## Decision Log

### March 20, 2026 — Technology Selection

**Decision**: FFmpeg + Puppeteer hybrid over Remotion or Revideo

| Evaluated | Verdict | Reason |
|---|---|---|
| **Remotion** | ❌ Rejected | $100/mo license, slower (renders every frame via Chrome), heavier RAM |
| **Revideo** | ❌ Rejected | Canvas-based = limited CSS support (no box-shadow, text-stroke) |
| **Pure FFmpeg** | ❌ Rejected | `drawtext` filter can't handle web fonts, CSS properties |
| **FFmpeg + Puppeteer** | ✅ Chosen | Full CSS via Puppeteer, fast encoding via FFmpeg, $0 license, PNG caching |

See [COMPARISON_FFmpeg_vs_Remotion.md](./COMPARISON_FFmpeg_vs_Remotion.md) for full comparison.

---

## What Has Been Implemented

### ✅ Phase 1: Core Rendering Engine (March 20)

| File | Purpose | Status |
|---|---|---|
| `src/shared/types.ts` | Zod schemas + TS types for all 5 layer types | ✅ Done |
| `src/shared/utils.ts` | `msToSeconds`, `parsePx`, `parseTransform`, `replaceDynamicText`, `simpleHash` | ✅ Done |
| `src/renderer/textRenderer.ts` | Puppeteer HTML→PNG renderer for **text, list, table, image** layers. Shared browser instance, content-hash caching | ✅ Done |
| `src/renderer/videoCompositor.ts` | FFmpeg complex filtergraph builder. Handles video scaling with CSS `transform-origin` center, timed overlays, audio passthrough + volume control | ✅ Done |
| `src/renderer/renderPipeline.ts` | Orchestrator: parses JSON → separates items → renders PNGs → composites with FFmpeg | ✅ Done |

### ✅ Phase 4: Layer Animations (March 25)

| File | Purpose | Status |
|---|---|---|
| `src/renderer/animationBuilder.ts` | Generates per-frame FFmpeg expression strings for x/y/alpha animations. Uses `t` for position (overlay variable) and `T` for alpha (geq variable). Cubic easing built-in. | ✅ Done |

**Supported animation types:**

| Type | Direction | Effect |
|---|---|---|
| `fadeIn` / `fadeOut` | in/out | Opacity from 0→1 / 1→0 via `geq` alpha filter |
| `slideInLeft` / `slideOutLeft` | in/out | Slides from/to off-screen left |
| `slideInRight` / `slideOutRight` | in/out | Slides from/to off-screen right |
| `slideInTop` / `slideOutTop` | in/out | Slides from/to off-screen top |
| `slideInBottom` / `slideOutBottom` | in/out | Slides from/to off-screen bottom |
| `zoomIn` / `zoomOut` | in/out | Fade effect (alpha-based; true zoom requires zoompan future work) |

**JSON usage — add `animation` field to any track item:**
```jsonc
"my_item": {
  "type": "text",
  "display": { "from": 0, "to": 5000 },
  "animation": {
    "in":  { "type": "fadeIn",     "duration": 800 },   // ms
    "out": { "type": "slideOutLeft", "duration": 400 }
  },
  "details": { ... }
}
```

**Verified render:** 1,217 KB animated MP4 — heading fadeIn/Out, list slideInLeft/Out, table slideInBottom/OutTop, logo zoomIn/Out, subtitle slideInRight/fadeOut.


### ✅ Phase 2: API Server (March 20)

| File | Purpose | Status |
|---|---|---|
| `src/server/app.ts` | Express routes: `POST /api/render`, `GET /api/render/:jobId/status`, `GET /api/render/:jobId/download`, `GET /api/health` | ✅ Done |
| `src/server/server.ts` | Server entry point, port config | ✅ Done |

### ✅ Phase 3: Supported Layer Types (March 20)

| Type | JSON `type` | Renderer | Features |
|---|---|---|---|
| **Video** | `"video"` | FFmpeg | scale, position, trim, playbackRate, volume, audio passthrough |
| **Text** | `"text"` | Puppeteer→PNG | Web fonts (URL), all CSS properties, `{{dynamic}}` variables |
| **Bullet List** | `"list"` | Puppeteer→PNG | disc/decimal/circle styles, item spacing, marker color, `{{dynamic}}` |
| **Table** | `"table"` | Puppeteer→PNG | Headers, rows, alternating row colors, cell padding, `{{dynamic}}` |
| **Image** | `"image"` | Puppeteer→PNG | border-radius, box-shadow, object-fit, border |

### ✅ Bugs Fixed (March 20)

1. **Video alignment** — CSS `transform: scale(N)` scales from element center. Fixed overlay position: `overlay = (center - scaledSize/2)` instead of using raw `left/top`.
2. **Text clipping** — Removed `display:flex; align-items:center` which caused multi-line text to overflow. Now uses block flow + `overflow:hidden`.

---

## What Is NOT Yet Implemented

### 🔲 Job Queue (BullMQ + Redis)
- Currently POC uses in-memory job store and processes renders inline
- For production: add BullMQ queue, Redis connection, separate worker process
- Files planned: `src/worker/queue.ts`, `src/worker/renderWorker.ts`

### 🔲 Overlay Animations
- Currently overlays are static PNGs that appear/disappear at `display.from/to`
- Planned: FFmpeg-native animations (fade in/out, slide, zoom) via filter expressions
- No Puppeteer per-frame rendering needed for these
- JSON schema would add: `"animation": { "in": { "type": "fadeIn", "duration": 500 } }`

### 🔲 Docker & Deployment
- `Dockerfile` and `docker-compose.yml` not yet created
- Need: `node:20-bookworm` base, Chrome + FFmpeg installed, multi-stage build
- `docker-compose.yml` with services: api, worker (scalable), redis

### 🔲 S3 Storage
- Currently outputs to local `./output/` directory
- For production: upload rendered MP4s to S3, return signed URLs

### 🔲 Multiple Video Layers
- Currently supports 1 video item (audio mapped from first video)
- Could extend to multiple video overlays with audio mixing

---

## Project Structure

```
mp4-video-generator/
├── src/
│   ├── renderer/
│   │   ├── textRenderer.ts      ← Puppeteer: text/list/table/image → PNG
│   │   ├── videoCompositor.ts   ← FFmpeg: filtergraph + encode
│   │   └── renderPipeline.ts    ← Orchestrator
│   ├── server/
│   │   ├── app.ts               ← Express routes
│   │   └── server.ts            ← Entry point
│   ├── shared/
│   │   ├── types.ts             ← Zod schemas + TS types
│   │   └── utils.ts             ← Helpers
│   └── test/
│       └── testRender.ts        ← Full demo test (all 5 layer types)
├── sample-input.json
├── COMPARISON_FFmpeg_vs_Remotion.md
├── WORK_LOG.md                  ← This file
├── package.json
├── tsconfig.json
├── .env / .env.example
└── .gitignore
```

## Key Technical Details (for continuity)

### Positioning Model
- `left` and `top` in JSON = CSS `left`/`top` (element's top-left corner)
- `transform: scale(N)` scales from the element's **center** (CSS default `transform-origin`)
- FFmpeg overlay position = `center - scaledSize/2` (computed in `videoCompositor.ts`)

### PNG Caching
- `textRenderer.ts` hashes the final HTML content → if hash matches a cached PNG, skips Puppeteer
- Cache stored in `./tmp/png_cache/`
- For dynamic text: hash includes the post-replacement text, so different values = different PNGs

### FFmpeg Filtergraph Pattern
```
[0:v] → canvas (black, composition size)
[1:v] → scale video → overlay on canvas at computed position
[2:v] → overlay text PNG 1 with enable='between(t, from, to)'
[3:v] → overlay text PNG 2 with enable='between(t, from, to)'
...
→ format=yuv420p → H.264 output
Audio: -map 1:a? -af volume=X
```

### Running Locally
```bash
npm install        # downloads Chrome + FFmpeg binaries automatically
npm run dev        # starts Express on :3000
npm run test:render  # standalone render test (no server)
```
