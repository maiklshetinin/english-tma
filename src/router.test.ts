// Роутер: адрес хранит положение (обновление не бросает на главную), чужие маршруты ведут на первую вкладку роли.
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter, goUp, homeOf, redirectFor } from './router'
import { useAuthStore } from './stores/auth'

async function start(url: string) {
  history.pushState({}, '', '/?demo&role=teacher')
  const pinia = createPinia(); setActivePinia(pinia)
  const history_ = createMemoryHistory(); history_.replace(url)          // «обновили страницу» на этом адресе
  const router = createAppRouter(history_)
  const w = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  const auth = useAuthStore()
  await vi.waitFor(() => expect(auth.status).toBe('ready'))
  await flushPromises()
  return { w, router, auth }
}

describe('redirectFor', () => {
  it('«посадочный» и чужие маршруты ведут на первую вкладку роли, свои — остаются', () => {
    expect(redirectFor({ meta: { landing: true } }, 'teacher')).toEqual(homeOf('teacher'))
    expect(redirectFor({ meta: { roles: ['teacher'] } }, 'student')).toEqual({ name: 'path' })
    expect(redirectFor({ meta: { roles: ['teacher'] } }, 'teacher')).toBeNull()
    expect(redirectFor({ meta: {} }, 'student')).toBeNull()
  })
})

describe('адрес вместо состояния в памяти', () => {
  it('после «обновления» на /words преподаватель остаётся в «Словах»', async () => {
    const { w, router } = await start('/words')
    expect(router.currentRoute.value.fullPath).toBe('/words')
    expect(router.currentRoute.value.meta.tab).toBe('words')
    w.unmount()
  })

  it('карточка ученика открывается по адресу, «Назад» без истории ведёт к списку, неизвестный ученик не ломает экран', async () => {
    const { w, router } = await start('/students/2')
    expect(router.currentRoute.value.params.id).toBe('2')
    expect(w.text()).toContain('Леня С.')
    goUp(router); await flushPromises()                                // пришли сразу на страницу ученика → список
    expect(router.currentRoute.value.fullPath).toBe('/students')
    await router.push('/students/нет-такого'); await flushPromises()
    expect(w.text()).toContain('Ученик не найден')
    w.unmount()
  })

  it('пустой и чужой адрес (например, данные запуска Telegram) ведут на первую вкладку', async () => {
    const { w, router } = await start('/tgWebAppData=query_id%3Dabc&tgWebAppVersion=8')
    expect(router.currentRoute.value.name).toBe('home')
    w.unmount()
  })

  it('ученик не попадает на экраны преподавателя', async () => {
    const { w, router, auth } = await start('/home')
    expect(auth.setRole('student')).toBe(true); await flushPromises()
    expect(router.currentRoute.value.name).toBe('path')
    await router.push('/students/2'); await flushPromises()
    expect(router.currentRoute.value.name).toBe('path')                // чужой маршрут → первая вкладка ученика
    await router.push('/cards'); await flushPromises()
    expect(router.currentRoute.value.name).toBe('cards')
    w.unmount()
  })
})
