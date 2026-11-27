/**
 * One rights statement per record (docs/reglas.md, rule 2; design 2026-11-27, section 4).
 *
 * A record's rights come from, in order: its own credit line (`rights`, from the
 * archive notes or an admin correction), its source's statement in
 * src/data/fuentes.json (keyed like the /fuente/ pages, lib/fuentes.ts), or its
 * collection's default in src/data/colecciones.json. Each resolves to one licence
 * code from LICENCIAS. The text shown to readers stays the credit line as written;
 * the code is what lists, data files and tests use.
 */
import fuentesRaw from '../data/fuentes.json';
import { coleccion } from './colecciones';
import { itemSourceKey } from './fuentes';
import type { Item } from './types';

export const LICENCIAS = [
  'dominio-publico',
  'cc-by-sa-4.0',
  'cc-by-sa-3.0',
  'creative-archive',
  'con-permiso',
  'titulares-originales',
  'desconocido',
  'sin-declarar',
] as const;
export type Licencia = (typeof LICENCIAS)[number];

export type Declaracion = { licencia: Licencia; titular: string; texto?: string };
export type Derechos = Declaracion & { origen: 'documento' | 'fuente' | 'coleccion' };

const FUENTES = fuentesRaw as Record<string, Declaracion>;

/**
 * The licence code of a credit line as the archive writes them. Order matters: a
 * "Public domain · autor desconocido" line is public domain. A new wording that
 * fits none is 'sin-declarar' until a rule is added here.
 */
const RULES: [RegExp, Licencia][] = [
  [/\bpublic domain\b|dominio p[úu]blico/i, 'dominio-publico'],
  [/^Fotograf[íi]a de autor no identificado, anterior a 1946\b/, 'dominio-publico'], // maintainer, 2026-11-27
  [/^Documento de 1[0-8]\d\d\b/, 'dominio-publico'], // maintainer, 2026-11-27: written before 1900
  [/\bCC BY-SA 4\.0\b/, 'cc-by-sa-4.0'],
  [/\bCC BY-SA 3\.0\b/, 'cc-by-sa-3.0'],
  [/\bCreative Archive Licen[cs]e\b/i, 'creative-archive'],
  [/reproduced by permission|reproducid[oa] con permiso/i, 'con-permiso'],
  [/statws hawlfraint: anhysbys|copyright (status )?unknown|derechos desconocidos/i, 'desconocido'],
  [/^©|uso restringido hasta obtener permiso|foto de la página impresa/i, 'titulares-originales'],
];

export function licenciaDe(texto: string): Licencia {
  const s = texto.trim();
  return RULES.find(([re]) => re.test(s))?.[1] ?? 'sin-declarar';
}

/** Who holds the rights, from a credit line: the parts that are not the licence. */
export function titularDe(texto: string): string {
  const parts = texto.split(/\s+·\s+|;\s+/).map((p) => p.trim()).filter(Boolean);
  const holder = parts.find((p) => !/^(public domain|CC BY-SA|Creative Archive|All Rights Reserved|statws hawlfraint|uso restringido|foto de la página)/i.test(p)) ?? parts[0] ?? '';
  return holder.replace(/^(©|Original:)\s*/, '').trim();
}

export function derechosDe(item: Pick<Item, 'rights' | 'coleccion' | 'source_url' | 'source_label'>, fuentes: Record<string, Declaracion> = FUENTES): Derechos | null {
  const own = (item.rights ?? '').trim();
  if (own) return { licencia: licenciaDe(own), titular: titularDe(own), texto: own, origen: 'documento' };
  const src = fuentes[itemSourceKey(item)];
  if (src) return { ...src, origen: 'fuente' };
  const def = coleccion(item.coleccion)?.derechos_por_defecto;
  return def ? { licencia: def.licencia as Licencia, titular: def.titular, origen: 'coleccion' } : null;
}
