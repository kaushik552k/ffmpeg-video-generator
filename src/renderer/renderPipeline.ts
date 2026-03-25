import path from 'path';
import fs from 'fs';
import {
    Composition, TextTrackItem, VideoTrackItem,
    ListTrackItem, TableTrackItem, ImageTrackItem,
} from '../shared/types';
import { renderOverlayLayers, OverlayItem } from './textRenderer';
import { compositeVideo } from './videoCompositor';
import { ensureDir } from '../shared/utils';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output';
const TEMP_DIR = process.env.TEMP_DIR ?? './tmp';
const CACHE_DIR = path.join(TEMP_DIR, 'png_cache');

/**
 * Full render pipeline:
 * 1. Parse composition — separate overlay items (text/list/table/image) and video items
 * 2. Render overlay items to transparent PNGs via Puppeteer
 * 3. Composite everything with FFmpeg
 * 4. Return the output MP4 path
 */
export async function renderComposition(params: {
    jobId: string;
    composition: Composition;
    dynamicFields?: Record<string, string>;
    onProgress?: (percent: number) => void;
}): Promise<string> {
    const { jobId, composition, dynamicFields = {}, onProgress } = params;

    const jobTempDir = path.join(TEMP_DIR, jobId);
    ensureDir(jobTempDir);
    ensureDir(OUTPUT_DIR);
    ensureDir(CACHE_DIR);

    try {
        // ── Step 1: Separate items by type in track order (bottom → top) ──────────
        const overlayItems: OverlayItem[] = [];
        const videoItems: VideoTrackItem[] = [];

        for (const track of composition.tracks) {
            for (const itemId of track.items) {
                const item = composition.trackItemsMap[itemId];
                if (!item) continue;

                switch (item.type) {
                    case 'text':
                        overlayItems.push({
                            id: item.id,
                            type: 'text',
                            details: (item as TextTrackItem).details,
                            display: item.display,
                            dynamicFields,
                            animation: (item as TextTrackItem).animation,
                        });
                        break;
                    case 'list':
                        overlayItems.push({
                            id: item.id,
                            type: 'list',
                            details: (item as ListTrackItem).details,
                            display: item.display,
                            dynamicFields,
                            animation: (item as ListTrackItem).animation,
                        });
                        break;
                    case 'table':
                        overlayItems.push({
                            id: item.id,
                            type: 'table',
                            details: (item as TableTrackItem).details,
                            display: item.display,
                            dynamicFields,
                            animation: (item as TableTrackItem).animation,
                        });
                        break;
                    case 'image':
                        overlayItems.push({
                            id: item.id,
                            type: 'image',
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

        const counts = {
            video: videoItems.length,
            text: overlayItems.filter((o) => o.type === 'text').length,
            list: overlayItems.filter((o) => o.type === 'list').length,
            table: overlayItems.filter((o) => o.type === 'table').length,
            image: overlayItems.filter((o) => o.type === 'image').length,
        };
        console.log(`[Pipeline] Job ${jobId}:`, counts);

        onProgress?.(10);

        // ── Step 2: Render overlay items to PNGs ──────────────────────────────────
        console.log('[Pipeline] Rendering overlay layers...');
        const overlayLayers = await renderOverlayLayers({
            items: overlayItems,
            tempDir: jobTempDir,
            cacheDir: CACHE_DIR,
        });

        onProgress?.(40);

        // ── Step 3: Composite with FFmpeg ─────────────────────────────────────────
        const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

        console.log('[Pipeline] Starting FFmpeg composite...');
        await compositeVideo({
            composition,
            textLayers: overlayLayers,
            videoItems,
            outputPath,
            onProgress: (pct) => onProgress?.(40 + Math.round(pct * 0.55)),
        });

        onProgress?.(100);
        return outputPath;
    } finally {
        try {
            fs.rmSync(jobTempDir, { recursive: true, force: true });
        } catch {
            // Non-critical
        }
    }
}
