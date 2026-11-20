// Выбор ученика перед «Разговором с Gemini» (21.11.2026) — общий для экрана и его подвала: подвал — отдельный экземпляр шаблона
// (LessonPlayer рисует part="fb"), поэтому модель, голос, «Оценивать речь», список моделей ключа и «идёт разговор» живут здесь.
// Выбор запоминается в браузере (те же ключи, что раньше); список моделей грузится один раз (liveModels — с кэшем на сутки)
import { reactive } from 'vue'
import { liveModels, firstKey } from '../../utils/live'
const rd = (k) => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const wr = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* приватный режим */ } }
export const tp = reactive({ pick: rd('tma.live.pick'), voice: rd('tma.live.voice'), eval: rd('tma.talk.eval') === '1', models: [], busy: {} })
export const setPick = (v) => { tp.pick = v; wr('tma.live.pick', v) }
export const setVoice = (v) => { tp.voice = v; wr('tma.live.voice', v) }
export const setEval = (v) => { tp.eval = !!v; wr('tma.talk.eval', v ? '1' : '0') }
let loading = null
export function loadModels() {
  if (tp.models.length || loading) return loading
  const k = firstKey(); if (!k) return null
  loading = liveModels(k).then((l) => { tp.models = l }).finally(() => { loading = null })
  return loading
}
