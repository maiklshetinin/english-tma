// Render API — для разработчика: статус сборок, логи сборки, пересборка и перезапуск из «Профиля» (DevServer.vue).
// Нужен ключ RENDER_API_KEY (Render → Account Settings → API Keys) в Environment сервиса; ID сервиса Render даёт сам (RENDER_SERVICE_ID).
// Ключ живёт только здесь, на сервере: в приложение не уходит. Используем его только для своего сервиса.
// Без ключа: пересборка — через Deploy Hook (RENDER_DEPLOY_HOOK), перезапуск — завершением процесса (Render поднимет его сам), статуса нет.
const API = 'https://api.render.com/v1'

export interface Deploy { id: string; status: string; commit: string; message: string; trigger: string; createdAt: string; finishedAt: string }
interface RawDeploy { id?: string; status?: string; trigger?: string; createdAt?: string; finishedAt?: string; commit?: { id?: string; message?: string } }
const toDeploy = (d: RawDeploy = {}): Deploy => ({
  id: d.id || '', status: d.status || '', commit: (d.commit?.id || '').slice(0, 7), message: (d.commit?.message || '').split('\n')[0].slice(0, 140),
  trigger: d.trigger || '', createdAt: d.createdAt || '', finishedAt: d.finishedAt || '',
})
// eslint-disable-next-line no-control-regex
const noAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

export function makeRender({ key = '', serviceId = '', hook = '', fetchFn = fetch }: { key?: string; serviceId?: string; hook?: string; fetchFn?: typeof fetch }) {
  const api = !!(key && serviceId)
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await fetchFn(API + path, { ...init, headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json', ...init.headers } })
    const text = await r.text()
    if (!r.ok) throw Object.assign(new Error(`Render API ${r.status}: ${text.slice(0, 200)}`), { status: 502 })
    return (text ? JSON.parse(text) : {}) as T
  }
  let owner = ''
  const ownerId = async () => owner || (owner = (await call<{ ownerId?: string }>(`/services/${serviceId}`)).ownerId || '')

  return {
    api, hook: !!hook,
    /** Последние сборки: новые первыми */
    async deploys(limit = 6): Promise<Deploy[]> {
      if (!api) return []
      const list = await call<{ deploy?: RawDeploy }[]>(`/services/${serviceId}/deploys?limit=${limit}`)
      return list.map((x) => toDeploy(x.deploy))
    },
    /** Пересобрать с последнего коммита */
    async deploy(): Promise<{ id: string; via: 'api' | 'hook' }> {
      if (api) return { id: toDeploy(await call<RawDeploy>(`/services/${serviceId}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: 'do_not_clear' }) })).id, via: 'api' }
      if (!hook) throw Object.assign(new Error('Нет RENDER_API_KEY и RENDER_DEPLOY_HOOK на Render'), { status: 400 })
      const r = await fetchFn(hook, { method: 'POST' })
      if (!r.ok) throw Object.assign(new Error(`Deploy Hook: ${r.status}`), { status: 502 })
      const body = await r.json().catch(() => ({})) as { deploy?: { id?: string } }
      return { id: body.deploy?.id || '', via: 'hook' }
    },
    /** Перезапуск через Render (без ключа — false: вызывающий завершит процесс сам) */
    async restart(): Promise<boolean> {
      if (!api) return false
      await call(`/services/${serviceId}/restart`, { method: 'POST' })
      return true
    },
    /** Логи сборки: от начала сборки (или после since), по порядку; до 100 строк за раз */
    async buildLogs(deployId: string, since = ''): Promise<{ t: number; msg: string }[]> {
      if (!api) return []
      const d = toDeploy(await call<RawDeploy>(`/services/${serviceId}/deploys/${deployId}`))
      if (!d.createdAt) return []
      const q = new URLSearchParams({ ownerId: await ownerId(), resource: serviceId, type: 'build', direction: 'forward', limit: '100',
        startTime: since ? new Date(Date.parse(since) + 1).toISOString() : d.createdAt, endTime: d.finishedAt || new Date().toISOString() })
      const r = await call<{ logs?: { timestamp?: string; message?: string }[] }>(`/logs?${q}`)
      return (r.logs ?? []).map((l) => ({ t: Date.parse(l.timestamp || '') || Date.now(), msg: noAnsi(l.message || '') }))
    },
  }
}
export type Render = ReturnType<typeof makeRender>
