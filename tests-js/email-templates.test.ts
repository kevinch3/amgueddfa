import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '../scripts/email_templates.mjs';

const ROOT = join(__dirname, '..');
const LANGS: [string, string][] = [['es', 'es-AR'], ['cy', 'cy-AR'], ['en', 'en-GB'], ['zh', 'zh-Hans'], ['it', 'it'], ['fr', 'fr'], ['sv', 'sv']];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What Supabase would send for an account whose user_metadata.lang is `lang`
 * (undefined: no lang): the template's language switch, evaluated. Only the
 * constructs the generator writes (flat if / else if / else chains on $l).
 */
function sendAs(tpl: string, lang: string | undefined): string {
  const l = lang ?? 'es';
  const out = tpl.replace(/^\{\{ \$l := "es" \}\}\{\{ with \.Data\.lang \}\}\{\{ \$l = printf "%v" \. \}\}\{\{ end \}\}/, '');
  return out.replace(/\{\{ if eq \$l "[a-z]+" \}\}[\s\S]*?\{\{ end \}\}/g, (chain) => {
    const parts = chain.split(/\{\{ (?:if|else if) eq \$l "([a-z]+)" \}\}|\{\{ else \}\}|\{\{ end \}\}/);
    // parts: ['', 'cy', cyText, 'en', enText, …, undefined (else), esText, undefined (end), '']
    for (let i = 1; typeof parts[i] === 'string'; i += 2) if (parts[i] === l) return parts[i + 1];
    return parts[parts.length - 3];
  });
}

describe('sign-in emails in the account language', () => {
  for (const kind of ['magic_link', 'confirmation'] as const) {
    const committed = readFileSync(join(ROOT, 'supabase', 'templates', `${kind}.html`), 'utf8');

    it(`${kind}.html is what scripts/email_templates.mjs writes from src/i18n (rerun it if not)`, () => {
      expect(committed).toBe(render(kind));
    });

    it(`${kind}: each language gets its own text, the link and the code; no lang means Spanish`, () => {
      for (const [code, tag] of LANGS) {
        const msgs = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', `${tag}.json`), 'utf8')).correo;
        const mail = sendAs(committed, code);
        expect(mail, code).toContain(`<html lang="${tag}">`);
        expect(mail, code).toContain(esc(kind === 'confirmation' ? msgs.intro_alta : msgs.intro_ingreso));
        for (const k of ['boton', 'otro_dispositivo', 'vence', 'ignorar']) expect(mail, `${code} ${k}`).toContain(esc(msgs[k]));
        expect(mail.match(/\{\{ \.ConfirmationURL \}\}/g), code).toHaveLength(1);
        expect(mail.match(/\{\{ \.Token \}\}/g), code).toHaveLength(1);
        expect(mail, code).not.toMatch(/\{\{ (if|else|end)/);
      }
      expect(sendAs(committed, undefined)).toBe(sendAs(committed, 'es'));
      expect(sendAs(committed, 'de')).toBe(sendAs(committed, 'es'));
    });
  }
});
