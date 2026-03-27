/**
 * demo_geq_old.ts — OLD Per-Pixel Filter Approach
 * ─────────────────────────────────────────────────
 * Uses the LEGACY `geq` filter for fade animations.
 * `geq` runs a custom formula for EVERY PIXEL on EVERY FRAME:
 *   1920 × 1080 × 900 frames = ~1.86 BILLION evaluations per animated layer
 *
 * Run: npx tsx src/test/demo_geq_old.ts
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { renderComposition } from '../renderer/renderPipeline';
import { Composition } from '../shared/types';
import { closeBrowser } from '../renderer/textRenderer';

// We temporarily swap animationBuilder inside the compositor by monkey-patching
// the module. This is a benchmark-only technique — NOT for production.
import { buildAnimationExpressionsGeq } from '../renderer/animationBuilderLegacy';

// Patch the compositor module to use the legacy geq builder for this run
import * as compositor from '../renderer/videoCompositor';
(compositor as any).__patchAnimFn = buildAnimationExpressionsGeq;

// ── Shared composition (same for both demos) ──────────────────────────────────
const composition: Composition = {
    fps: 30,
    id: 'demo_geq_old',
    size: { width: 1920, height: 1080 },
    tracks: [
        { id: 'track_video', items: ['vid_bg'], type: 'video' },
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
            animation: { in: { type: 'fadeIn', duration: 1200 }, out: { type: 'fadeOut', duration: 800 } },
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
            animation: { in: { type: 'slideInRight', duration: 1000 }, out: { type: 'slideOutRight', duration: 600 } },
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
            animation: { in: { type: 'slideInLeft', duration: 900 }, out: { type: 'slideOutLeft', duration: 600 } },
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
            animation: { in: { type: 'slideInBottom', duration: 1000 }, out: { type: 'fadeOut', duration: 800 } },
            details: {
                left: '160px', top: '620px', width: 800, height: 240,
                headers: ['Metric', 'Q2', 'Q3'],
                rows: [['Revenue', '$10M', '$14M'], ['Users', '700K', '1M'], ['Markets', '5', '8']],
                fontSize: 28, color: '#ffffff', opacity: 100,
                backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
            },
        } as any,
        img_logo: {
            type: 'image', id: 'img_logo',
            display: { from: 0, to: 30000 },
            animation: { in: { type: 'zoomIn', duration: 1500 }, out: { type: 'zoomOut', duration: 800 } },
            details: {
                src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/800px-Google_2015_logo.svg.png',
                left: '1650px', top: '40px', width: 220, height: 80,
                opacity: 90, borderRadius: 0,
            },
        } as any,
    },
};

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🐌 DEMO — OLD Approach  (geq filter — per-pixel formula)');
    console.log('═'.repeat(60));
    console.log('  Filter   : geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':a=\'...\'');
    console.log('  Cost     : ~1.86 BILLION pixel evaluations per layer');
    console.log('  Layers   : 5 (video + text + list + table + image)');
    console.log('  Animations: fadeIn/Out · slideInLeft/Right/Bottom · zoomIn/Out');
    console.log('─'.repeat(60) + '\n');

    const total = Date.now();

    try {
        const output = await renderComposition({
            jobId: composition.id,
            composition,
            buildAnimFn: buildAnimationExpressionsGeq,
        });

        const elapsed = ((Date.now() - total) / 1000).toFixed(1);
        const size    = (fs.statSync(output).size / 1024 / 1024).toFixed(2);

        console.log('\n' + '─'.repeat(60));
        console.log('  ✅ Render complete!');
        console.log(`  📁 Output : ${path.resolve(output)}`);
        console.log(`  📦 Size   : ${size} MB`);
        console.log(`  ⏱️  Time   : ${elapsed}s   ← THIS IS THE SLOW APPROACH`);
        console.log('═'.repeat(60) + '\n');
        console.log('  👉 Now run demo_fade_new.ts to see the improvement!\n');
    } catch (err) {
        console.error('\n❌ Error:', err);
        process.exit(1);
    } finally {
        await closeBrowser();
    }
}

main();
