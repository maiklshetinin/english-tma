// Звуки ответов в уроке, как в Busuu (18.11.2026): верно — светлый «дзынь» вверх, ошибка — мягкий низкий «бум», пара сошлась — короткий «тик».
// Звуки синтезируются Web Audio прямо в браузере — без файлов и загрузок. Выключаются в Профиле («Звуки ответов»), помнится в браузере.
import { ref } from 'vue'

const K = 'tma.sfx'
export const sfxOn = ref((() => { try { return localStorage.getItem(K) !== '0' } catch { return true } })())
export function setSfx(on) { sfxOn.value = !!on; try { localStorage.setItem(K, on ? '1' : '0') } catch { /* приватный режим */ } }

let ctx = null
function ac() {
  const A = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!A) return null
  ctx ??= new A()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})          // звук — по нажатию ученика, браузер разрешает
  return ctx
}
// одна нота: быстро громче и плавно тише (без щелчков)
function note(c, f, t0, dur, type = 'sine', vol = 0.16) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(f, t0)
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02)
}
const play = (fn) => { if (!sfxOn.value) return; try { const c = ac(); if (c) fn(c, c.currentTime) } catch { /* без звука */ } }

/** Ответ: верно — две ноты вверх (ля и ми), ошибка — две низкие вниз */
export const sfxResult = (ok) => play((c, t) => {
  if (ok) { note(c, 880, t, 0.14); note(c, 1318.5, t + 0.09, 0.32); note(c, 2637, t + 0.09, 0.18, 'sine', 0.03) }
  else { note(c, 311.1, t, 0.16, 'triangle', 0.14); note(c, 233.1, t + 0.12, 0.26, 'triangle', 0.14) }
})
/** Маленький шаг верно (пара сошлась) — короткий тихий «тик» */
export const sfxTick = () => play((c, t) => note(c, 1046.5, t, 0.09, 'sine', 0.08))
