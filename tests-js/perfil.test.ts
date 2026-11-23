// The rows of /perfil/ (src/pages/perfil.astro) that need more than the type: a transcript correction names its video
// and how many changes it has, and links to the moment of its first change.
import { describe, expect, it } from 'vitest';
import { videoTextFila } from '../src/lib/perfil';

describe("a transcript correction's row on /perfil/", () => {
  it('names the video (its title from the payload) and the number of changes, and links to its first change', () => {
    const payload = {
      video: { id: 'UW0GV9sicGs', title: 'GORSEDD Y WLADFA 2011' },
      cambios: [{ t: 98.6, antes: 'a', texto: 'b' }, { t: 120, antes: 'c', quitar: true }, { t: 130, texto: 'd', idioma: 'es' }, { t: 140, antes: 'e', idioma: 'cy' }],
    };
    expect(videoTextFila(payload)).toEqual({ resumen: ' · «GORSEDD Y WLADFA 2011» · 4 cambios', hash: '#v=UW0GV9sicGs&t=98' });
    expect(videoTextFila({ ...payload, cambios: [payload.cambios[1]] }).resumen).toBe(' · «GORSEDD Y WLADFA 2011» · 1 cambio');
  });

  it('without a title, only the number of changes; a row it cannot read says nothing and links nowhere', () => {
    expect(videoTextFila({ video: { id: 'UW0GV9sicGs' }, cambios: [{ t: 5, antes: 'a', texto: 'b' }] })).toEqual({ resumen: ' · 1 cambio', hash: '#v=UW0GV9sicGs&t=5' });
    expect(videoTextFila({ video: { id: 'UW0GV9sicGs', title: '   ' }, cambios: [] })).toEqual({ resumen: '', hash: '#v=UW0GV9sicGs' });
    expect(videoTextFila(null)).toEqual({ resumen: '', hash: '' });
    expect(videoTextFila({ video: { id: 5, title: 7 }, cambios: 'x' })).toEqual({ resumen: '', hash: '' });
  });
});
