// Группы по расписанию: ученики, связанные общими групповыми уроками, — одна группа (объединение по цепочке).
// Подпись — день и время ближайшего урока группы («Пт 20:00»). Общая для панели учеников и окна «Кого назначить?».
import { computed } from 'vue'
import { DAYS, hh, todayYmd } from '../store/app'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore } from '../stores/schedule'

export function useGroups() {
  const studentStore = useStudentsStore(), scheduleStore = useScheduleStore()
  return computed(() => {
    const ids = new Set(studentStore.list.map(s => s.id)), parent = {}
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
    const lessonsOf = {}                                                     // корень группы → её уроки (для подписи)
    const multi = scheduleStore.lessons.map(l => ({ l, ids: l.studentIds.filter(id => ids.has(id) && !l.canceled?.[id]) })).filter(x => x.ids.length > 1)
    for (const { ids: g } of multi) for (const id of g) parent[id] ??= id
    for (const { ids: g } of multi) for (const id of g.slice(1)) parent[find(id)] = find(g[0])
    for (const { l, ids: g } of multi) (lessonsOf[find(g[0])] ??= []).push(l)
    const out = {}
    for (const id of Object.keys(parent)) (out[find(id)] ??= []).push(id)
    const today = todayYmd()
    return Object.entries(out).map(([root, members]) => {
      const ls = lessonsOf[root].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
      const next = ls.find(l => l.date >= today) ?? ls[ls.length - 1]
      const dow = DAYS[(new Date(next.date + 'T12:00:00Z').getUTCDay() + 6) % 7]
      return { key: root, label: `${dow} ${hh(next.hour, next.minute)}`, members: members.map(id => studentStore.byId(id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')) }
    }).sort((a, b) => a.label.localeCompare(b.label))
  })
}
