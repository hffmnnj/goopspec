/**
 * Lazy Shiki highlighter (T3.3 — MH-15).
 *
 * Shiki's grammars + themes are heavy, so the highlighter is created on first
 * use and cached for the lifetime of the page. Languages are loaded on demand;
 * unknown languages fall back to plaintext rather than throwing. Dual themes
 * (`github-light` / `github-dark`) let the rendered HTML switch with the app's
 * `data-theme` via CSS variables, with no re-highlight on theme change.
 */
import type { Highlighter } from 'shiki';

export const SHIKI_THEMES = {
  light: 'github-light',
  dark: 'github-dark',
} as const;

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((shiki) =>
      shiki.createHighlighter({
        themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
        langs: [],
      })
    );
  }
  return highlighterPromise;
}

/** True when Shiki bundles a grammar for `lang`. */
async function isSupported(lang: string): Promise<boolean> {
  const { bundledLanguages } = await import('shiki');
  return lang in bundledLanguages;
}

/**
 * Highlight `code` to dual-theme HTML. Resolves to `null` when highlighting is
 * unavailable (load failure / unknown language) so callers can fall back to a
 * plain `<pre>` without breaking the message render.
 */
export async function highlightCode(
  code: string,
  lang: string
): Promise<string | null> {
  try {
    const normalized = lang && (await isSupported(lang)) ? lang : 'text';
    const highlighter = await getHighlighter();

    if (normalized !== 'text' && !loadedLangs.has(normalized)) {
      await highlighter.loadLanguage(
        normalized as Parameters<Highlighter['loadLanguage']>[0]
      );
      loadedLangs.add(normalized);
    }

    return highlighter.codeToHtml(code, {
      lang: normalized,
      themes: { light: SHIKI_THEMES.light, dark: SHIKI_THEMES.dark },
      defaultColor: false,
    });
  } catch {
    return null;
  }
}
