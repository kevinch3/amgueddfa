// The sign-in emails, in the account's language. Supabase gives the templates the
// account's user_metadata as {{ .Data }}; src/lib/auth.ts keeps "lang" there (sent at
// sign-up, updated when someone signs in from another language). The texts are the
// correo.* keys of src/i18n/*.json, so they are translated and checked like the rest.
//
//   node scripts/email_templates.mjs     (after changing correo.*; a test checks it)
//
// Then paste supabase/templates/*.html into Supabase → Authentication → Email
// Templates (README, «Plantillas con código»). The subject is the archive's name,
// the same in every language.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Site language code (what auth.ts stores) → messages file and <html lang>. */
const LANGS = [
  ['es', 'es-AR'],
  ['cy', 'cy-AR'],
  ['en', 'en-GB'],
  ['zh', 'zh-Hans'],
  ['it', 'it'],
  ['fr', 'fr'],
  ['sv', 'sv'],
];
export const SUBJECT = 'Amgueddfa Eisteddfod y Wladfa';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function body(m, kind) {
  return [
    `    <p>${esc(kind === 'confirmation' ? m.intro_alta : m.intro_ingreso)}</p>`,
    `    <p><a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #9e1b22; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">${esc(m.boton)}</a></p>`,
    `    <p style="font-size: 14px;">${esc(m.otro_dispositivo)}</p>`,
    '    <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; font-family: monospace;">{{ .Token }}</p>',
    `    <p>${esc(m.vence)}</p>`,
    `    <p style="color: #4a4a52; font-size: 14px;">${esc(m.ignorar)}</p>`,
  ].join('\n');
}

/** One template; kind is "magic_link" (sign in) or "confirmation" (a new account). */
export function render(kind) {
  const msgs = Object.fromEntries(LANGS.map(([code, tag]) => [code, JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', `${tag}.json`), 'utf8')).correo]));
  // Spanish unless the account says otherwise; printf turns any stored value into a string.
  const pick = (each) =>
    LANGS.slice(1).map(([code], i) => `{{ ${i ? 'else if' : 'if'} eq $l "${code}" }}${each(code)}`).join('') + `{{ else }}${each('es')}{{ end }}`;
  const tagOf = Object.fromEntries(LANGS);
  return [
    '{{ $l := "es" }}{{ with .Data.lang }}{{ $l = printf "%v" . }}{{ end }}<!doctype html>',
    `<html lang="${pick((c) => tagOf[c])}">`,
    '  <body style="font-family: Georgia, serif; color: #1f2230; background: #f8f2e4; padding: 24px;">',
    '    <h2 style="color: #9e1b22;">Amgueddfa Eisteddfod y Wladfa</h2>',
    pick((c) => `\n${body(msgs[c], kind)}\n`),
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const kind of ['magic_link', 'confirmation']) {
    writeFileSync(join(ROOT, 'supabase', 'templates', `${kind}.html`), render(kind));
    console.log(`wrote supabase/templates/${kind}.html`);
  }
}
