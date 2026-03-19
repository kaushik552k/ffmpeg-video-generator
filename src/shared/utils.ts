import path from 'path';
import fs from 'fs';

/**
 * Convert milliseconds to seconds
 */
export function msToSeconds(ms: number): number {
    return ms / 1000;
}

/**
 * Convert milliseconds to frame number
 */
export function msToFrames(ms: number, fps: number): number {
    return Math.round((ms / 1000) * fps);
}

/**
 * Replace {{variable}} placeholders in text with values from dynamicFields map
 */
export function replaceDynamicText(
    text: string,
    dynamicFields: Record<string, string> = {}
): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return dynamicFields[key] ?? match;
    });
}

/**
 * Calculate total video duration in milliseconds from trackItemsMap
 */
export function calculateDurationMs(
    trackItemsMap: Record<string, { display: { from: number; to: number } }>
): number {
    return Object.values(trackItemsMap).reduce((max, item) => {
        return Math.max(max, item.display.to);
    }, 0);
}

/**
 * Parse a CSS pixel value like "640px" → 640
 */
export function parsePx(value: string): number {
    return parseFloat(value.replace('px', ''));
}

/**
 * Parse CSS transform like "scale(3)" → { scale: 3 }
 */
export function parseTransform(transform: string | undefined): {
    scale?: number;
    scaleX?: number;
    scaleY?: number;
} {
    if (!transform || transform === 'none') return {};
    const result: { scale?: number; scaleX?: number; scaleY?: number } = {};

    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    if (scaleMatch) {
        const parts = scaleMatch[1].split(',').map(Number);
        if (parts.length === 1) result.scale = parts[0];
        else { result.scaleX = parts[0]; result.scaleY = parts[1]; }
    }
    return result;
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Generate a safe temp file path
 */
export function tempFilePath(dir: string, name: string, ext: string): string {
    return path.join(dir, `${name}_${Date.now()}${ext}`);
}

/**
 * Simple hash of a string (for caching)
 */
export function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}
