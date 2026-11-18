import { execSync } from 'node:child_process';

/**
 * When the site's content last changed, as far as the build knows: the last
 * commit (data and code ship together), or the build time when git is not there.
 * The footer line starts from this and the browser moves it forward with the
 * newest approved contribution or edition change (scripts/ultimo-cambio.ts).
 */
export const BUILD_CHANGED_AT: string = (() => {
  try {
    const iso = execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!Number.isNaN(Date.parse(iso))) return new Date(iso).toISOString();
  } catch {
    // no git in this build
  }
  return new Date().toISOString();
})();
