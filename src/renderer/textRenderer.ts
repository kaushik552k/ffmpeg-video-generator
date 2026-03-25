import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import {
    TextDetails, ListDetails, TableDetails, ImageDetails, LayerAnimation,
} from '../shared/types';
import { replaceDynamicText, parsePx, simpleHash, ensureDir } from '../shared/utils';

let browserInstance: Browser | null = null;

/**
 * Get or create a shared Puppeteer browser instance.
 */
async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.connected) {
        console.log('[LayerRenderer] Launching Puppeteer browser...');
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none',
            ],
        });
        console.log('[LayerRenderer] Browser ready.');
    }
    return browserInstance;
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

export interface RenderedOverlayLayer {
    pngPath: string;
    left: number;
    top: number;
    width: number;
    height: number;
    fromSec: number;
    toSec: number;
    opacity: number;
    /** Optional animation config from the JSON track item */
    animation?: LayerAnimation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared font-face CSS helper
// ─────────────────────────────────────────────────────────────────────────────
function fontFaceCSS(
    family: string, url: string, weight = 'normal', style = 'normal'
): string {
    return `
    @font-face {
      font-family: '${family}';
      src: url('${url}');
      font-weight: ${weight};
      font-style: ${style};
    }`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Builders — one per layer type
// ─────────────────────────────────────────────────────────────────────────────

function buildTextHTML(d: TextDetails, text: string): string {
    const strokeW = d.WebkitTextStrokeWidth ?? '0px';
    const strokeC = d.WebkitTextStrokeColor ?? 'transparent';
    const bs = d.boxShadow;
    const boxShadow = bs ? `${bs.x}px ${bs.y}px ${bs.blur}px ${bs.color}` : 'none';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  ${fontFaceCSS(d.fontFamily, d.fontUrl, d.fontWeight, d.fontStyle)}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${d.width}px; height:${d.height}px; overflow:hidden; background:transparent; }
  .layer {
    position:absolute; top:0; left:0;
    width:${d.width}px; height:${d.height}px;
    overflow:hidden;
    font-family:'${d.fontFamily}',sans-serif;
    font-size:${d.fontSize}px;
    font-weight:${d.fontWeight ?? 'normal'};
    font-style:${d.fontStyle ?? 'normal'};
    color:${d.color};
    text-align:${d.textAlign ?? 'left'};
    text-decoration:${d.textDecoration ?? 'none'};
    text-transform:${d.textTransform ?? 'none'};
    text-shadow:${d.textShadow ?? 'none'};
    letter-spacing:${d.letterSpacing ?? 'normal'};
    line-height:${d.lineHeight ?? 'normal'};
    word-break:${d.wordBreak ?? 'normal'};
    word-wrap:${d.wordWrap ?? 'normal'};
    word-spacing:${d.wordSpacing ?? 'normal'};
    -webkit-text-stroke:${strokeW} ${strokeC};
    box-shadow:${boxShadow};
    background-color:${d.backgroundColor ?? 'transparent'};
    border:${d.border ?? 'none'};
  }
  </style></head><body>
  <div class="layer">${text.replace(/\n/g, '<br/>')}</div>
  </body></html>`;
}

function buildListHTML(d: ListDetails): string {
    const tag = d.listStyle === 'decimal' ? 'ol' : 'ul';
    const spacing = d.itemSpacing ?? 8;
    const items = d.items.map(
        (item) => `<li style="margin-bottom:${spacing}px">${item}</li>`
    ).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  ${fontFaceCSS(d.fontFamily, d.fontUrl, d.fontWeight, d.fontStyle)}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${d.width}px; height:${d.height}px; overflow:hidden; background:transparent; }
  .layer {
    position:absolute; top:0; left:0;
    width:${d.width}px; height:${d.height}px;
    overflow:hidden;
    font-family:'${d.fontFamily}',sans-serif;
    font-size:${d.fontSize}px;
    font-weight:${d.fontWeight ?? 'normal'};
    font-style:${d.fontStyle ?? 'normal'};
    color:${d.color};
    line-height:${d.lineHeight ?? '1.5'};
    letter-spacing:${d.letterSpacing ?? 'normal'};
    background-color:${d.backgroundColor ?? 'transparent'};
    border-radius:${d.borderRadius ?? 0}px;
    padding: 8px 8px 8px 32px;
  }
  ${tag} {
    list-style-type: ${d.listStyle};
    padding-left: 24px;
  }
  ${tag} li::marker {
    color: ${d.markerColor ?? d.color};
  }
  </style></head><body>
  <div class="layer"><${tag}>${items}</${tag}></div>
  </body></html>`;
}

function buildTableHTML(d: TableDetails): string {
    const padding = d.cellPadding ?? 12;
    const align = d.textAlign ?? 'left';
    const headerBg = d.headerBgColor ?? 'rgba(255,255,255,0.15)';
    const rowBg = d.rowBgColor ?? 'transparent';
    const rowAltBg = d.rowAltBgColor ?? 'rgba(255,255,255,0.05)';
    const borderC = d.borderColor ?? 'rgba(255,255,255,0.2)';

    const headerCells = d.headers.map(
        (h) => `<th>${h}</th>`
    ).join('');
    const bodyRows = d.rows.map((row, i) => {
        const bg = i % 2 === 0 ? rowBg : rowAltBg;
        const cells = row.map((cell) => `<td>${cell}</td>`).join('');
        return `<tr style="background:${bg}">${cells}</tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  ${fontFaceCSS(d.fontFamily, d.fontUrl, d.fontWeight, d.fontStyle)}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${d.width}px; height:${d.height}px; overflow:hidden; background:transparent; }
  .layer {
    position:absolute; top:0; left:0;
    width:${d.width}px; height:${d.height}px;
    overflow:hidden;
    font-family:'${d.fontFamily}',sans-serif;
    font-size:${d.fontSize}px;
    font-weight:${d.fontWeight ?? 'normal'};
    font-style:${d.fontStyle ?? 'normal'};
    color:${d.color};
    background-color:${d.backgroundColor ?? 'transparent'};
    border-radius:${d.borderRadius ?? 0}px;
  }
  table {
    width:100%;
    border-collapse:collapse;
    text-align:${align};
  }
  th {
    background:${headerBg};
    padding:${padding}px;
    border-bottom:2px solid ${borderC};
    font-weight:bold;
  }
  td {
    padding:${padding}px;
    border-bottom:1px solid ${borderC};
  }
  </style></head><body>
  <div class="layer">
    <table><thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody></table>
  </div>
  </body></html>`;
}

function buildImageHTML(d: ImageDetails): string {
    const bs = d.boxShadow;
    const boxShadow = bs ? `${bs.x}px ${bs.y}px ${bs.blur}px ${bs.color}` : 'none';
    const fit = d.objectFit ?? 'cover';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${d.width}px; height:${d.height}px; overflow:hidden; background:transparent; }
  .layer {
    position:absolute; top:0; left:0;
    width:${d.width}px; height:${d.height}px;
    overflow:hidden;
    border-radius:${d.borderRadius ?? 0}px;
    border:${d.borderWidth ?? 0}px solid ${d.borderColor ?? 'transparent'};
    box-shadow:${boxShadow};
    background-color:${d.backgroundColor ?? 'transparent'};
  }
  img {
    width:100%; height:100%;
    object-fit:${fit};
    display:block;
  }
  </style></head><body>
  <div class="layer"><img src="${d.src}" /></div>
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core PNG Renderer
// ─────────────────────────────────────────────────────────────────────────────

async function renderHTMLToPng(
    html: string, width: number, height: number, outputPath: string
): Promise<void> {
    const browser = await getBrowser();
    const page: Page = await browser.newPage();
    try {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.screenshot({
            path: outputPath as `${string}.png`,
            type: 'png',
            omitBackground: true,
            clip: { x: 0, y: 0, width, height },
        });
    } finally {
        await page.close();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: Render all overlay layers to PNGs
// ─────────────────────────────────────────────────────────────────────────────

export interface OverlayItem {
    id: string;
    type: 'text' | 'list' | 'table' | 'image';
    details: TextDetails | ListDetails | TableDetails | ImageDetails;
    display: { from: number; to: number };
    dynamicFields?: Record<string, string>;
    /** Optional animation from the JSON track item */
    animation?: LayerAnimation;
}

export async function renderOverlayLayers(params: {
    items: OverlayItem[];
    tempDir: string;
    cacheDir: string;
    /** Max concurrent Puppeteer pages. Default: 4 */
    concurrency?: number;
}): Promise<RenderedOverlayLayer[]> {
    const { items, tempDir, cacheDir, concurrency = 4 } = params;
    ensureDir(tempDir);
    ensureDir(cacheDir);

    // Pre-warm browser before parallel work
    await getBrowser();

    /**
     * Render a single overlay item to PNG (cache-aware).
     */
    async function renderItem(item: OverlayItem): Promise<RenderedOverlayLayer> {
        const d = item.details;
        let html: string;

        switch (item.type) {
            case 'text': {
                const td = d as TextDetails;
                const text = replaceDynamicText(td.text, item.dynamicFields ?? {});
                html = buildTextHTML(td, text);
                break;
            }
            case 'list': {
                const ld = { ...(d as ListDetails) };
                ld.items = ld.items.map((i) => replaceDynamicText(i, item.dynamicFields ?? {}));
                html = buildListHTML(ld);
                break;
            }
            case 'table': {
                const tbd = { ...(d as TableDetails) };
                tbd.headers = tbd.headers.map((h) => replaceDynamicText(h, item.dynamicFields ?? {}));
                tbd.rows = tbd.rows.map(
                    (row) => row.map((cell) => replaceDynamicText(cell, item.dynamicFields ?? {}))
                );
                html = buildTableHTML(tbd);
                break;
            }
            case 'image': {
                html = buildImageHTML(d as ImageDetails);
                break;
            }
            default:
                throw new Error(`[LayerRenderer] Unknown type: ${(item as any).type}`);
        }

        const cacheKey = simpleHash(html);
        const cachedPath = path.join(cacheDir, `${cacheKey}.png`);
        const pngPath = path.join(tempDir, `${item.type}_${item.id}.png`);

        if (fs.existsSync(cachedPath)) {
            fs.copyFileSync(cachedPath, pngPath);
            console.log(`[LayerRenderer] Cache hit: ${item.type} ${item.id}`);
        } else {
            console.log(`[LayerRenderer] Rendering ${item.type} layer: ${item.id}`);
            await renderHTMLToPng(html, d.width, d.height, pngPath);
            fs.copyFileSync(pngPath, cachedPath);
        }

        return {
            pngPath,
            left: parsePx(d.left),
            top: parsePx(d.top),
            width: d.width,
            height: d.height,
            fromSec: item.display.from / 1000,
            toSec: item.display.to / 1000,
            opacity: d.opacity / 100,
            animation: item.animation,
        };
    }

    // ── Concurrency-limited parallel rendering ────────────────────────────────
    // Process in chunks of `concurrency` to avoid exhausting browser memory
    const results: RenderedOverlayLayer[] = new Array(items.length);
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(renderItem));
        chunkResults.forEach((r, j) => { results[i + j] = r; });
    }

    return results;
}

// ─── Backward-compatible export ─────────────────────────────────────────────
export { RenderedOverlayLayer as RenderedTextLayer };
export const renderTextLayers = renderOverlayLayers;
