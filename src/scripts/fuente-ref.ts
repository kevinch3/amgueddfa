import type { Contribution } from '../lib/contrib';
import { knownSources, sourceRef } from '../lib/fuentes';
import { contentLang, t, tAround } from '../lib/i18n';

/** "Fuente: …" for a live row, the markup components/FuenteRef.astro renders; null when there is none. */
export function sourceNode(c: Contribution, tag: 'span' | 'p' = 'span', compact = false): HTMLElement | null {
  const ref = sourceRef(c, knownSources());
  if (!ref) return null;
  if (compact && ref.href) {
    // Edition facts: only a small muted "fuente" link.
    const a = document.createElement('a');
    a.href = ref.href;
    a.textContent = t('edicion.fuente_corta');
    const s = document.createElement(tag);
    s.className = 'muted fuente fuente-corta';
    s.append(' ', a);
    return s;
  }
  const [before, after] = tAround('edicion.fuente', 'fuente');
  const inner = document.createElement('span');
  const lang = ref.own ? contentLang() : undefined;
  if (lang) inner.lang = lang;
  if (ref.href) {
    const a = document.createElement('a');
    a.href = ref.href;
    a.textContent = ref.label;
    inner.append(a);
  } else inner.textContent = ref.label;
  const s = document.createElement(tag);
  s.className = 'muted small fuente';
  s.append(before, inner, after);
  return s;
}
