import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android and iOS apps wrap the same built web game (`npm run build` → dist).
 * Online play talks to the live server at loodle.online (see `src/platform.ts`).
 */
const config: CapacitorConfig = {
  appId: 'online.loodle.app',
  appName: 'LOODLE',
  webDir: 'dist',
  backgroundColor: '#060d2b',
  android: {
    // The game never needs plain HTTP.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
