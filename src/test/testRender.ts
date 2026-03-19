/**
 * Standalone test — renders a composition with ALL layer types:
 * video, text, list, table, and image.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { renderComposition } from '../renderer/renderPipeline';
import { Composition } from '../shared/types';
import { closeBrowser } from '../renderer/textRenderer';

const sampleComposition: Composition = {
    fps: 30,
    id: "full_demo",
    size: { height: 1080, width: 1920 },
    trackItemsMap: {
        // ── VIDEO: background ──────────────────────────────────────────────────────
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
        },

        // ── TEXT: heading ───────────────────────────────────────────────────────────
        "txt_heading": {
            type: "text",
            display: { from: 0, to: 8000 },
            id: "txt_heading",
            details: {
                text: "{{title}}",
                left: "160px",
                top: "80px",
                width: 800,
                height: 120,
                fontFamily: "Roboto-Bold",
                fontUrl: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
                fontSize: 64,
                color: "#ffffff",
                textAlign: "left",
                opacity: 100,
                backgroundColor: "transparent",
            },
        },

        // ── LIST: bullet points ────────────────────────────────────────────────────
        "list_features": {
            type: "list",
            display: { from: 2000, to: 10000 },
            id: "list_features",
            details: {
                left: "160px",
                top: "220px",
                width: 700,
                height: 350,
                listStyle: "disc",
                items: [
                    "{{bullet1}}",
                    "{{bullet2}}",
                    "{{bullet3}}",
                    "{{bullet4}}",
                ],
                fontFamily: "Roboto-Bold",
                fontUrl: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
                fontSize: 32,
                color: "#ffffff",
                lineHeight: "1.6",
                opacity: 100,
                backgroundColor: "rgba(0,0,0,0.3)",
                borderRadius: 12,
            },
        },

        // ── TABLE: data comparison ─────────────────────────────────────────────────
        "table_stats": {
            type: "table",
            display: { from: 10000, to: 20000 },
            id: "table_stats",
            details: {
                left: "160px",
                top: "200px",
                width: 800,
                height: 300,
                headers: ["Metric", "Q1", "Q2", "Q3"],
                rows: [
                    ["Revenue", "$10M", "$12M", "$15M"],
                    ["Users", "50K", "75K", "{{q3Users}}"],
                    ["Growth", "15%", "20%", "28%"],
                ],
                fontFamily: "Roboto-Bold",
                fontUrl: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
                fontSize: 26,
                color: "#ffffff",
                headerBgColor: "rgba(255,255,255,0.2)",
                rowBgColor: "rgba(0,0,0,0.25)",
                rowAltBgColor: "rgba(0,0,0,0.4)",
                borderColor: "rgba(255,255,255,0.15)",
                cellPadding: 14,
                textAlign: "center",
                opacity: 100,
                backgroundColor: "transparent",
                borderRadius: 8,
            },
        },

        // ── IMAGE: logo overlay ────────────────────────────────────────────────────
        "img_logo": {
            type: "image",
            display: { from: 0, to: 30000 },
            id: "img_logo",
            details: {
                src: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/SVG_Logo.svg/200px-SVG_Logo.svg.png",
                left: "1650px",
                top: "40px",
                width: 120,
                height: 120,
                borderRadius: 60,
                borderWidth: 3,
                borderColor: "#ffffff",
                boxShadow: { x: 0, y: 4, blur: 12, color: "rgba(0,0,0,0.5)" },
                opacity: 100,
            },
        },

        // ── TEXT: subtitle / dynamic text ───────────────────────────────────────────
        "txt_subtitle": {
            type: "text",
            display: { from: 20000, to: 30000 },
            id: "txt_subtitle",
            details: {
                text: "{{subtitle}}",
                left: "160px",
                top: "500px",
                width: 900,
                height: 100,
                fontFamily: "Roboto-Bold",
                fontUrl: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
                fontSize: 48,
                color: "#ffdd00",
                textAlign: "center",
                opacity: 100,
                backgroundColor: "transparent",
            },
        },
    },

    tracks: [
        { id: "track_video", items: ["vid_bg"], type: "video" },
        { id: "track_image", items: ["img_logo"], type: "image" },
        { id: "track_table", items: ["table_stats"], type: "table" },
        { id: "track_list", items: ["list_features"], type: "list" },
        { id: "track_text", items: ["txt_heading", "txt_subtitle"], type: "text" },
    ],
};

async function main() {
    console.log('🎬 Starting full demo render (all layer types)...\n');

    try {
        const outputPath = await renderComposition({
            jobId: `demo_${Date.now()}`,
            composition: sampleComposition,
            dynamicFields: {
                title: "Quarterly Business Review",
                subtitle: "Thank you for watching!",
                bullet1: "Revenue grew 50% year-over-year",
                bullet2: "User acquisition exceeded targets",
                bullet3: "New markets launched in Q3",
                bullet4: "Product NPS score: 72",
                q3Users: "120K",
            },
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
