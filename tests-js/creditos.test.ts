import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODELO_RECONSTRUCCION } from '../src/lib/creditos';

describe('credits page', () => {
  it('names the model the reconstruction really uses (scripts/reconstruct/model.py)', () => {
    const py = readFileSync(join(__dirname, '..', 'scripts', 'reconstruct', 'model.py'), 'utf-8');
    expect(/^MODEL = "([^"]+)"/m.exec(py)?.[1]).toBe(MODELO_RECONSTRUCCION);
  });
});
