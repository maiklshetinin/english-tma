// Навигация: где сейчас пользователь, хранится в адресе (#/students/42), поэтому обновление страницы не бросает на главную,
// а «Назад» в браузере и системная кнопка Telegram работают как положено.
//  • Режим hash: GitHub Pages не умеет отдавать index.html на любой путь, а с # обновление страницы безопасно.
//  • Telegram открывает приложение с данными запуска в hash (#tgWebAppData=…): они не совпадают ни с одним маршрутом и
//    уходят на «посадочный» маршрут (landing) → первая вкладка роли. Сами данные SDK Telegram уже прочитал и сохранил.
//  • Вкладки и права: у каждого маршрута есть meta.tab (подсветка в нижней панели) и meta.roles (кому можно); чужие маршруты
//    ведут на первую вкладку роли — это проверяет и сам роутер, и App.vue (когда роль становится известна после входа или меняется демо-переключателем).
import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteMeta, RouteRecordRaw, Router, RouterHistory } from 'vue-router'
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import type { Role } from '../server/types'
import { TABS } from './store/app'
import { useAuthStore } from './stores/auth'
import StudentPath from './views/StudentPath.vue'
import StudentCards from './views/StudentCards.vue'
import StudentProfile from './views/StudentProfile.vue'
import Schedule from './views/Schedule.vue'
import TeacherHome from './views/teacher/TeacherHome.vue'
import TeacherProfile from './views/teacher/TeacherProfile.vue'
import TeacherPath from './views/teacher/TeacherPath.vue'
import TeacherStudents from './views/teacher/TeacherStudents.vue'
import TeacherWords from './views/teacher/TeacherWords.vue'

declare module 'vue-router' {
  interface RouteMeta {
    tab?: string          // какая вкладка нижней панели подсвечена
    roles?: Role[]        // кому доступен маршрут (нет — всем)
    landing?: boolean     // «посадочный»: адрес пустой или не наш — сразу уходим на первую вкладку роли
  }
}

/** Один адрес, два экрана: что показать, решает роль (так «Путь» и «Профиль» есть и у преподавателя, и у ученика). */
const byRole = (views: Record<Role, Component>): Component => defineComponent({
  name: 'RoleView',
  setup() { const auth = useAuthStore(); return () => h(views[auth.role]) },
})
const Blank = defineComponent({ name: 'Blank', render: () => null })

// Имя маршрута = id вкладки из TABS. Необязательный :id — открытая карточка ученика (на «Главной» и в «Учениках»).
export const routes: RouteRecordRaw[] = [
  { path: '/home/:id?', name: 'home', component: TeacherHome, meta: { tab: 'home', roles: ['teacher'] } },
  { path: '/path', name: 'path', component: byRole({ teacher: TeacherPath, student: StudentPath }), meta: { tab: 'path' } },
  { path: '/students/:id?', name: 'students', component: TeacherStudents, meta: { tab: 'students', roles: ['teacher'] } },
  { path: '/courses', name: 'courses', component: () => import('./views/teacher/CourseEditor.vue'), meta: { tab: 'courses', roles: ['teacher'] } },      // ЭСКИЗ: редактор курсов (холст), грузится лениво
  { path: '/cards-studio', name: 'cards-studio', component: () => import('./views/teacher/CardStudio.vue'), meta: { tab: 'words', roles: ['teacher'] } },      // ЭСКИЗ: редактор карточек
  { path: '/info', name: 'info', component: () => import('./views/teacher/TeacherInfo.vue'), meta: { tab: 'info', roles: ['teacher'] } },      // доходы по месяцам (грузится лениво)
  { path: '/words', name: 'words', component: TeacherWords, meta: { tab: 'words', roles: ['teacher'] } },
  { path: '/cards', name: 'cards', component: StudentCards, meta: { tab: 'cards', roles: ['student'] } },
  { path: '/lessons', name: 'lessons', component: Schedule, meta: { tab: 'lessons', roles: ['student'] } },
  { path: '/profile', name: 'profile', component: byRole({ teacher: TeacherProfile, student: StudentProfile }), meta: { tab: 'profile' } },
  { path: '/:pathMatch(.*)*', name: 'landing', component: Blank, meta: { landing: true } },      // «/» и любой чужой адрес
]

/** Первая вкладка роли — куда попадает пользователь после входа и при смене режима. */
export const homeOf = (role: Role) => ({ name: TABS[role][0].id })

/** Если маршрут этой роли не положен (или это «посадочный») — куда её отправить; иначе null. */
export const redirectFor = (to: { meta: RouteMeta }, role: Role) =>
  to.meta.landing || (to.meta.roles && !to.meta.roles.includes(role)) ? homeOf(role) : null

/** «Назад» из карточки ученика: на шаг назад по истории, а если пришли сразу на эту страницу (обновление, ссылка) — к списку. */
export function goUp(router: Router) {
  const route = router.currentRoute.value
  if (router.options.history.state.back) router.back()
  else router.replace({ name: route.name as string })
}

export function createAppRouter(history: RouterHistory = createWebHashHistory(import.meta.env.BASE_URL)): Router {
  const router = createRouter({ history, routes })
  router.beforeEach((to) => {
    const auth = useAuthStore()
    // Пока вход не закончился, роль неизвестна: пропускаем, а App.vue перепроверит, когда она появится
    return auth.status === 'ready' ? (redirectFor(to, auth.role) ?? true) : true
  })
  return router
}
