/**
 * Analytics module for URL shortener.
 * Tracks clicks, user agents, referrers, and geographic data.
 */

export interface ClickEvent {
  timestamp: number;
  userAgent: string;
  referer: string;
  ip: string;
  country?: string;
  browser?: string;
  os?: string;
  device?: string;
}

export interface AnalyticsSummary {
  totalClicks: number;
  clicksByDay: Record<string, number>;
  clicksByHour: Record<number, number>;
  topReferers: Array<{ referer: string; count: number }>;
  topBrowsers: Array<{ browser: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  avgClicksPerDay: number;
}

/**
 * Parse user agent string to extract browser and OS.
 */
export function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  const browser = ua.includes("Chrome") ? "Chrome" :
    ua.includes("Firefox") ? "Firefox" :
    ua.includes("Safari") ? "Safari" :
    ua.includes("Edge") ? "Edge" : "Other";

  const os = ua.includes("Windows") ? "Windows" :
    ua.includes("Mac") ? "macOS" :
    ua.includes("Linux") ? "Linux" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") ? "iOS" : "Other";

  const device = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? "Mobile" : "Desktop";

  return { browser, os, device };
}

/**
 * Generate analytics summary from click events.
 */
export function summarize(clicks: ClickEvent[]): AnalyticsSummary {
  const totalClicks = clicks.length;
  
  const clicksByDay: Record<string, number> = {};
  const clicksByHour: Record<number, number> = {};
  const refererCounts: Record<string, number> = {};
  const browserCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};

  for (const click of clicks) {
    const day = new Date(click.timestamp).toISOString().split("T")[0];
    clicksByDay[day] = (clicksByDay[day] || 0) + 1;

    const hour = new Date(click.timestamp).getHours();
    clicksByHour[hour] = (clicksByHour[hour] || 0) + 1;

    const referer = click.referer || "Direct";
    refererCounts[referer] = (refererCounts[referer] || 0) + 1;

    if (click.browser) {
      browserCounts[click.browser] = (browserCounts[click.browser] || 0) + 1;
    }

    if (click.country) {
      countryCounts[click.country] = (countryCounts[click.country] || 0) + 1;
    }
  }

  const sortDesc = (obj: Record<string, number>) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

  const days = Object.keys(clicksByDay).length || 1;

  return {
    totalClicks,
    clicksByDay,
    clicksByHour,
    topReferers: sortDesc(refererCounts).map(([referer, count]) => ({ referer, count })),
    topBrowsers: sortDesc(browserCounts).map(([browser, count]) => ({ browser, count })),
    topCountries: sortDesc(countryCounts).map(([country, count]) => ({ country, count })),
    avgClicksPerDay: Math.round(totalClicks / days),
  };
}
