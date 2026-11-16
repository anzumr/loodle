import { describe, expect, it } from 'vitest';
import { assetPath } from '../src/http';

describe('public static routes', () => {
  it('serves the entry point and typed assets', () => {
    expect(assetPath('/')).toBe('index.html');
    expect(assetPath('/index.html?v=2')).toBe('index.html');
    expect(assetPath('/assets/index-abc.js')).toBe('assets/index-abc.js');
  });
  it.each(['/../package.json', '/assets/../../.env', '/assets/%2e%2e/%2e%2e/.env', '/assets/..%5c..%5c.env', '/.git/config', '/src/index.ts', '/assets/config.json', '/assets/%00.js', '/%broken'])('does not expose %s', (path) => {
    expect(assetPath(path)).toBeNull();
  });
});
