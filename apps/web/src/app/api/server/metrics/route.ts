import { requireUser } from '@/lib/auth';
import { readLiveMetrics, readMetricsHistory, readServerFacts } from '@/lib/host-files';
import {
  buildContainers,
  chartSeries,
  diskForecastDays,
  parseHistory,
  parseLatest,
  parseRange,
  type Range,
  rangeMs,
  type ServerView,
} from '@/lib/server-metrics';

export const dynamic = 'force-dynamic';

// What the Server page shows, from the files the host samples every minute.
// Any signed-in user may read it; nothing here changes the host.
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const range = parseRange(new URL(req.url).searchParams.get('range'));
  const now = Date.now();

  const [live, facts] = await Promise.all([readLiveMetrics(), readServerFacts()]);
  // The forecast needs seven days of history, so read at least that much.
  const historyRange: Range = rangeMs(range) < rangeMs('7d') ? '7d' : range;
  const raw = await readMetricsHistory(historyRange);
  const samples = parseHistory(raw ?? '', now, now - rangeMs(historyRange));
  const shown = samples.filter((s) => Date.parse(s.at) >= now - rangeMs(range));

  const view: ServerView = {
    domain: process.env.GUST_DOMAIN ?? null,
    facts,
    snapshot: parseLatest(live.latest),
    containers: buildContainers(live.containerStats, live.containerInspect),
    range,
    series: chartSeries(shown, range),
    diskForecastDays: diskForecastDays(samples, now),
  };
  return Response.json(view);
}
