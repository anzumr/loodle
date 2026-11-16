import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/** Serve only the built entry point and assets, never source, environment files or arbitrary paths. */
export function assetPath(url: string): string | null {
  let path: string;
  try { path = decodeURIComponent(url.split('?')[0]!); } catch { return null; }
  if (path === '/' || path === '/index.html') return 'index.html';
  if (!path.startsWith('/assets/') || path.includes('\\') || path.includes('\0') || path.split('/').some((part) => part.startsWith('.'))) return null;
  return TYPES[extname(path)] ? path.slice(1) : null;
}

export async function serveWeb(request: IncomingMessage, response: ServerResponse, directory: string) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  if (request.url?.split('?')[0] === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : '{"ok":true}'); return;
  }
  const path = assetPath(request.url ?? '/');
  if (!path) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const contents = await readFile(resolve(directory, path));
    response.writeHead(200, {
      'Content-Type': TYPES[extname(path)]!,
      'Content-Length': contents.length,
      'Cache-Control': path === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}
