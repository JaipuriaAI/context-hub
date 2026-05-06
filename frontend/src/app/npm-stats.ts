/**
 * Fetches public download counts from the npm registry's open API.
 * Endpoints used:
 *   - https://api.npmjs.org/downloads/point/last-week/<pkg>     → weekly total + window dates
 *   - https://registry.npmjs.org/<pkg>                          → first publish date (time.created)
 *   - https://api.npmjs.org/downloads/range/<start>:<end>/<pkg> → all-time, summed
 *
 * Every endpoint is unauthenticated and CORS-enabled. Responses are cached for
 * 6 hours via Next.js ISR so the page stays fast, the date range still reflects
 * the current rolling window within the day, and we don't hammer the API.
 */
const PKG = "create-context-hub";

// 6 hours — fresh enough that the rolling weekly window updates within a day,
// kind enough to npm's free public API.
const REVALIDATE_SECONDS = 60 * 60 * 6;

export type NpmStats = {
  weekly: number | null;
  total: number | null;
  /** Inclusive start of the rolling 7-day window, as YYYY-MM-DD (UTC). */
  weeklyStart: string | null;
  /** Inclusive end of the rolling 7-day window, as YYYY-MM-DD (UTC). */
  weeklyEnd: string | null;
  /** First publish date of the package, as YYYY-MM-DD (UTC). */
  firstPublished: string | null;
};

export async function getNpmStats(): Promise<NpmStats> {
  const today = new Date().toISOString().slice(0, 10);

  const weeklyUrl = `https://api.npmjs.org/downloads/point/last-week/${PKG}`;
  const registryUrl = `https://registry.npmjs.org/${PKG}`;

  const [weeklyResp, firstPublished] = await Promise.all([
    fetchWeekly(weeklyUrl),
    fetchFirstPublishedDate(registryUrl),
  ]);

  // Use the package's first publish date as the start of the all-time range
  // so the total reflects genuine cumulative downloads (not a padded zero
  // window from before the package existed).
  const totalStart = firstPublished ?? "2010-01-01";
  const rangeUrl = `https://api.npmjs.org/downloads/range/${totalStart}:${today}/${PKG}`;
  const total = await fetchTotal(rangeUrl);

  return {
    weekly: weeklyResp.downloads,
    weeklyStart: weeklyResp.start,
    weeklyEnd: weeklyResp.end,
    total,
    firstPublished,
  };
}

async function fetchWeekly(url: string): Promise<{
  downloads: number | null;
  start: string | null;
  end: string | null;
}> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return { downloads: null, start: null, end: null };
    const data = (await res.json()) as {
      downloads?: number;
      start?: string;
      end?: string;
    };
    return {
      downloads: typeof data.downloads === "number" ? data.downloads : null,
      start: typeof data.start === "string" ? data.start : null,
      end: typeof data.end === "string" ? data.end : null,
    };
  } catch {
    return { downloads: null, start: null, end: null };
  }
}

async function fetchTotal(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      downloads?: { downloads: number; day: string }[];
    };
    if (!Array.isArray(data.downloads)) return null;
    return data.downloads.reduce((sum, day) => sum + day.downloads, 0);
  } catch {
    return null;
  }
}

async function fetchFirstPublishedDate(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as { time?: { created?: string } };
    const created = data.time?.created;
    if (typeof created !== "string") return null;
    return created.slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Compact, locale-aware number formatting:
 *   1_234          → "1,234"
 *   12_345         → "12.3K"
 *   1_234_567      → "1.2M"
 *   null/undefined → "—"
 */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1_000) return n.toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}

const SHORT_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-04-30" + "2026-05-06" → "Apr 30 – May 6". */
export function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (!start || !end) return "Last 7 days";
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return "Last 7 days";
  }
  return `${SHORT_MONTH.format(a)} – ${SHORT_MONTH.format(b)}`;
}

/** "2026-03-12" → "Since Mar 2026". */
export function formatSinceLabel(firstPublished: string | null): string {
  if (!firstPublished) return "Since first release";
  const d = new Date(`${firstPublished}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "Since first release";
  return `Since ${MONTH_YEAR.format(d)}`;
}
