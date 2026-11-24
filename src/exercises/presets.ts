// Настройки упражнений курса (21.11.2026): «{ }» на плитке меню Exercise — промпты и настройки этого упражнения для всего курса.
// Экран хранит только свои отличия, поэтому настройки курса сразу действуют на все его экраны этого упражнения, где поле не меняли
// вручную, и на новые. Порядок: умолчания в коде (их видно в JSON) ← настройки курса ← свои поля экрана. Других текстов нет.
// Ключ — id шаблона (src/utils/lesson.ts TEMPLATES): kp, kpfile, kpapi, talk, talkava, talkptt, talkptt2, talkvn (рация · голосовые), talkexam (собеседование-рация, 24.11.2026). Хранятся в курсе (server/courses.ts → presets).
import { reactive } from 'vue'

export const PRESET_TPLS = ['kp', 'kpfile', 'kpapi', 'talk', 'talkava', 'talkptt', 'talkptt2', 'talkvn', 'talkexam'] as const
export type PresetTpl = typeof PRESET_TPLS[number]
export type Presets = Partial<Record<PresetTpl, Record<string, unknown>>>

/** настройки упражнений открытого курса (редактор или просмотр курса ставят их при загрузке) */
export const presets = reactive<Presets>({})
// Пресеты (24.11.2026): у типа может быть несколько вариантов настроек — ключ «talkexam-1», «talkexam-2»… (номер 1–99).
// Вариант хранит только свои отличия от базового (talkexam) и имя (name); экран с полем pv: 2 берёт базовый, поверх — talkexam-2.
// Варианта нет (удалили) — экран тихо берёт базовый. В JSON урока — «"type": "talkexam-2"» (utils/lesson.ts → fromType)
const KEY = new RegExp('^(' + PRESET_TPLS.join('|') + ')(?:-([1-9]\\d?))?$')
/** «talkexam-2» → { base: 'talkexam', n: 2 }; не пресет — null */
export function splitKey(k: string): { base: PresetTpl; n: number } | null { const m = KEY.exec(String(k)); return m ? { base: m[1] as PresetTpl, n: m[2] ? +m[2] : 0 } : null }
export const presetKey = (base: string, n?: number) => (n ? `${base}-${n}` : base)
export function setPresets(p: unknown) {
  for (const k of Object.keys(presets)) delete (presets as any)[k]
  if (p && typeof p === 'object') for (const [k, v] of Object.entries(p as object)) if (splitKey(k) && v && typeof v === 'object') (presets as any)[k] = { ...v }
}
/** настройки типа для экрана: базовые, поверх — пресет pv (без имени) */
export function presetFor(tpl: string, pv?: unknown): Record<string, unknown> {
  const base = (presets as any)[tpl] ?? {}, n = Number(pv)
  if (!(Number.isInteger(n) && n > 0)) return base
  const { name: _n, ...v } = (presets as any)[`${tpl}-${n}`] ?? {}
  return { ...base, ...v }
}
/** пресеты типа из настроек курса: [{ n, name, fields }] по номеру */
export function variantsOf(all: Record<string, any> | undefined, tpl: string): { n: number; name: string; fields: Record<string, unknown> }[] {
  return Object.entries(all ?? {}).map(([k, v]) => ({ s: splitKey(k), v })).filter((x) => x.s && x.s.base === tpl && x.s.n > 0)
    .map(({ s, v }) => { const { name, ...fields } = (v ?? {}) as any; return { n: s!.n, name: typeof name === 'string' && name.trim() ? name : `Пресет ${s!.n}`, fields } })
    .sort((a, b) => a.n - b.n)
}
