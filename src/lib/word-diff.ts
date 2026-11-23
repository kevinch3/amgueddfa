// Word-level difference between two lines, for the admin review of transcript corrections.
export type DiffPart = { op: 'same' | 'del' | 'ins'; text: string };

/** The words of `a` and `b` as runs of kept, removed and added words (longest common subsequence). */
export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const n = x.length;
  const m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (op: DiffPart['op'], w: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ` ${w}`;
    else out.push({ op, text: w });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      push('same', x[i]);
      i++;
      j++;
    } else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) push('del', x[i++]);
    else push('ins', y[j++]);
  }
  // A replaced run reads deletion first, then insertion.
  for (let k = 0; k + 1 < out.length; k++) {
    if (out[k].op === 'ins' && out[k + 1].op === 'del') [out[k], out[k + 1]] = [out[k + 1], out[k]];
  }
  return out;
}
