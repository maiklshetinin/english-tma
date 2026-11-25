// JSON настроек упражнения курса («{ }» на плитке меню Exercise, 21.11.2026): показать — действующие общие настройки (код ← курс),
// сохранить — только отличия от умолчаний кода (их и хранит курс, server/courses.ts → presets). Свои поля экрана — вопрос, эталон и
// исключения — остаются у экрана; «Применить ко всем экранам курса» убирает у экранов исключения по этим полям.
import { same } from '../utils/overlay'
import { kpShown, kpDefaults, kpApi } from './kp/defaults'
import { talkCfg, talkDefaults } from './talk/defaults'
import { splitKey, presetFor, type PresetTpl } from './presets'

export const PRESET_FORM: Record<PresetTpl, Record<string, unknown>> = {
  kp: { kind: 'kp' }, kpfile: { kind: 'kp', dic: 'file' }, kpapi: { kind: 'kp', engine: 'api' }, kpballive: { kind: 'kp', ball: true, ballLive: true },          // шар Live — 25.11.2026
  talk: { kind: 'talk' }, talkava: { kind: 'talk', avatar: true }, talkptt: { kind: 'talk', avatar: true, ptt: true }, talkptt2: { kind: 'talk', avatar: true, ptt: true, busuu: true },
  talkvn: { kind: 'talk', avatar: true, ptt: true, vn: true },
  talkexam: { kind: 'talk', avatar: true, ptt: true, exam: true },
  es_talk: { kind: 'talk', lang: 'es-ES' }, es_talkptt: { kind: 'talk', avatar: true, ptt: true, lang: 'es-ES' },
}
// key — тип (talkexam) или его пресет (talkexam-2, 24.11.2026): пресет показывается целиком (базовый + свои отличия), хранит — только отличия от базового
const baseOf = (key: string) => (splitKey(key)?.base ?? key) as PresetTpl
const nOf = (key: string) => splitKey(key)?.n ?? 0
const isKp = (key: string) => PRESET_FORM[baseOf(key)].kind === 'kp'
const formOnly = (key: string) => { const { kind: _k, ...f } = PRESET_FORM[baseOf(key)]; return nOf(key) ? { ...f, pv: nOf(key) } : f }

/** действующие общие настройки упражнения (или его пресета) в курсе — то, что показываем на плитке */
export function presetJson(key: string): Record<string, unknown> {
  const o: Record<string, unknown> = isKp(key) ? { ...kpShown(formOnly(key)) } : { ...talkCfg(formOnly(key)) }
  delete o.pv
  delete o.lang; delete o.lock; delete o.guard          // язык и замок — из типа, в JSON их нет (24.11.2026)
  return o
}
/** поля настроек упражнения — их же «Применить ко всем экранам» убирает у экранов */
export const presetKeys = (key: string) => Object.keys(presetJson(key))

const eq = same
/** текст JSON → отличия от умолчаний кода (для курса) или ошибка строкой */
export function presetFromJson(tpl: string, text: string): { fields?: Record<string, unknown>; error?: string } {
  let raw: any
  try { raw = JSON.parse(text) } catch { return { error: 'Не JSON — проверьте кавычки, запятые и скобки' } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Нужен объект { … }' }
  const form = formOnly(tpl)
  if (isKp(tpl) && !kpApi(form) && raw.format !== undefined && !(typeof raw.format === 'string' && raw.format.includes('{id}')))
    return { error: 'В format моста нужна метка {id} — по ней мост находит ответ в чате' }
  const { pv: _pv, ...bare } = form as any
  const x: any = isKp(tpl) ? kpDefaults({ ...bare, ...raw }) : talkDefaults({ ...bare, ...raw })
  // пресет: отличия — от действующего базового (код + общие настройки типа), не от кода
  const b = nOf(tpl) ? { ...bare, ...presetFor(baseOf(tpl)) } : bare
  const d: any = isKp(tpl) ? kpDefaults(b) : talkDefaults(b)
  const o: Record<string, unknown> = {}
  for (const k of presetKeys(tpl)) {
    if (raw[k] === undefined) continue
    if (k === 'temperature' && raw.temperature === null && d.temperature === null) continue
    if (!eq(x[k], d[k])) o[k] = x[k]
  }
  return { fields: o }
}
