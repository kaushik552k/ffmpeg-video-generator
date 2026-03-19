# FFmpeg + Puppeteer vs Remotion — Cost & Performance Comparison

**Date:** March 20, 2026  
**Context:** Backend service for JSON → MP4 video generation at scale (3M+ videos)

---

## Cost Comparison

| | FFmpeg + Puppeteer | Remotion |
|---|---|---|
| **Software license** | $0 (MIT / GPL) | ~$100/mo (Company License) |
| **Self-hosted rendering** | Your server costs only | Your server costs only |
| **Lambda / serverless** | AWS compute only | AWS compute + $100/mo license |
| **Per-video software cost** | $0 | $0 (flat monthly fee) |

> **Note:** Remotion's $100/mo is flat regardless of volume — negligible at 3M scale.  
> Free for companies with ≤ 3 employees.

---

## Speed Comparison

| | FFmpeg + Puppeteer | Remotion |
|---|---|---|
| **Rendering approach** | Puppeteer renders overlays as PNGs **once**, FFmpeg composites + encodes in a single pass | Chrome renders **every frame** as a screenshot, then FFmpeg stitches all frames |
| **Frames to render (30s @ 30fps)** | ~5 PNG overlays + 1 FFmpeg pass | **900 individual screenshots** |
| **Render time (30s video)** | **~25–30 seconds** | ~60–120 seconds |
| **RAM per worker** | ~200–400 MB | ~800 MB – 1.2 GB |
| **Overlay caching** | ✅ Same text/style → skip Puppeteer | ❌ Every frame re-rendered |
| **GPU acceleration** | ✅ FFmpeg NVENC/VAAPI | ❌ Chrome has no GPU on servers |

---

## Scale Projection (3M Videos)

| Metric | FFmpeg + Puppeteer | Remotion (Self-hosted) | Remotion (Lambda) |
|---|---|---|---|
| **Avg render time** | ~30 sec | ~90 sec | ~15 sec (parallel chunks) |
| **Per 10 workers/day** | ~28,800 videos | ~9,600 videos | N/A (burst) |
| **Workers for 3M in 30 days** | ~35 workers | ~105 workers | 1000 concurrent Lambdas |
| **Software cost** | $0 | $100/mo | $100/mo |
| **Infra cost (est.)** | ~$1,500/mo (35 VMs) | ~$4,500/mo (105 VMs) | ~$30K–$150K total |

---

## Feature Comparison

| Capability | FFmpeg + Puppeteer | Remotion |
|---|---|---|
| Static text overlays | ✅ Full CSS | ✅ Full CSS |
| Web fonts (custom URLs) | ✅ | ✅ |
| Bullet lists | ✅ HTML rendering | ✅ React components |
| Tables | ✅ HTML rendering | ✅ React components |
| Image overlays | ✅ With CSS effects | ✅ With CSS effects |
| Video compositing | ✅ FFmpeg filters | ✅ `<OffthreadVideo>` |
| Dynamic text (`{{vars}}`) | ✅ | ✅ (inputProps) |
| **Per-frame animations** | ❌ Static overlays only | ✅ Full frame-by-frame |
| **Motion graphics** | ❌ | ✅ Spring/interpolate APIs |
| Visual preview (Studio) | ❌ | ✅ Built-in |
| Audio volume control | ✅ FFmpeg filters | ✅ |

---

## When to Choose What

| Use Case | Recommendation |
|---|---|
| Template videos with text/tables/lists at scale | **FFmpeg + Puppeteer** |
| Animated text, transitions, motion graphics | **Remotion** |
| Budget-sensitive, high volume | **FFmpeg + Puppeteer** |
| Small team (≤3 employees), animation needed | **Remotion** (free license) |
| Hybrid: mostly static, some animation | FFmpeg for bulk + Remotion for premium |

---

## POC Benchmark Results

| Metric | FFmpeg + Puppeteer POC |
|---|---|
| Video: 1920×1080 @ 30fps, 30 seconds | ✅ |
| Layers: video + 2 texts + list + table + image | ✅ |
| Output size | ~997 KB |
| Render time | **~25 seconds** |
| Dynamic field replacement | ✅ Working |
| Audio passthrough with volume | ✅ Working |
| TypeScript compilation | ✅ Zero errors |
