// Что принимает упражнение (23.11.2026): список ключей JSON экрана и общих настроек упражнения в курсе — для окна JSON (JsonModal):
// справа видно, какие ключи есть, какие можно добавить и чего ждёт каждый; «Применить» не пройдёт с неизвестным ключом (опечатка,
// переименовали), без обязательного (kind, вопрос) или с значением не того вида — раньше такое молча выбрасывалось, и экран ломался.
// Источник — описания упражнений (src/exercises/<тип>/<тип>.json → fields) и те же правила, что у самого приложения:
// у «Ответа по смыслу» и «Разговора» набор настроек зависит от формы (мост / Gemini API / целым аудио, рация…) — kpShown, talkCfg.
import { EX } from './index'
import { kpShown, kpCfg } from './kp/defaults'
import { talkCfg } from './talk/defaults'
import { presetJson, PRESET_FORM } from './presetJson'
import type { PresetTpl } from './presets'

export type SType = 'kind' | 'text' | 'number' | 'bool' | 'select' | 'list' | 'file' | 'object' | 'any'
export interface SKey { key: string; type: SType; label: string; options?: string[]; req?: boolean; def?: unknown; null?: boolean }

const typeOf = (f: any): SType => {
  const t = f?.type
  if (t === 'text' || t === 'rich') return 'text'
  if (t === 'number' || t === 'index') return 'number'
  if (t === 'bool') return 'bool'
  if (t === 'select' || t === 'enum') return 'select'
  if (t === 'list') return 'list'
  if (t === 'object') return 'object'
  if (t === 'image' || t === 'audio' || t === 'video') return 'file'
  return 'any'
}
const fromField = (key: string, f: any): SKey => ({ key, type: typeOf(f), label: String(f?.label ?? ''), ...(f?.options || f?.of && Array.isArray(f.of) ? { options: (f.options ?? f.of).map(String) } : {}), ...(f?.default !== undefined ? { def: f.default, null: f.default === null } : {}) })

// ключи экрана, которых нет в fields упражнения, но приложение их понимает (utils/lesson.ts → stepFrom)
const COMMON: SKey[] = [
  { key: 'kind', type: 'kind', label: 'Тип экрана — не меняйте', req: true },
  { key: 'min', type: 'number', label: 'Своё время на экран, мин (нет — по типу)' },
]
const EXTRA: Record<string, SKey[]> = {
  kp: [
    { key: 'n', type: 'number', label: 'Номер вопроса, как в домашке' },
    { key: 'star', type: 'bool', label: 'Красная звезда — ответ знать обязательно' },
    { key: 'look', type: 'select', options: ['lines', 'cards'], label: 'Вид: lines — линии, cards — подложки (нет — как в домашке)' },
    { key: 'plain', type: 'bool', label: 'Эталон без выделений' },
    { key: 'autoplay', type: 'bool', label: 'Звук вопроса играет сам' },
    { key: 'audio', type: 'file', label: 'Звук вопроса (озвучка)' },
    { key: 'engine', type: 'select', options: ['api'], label: 'Проверка напрямую через Gemini API (нет — через мост)' },
  ],
  talk: [{ key: 'busuu', type: 'bool', label: 'Рация «как в Busuu» — свои настройки курса' },
    { key: 'vn', type: 'bool', label: 'Рация · голосовые: реплики ученика — голосовыми, как в Telegram (без распознавания)' },
    { key: 'exam', type: 'bool', label: 'Собеседование · рация: вопрос (text), эталон (ideal) и звезда — в роль консула метками {question}, {reference}, {star}' },
    { key: 'ideal', type: 'text', label: 'Эталон ответа — консул сверяет с ним (собеседование)' },
    { key: 'star', type: 'bool', label: 'Красная звезда — ответ знать обязательно (собеседование)' },
    { key: 'n', type: 'number', label: 'Номер вопроса, как в домашке (собеседование)' }],
}
// обязательные у экрана (кроме kind)
const REQ: Record<string, string[]> = { kp: ['text'], talk: [], stt: [] }

/** Ключи JSON экрана s: что можно написать, с подписью, видом и значением сейчас (def — действующее: своё ← курс ← умолчание) */
export function stepSchema(s: any): SKey[] {
  const kind = s?.kind, ex: any = (EX as any)[kind]
  if (!ex) return COMMON
  const fields: Record<string, any> = ex.fields ?? {}
  let keys = Object.keys(fields)
  let cur: Record<string, unknown> = {}
  if (kind === 'kp') {
    const shown = kpShown(s); cur = kpCfg(s) as any
    keys = keys.filter((k) => ['head', 'text', 'ideal', 'dic'].includes(k) || k in shown)          // настройки — только этой формы
  } else if (kind === 'talk') cur = talkCfg(s) as any
  const req = new Set(REQ[kind] ?? [])
  const out: SKey[] = [...COMMON]
  for (const k of keys) { const f = fromField(k, fields[k]); if (k in cur) f.def = cur[k]; if (s && k in s && k !== 'kind') f.def = s[k]; if (req.has(k)) f.req = true; out.push(f) }
  for (const x of EXTRA[kind] ?? []) if (!out.some((o) => o.key === x.key)) out.push(s && x.key in s ? { ...x, def: s[x.key] } : x)
  return out
}

/** Ключи общих настроек упражнения в курсе («{ }» на плитке): только то, что курс хранит; def — действующее (код ← курс) */
export function presetSchema(tpl: PresetTpl): SKey[] {
  const kind = PRESET_FORM[tpl].kind as string, fields: Record<string, any> = (EX as any)[kind]?.fields ?? {}
  const cur = presetJson(tpl)
  return Object.keys(cur).map((k) => ({ ...(fields[k] ? fromField(k, fields[k]) : { key: k, type: 'any' as SType, label: '' }), def: cur[k], ...(cur[k] === null ? { null: true } : {}) }))
}

export interface SIssue { key: string; msg: string }
/** Проверка JSON по ключам: неизвестные, без обязательных, не того вида. kind — каким должен остаться тип экрана */
export function checkKeys(obj: unknown, schema: SKey[], kind?: string): SIssue[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [{ key: '', msg: 'Нужен один объект { … }' }]
  const o = obj as Record<string, unknown>, by = new Map(schema.map((k) => [k.key, k])), out: SIssue[] = []
  for (const k of Object.keys(o)) {
    if (k === 'id') continue
    const s = by.get(k)
    if (!s) { out.push({ key: k, msg: `«${k}» — такого ключа упражнение не принимает (опечатка или переименовали?)` }); continue }
    const v = o[k]
    if (s.type === 'kind') { if (kind && v !== kind) out.push({ key: k, msg: `kind — «${kind}», его не меняют (другой тип — другой экран)` }); continue }
    if (v === null && (s.null || !s.req)) continue
    const bad = s.type === 'text' || s.type === 'file' ? typeof v !== 'string'
      : s.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v)
        : s.type === 'bool' ? typeof v !== 'boolean'
          : s.type === 'select' ? !(s.options ?? []).includes(String(v)) || typeof v !== 'string'
            : s.type === 'list' ? !Array.isArray(v)
              : s.type === 'object' ? !(v && typeof v === 'object' && !Array.isArray(v)) : false
    if (bad) out.push({ key: k, msg: `«${k}» — ${s.type === 'select' ? 'одно из: ' + (s.options ?? []).join(', ') : s.type === 'number' ? 'число' : s.type === 'bool' ? 'true или false' : s.type === 'list' ? 'список [ … ]' : s.type === 'object' ? 'объект { … }' : 'строка в кавычках'}` })
  }
  for (const s of schema) if (s.req && !(s.key in o)) out.push({ key: s.key, msg: `нет обязательного «${s.key}»${s.label ? ' — ' + s.label : ''}` })
  return out
}

/** Значение для вставки ключа: действующее, иначе пустое своего вида */
export const blankOf = (s: SKey): unknown => (s.def !== undefined ? s.def : s.type === 'number' ? 0 : s.type === 'bool' ? false : s.type === 'select' ? s.options?.[0] ?? '' : s.type === 'list' ? [] : '')
