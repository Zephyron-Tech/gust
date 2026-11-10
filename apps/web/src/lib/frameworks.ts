// The frameworks a Node.js project is built on, read from its package.json.
// The most specific first: a meta-framework hides the library it is built on.

const RULES: [label: string, packages: string[]][] = [
  ['Next.js', ['next']],
  ['Nuxt', ['nuxt']],
  ['SvelteKit', ['@sveltejs/kit']],
  ['Remix', ['@remix-run/react', '@remix-run/node']],
  ['Astro', ['astro']],
  ['Gatsby', ['gatsby']],
  ['NestJS', ['@nestjs/core']],
  ['Angular', ['@angular/core']],
  ['Vue', ['vue']],
  ['React', ['react']],
  ['Svelte', ['svelte']],
  ['Express', ['express']],
  ['Fastify', ['fastify']],
  ['Hono', ['hono']],
  ['Vite', ['vite']],
];

/** Labels for the frameworks in a package.json, at most `max`. Unreadable input gives none. */
export function detectFrameworks(packageJson: string, max = 3): string[] {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(packageJson);
  } catch {
    return [];
  }
  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  const found: string[] = [];
  for (const [label, packages] of RULES) {
    if (packages.some((p) => deps.has(p))) found.push(label);
  }
  // A meta-framework already says what the app is: drop the libraries under it.
  const meta = ['Next.js', 'Nuxt', 'SvelteKit', 'Remix', 'Astro', 'Gatsby', 'NestJS', 'Angular'].find((m) => found.includes(m));
  const shown = meta ? found.filter((f) => f === meta || !['React', 'Vue', 'Svelte', 'Vite'].includes(f)) : found;
  return shown.slice(0, max);
}
