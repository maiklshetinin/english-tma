// Путь учеников и пресеты пути. Преподаватель правит их «на месте» (компоненты меняют массивы юнитов), а автосохранение
// (sync.ts) отправляет изменения на сервер: путь — PUT /paths/<id ученика>, пресеты — PUT/DELETE /presets/<id>.
// Ученик путь не меняет — он только отмечает текущий кружок выполненным (POST /paths/<id>/complete), монеты начисляет сервер.
// Формы данных — PathUnit, PathNode, Preset из server/types.ts.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { CompleteResponse, PathNode, PathUnit, Preset } from '../../server/types'
import { isDemo } from '../firebase'
import { newId } from '../utils/id'
import { clonePath, dateAfter, presetUnits } from '../utils/path'
import { del, enc, fetchContent, post, put } from './api'
import { session } from './session'
import { createDocSync, onHide } from './sync'
import { useStudentsStore } from './students'

export const usePathStore = defineStore('path', () => {
  const paths = ref<Record<string, PathUnit[]>>({})          // id ученика → юниты
  const presets = ref<Preset[]>([])
  const students = useStudentsStore()

  const presetsById = () => Object.fromEntries(presets.value.map((p) => [p.id, p]))
  const canSave = () => session.canEdit && !isDemo
  async function reload() { const c = await fetchContent(); applyPaths(c.paths); applyPresets(c.presets) }

  const pathSync = createDocSync<PathUnit[]>({ what: 'Путь', snapshot: () => paths.value, enabled: canSave, reload,
    save: (id, units) => put(`/paths/${enc(id)}`, { units }, 'Не удалось сохранить путь') })
  const presetSync = createDocSync<Preset>({ what: 'Пресеты', snapshot: presetsById, enabled: canSave, reload,
    save: (id, p) => put(`/presets/${enc(id)}`, { name: p.name, units: p.units }, 'Не удалось сохранить пресет'),
    remove: (id) => del(`/presets/${enc(id)}`, 'Не удалось удалить пресет') })
  watch(paths, pathSync.touch, { deep: true })
  watch(presets, presetSync.touch, { deep: true })
  onHide(() => { pathSync.flushNow(); presetSync.flushNow() })

  /** У каждого ученика из списка есть свой (пока пустой) путь в сторе — чтобы правки нового ученика сохранялись. */
  function ensure(id: string): PathUnit[] {
    if (!paths.value[id]) { pathSync.know(id, []); paths.value[id] = [] }
    return paths.value[id]
  }
  watch(() => students.list.map((s) => s.id), (ids) => ids.forEach(ensure), { immediate: true, flush: 'sync' })

  /** Путь ученика (то же самое, что хранится в сторе: правки на месте сохраняются). */
  const of = (id: string | null | undefined): PathUnit[] => (id ? paths.value[id] ?? [] : [])

  // --- Загрузка ---
  /** Применить ответ сервера. `was` — ревизия до запроса: если за это время что-то правили или сохраняют, ответ устарел и не применяется. */
  function applyPaths(p: Record<string, PathUnit[]>, was?: number) {
    if (was !== undefined && !pathSync.settled(was)) return
    paths.value = { ...p }; pathSync.accept(paths.value); students.list.forEach((s) => ensure(s.id))
  }
  function applyPresets(list: Preset[], was?: number) {
    if (was !== undefined && !presetSync.settled(was)) return
    presets.value = list; presetSync.accept(presetsById())
  }
  const revs = () => ({ paths: pathSync.rev(), presets: presetSync.rev() })
  function clear() { paths.value = {}; presets.value = []; pathSync.accept({}); presetSync.accept({}) }

  // --- Выполнение кружка ---
  /** Отметить кружок выполненным: на экране сразу, на сервере — монеты начисляет сервер (ученик — только текущий кружок). */
  function complete(node: PathNode, studentId: string | null | undefined) {
    if (node.done || !studentId) return
    node.done = true
    const s = students.byId(studentId); if (s) s.coins += node.xp
    if (isDemo) return
    pathSync.run(async () => {
      const r = await post<CompleteResponse>(`/paths/${enc(studentId)}/complete`, { nodeId: node.id }, 'Не удалось отметить выполнение')
      const st = students.byId(studentId); if (st && typeof r.coins === 'number') st.coins = r.coins
    })
  }

  // --- Пресеты ---
  function addPreset(name: string, units: PathUnit[] = []): Preset {
    const id = newId('p')
    presets.value.push({ id, name: name || 'Новый пресет', units })
    return presets.value.find((x) => x.id === id)!            // реактивный объект из стора, а не «сырой»
  }
  const duplicatePreset = (p: Preset) => addPreset(p.name + ' (копия)', clonePath(p.units))
  function removePreset(id: string) {
    const i = presets.value.findIndex((p) => p.id === id)
    return i < 0 ? null : { preset: presets.value.splice(i, 1)[0], index: i }
  }
  const restorePreset = ({ preset, index }: { preset: Preset; index: number }) => { presets.value.splice(Math.min(index, presets.value.length), 0, preset) }
  const presetFromPath = (name: string, units: PathUnit[]) => addPreset(name, presetUnits(units))
  /** Добавляет копию пресета в конец пути ученика; кружки датируются через день, начиная после последнего. */
  function applyPreset(studentId: string, preset: Preset) {
    const us = clonePath(preset.units), list = ensure(studentId)
    dateAfter(list, us)
    const from = list.length
    list.push(...us)
    return { from, count: us.length }
  }

  return { paths, presets, of, ensure, applyPaths, applyPresets, revs, clear, complete, addPreset, duplicatePreset, removePreset, restorePreset, presetFromPath, applyPreset }
})
