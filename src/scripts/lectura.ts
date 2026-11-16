// Reading settings forms (header fold-out and /accesibilidad/): every change is
// saved and applied at once, and every form on the page shows the same choice.
import { AJUSTES, DEFAULTS, applyAjustes, readAjustes, sanitize, saveAjustes, type Ajustes } from '../lib/lectura';

let current: Ajustes = readAjustes();

function sync(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('form[data-lectura] input[data-ajuste]')) {
    input.checked = current[input.dataset.ajuste as keyof Ajustes] === input.value;
  }
}

/** Change some settings (from a form, or a WebMCP tool); returns what now applies. */
export function setAjustes(partial: Partial<Record<keyof Ajustes, string>>): Ajustes {
  current = sanitize({ ...current, ...partial });
  saveAjustes(current);
  applyAjustes(document.documentElement, current);
  sync();
  return current;
}

export function getAjustes(): Ajustes {
  return { ...current };
}

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-lectura]')) {
  form.hidden = false;
  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.dataset.ajuste && AJUSTES.includes(input.dataset.ajuste as keyof Ajustes)) setAjustes({ [input.dataset.ajuste]: input.value });
  });
  form.querySelector('[data-lectura-reset]')?.addEventListener('click', () => setAjustes(DEFAULTS));
}
sync();
