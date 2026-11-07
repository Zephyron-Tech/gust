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
  res.writeHead(200, { 'content-type': 'application/json', connection: draining ? 'close' : 'keep-alive' });
  res.end(JSON.stringify({ version, host: hostname() }));
});

server.listen(port, () => console.log(`hello ${version} listening on ${port}`));

process.on('SIGTERM', () => {
  draining = true;
  console.log(`SIGTERM: draining for ${drainMs} ms`);
  setTimeout(() => server.close(() => process.exit(0)), drainMs);
});
