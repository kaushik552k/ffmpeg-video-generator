import path from 'path';
import fs from 'fs';
import os from 'os';
import {
    Composition, TextTrackItem, VideoTrackItem,
    ListTrackItem, TableTrackItem, ImageTrackItem,
} from '../shared/types';
import { renderOverlayLayers, OverlayItem } from './textRenderer';
import { compositeVideo, CompositeOptions } from './videoCompositor';
import { ensureDir } from '../shared/utils';
import { getOrDownloadVideo, isRemoteUrl } from '../shared/downloader';

const OUTPUT_DIR       = process.env.OUTPUT_DIR       ?? './output';
const TEMP_DIR         = process.env.TEMP_DIR         ?? './tmp';
const CACHE_DIR        = path.join(TEMP_DIR, 'png_cache');
/** Persistent cross-job video cache — never deleted automatically */
const VIDEO_CACHE_DIR  = path.join(TEMP_DIR, 'video_cache');
// Parallel Puppeteer page concurrency. Tune per server RAM.
const PNG_CONCURRENCY  = Number(process.env.PNG_CONCURRENCY ?? os.cpus().length);

/**
 * Full render pipeline — optimized for throughput:
 *   1. Separate overlay items and video items
 *   2. Launch CONCURRENTLY:
 *        a) Download remote video(s) to local temp files
 *        b) Render all overlay PNGs via Puppeteer (parallel)
 *   3. FFmpeg composite + encode (ultrafast preset, threaded)
 *   4. Return the output MP4 path
 */
export async function renderComposition(params: {
    jobId: string;
    composition: Composition;
    dynamicFields?: Record<string, string>;
    onProgress?: (percent: number) => void;
    /** Inject a custom animation builder (e.g. legacy geq for benchmarks). */
    buildAnimFn?: CompositeOptions['buildAnimFn'];
}): Promise<string> {
    const { jobId, composition, dynamicFields = {}, onProgress, buildAnimFn } = params;

    const jobTempDir = path.join(TEMP_DIR, jobId);
    ensureDir(jobTempDir);
    ensureDir(OUTPUT_DIR);
    ensureDir(CACHE_DIR);
    ensureDir(VIDEO_CACHE_DIR);

    try {
        // ── Step 1: Separate items by type ────────────────────────────────────
        const overlayItems: OverlayItem[] = [];
        const videoItems: VideoTrackItem[] = [];

        for (const track of composition.tracks) {
            for (const itemId of track.items) {
                const item = composition.trackItemsMap[itemId];
                if (!item) continue;

                switch (item.type) {
                    case 'text':
                        overlayItems.push({
                            id: item.id, type: 'text',
                            details: (item as TextTrackItem).details,
                            display: item.display, dynamicFields,
                            animation: (item as TextTrackItem).animation,
                        });
                        break;
                    case 'list':
                        overlayItems.push({
                            id: item.id, type: 'list',
                            details: (item as ListTrackItem).details,
                            display: item.display, dynamicFields,
                            animation: (item as ListTrackItem).animation,
                        });
                        break;
                    case 'table':
                        overlayItems.push({
                            id: item.id, type: 'table',
                            details: (item as TableTrackItem).details,
                            display: item.display, dynamicFields,
                            animation: (item as TableTrackItem).animation,
                        });
                        break;
                    case 'image':
                        overlayItems.push({
                            id: item.id, type: 'image',
                            details: (item as ImageTrackItem).details,
                            display: item.display,
                            animation: (item as ImageTrackItem).animation,
                        });
                        break;
                    case 'video':
                        videoItems.push(item as VideoTrackItem);
                        break;
                }
            }
        }

        console.log(`[Pipeline] Job ${jobId}: video=${videoItems.length} overlay=${overlayItems.length} cpus=${PNG_CONCURRENCY}`);
        onProgress?.(5);

        // ── Step 2: PARALLEL — download videos + render PNGs ─────────────────
        //   These two phases are fully independent — run them simultaneously.

        // 2a) Resolve remote video sources → persistent cache (download once, reuse forever)
        const videoDownloadPromise = Promise.all(
            videoItems.map(async (vItem, i) => {
                const src = vItem.details.src;
                if (!src || !isRemoteUrl(src)) return; // already a local path
                // getOrDownloadVideo returns cached path instantly if already downloaded
                const localPath = await getOrDownloadVideo(src, VIDEO_CACHE_DIR);
                vItem.details.src = localPath; // point FFmpeg to local file
            })
        );

        // 2b) Render overlay PNGs (parallel Puppeteer pages)
        console.log('[Pipeline] Rendering overlay layers (parallel)...');
        const t0 = Date.now();
        const overlayPromise = renderOverlayLayers({
            items: overlayItems,
            tempDir: jobTempDir,
            cacheDir: CACHE_DIR,
            concurrency: PNG_CONCURRENCY,
        });

        // Wait for BOTH to finish
        const [, overlayLayers] = await Promise.all([videoDownloadPromise, overlayPromise]);
        console.log(`[Pipeline] PNGs rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        onProgress?.(50);

        // ── Step 3: FFmpeg composite ──────────────────────────────────────────
        const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
        console.log('[Pipeline] Starting FFmpeg composite...');
        const t1 = Date.now();
        await compositeVideo({
            composition,
            textLayers: overlayLayers,
            videoItems,
            outputPath,
            onProgress: (pct) => onProgress?.(50 + Math.round(pct * 0.48)),
            buildAnimFn,
        });
        console.log(`[Pipeline] FFmpeg done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

        onProgress?.(100);
        return outputPath;

    } finally {
        // Clean up job temp dir
        try { fs.rmSync(jobTempDir, { recursive: true, force: true }); } catch {}
    }
}
