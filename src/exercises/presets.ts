// Настройки упражнений курса (21.11.2026): «{ }» на плитке меню Exercise — промпты и настройки этого упражнения для всего курса.
// Экран хранит только свои отличия, поэтому настройки курса сразу действуют на все его экраны этого упражнения, где поле не меняли
// вручную, и на новые. Порядок: умолчания в коде (их видно в JSON) ← настройки курса ← свои поля экрана. Других текстов нет.
// Ключ — id шаблона (src/utils/lesson.ts TEMPLATES): kp, kpfile, kpapi, talk, talkava, talkptt, talkptt2, talkexam (собеседование-рация, 24.11.2026). Хранятся в курсе (server/courses.ts → presets).
import { reactive } from 'vue'

export const PRESET_TPLS = ['kp', 'kpfile', 'kpapi', 'talk', 'talkava', 'talkptt', 'talkptt2', 'talkexam'] as const
export type PresetTpl = typeof PRESET_TPLS[number]
export type Presets = Partial<Record<PresetTpl, Record<string, unknown>>>

/** настройки упражнений открытого курса (редактор или просмотр курса ставят их при загрузке) */
export const presets = reactive<Presets>({})
export function setPresets(p: unknown) {
  for (const k of Object.keys(presets)) delete (presets as any)[k]
  if (p && typeof p === 'object') for (const k of PRESET_TPLS) { const v = (p as any)[k]; if (v && typeof v === 'object') (presets as any)[k] = { ...v } }
}
export const presetFor = (tpl: string): Record<string, unknown> => ((presets as any)[tpl] ?? {})
