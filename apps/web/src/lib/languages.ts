// The colour logo of a GitHub language, from devicon (MIT, see public/languages/LICENSE-devicon.txt).
// Languages without one, and marks that are black on a dark page (Rust, GitHub), return null,
// so the caller shows the neutral glyph instead.
const FILES: Record<string, string> = {
  TypeScript: 'typescript',
  JavaScript: 'javascript',
  Python: 'python',
  Vue: 'vuejs',
  HTML: 'html5',
  CSS: 'css3',
  SCSS: 'sass',
  Go: 'go',
  PHP: 'php',
  Shell: 'bash',
  Ruby: 'ruby',
  Java: 'java',
  'C#': 'csharp',
  C: 'c',
  'C++': 'cplusplus',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Dart: 'dart',
  Svelte: 'svelte',
  Dockerfile: 'docker',
};

export function languageLogo(language: string | null): string | null {
  const file = language ? FILES[language] : undefined;
  return file ? `/languages/${file}.svg` : null;
}
