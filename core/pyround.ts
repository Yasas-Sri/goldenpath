/**
 * Python-compatible round(). Python rounds correctly w.r.t. the true double
 * value with ties-to-even. For ndigits > 0 an exact decimal tie is impossible
 * in binary floating point (x.xx5 is never exactly representable), so
 * toFixed — which is also correctly rounded — gives identical results.
 * Only ndigits = 0 can hit a real tie (e.g. 2.5) and needs ties-to-even.
 */
export function pyround(x: number, ndigits = 0): number {
  if (!Number.isFinite(x)) return x;

  if (ndigits > 0) {
    return parseFloat(x.toFixed(ndigits));
  }

  const floor = Math.floor(x);
  if (x - floor === 0.5) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}
