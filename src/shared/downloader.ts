import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

/**
 * Download a remote URL to a local file path.
 * Uses Node's native http/https — no extra dependencies.
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
