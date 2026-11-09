// A tiny app for testing Gust deploys. It reports its version, becomes
// healthy only after STARTUP_DELAY_MS, and on SIGTERM keeps serving while
// it fails its health check, so the proxy can take it out before it exits.
import { createServer } from 'node:http';
import { hostname } from 'node:os';

const version = process.env.VERSION ?? 'dev';
const port = Number(process.env.PORT ?? 3000);
const startupDelay = Number(process.env.STARTUP_DELAY_MS ?? 2000);
const drainMs = Number(process.env.DRAIN_MS ?? 3000);
const failHealth = process.env.FAIL_HEALTH === '1';
const started = Date.now();
let draining = false;

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    const ok = !failHealth && !draining && Date.now() - started > startupDelay;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'text/plain' });
    res.end(ok ? 'ok' : 'not ready');
    return;
  }
  // What the app received from Gust: GREETING as plain text, the secret only
  // as "set" or "missing".
  const info = {
    version,
    host: hostname(),
    greeting: process.env.GREETING ?? null,
    tokenSet: Boolean(process.env.DEMO_API_TOKEN),
  };
  const headers = { connection: draining ? 'close' : 'keep-alive' };
  if (req.headers.accept?.includes('text/html')) {
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>hello ${esc(version)}</title>
<body style="font:16px/1.5 system-ui;background:#1f3d2b;color:#e8fff1;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="position:fixed;top:0;left:0;right:0;background:#3ddc84;color:#06160d;text-align:center;padding:14px;font-weight:700;letter-spacing:.06em">PREVIEW · dev branch · second deploy</div>
<main style="text-align:center">
<p style="color:#3ddc84;margin:0">demo/hello · preview · ${esc(version)}</p>
<h1 style="font-size:48px;margin:8px 0">${esc(info.greeting ?? 'No GREETING set')}</h1>
<p style="color:#6c6b84">DEMO_API_TOKEN ${info.tokenSet ? 'received' : 'missing'} · container ${esc(info.host)}</p>
</main>`);
    return;
  }
  res.writeHead(200, { ...headers, 'content-type': 'application/json' });
  res.end(JSON.stringify(info));
});

server.listen(port, () => console.log(`hello ${version} listening on ${port}`));

process.on('SIGTERM', () => {
  draining = true;
  console.log(`SIGTERM: draining for ${drainMs} ms`);
  setTimeout(() => server.close(() => process.exit(0)), drainMs);
});
