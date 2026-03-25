import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import { Composition, VideoTrackItem } from '../shared/types';
import { RenderedTextLayer } from './textRenderer';
import { msToSeconds, parsePx, parseTransform, ensureDir } from '../shared/utils';
import { buildAnimationExpressions } from './animationBuilder';

// Point fluent-ffmpeg at the pre-installed binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
console.log('[FFmpeg] Binary path:', ffmpegInstaller.path);

export interface CompositeOptions {
    composition: Composition;
    textLayers: RenderedTextLayer[];
    videoItems: VideoTrackItem[];
    outputPath: string;
    onProgress?: (percent: number) => void;
}

/**
 * Build and execute an FFmpeg complex filtergraph:
 *   Input 0      : lavfi color source (black canvas at composition size)
 *   Inputs 1..N  : video files (one per video track item)
 *   Inputs N+1.. : text PNG overlays (one per text layer)
 *
 * Filtergraph flow:
 *   [0:v] → scale/format → [canvas]
 *   [canvas] + [1:v scaled] → overlay → [v0]
 *   [v0] + [text0.png] → overlay (timed) → [v1]
 *   ... → [vN] → format=yuv420p → [out]
 */
export async function compositeVideo(opts: CompositeOptions): Promise<void> {
    const { composition, textLayers, videoItems, outputPath, onProgress } = opts;
    const { width, height } = composition.size;
    const fps = composition.fps;

    const totalDurationSec = Math.max(
        ...Object.values(composition.trackItemsMap).map(
            (item) => msToSeconds(item.display.to)
        )
    );

    ensureDir(path.dirname(outputPath));

    return new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg();

        // ─── Input 0: lavfi black canvas ────────────────────────────────────────────
        // Must use -f lavfi BEFORE the input URL
        cmd
            .input(`color=c=black:s=${width}x${height}:r=${fps}:d=${totalDurationSec}`)
            .inputFormat('lavfi');

        // ─── Inputs 1..N: Video source files ────────────────────────────────────────
        const videoInputIndices: number[] = [];
        for (const vItem of videoItems) {
            if (!vItem.details.src) continue;
            const inputIndex = 1 + videoInputIndices.length;
            videoInputIndices.push(inputIndex);
            cmd.input(vItem.details.src);
        }

        // ─── Inputs N+1..: Text PNG stills ──────────────────────────────────────────
        const textInputStart = 1 + videoInputIndices.length;
        for (const layer of textLayers) {
            // Each PNG needs -loop 1 so it's treated as an infinitely long still image
            cmd.input(layer.pngPath).inputOptions(['-loop', '1']);
        }

        // ─── Build filtergraph ───────────────────────────────────────────────────────
        const filters: string[] = [];
        let currentOut = 'canvas';

        // 1) Prepare canvas
        filters.push(`[0:v]scale=${width}:${height},fps=${fps},format=rgba[canvas]`);

        // 2) Process video items — scale then overlay
        //    CSS transform: scale(N) scales from the element's CENTER.
        //    So we compute: center = (left + w/2, top + h/2)
        //                   overlay = (center_x - scaledW/2, center_y - scaledH/2)
        videoInputIndices.forEach((inputIdx, i) => {
            const vItem = videoItems[i];
            const det = vItem.details;
            const cssLeft = parsePx(det.left);
            const cssTop = parsePx(det.top);
            const origW = det.width ?? 640;
            const origH = det.height ?? 360;
            const fromSec = msToSeconds(vItem.display.from);
            const toSec = msToSeconds(vItem.display.to);

            const { scale, scaleX, scaleY } = parseTransform(det.transform);
            const sX = scale ?? scaleX ?? 1;
            const sY = scale ?? scaleY ?? 1;
            const sw = Math.round(origW * sX);
            const sh = Math.round(origH * sY);

            // Center of the element (CSS top-left + half original size)
            const centerX = cssLeft + origW / 2;
            const centerY = cssTop + origH / 2;

            // Post-transform top-left (center stays fixed, size changes)
            const overlayX = Math.round(centerX - sw / 2);
            const overlayY = Math.round(centerY - sh / 2);

            const scaledLabel = `vscaled${i}`;
            const afterLabel = `after_v${i}`;

            filters.push(`[${inputIdx}:v]scale=${sw}:${sh},format=rgba[${scaledLabel}]`);
            filters.push(
                `[${currentOut}][${scaledLabel}]overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${fromSec},${toSec})'[${afterLabel}]`
            );
            currentOut = afterLabel;
        });

        // 3) Overlay PNG layers (time-gated, with optional animations)
        textLayers.forEach((layer, i) => {
            const textInputIdx = textInputStart + i;
            const { left, top, fromSec, toSec } = layer;
            const layerLabel = `t${i}`;
            const afterLabel = `after_t${i}`;

            const { xExpr, yExpr, extraFilters, overlayInputLabel } = buildAnimationExpressions({
                animation: layer.animation,
                x: left,
                y: top,
                w: layer.width,
                h: layer.height,
                fromSec,
                toSec,
                layerLabel,
                inputLabel: `[${textInputIdx}:v]`,
            });

            // Push any extra filters (e.g. geq alpha chain) first
            filters.push(...extraFilters);

            filters.push(
                `[${currentOut}]${overlayInputLabel}overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${fromSec},${toSec})'[${afterLabel}]`
            );
            currentOut = afterLabel;
        });


        // 4) Strip alpha channel (required for H.264)
        filters.push(`[${currentOut}]format=yuv420p[out]`);

        const filterStr = filters.join('; ');
        console.log('\n[FFmpeg] filter_complex:\n', filterStr, '\n');

        // ─── Output options ──────────────────────────────────────────────────────────
        const outputOpts: string[] = [
            '-map', '[out]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-t', String(totalDurationSec),
            '-y',
        ];

        if (videoInputIndices.length > 0) {
            // Map audio from first video; ? means ignore if not present
            outputOpts.push('-map', `${videoInputIndices[0]}:a?`);
            outputOpts.push('-c:a', 'aac', '-b:a', '128k');

            // Apply volume control from JSON (0-100 → 0.0-1.0)
            const vol = (videoItems[0]?.details.volume ?? 100) / 100;
            if (vol !== 1) {
                outputOpts.push('-af', `volume=${vol.toFixed(2)}`);
            }
        }

        cmd
            .complexFilter(filterStr)
            .outputOptions(outputOpts)
            .output(outputPath)
            .on('start', (cmdLine) => console.log('[FFmpeg] Running:', cmdLine))
            .on('progress', (progress) => {
                const pct = Math.min(99, Math.round(progress.percent ?? 0));
                onProgress?.(pct);
            })
            .on('end', () => {
                console.log('[FFmpeg] Done →', outputPath);
                resolve();
            })
            .on('error', (err, _stdout, stderr) => {
                console.error('[FFmpeg] Error:', err.message);
                console.error('[FFmpeg] stderr:', stderr);
                reject(new Error(`FFmpeg failed: ${err.message}\n${stderr}`));
            })
            .run();
    });
}
