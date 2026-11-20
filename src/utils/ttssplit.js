// Пакетная озвучка (20.11.2026): несколько фраз — одним запросом TTS (лимит 10 в сутки на модель), потом звук режется на части.
// Перенесено из «Gemini TTS Studio» автора: между частями — длинный разрыв (многоточие + пустые строки), в аудио ищутся паузы
// и выравниваются по ожидаемым паузам текста (каждое предложение — пауза; граница части — пауза на конце её последнего предложения),
// как сравнение двух последовательностей. Не вышло — режем пропорционально длине текста. Границы потом двигают руками (TtsBatch.vue).
export const PART_GAP = '\n\n\n\n'
const endPart = (l) => (/[?!]$/.test(l) ? l + '...' : l.replace(/[.…]+$/, '') + '...')
/** Фразы → текст для одного запроса: у всех, кроме последней, — «...» на конце (самая длинная пауза у TTS) и разрыв */
export const batchText = (lines) => lines.map((l, i) => (i < lines.length - 1 ? endPart(l.trim()) : (/[.!?…]$/.test(l.trim()) ? l.trim() : l.trim() + '.'))).join(PART_GAP)

function sentencesOf(t) {
  const m = t.match(/[\s\S]+?[.!?…]+["»”')\]]*(?=\s|$)|[\s\S]+$/g) || [t]
  return m.map((s) => s.trim()).filter(Boolean)
}
function alignCuts(cand, bnd, nf) {
  const M = bnd.length, K = cand.length
  if (!M) return null
  const unit = nf / (M + 1)
  const skipB = (i) => (bnd[i].part >= 0 ? 6 : 0.9)
  const skipP = (j) => 0.15 + 0.7 * Math.min(cand[j].len, 1.2)
  const match = (i, j) => { const D = Math.abs(cand[j].pos - bnd[i].e) / unit, L = Math.min(cand[j].len, 1.2); return 0.7 * Math.min(D, 4) + 0.4 * (1.2 - L) - (bnd[i].part >= 0 ? 0.25 * Math.min(cand[j].len, 2) : 0) }
  const W = K + 1, dp = new Float64Array((M + 1) * W), bk = new Int8Array((M + 1) * W)
  for (let j = 1; j <= K; j++) { dp[j] = dp[j - 1] + skipP(j - 1); bk[j] = 2 }
  for (let i = 1; i <= M; i++) {
    dp[i * W] = dp[(i - 1) * W] + skipB(i - 1); bk[i * W] = 1
    for (let j = 1; j <= K; j++) {
      let b = dp[(i - 1) * W + j - 1] + match(i - 1, j - 1), t = 0
      const a = dp[(i - 1) * W + j] + skipB(i - 1), c = dp[i * W + j - 1] + skipP(j - 1)
      if (a < b) { b = a; t = 1 } if (c < b) { b = c; t = 2 }
      dp[i * W + j] = b; bk[i * W + j] = t
    }
  }
  const asg = new Array(M).fill(-1)
  let i = M, j = K
  while (i > 0 || j > 0) { const t = bk[i * W + j]; if (i > 0 && j > 0 && t === 0) { asg[i - 1] = j - 1; i--; j-- } else if (i > 0 && (t === 1 || j === 0)) i--; else j-- }
  const cuts = []
  for (let b = 0; b < M; b++) if (bnd[b].part >= 0) { if (asg[b] < 0) return null; cuts[bnd[b].part] = cand[asg[b]].pos }
  for (let k = 1; k < cuts.length; k++) if (cuts[k] <= cuts[k - 1]) return null
  return { cuts, cost: dp[M * W + K] / (M + 1) }
}
/** PCM → { info: {e, p90, fr, nf}, cuts: [кадр конца части 1, 2, …] } (кадр = 10 мс) */
export function splitPcm(pcm, rate, lines) {
  const N = lines.length, fr = Math.round(rate / 100), nf = Math.floor(pcm.length / fr), e = new Float32Array(nf)
  for (let i = 0; i < nf; i++) { let q = 0; for (let j = i * fr; j < (i + 1) * fr; j++) q += pcm[j] * pcm[j]; e[i] = Math.sqrt(q / fr) }
  const p90 = [...e].sort((x, y) => x - y)[Math.floor(nf * 0.9)] || 1
  const info = { e, p90, fr, nf }
  if (N < 2) return { info, cuts: [] }
  const bnd = []; let cum = 0, tw = 0
  lines.forEach((l, k) => {
    const ss = sentencesOf(l)
    ss.forEach((s2, si) => {
      cum += s2.length + 10
      const last = si === ss.length - 1
      if (last && k === N - 1) { tw = cum; return }
      if (last) cum += 20
      bnd.push({ w: cum, part: last ? k : -1 })
    })
  })
  bnd.forEach((b) => { b.e = (nf * b.w) / tw })
  const exp = bnd.filter((b) => b.part >= 0).map((b) => b.e)
  let best = null
  for (const k of [0.06, 0.1, 0.18, 0.3]) {
    const thr = p90 * k, cand = []; let st = -1
    for (let i = 0; i <= nf; i++) {
      const q = i < nf && e[i] < thr
      if (q && st < 0) st = i
      if (!q && st >= 0) { if (st > 0 && i < nf && i - st >= 10) cand.push({ pos: (st + i) >> 1, len: Math.min((i - st) / 100, 6) }); st = -1 }
    }
    if (cand.length < N - 1) continue
    const r = alignCuts(cand, bnd, nf)
    if (r && (!best || r.cost < best.cost)) best = r
  }
  return { info, cuts: best ? best.cuts : exp.map(Math.round), guessed: !best }
}
/** Разрезы → диапазоны в отсчётах; тишина у разреза отрезается с обеих частей */
export function rangesOf(info, cuts) {
  const { e, p90, fr, nf } = info, th = p90 * 0.08, out = []; let prev = 0
  ;[...cuts, nf].forEach((c) => {
    let a = prev, b = c
    while (a < b && e[a] < th) a++
    while (b > a && e[b - 1] < th) b--
    a = Math.max(prev, a - 6); b = Math.min(c, b + 6)
    out.push(b > a ? [a * fr, b * fr] : [prev * fr, c * fr]); prev = c
  })
  return out
}
export function peaks(pcm, n) {
  const out = [], st = Math.max(1, Math.floor(pcm.length / n))
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * st; j < Math.min(pcm.length, (i + 1) * st); j++) { const v = Math.abs(pcm[j]); if (v > m) m = v } out.push(m) }
  const mx = Math.max(...out, 1); return out.map((v) => v / mx)
}
