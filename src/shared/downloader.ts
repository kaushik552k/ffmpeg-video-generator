import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import { ensureDir } from './utils';

/**
 * Download a remote URL to a local file path.
 * Uses Node's native http/https — no extra dependencies.
 * Handles HTTP 301/302 redirects (common with S3 pre-signed URLs).
 * Returns the local file path.
 */
export function downloadFile(url: string, destPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(destPath);

    const request = protocol.get(url, (response) => {
      // Handle redirects (S3 pre-signed URLs often redirect)
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error(`Redirect with no location header from ${url}`));
          return;
        }
        file.close();
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {}); // cleanup partial file
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Returns true if the given string looks like a remote URL.
 */
export function isRemoteUrl(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://');
}

/**
 * Persistent video cache.
 *
 * For batch rendering (e.g. 3M videos sharing the same base template video),
 * the remote video only needs to be downloaded ONCE. This function:
 *   1. Hashes the URL → deterministic cache filename
 *   2. If the cached file already exists → returns it instantly (0ms)
 *   3. If not → downloads it, saves to cache, returns path
 *
 * The cache is stored in VIDEO_CACHE_DIR (default: ./tmp/video_cache/)
 * and is NEVER deleted between jobs. Only cleared manually or on server restart.
 *
 * Savings at scale:
 *   - 3M videos × 8s download = 24M seconds wasted WITHOUT cache
 *   - WITH cache = 8s total, then 0ms for all 2,999,999 subsequent jobs
 */
export async function getOrDownloadVideo(
  url: string,
  videoCacheDir: string
): Promise<string> {
  ensureDir(videoCacheDir);

  // Hash the URL to a short, filesystem-safe key
  const urlHash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
  const ext = path.extname(new URL(url).pathname) || '.mp4';
  const cachedPath = path.join(videoCacheDir, `${urlHash}${ext}`);

  if (fs.existsSync(cachedPath)) {
    console.log(`[VideoCache] HIT  → ${cachedPath} (skipping download)`);
    return cachedPath;
  }

  console.log(`[VideoCache] MISS → downloading: ${url.slice(0, 70)}...`);
  const t = Date.now();
  await downloadFile(url, cachedPath);
  console.log(`[VideoCache] Saved in ${((Date.now() - t) / 1000).toFixed(1)}s → ${cachedPath}`);

  return cachedPath;
}
