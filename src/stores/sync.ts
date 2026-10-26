// Автосохранение документов. Компоненты правят данные «на месте» (v-model, push, splice), а этот помощник замечает изменения
// и через паузу отправляет на сервер только те документы, что реально изменились (сравнивает с последним известным серверным состоянием).
// Запросы идут строго по очереди; если сервер отказал — тост и перечитывание, чтобы экран не расходился с базой.
import { showToast } from '../composables/useToast'

export interface DocSyncOptions<T> {
  what: string                                        // что сохраняем — для сообщения об ошибке («путь», «колоды»…)
  snapshot: () => Record<string, T>                   // все документы сейчас: id → значение
  save: (id: string, value: T) => Promise<unknown>
  remove?: (id: string) => Promise<unknown>           // документ пропал из snapshot → удалить на сервере
  reload: () => Promise<void>                         // перечитать с сервера после ошибки
  enabled: () => boolean                              // false: не сохранять (демо, ученик)
  delay?: number                                      // пауза после последней правки, мс
}

export function createDocSync<T>(o: DocSyncOptions<T>) {
  const baseline = new Map<string, string>()          // id → JSON последнего известного серверного состояния
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = 0, rev = 0, dirty = false
  let chain: Promise<unknown> = Promise.resolve()

  /** Поставить запрос в очередь. После ошибки (когда очередь опустеет) — перечитать данные. */
  function run(task: () => Promise<unknown>) {
    pending++
    chain = chain.then(task).catch((e: Error) => { dirty = true; showToast(`${o.what}: ${e.message}`, null, 'bad') }).then(async () => {
      if (--pending === 0 && dirty) { dirty = false; await o.reload().catch(() => {}) }
    })
  }

  function flush() {
    timer = undefined
    const cur = o.snapshot(), jobs: Array<() => Promise<unknown>> = []
    for (const [id, value] of Object.entries(cur)) {
      const json = JSON.stringify(value)
      if (baseline.get(id) === json) continue
      baseline.set(id, json)
      const frozen = JSON.parse(json) as T                  // отправляем то, что было на момент проверки
      jobs.push(() => o.save(id, frozen))
    }
    for (const id of [...baseline.keys()]) if (!(id in cur)) { baseline.delete(id); if (o.remove) jobs.push(() => o.remove!(id)) }
    jobs.forEach(run)
  }

  const busy = () => timer !== undefined || pending > 0
  /** Есть ли отличия от последнего известного серверного состояния (изменён, добавлен или удалён хотя бы один документ). */
  function differs(): boolean {
    const cur = o.snapshot(), ids = Object.keys(cur)
    if (ids.length !== baseline.size) return true
    return ids.some((id) => baseline.get(id) !== JSON.stringify(cur[id]))
  }

  return {
    /** Данные могли измениться (вызывать из watch с deep). Реагирует только на настоящие отличия от серверного состояния:
     *  служебные изменения (пустой путь новому ученику, ответ сервера) и возврат к прежнему значению не считаются правкой. */
    touch() {
      if (!differs()) { clearTimeout(timer); timer = undefined; return }
      rev++
      if (!o.enabled()) return
      clearTimeout(timer); timer = setTimeout(flush, o.delay ?? 700)
    },
    /** Сохранить немедленно (например, когда приложение уходит в фон). */
    flushNow() { if (timer !== undefined) { clearTimeout(timer); flush() } },
    run,
    /** Запомнить серверное состояние всех документов (после загрузки): изменений нет, сохранять нечего. */
    accept(all: Record<string, T>) { baseline.clear(); for (const [id, v] of Object.entries(all)) baseline.set(id, JSON.stringify(v)) },
    /** Запомнить серверное состояние одного документа (например, пустой путь нового ученика — чтобы не создавать пустой документ). */
    know(id: string, value: T) { baseline.set(id, JSON.stringify(value)) },
    busy,
    rev: () => rev,
    /** Можно ли применить ответ сервера, полученный с момента, когда ревизия была `was`: ничего не менялось и ничего не сохраняется. */
    settled: (was: number) => !busy() && rev === was,
  }
}
export type DocSync<T> = ReturnType<typeof createDocSync<T>>

// Когда приложение уходит в фон, не ждём паузы — сохраняем сразу
const syncs = new Set<() => void>()
export const onHide = (fn: () => void) => { syncs.add(fn) }
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncs.forEach((f) => f()) })
