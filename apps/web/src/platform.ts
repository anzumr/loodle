import { Capacitor } from '@capacitor/core';

/** True inside the Android or iOS app, false on the website. */
export const isNativeApp = Capacitor.isNativePlatform();

/** The public website. The apps use it for online play and for invite links. */
export const PUBLIC_SITE = 'https://loodle.online';

/** Where invite links point: this site on the web, the public site from the apps. */
export const siteOrigin = (): string => (isNativeApp ? PUBLIC_SITE : window.location.origin);
