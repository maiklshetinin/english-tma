// Выбор ученика перед «Разговором с Gemini» (21.11.2026) — общий для экрана и его подвала: подвал — отдельный экземпляр шаблона
// (LessonPlayer рисует part="fb"), поэтому модель, голос, «Оценивать речь», список моделей ключа и «идёт разговор» живут здесь.
// 21.11.2026: голос и модель — из JSON экрана. В редакторе курса пилюли пишут прямо в экран (voice / model в JSON); у ученика выбор —
// только на это открытие (в браузере не запоминается, урок сильнее). «Оценивать речь» — запоминается. Список моделей грузится один раз
import { reactive } from 'vue'
import { liveModels, firstKey } from '../../utils/live'
const rd = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const wr = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* приватный режим */ } }
// ctl[id экрана] (24.11.2026) — строка ввода «рации» в подвале: текст, черновик распознавания, волна и кнопки; живёт в экземпляре экрана, рисует подвал
export const tp = reactive({ pick: '', voice: '', eval: rd('tma.talk.eval') === '1', models: [], busy: {}, ctl: {} })
wr('tma.live.pick', ''); wr('tma.live.voice', '')          // старый выбор из браузера больше не перебивает урок
export const setPick = (v) => { tp.pick = v }
export const setVoice = (v) => { tp.voice = v }
export const setEval = (v) => { tp.eval = !!v; wr('tma.talk.eval', v ? '1' : '0') }
let loading = null
export function loadModels() {
  if (tp.models.length || loading) return loading
  const k = firstKey(); if (!k) return null
  loading = liveModels(k).then((l) => { tp.models = l }).finally(() => { loading = null })
  return loading
}
