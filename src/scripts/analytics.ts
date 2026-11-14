// Load the Cloudflare Web Analytics beacon unless this visitor opted out
// (/cookies) or their browser sends do-not-track / Global Privacy Control.
import { BEACON_SRC, readSignals, shouldCount } from '../lib/consent';

const token = document.querySelector<HTMLMetaElement>('meta[name="amg-analytics"]')?.content;
if (token && shouldCount(readSignals())) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = BEACON_SRC;
  s.dataset.cfBeacon = JSON.stringify({ token });
  document.head.append(s);
}
