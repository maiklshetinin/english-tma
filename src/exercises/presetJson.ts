// JSON настроек упражнения курса («{ }» на плитке меню Exercise, 21.11.2026): показать — действующие общие настройки (код ← курс),
// сохранить — только отличия от умолчаний кода (их и хранит курс, server/courses.ts → presets). Свои поля экрана — вопрос, эталон и
// исключения — остаются у экрана; «Применить ко всем экранам курса» убирает у экранов исключения по этим полям.
import { same } from '../utils/overlay'
import { kpShown, kpDefaults, kpApi } from './kp/defaults'
import { talkCfg, talkDefaults } from './talk/defaults'
import type { PresetTpl } from './presets'

export const PRESET_FORM: Record<PresetTpl, Record<string, unknown>> = {
  kp: { kind: 'kp' }, kpfile: { kind: 'kp', dic: 'file' }, kpapi: { kind: 'kp', engine: 'api' },
  talk: { kind: 'talk' }, talkava: { kind: 'talk', avatar: true }, talkptt: { kind: 'talk', avatar: true, ptt: true }, talkptt2: { kind: 'talk', avatar: true, ptt: true, busuu: true },
}
const isKp = (tpl: PresetTpl) => PRESET_FORM[tpl].kind === 'kp'
const formOnly = (tpl: PresetTpl) => { const { kind: _k, ...f } = PRESET_FORM[tpl]; return f }

/** действующие общие настройки упражнения в курсе — то, что показываем на плитке */
export function presetJson(tpl: PresetTpl): Record<string, unknown> {
  return isKp(tpl) ? { ...kpShown(formOnly(tpl)) } : { ...talkCfg(formOnly(tpl)) }
}
/** поля настроек упражнения — их же «Применить ко всем экранам» убирает у экранов */
export const presetKeys = (tpl: PresetTpl) => Object.keys(presetJson(tpl))

const eq = same
/** текст JSON → отличия от умолчаний кода (для курса) или ошибка строкой */
export function presetFromJson(tpl: PresetTpl, text: string): { fields?: Record<string, unknown>; error?: string } {
  let raw: any
  try { raw = JSON.parse(text) } catch { return { error: 'Не JSON — проверьте кавычки, запятые и скобки' } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Нужен объект { … }' }
  const form = formOnly(tpl)
  if (isKp(tpl) && !kpApi(form) && raw.format !== undefined && !(typeof raw.format === 'string' && raw.format.includes('{id}')))
    return { error: 'В format моста нужна метка {id} — по ней мост находит ответ в чате' }
  const x: any = isKp(tpl) ? kpDefaults({ ...form, ...raw }) : talkDefaults({ ...form, ...raw })
  const d: any = isKp(tpl) ? kpDefaults(form) : talkDefaults(form)
  const o: Record<string, unknown> = {}
  for (const k of presetKeys(tpl)) {
    if (raw[k] === undefined) continue
    if (k === 'temperature' && raw.temperature === null && d.temperature === null) continue
    if (!eq(x[k], d[k])) o[k] = x[k]
  }
  return { fields: o }
}
