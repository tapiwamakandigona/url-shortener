export type AnalyticsParams = Record<string, string | boolean>;

declare global {
  interface Window {
    tapiwaTrack?: (name: string, params?: AnalyticsParams) => boolean;
  }
}

/** Analytics is best-effort. Privacy tools or a tag failure must never break
 * shortening, copying, QR downloads, or any other product action. */
export function track(name: string, params: AnalyticsParams = {}): boolean {
  if (typeof window === 'undefined' || typeof window.tapiwaTrack !== 'function') return false;
  try {
    return window.tapiwaTrack(name, params) === true;
  } catch {
    return false;
  }
}
