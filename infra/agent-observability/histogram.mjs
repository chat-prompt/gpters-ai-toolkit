/** Fixed inclusive upper bounds; final count is the overflow bucket. Never average percentiles. */
export const BOUNDS = Object.freeze([0, 100, 1000, 8000, 32000, 64000, 128000, 200000, 500000, 1000000])
export function histogram(values = []) {
  const result = { bounds: [...BOUNDS], counts: Array(BOUNDS.length + 1).fill(0), count: 0, sum: 0, min: null, max: null }
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(result.sum + value)) throw new Error('Invalid histogram sample')
    let bucket = BOUNDS.findIndex(bound => value <= bound)
    if (bucket < 0) bucket = BOUNDS.length
    result.counts[bucket]++; result.count++; result.sum += value
    result.min = result.min === null ? value : Math.min(result.min, value)
    result.max = result.max === null ? value : Math.max(result.max, value)
  }
  return result
}
export function mergeHistograms(items) {
  const result = histogram()
  for (const item of items) {
    if (JSON.stringify(item.bounds) !== JSON.stringify(BOUNDS) || item.counts.length !== BOUNDS.length + 1 ||
      item.counts.some(n => !Number.isSafeInteger(n) || n < 0) || item.counts.reduce((a,b) => a+b,0) !== item.count ||
      !Number.isSafeInteger(item.sum) || item.sum < 0 || !Number.isSafeInteger(result.sum + item.sum)) throw new Error('Incompatible histogram')
    for (let i = 0; i < result.counts.length; i++) result.counts[i] += item.counts[i]
    result.count += item.count; result.sum += item.sum
    if (item.count) {
      if (!Number.isSafeInteger(item.min) || !Number.isSafeInteger(item.max) || item.min < 0 || item.min > item.max) throw new Error('Invalid histogram extrema')
      result.min = result.min === null ? item.min : Math.min(result.min, item.min)
      result.max = result.max === null ? item.max : Math.max(result.max, item.max)
    }
  }
  return result
}
