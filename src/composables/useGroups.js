// Группы учеников для экрана: отдельная сущность (stores/groups → server/groups.ts) + подпись по расписанию —
// день и время ближайшего урока группы («Пт 20:00»), уроков нет — «без урока». Общая для панели учеников,
// окна «Кого назначить?» и выбора учеников колоды.
// Урок группы — урок, где 2+ учеников и все они из этой группы (урок может быть и без кого-то — например, его убрали).
import { computed } from 'vue'
import { DAYS, hh, todayYmd } from '../store/app'
import { useStudentsStore } from '../stores/students'
import { useScheduleStore } from '../stores/schedule'
import { useGroupsStore } from '../stores/groups'

/** Уроки группы: 2+ живых ученика, все из группы. future — только непроведённые с сегодняшнего дня. */
export function lessonsOfGroup(memberIds, lessons, alive, future = false) {
  const ids = new Set(memberIds), today = todayYmd()
  return lessons.filter((l) => {
    const live = l.studentIds.filter((id) => alive(id))
    return live.length > 1 && live.every((id) => ids.has(id)) && (!future || (!l.done && l.date >= today))
  })
}

export function useGroups() {
  const studentStore = useStudentsStore(), scheduleStore = useScheduleStore(), groupsStore = useGroupsStore()
  return computed(() => {
    const alive = (id) => !!studentStore.byId(id), today = todayYmd()
    return groupsStore.list.map((g) => {
      const members = g.studentIds.map((id) => studentStore.byId(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      const ls = lessonsOfGroup(g.studentIds, scheduleStore.lessons, alive).sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
      const next = ls.find((l) => l.date >= today) ?? ls[ls.length - 1]
      const label = next ? `${DAYS[(new Date(next.date + 'T12:00:00Z').getUTCDay() + 6) % 7]} ${hh(next.hour, next.minute)}` : 'без урока'
      return { key: g.id, id: g.id, label, members }
    }).filter((g) => g.members.length).sort((a, b) => a.label.localeCompare(b.label))
  })
}
