/**
 * DEMO: Static Render (No Animations)
 * ------------------------------------
 * Renders a 30-second video with 5 overlay layers — text, list, table, image, video.
 * NO animation is applied to any layer.
 *
 * Run: npx tsx src/test/demo_static.ts
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { renderComposition } from '../renderer/renderPipeline';
import { Composition } from '../shared/types';
import { closeBrowser } from '../renderer/textRenderer';

const composition: Composition = {
    fps: 30,
    id: 'demo_static',
    size: { width: 1920, height: 1080 },
    tracks: [
        { id: 'track_video', items: ['vid_bg'],       type: 'video' },
        { id: 'track_text',  items: ['txt_heading', 'txt_subtitle', 'lst_points', 'tbl_stats', 'img_logo'], type: 'text' },
    ],
    trackItemsMap: {
        vid_bg: {
            type: 'video', id: 'vid_bg',
            display: { from: 0, to: 30000 }, duration: 30000,
            playbackRate: 1, trim: { from: 0, to: 30000 },
            details: {
                src: 'https://uat-visuals-pub.s3.ap-south-1.amazonaws.com/media_templates/121826074e47a6048f6574e12edd7560.mp4',
                left: '640px', top: '360px', width: 640, height: 360,
                transform: 'scale(3)', opacity: 100, volume: 80,
            },
        },
        txt_heading: {
            type: 'text', id: 'txt_heading',
            display: { from: 0, to: 30000 },
            // animation: ← intentionally omitted
            details: {
                text: 'Q3 Business Review',
                left: '160px', top: '80px', width: 900, height: 120,
                fontFamily: 'Roboto-Bold',
                fontUrl: 'https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf',
                fontSize: 72, color: '#ffffff', textAlign: 'left', opacity: 100,
                backgroundColor: 'transparent',
            },
        } as any,
        txt_subtitle: {
            type: 'text', id: 'txt_subtitle',
            display: { from: 0, to: 30000 },
            details: {
                text: 'Presented by Kaushik · March 2026',
                left: '160px', top: '210px', width: 800, height: 60,
                fontFamily: 'Roboto-Bold',
                fontUrl: 'https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf',
                fontSize: 32, color: '#cccccc', textAlign: 'left', opacity: 100,
                backgroundColor: 'transparent',
            },
        } as any,
        lst_points: {
            type: 'list', id: 'lst_points',
            display: { from: 3000, to: 30000 },
            details: {
                left: '160px', top: '300px', width: 700, height: 280,
                listStyle: 'disc',
                items: ['Revenue grew 40% YoY', 'MAU crossed 1 Million', 'Launched in 3 new markets'],
                fontSize: 34, color: '#ffffff', opacity: 100,
                backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12,
            },
        } as any,
        tbl_stats: {
            type: 'table', id: 'tbl_stats',
            display: { from: 8000, to: 30000 },
            details: {
                left: '160px', top: '620px', width: 800, height: 240,
                headers: ['Metric', 'Q2', 'Q3'],
                rows: [
                    ['Revenue', '$10M', '$14M'],
                    ['Users',   '700K', '1M'],
                    ['Markets', '5',    '8'],
                ],
                fontSize: 28, color: '#ffffff', opacity: 100,
                backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
            },
        } as any,
        img_logo: {
            type: 'image', id: 'img_logo',
            display: { from: 0, to: 30000 },
            details: {
                src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/800px-Google_2015_logo.svg.png',
                left: '1650px', top: '40px', width: 220, height: 80,
                opacity: 90, borderRadius: 0,
            },
        } as any,
    },
};

async function main() {
    console.log('\n' + '═'.repeat(55));
    console.log('  🎬 DEMO — Static Render (NO Animations)');
    console.log('═'.repeat(55));
    console.log(`  Layers : 1 video + 4 text overlays + 1 image`);
    console.log(`  Length : 30 seconds @ 1920×1080`);
    console.log('─'.repeat(55) + '\n');

    const phases: Record<string, number> = {};
    const total = Date.now();

    try {
        const output = await renderComposition({
            jobId: composition.id,
            composition,
            onProgress: (pct) => process.stdout.write(`\r  Progress: ${pct}%   `),
        });

        const elapsed = ((Date.now() - total) / 1000).toFixed(1);
        const size    = (fs.statSync(output).size / 1024 / 1024).toFixed(2);

        console.log('\n\n' + '─'.repeat(55));
        console.log('  ✅ Render complete!');
        console.log(`  📁 Output : ${path.resolve(output)}`);
        console.log(`  📦 Size   : ${size} MB`);
        console.log(`  ⏱️  Time   : ${elapsed}s`);
        console.log('═'.repeat(55) + '\n');
    } catch (err) {
        console.error('\n❌ Error:', err);
        process.exit(1);
    } finally {
        await closeBrowser();
    }
}

main();
