// Волна звука для AudioWave: длительность и 48 высот столбиков одной строкой «1.84|abc…» (буквы a–p = 0…15) — её можно хранить в карточке.
const N = 48
/** Посчитать волну из файла (Blob / ArrayBuffer) → «1.84|abc…» */
export async function waveOf(buf) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const a = await ctx.decodeAudioData(buf instanceof Blob ? await buf.arrayBuffer() : buf), ch = a.getChannelData(0), step = Math.floor(ch.length / N) || 1, out = []
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < ch.length; j += 16) m = Math.max(m, Math.abs(ch[j])); out.push(m) }
    const top = Math.max(...out) || 1
    return `${a.duration.toFixed(2)}|${out.map(v => String.fromCharCode(97 + Math.round(v / top * 15))).join('')}`
  } finally { ctx.close?.() }
}
