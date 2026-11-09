import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planDockerfile } from './dockerfile.mjs';

const next = { dependencies: { next: '16.0.0', react: '19.0.0' }, scripts: { build: 'next build', start: 'next start' } };
const plan = (files, pkg, extra = {}) => planDockerfile({ files: new Set(files), pkg, ...extra }).dockerfile;

test('pnpm Next app with standalone output copies .next/standalone and runs server.js', () => {
  const out = plan(
    ['package.json', 'pnpm-lock.yaml', 'public'],
    { ...next, packageManager: 'pnpm@12.5.1+sha256.abc' },
    {
      nextConfig: "const c = { output: 'standalone' }; export default c;",
    },
  );
  assert.match(out, /^COPY package\.json pnpm-lock\.yaml \.\/$/m);
  assert.match(
    out,
    /RUN --mount=type=cache,id=pnpm,target=\/root\/\.local\/share\/pnpm\/store \(pnpm install --frozen-lockfile \|\| true\) && pnpm approve-builds --all && pnpm install --frozen-lockfile/,
  );
  assert.match(out, /npm install -g pnpm@12\.5\.1$/m);
  assert.match(out, /RUN pnpm run build/);
  assert.match(out, /COPY --from=build --chown=node:node \/app\/\.next\/standalone \.\//);
  assert.match(out, /COPY --from=build --chown=node:node \/app\/public \.\/public/);
  assert.match(out, /CMD \["node", "server\.js"\]/);
  assert.match(out, /USER node/);
  assert.match(out, /ENV HOSTNAME=0\.0\.0\.0/);
});

test('npm Next app without standalone runs next start and prunes dev dependencies', () => {
  const out = plan(['package.json', 'package-lock.json'], next, { nextConfig: 'export default {};' });
  assert.match(out, /RUN --mount=type=cache,id=npm,target=\/root\/\.npm npm ci/);
  assert.match(out, /RUN npm prune --omit=dev/);
  assert.match(out, /CMD \["node", "node_modules\/next\/dist\/bin\/next", "start", "-H", "0\.0\.0\.0", "-p", "3000"\]/);
  assert.doesNotMatch(out, /standalone/);
  assert.doesNotMatch(out, /COPY --from=build --chown=node:node \/app\/public/);
});

test('missing lockfile falls back to a plain install', () => {
  const out = plan(['package.json'], next);
  assert.match(out, /npm install$/m);
  assert.doesNotMatch(out, /npm ci/);
});

test('yarn Berry is detected from packageManager and installs immutably', () => {
  const out = plan(['package.json', 'yarn.lock'], { ...next, packageManager: 'yarn@4.5.0' });
  assert.match(out, /npm install -g yarn@4\.5\.0/);
  assert.match(out, /yarn install --immutable/);
  assert.doesNotMatch(out, /yarn install --production/);
});

test('yarn classic is detected from its lockfile format', () => {
  const out = plan(['package.json', 'yarn.lock'], next, { yarnLock: '# yarn lockfile v1\n' });
  assert.match(out, /npm install -g yarn@1$/m);
  assert.match(out, /yarn install --frozen-lockfile/);
  assert.match(out, /RUN yarn install --production --frozen-lockfile/);
});

test('a generic Node app runs its start script as a non-root user on port 3000', () => {
  const out = plan(['package.json', 'package-lock.json'], { scripts: { build: 'tsc', start: 'node dist/index.js' } });
  assert.match(out, /RUN npm run build/);
  assert.match(out, /EXPOSE 3000/);
  assert.match(out, /CMD \["npm", "start"\]/);
  assert.doesNotMatch(out, /standalone|next/);
});

test('pnpm 9 installs with plain frozen lockfile, since it has no build approval step', () => {
  const out = plan(['package.json', 'pnpm-lock.yaml'], { ...next, packageManager: 'pnpm@9.15.0' });
  assert.match(out, /pnpm install --frozen-lockfile$/m);
  assert.doesNotMatch(out, /approve-builds/);
});

test('pnpm generic app installs pnpm in the run stage, because its start command needs it', () => {
  const out = plan(['package.json', 'pnpm-lock.yaml'], { scripts: { start: 'node index.js' } });
  const run = out.split('AS run')[1];
  assert.match(run, /RUN npm install -g pnpm@12/);
  assert.match(run, /CMD \["pnpm", "start"\]/);
});

test('refuses a repository with no package.json or nothing to start', () => {
  assert.throws(() => planDockerfile({ files: new Set(['README.md']), pkg: null }), /no package\.json/);
  assert.throws(() => plan(['package.json'], { scripts: { build: 'tsc' } }), /neither a Next\.js dependency nor a "start" script/);
});

test('refuses package managers it does not build', () => {
  assert.throws(() => plan(['package.json'], { ...next, packageManager: 'bun@1.1.0' }), /Only npm, pnpm and yarn/);
});

test('dockerignore keeps dependencies, secrets and git out of the build context', () => {
  const { dockerignore } = planDockerfile({ files: new Set(['package.json']), pkg: next });
  const rules = dockerignore.split('\n');
  for (const rule of ['.git', '**/node_modules', '**/.env', '**/.env.local', '**/.next']) assert.ok(rules.includes(rule), rule);
  assert.ok(!rules.includes('**/.env.production'), 'committed .env.production stays available to the build');
});

test('the run stage carries curl, which the engine health check needs', () => {
  for (const files of [
    ['package.json', 'package-lock.json'],
    ['package.json', 'pnpm-lock.yaml'],
  ]) {
    const out = plan(files, next, { nextConfig: "output: 'standalone'" });
    assert.match(out, /apt-get install -y --no-install-recommends curl/);
    assert.ok(out.indexOf('curl') > out.indexOf('AS run'), 'installed in the run stage, not the build stage');
  }
  const node = plan(['package.json', 'package-lock.json'], { scripts: { start: 'node index.js' } });
  assert.match(node, /apt-get install -y --no-install-recommends curl/);
});

test('pnpm 10 installs with the plain frozen lockfile: it has no --all approval and does not fail on pending builds', () => {
  const out = plan(['package.json', 'pnpm-lock.yaml'], { ...next, packageManager: 'pnpm@10.4.1' });
  assert.match(out, /pnpm install --frozen-lockfile$/m);
  assert.doesNotMatch(out, /approve-builds/);
});

test('an unpinned pnpm project gets the current pnpm, with the approval step', () => {
  const out = plan(['package.json', 'pnpm-lock.yaml'], next);
  assert.match(out, /npm install -g pnpm@12$/m);
  assert.match(out, /approve-builds --all/);
});
