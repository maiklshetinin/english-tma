// Группы учеников — отдельная сущность на сервере (server/groups.ts). Создаются только кнопкой «группа +» в панели учеников,
// состав меняется только через меню группы; урок — это урок (в него ставят группу целиком или одного ученика).
// Раньше группы собирались из расписания — при первой загрузке они один раз переносятся на сервер (POST /groups/seed).
// В демо-режиме сервера нет — всё в памяти.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Group, Lesson } from '../../server/types'
import { apiRequest, isDemo } from '../firebase'
import { showToast } from '../composables/useToast'

async function call<T>(path: string, opts: RequestInit | undefined, what: string): Promise<T> {
  const r = await apiRequest(path, opts)
  if (!r.ok) throw new Error(r.status === 404 ? 'Группа или ученик не найдены' : r.status === 400 ? 'В группе — от 2 до 12 учеников' : `${what} (${r.status})`)
  return r.json() as Promise<T>
}
const send = <T>(path: string, method: string, body: unknown, what: string) => call<T>(path, { method, body: JSON.stringify(body) }, what)

/** Старые группы из расписания: ученики, связанные общими уроками на несколько человек (объединение по цепочке). */
export function groupsFromLessons(lessons: Lesson[], alive: Set<string>): string[][] {
  const parent: Record<string, string> = {}
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const multi = lessons.map(l => l.studentIds.filter(id => alive.has(id) && !l.canceled?.[id])).filter(ids => ids.length > 1)
  for (const g of multi) for (const id of g) parent[id] ??= id
  for (const g of multi) for (const id of g.slice(1)) parent[find(id)] = find(g[0])
  const out: Record<string, string[]> = {}
  for (const id of Object.keys(parent)) (out[find(id)] ??= []).push(id)
  return Object.values(out).filter(g => g.length > 1 && g.length <= 12)
}

let seq = 0
export const useGroupsStore = defineStore('groups', () => {
  const list = ref<Group[]>([])
  const byId = (id: string) => list.value.find(g => g.id === id)
  const fail = (e: unknown) => { showToast((e as Error).message, null, 'bad'); load().catch(() => {}) }

  /** Загрузить; если перенос ещё не делали — перенести старые группы из расписания (lessons, alive). */
  async function load(old?: () => string[][]): Promise<void> {
    if (isDemo) { if (!list.value.length && old) list.value = old().map(ids => ({ id: `demo-g${++seq}`, studentIds: ids })); return }
    const r = await call<{ groups: Group[]; seeded: boolean }>('/groups', undefined, 'Не удалось загрузить группы')
    if (!r.seeded && old) { list.value = (await send<{ groups: Group[] }>('/groups/seed', 'POST', { groups: old() }, 'Не удалось перенести группы')).groups; return }
    list.value = r.groups
  }
  const set = (items: Group[]) => { list.value = items }
  const clear = () => { list.value = [] }

  /** Новая группа (на экране — сразу, на сервере — следом). */
  function create(studentIds: string[]): Group {
    const g: Group = { id: `tmp-g${++seq}`, studentIds: [...studentIds] }
    list.value.push(g)
    if (!isDemo) send<Group>('/groups', 'POST', { studentIds }, 'Не удалось создать группу').then((r) => { const x = byId(g.id); if (x) x.id = r.id }).catch(fail)
    return g
  }
  function setMembers(g: Group, studentIds: string[]): void {
    const x = byId(g.id); if (!x) return
    x.studentIds = [...studentIds]
    if (!isDemo) send(`/groups/${encodeURIComponent(x.id)}`, 'PUT', { studentIds }, 'Не удалось изменить группу').catch(fail)
  }
  function remove(g: Group): void {
    list.value = list.value.filter(x => x.id !== g.id)
    if (!isDemo) call(`/groups/${encodeURIComponent(g.id)}`, { method: 'DELETE' }, 'Не удалось расформировать группу').catch(fail)
  }
  return { list, byId, load, set, clear, create, setMembers, remove }
})
