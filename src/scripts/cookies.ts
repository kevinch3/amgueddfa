// /cookies: the "No contar mis visitas" switch.
import { counterState, readSignals, setOptOut } from '../lib/consent';
import { t } from '../lib/i18n';

const box = document.getElementById('no-contar') as HTMLInputElement | null;
const status = document.getElementById('no-contar-estado');

function render(error = false): void {
  if (!box || !status) return;
  const s = readSignals();
  const state = counterState(s);
  box.checked = s.optOut; // the visitor's own choice; the status line says when the browser decides anyway
  status.textContent = error
    ? t('legal.cookies.estado_error')
    : state.reason === 'browser'
      ? t('legal.cookies.estado_navegador')
      : t(state.counted ? 'legal.cookies.estado_contado' : 'legal.cookies.estado_optout');
}

if (box) {
  box.disabled = false;
  box.addEventListener('change', () => {
    const ok = setOptOut(box.checked);
    render(!ok);
  });
  render();
}
