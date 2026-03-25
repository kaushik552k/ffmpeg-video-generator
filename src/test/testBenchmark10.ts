import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { renderComposition } from '../renderer/renderPipeline';
import { Composition, TrackItem, Track } from '../shared/types';
import { closeBrowser } from '../renderer/textRenderer';

const enableAnimations = process.argv.includes('--animated');

const trackItemsMap: Record<string, TrackItem> = {
    // Background video
    "vid_bg": {
        type: "video",
        display: { from: 0, to: 30000 },
        duration: 30000,
        id: "vid_bg",
        playbackRate: 1,
        trim: { from: 0, to: 30000 },
        details: {
            src: "https://uat-visuals-pub.s3.ap-south-1.amazonaws.com/media_templates/121826074e47a6048f6574e12edd7560.mp4",
            left: "640px",
            top: "360px",
            width: 640,
            height: 360,
            transform: "scale(3)",
            opacity: 100,
            volume: 100,
        },
    }
};

const textTrackItems: string[] = [];

// Generate 10 Text Layers
for (let i = 0; i < 10; i++) {
    const id = `txt_${i}`;
    textTrackItems.push(id);
    
    // Stagger display times slightly
    const from = i * 2000;
    const to = 30000;
    
    trackItemsMap[id] = {
        type: "text",
        id,
        display: { from, to },
        animation: enableAnimations ? {
            in: { type: i % 2 === 0 ? "fadeIn" : "slideInLeft", duration: 1000 },
            out: { type: i % 2 === 0 ? "fadeOut" : "slideOutRight", duration: 1000 }
        } : undefined,
        details: {
            text: `Layer ${i + 1}`,
            left: `${100 + (i * 50)}px`,
            top: `${100 + (i * 60)}px`,
            width: 400,
            height: 80,
            fontFamily: "Roboto-Bold",
            fontUrl: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
            fontSize: 48,
            color: i % 2 === 0 ? "#ffffff" : "#ffcc00",
            textAlign: "left",
            opacity: 100,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 8,
        }
    } as any;
}

const composition: Composition = {
    fps: 30,
    id: `bench_10_${enableAnimations ? 'anim' : 'static'}`,
    size: { height: 1080, width: 1920 },
    trackItemsMap,
    tracks: [
        { id: "track_video", items: ["vid_bg"], type: "video" },
        { id: "track_text", items: textTrackItems, type: "text" }
    ],
};

async function main() {
    console.log(`🎬 Benchmark: 10 Text Layers | Animations: ${enableAnimations ? 'ON' : 'OFF'}\n`);

    try {
        const outputPath = await renderComposition({
            jobId: composition.id,
            composition,
            onProgress: (pct) => {
                process.stdout.write(`\r  Progress: ${pct}%`);
            },
        });

        console.log('\n\n✅ Render complete!');
        console.log('   Output:', path.resolve(outputPath));
        console.log('   Size:  ', (fs.statSync(outputPath).size / 1024).toFixed(1), 'KB');
    } catch (err) {
        console.error('\n❌ Render failed:', err);
        process.exit(1);
    } finally {
        await closeBrowser();
    }
}

main();
