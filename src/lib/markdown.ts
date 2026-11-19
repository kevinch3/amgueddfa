/**
 * Markdown twins of the edition and document pages (/chubut/1937.md,
 * /item/<id>.md): the same data as the HTML, for agents and anyone who wants
 * plain text. Pure functions; the endpoints in src/pages pass the data in.
 * Restricted and hidden documents never reach these (the endpoints filter them).
 */

/** One YAML front-matter value: JSON strings are valid YAML and need no escaping rules of our own. */
function yamlValue(v: string | number | boolean | null): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

export function frontMatter(fields: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${yamlValue(v as string | number | boolean | null)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** Push a transcription's headings one level down, so it nests under "## Transcripción". */
export function nestHeadings(text: string): string {
  return text.replace(/^(#{1,5}) /gm, '#$1 ');
}

export type MdFact = { label: string; value: string; fuente: string | null; by: string };
export type MdDoc = { title: string; category: string; url: string; transcribed: boolean };

export function editionMarkdown(o: {
  name: string;
  festival: string;
  year: number;
  url: string;
  /** held / not_held / unknown: whether it took place. */
  status: 'held' | 'not_held' | 'unknown';
  /** full / some / none: how much material the archive has. */
  estado: string;
  stateText: string;
  facts: MdFact[];
  docs: MdDoc[];
  /** Approved community uploads (images on the page, not catalog documents). */
  uploads: number;
  dataUrl: string;
}): string {
  const out = [
    frontMatter({ tipo: 'edicion', eisteddfod: o.festival, ano: o.year, url: o.url, realizada: o.status === 'unknown' ? null : o.status === 'held', estado: o.estado }),
    `# ${o.name} ${o.year}`,
    '',
    `Página: ${o.url}`,
    '',
    `- ¿Se realizó?: ${o.status === 'held' ? 'sí' : o.status === 'not_held' ? 'no' : 'no se sabe (no es lo mismo que «no se hizo»)'}`,
    `- Material en el archivo: ${o.stateText}`,
    '',
  ];
  out.push('## Datos aprobados', '');
  if (o.facts.length === 0) out.push('Todavía no hay datos aprobados.', '');
  for (const f of o.facts) {
    const extra = [f.fuente, f.by].filter(Boolean).join(' · ');
    out.push(`- ${f.label}: ${f.value}${extra ? ` (${extra})` : ''}`);
  }
  if (o.facts.length) out.push('');
  out.push('## Documentos', '');
  if (o.docs.length === 0 && o.uploads === 0) out.push('Todavía no hay documentos públicos de esta edición.', '');
  for (const d of o.docs) out.push(`- [${d.title}](${d.url}) · ${d.category}${d.transcribed ? ' · transcrito' : ''}`);
  if (o.uploads) out.push(`- ${o.uploads === 1 ? '1 imagen aportada' : `${o.uploads} imágenes aportadas`} por la comunidad, en la página: ${o.url}`);
  if (o.docs.length || o.uploads) out.push('');
  out.push(`Datos abiertos de todas las ediciones: ${o.dataUrl}`, '');
  return out.join('\n');
}

export function itemMarkdown(o: {
  id: string;
  title: string;
  festivalName: string;
  festival: string;
  year: number | null;
  category: string;
  url: string;
  editionUrl: string | null;
  rights: string;
  source: string | null;
  sourceUrl: string | null;
  note: string;
  images: string[];
  /** The document's transcription body (docmd), or null. */
  transcription: string | null;
  transcriptionLicense: string;
}): string {
  const out = [
    frontMatter({ tipo: 'documento', id: o.id, eisteddfod: o.festival, ano: o.year, categoria: o.category, url: o.url, derechos: o.rights, transcrito: o.transcription !== null }),
    `# ${o.title}`,
    '',
    `${o.festivalName}${o.year !== null ? ` ${o.year}` : ''} · ${o.category}`,
    '',
    `Página: ${o.url}`,
  ];
  if (o.editionUrl) out.push(`Edición: ${o.editionUrl}`);
  out.push('', `- Derechos del documento: ${o.rights}`);
  if (o.source) out.push(`- Fuente: ${o.source}${o.sourceUrl ? ` (${o.sourceUrl})` : ''}`);
  if (o.note.trim()) out.push(`- Nota: ${o.note.trim()}`);
  out.push('');
  if (o.images.length) {
    out.push('## Imágenes', '');
    o.images.forEach((src, i) => out.push(`- [Página ${i + 1}](${src})`));
    out.push('');
  }
  if (o.transcription !== null) {
    out.push('## Transcripción', '', `Licencia de la transcripción: ${o.transcriptionLicense}.`, '', nestHeadings(o.transcription.trim()), '');
  }
  return out.join('\n');
}
