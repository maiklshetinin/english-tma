<script setup>
// Профиль преподавателя — как настройки в Telegram: сверху аватар и имя, ниже — группы строк (значок, название, справа значение или переключатель).
// Только настройки. Цифры (ученики, уроки, оплаты, выученные слова) здесь не показываем — это есть на своих экранах.
import { ref, computed } from 'vue'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppVersion from '../../components/AppVersion.vue'
import GeminiKeys from '../../components/GeminiKeys.vue'
import { ai as gem } from '../../utils/gemini'
import { showToast } from '../../composables/useToast'
import { ask } from '../../composables/useDialog'
import { hapticOn, setHaptic, swipeLock, setSwipeLock } from '../../composables/useTelegram'
import { sfxOn, setSfx, sfxResult } from '../../composables/useSfx'
import { apiFetch, canLogout } from '../../firebase'
import { useStudentsStore } from '../../stores/students'
import { useAuthStore } from '../../stores/auth'
import { live } from '../../composables/useLive'
import { MY_VER, siteVer, updateAll } from '../../composables/useUpdate'
import { request, post } from '../../stores/api'
import { devtools } from '../../composables/useNetLog'
const auth = useAuthStore()
const studentStore = useStudentsStore()
const name = computed(() => auth.user?.first_name || auth.teacher.name)
const me = computed(() => ({ ...auth.teacher, name: name.value }))     // запись преподавателя (photoUrl — из Telegram)
const demo = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
const noStudents = computed(() => auth.role === 'teacher' && !studentStore.list.length)
const switchRole = () => { if (!noStudents.value) auth.setRole(auth.role === 'student' ? 'teacher' : 'student') }
const busy = ref(false)
// Разработчик: у кого какая версия сайта открыта (по вкладкам) и «Обновить у всех» (useUpdate.js)
const site = ref('')
if (auth.isDev) siteVer().then((v) => { site.value = v || '' })
const fresh = computed(() => site.value || MY_VER)
const vers = computed(() => {
  const by = new Map()
  for (const u of live.users) { const p = by.get(u.uid) ?? { uid: u.uid, name: u.name, photoUrl: u.photo, color: u.color, me: false, vers: new Set(), tabs: 0 }; p.vers.add(u.ver || '?'); p.tabs++; if (u.cid === live.cid) p.me = true; by.set(u.uid, p) }
  const out = [...by.values()].map((p) => ({ ...p, vers: [...p.vers], on: true, old: [...p.vers].some((v) => v !== fresh.value) }))
  // остальные преподаватели (Настя и др.) — всегда, даже не в сети: последняя открытая версия из их записи (users.ver, пишет /me/visit)
  for (const t of team.value ?? []) if (!by.has(t.uid)) out.push({ uid: t.uid, name: t.name, photoUrl: t.photo, color: '#9aa0a6', me: false, on: false, tabs: 0, at: t.verAt, vers: t.ver ? [t.ver] : [], old: !!t.ver && t.ver !== fresh.value })
  return out.sort((a, b) => a.me - b.me || b.on - a.on)
})
const seen = (t) => { if (!t) return 'не в сети'; const d = new Date(t), hm = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); return 'не в сети · заходил(а) ' + (d.toDateString() === new Date().toDateString() ? 'сегодня в ' + hm : d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + ' в ' + hm) }
// Кэш чтений базы на сервере (server/cache.ts): срок, сколько прочитано из базы и сколько отдано из памяти с запуска сервера
const CACHE_OPTS = [[0, 'выкл'], [10, '10 мин'], [60, '1 ч'], [360, '6 ч'], [720, '12 ч'], [1440, '24 ч']]
const cache = ref(null)
const loadCache = () => request('/dev/cache', undefined, 'Кэш сервера').then((v) => { cache.value = v }).catch(() => { cache.value = null })
if (auth.isDev) loadCache()
const savedPct = computed(() => { const c = cache.value; return c && c.reads + c.saved ? Math.round((c.saved / (c.reads + c.saved)) * 100) : 0 })
const awake = computed(() => cache.value && new Date(cache.value.since).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
async function setCache(body, msg) {
  try { cache.value = await post('/dev/cache', body, 'Кэш сервера'); showToast(msg) } catch (e) { showToast(e.message) }
}
// Права преподавателей: «только просмотр» — всё видит, ничего не меняет (сервер не примет записи)
const team = ref(null)
const loadTeam = () => request('/dev/access', undefined, 'Права').then((r) => { team.value = r.teachers }).catch(() => { team.value = [] })
if (auth.isDev) loadTeam()
async function setView(t, on) {
  try { await post('/dev/access', { uid: t.uid, viewOnly: on }, 'Права'); t.viewOnly = on; showToast(on ? `${t.name}: только просмотр` : `${t.name}: полный доступ`) } catch (e) { showToast(e.message) }
}
// «Уроки — только просмотр» (19.11.2026): нельзя только правки уроков в расписании, остальное — можно
async function setLessons(t, on) {
  try { await post('/dev/access', { uid: t.uid, lessonsLock: on }, 'Права'); t.lessonsLock = on; showToast(on ? `${t.name}: уроки — только просмотр` : `${t.name}: уроки можно менять`) } catch (e) { showToast(e.message) }
}
// Учёт активности (server/activity.ts): отдельно для преподавателей и учеников; смотреть — панель разработчика → «Активность»
const actSet = ref(null)
const td = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
if (auth.isDev) request(`/dev/activity?from=${td}&to=${td}`, undefined, 'Активность').then((r) => { actSet.value = r.settings }).catch(() => { actSet.value = null })
async function setAct(k, on) {
  try { actSet.value = await post('/dev/activity', { [k]: on }, 'Активность'); showToast(`Учёт активности: ${k === 'teachers' ? 'преподаватели' : 'ученики'} — ${on ? 'включён' : 'выключен'}`) } catch (e) { showToast(e.message) }
}
function openActivity() { devtools.tab = 'activity'; devtools.open = true }
// Очистка логов (server/visits.ts → clean): заходы и учёт активности, за период или целиком
const CLEAN_OPTS = [[30, 'старше 30 дней'], [90, 'старше 90 дней'], [0, 'всё']]
const cleanDays = ref(90)
async function cleanLogs(what) {
  const t = what === 'visits' ? 'заходов' : 'учёта активности', d = cleanDays.value
  if (!(await ask(`Очистить лог ${t}${d ? ` старше ${d} дней` : ' целиком'}?`, { text: 'Удалённое не вернуть.', ok: 'Очистить', danger: true }))) return
  try { const r = await post('/dev/logs/clean', { what, days: d }, 'Логи'); showToast(`Лог ${t}: удалено записей — ${r.deleted}`) } catch (e) { showToast(e.message) }
}
function updateEveryone() { updateAll(); showToast('Отправлено: обновятся все, как только новая версия будет на сайте (тихо — или плашкой, если человек сейчас работает)') }
async function ping() {
  if (!import.meta.env.VITE_API_URL) return showToast('Не задан API_URL — приложение не знает адрес сервера')
  busy.value = true
  try {
    const r = await apiFetch('/ping', { method: 'POST', body: JSON.stringify({ msg: 'тест из Профиля' }) })
    showToast(r.ok ? `Сервер ответил: ${(await r.json()).who}` : `Сервер ответил ошибкой ${r.status}`)
  } catch { showToast('Сервер не отвечает (спит, неверный адрес или CORS) — см. консоль браузера') }
  finally { busy.value = false }
}
</script>
<template>
  <div class="page tg">
    <header class="me">
      <Avatar :s="me" :size="84" />
      <b>{{ name }}</b>
      <small>@{{ auth.user?.username || auth.teacher.username }} · {{ auth.isDev ? 'Разработчик' : 'Преподаватель' }}</small>
    </header>

    <section class="grp">
      <button class="it" :disabled="noStudents" :title="noStudents ? 'Сначала добавьте ученика' : ''" @click="switchRole">
        <span class="ic"><AppIcon name="users" :size="18" /></span>
        <span class="tx">{{ demo ? 'Демо-режим' : 'Смотреть как ученик' }}</span>
        <span class="val">{{ auth.role === 'student' ? 'ученик' : 'преподаватель' }}</span>
      </button>
    </section>

    <section class="grp">
      <router-link class="it" :to="{ name: 'course-how' }">
        <span class="ic"><AppIcon name="book" :size="18" /></span>
        <span class="tx">Как работает курс<small>Живой пример и песочница: куда уходят слова, повторение, чекпоинт, настройки; правила</small></span>
        <span class="val">›</span>
      </router-link>
    </section>

    <section class="grp">
      <label class="it">
        <span class="ic"><AppIcon name="headphones" :size="18" /></span>
        <span class="tx">Звуки ответов<small>«Дзынь», когда верно, и мягкий звук при ошибке — в уроке, песочнице и на ветке</small></span>
        <input type="checkbox" class="sw" :checked="sfxOn" aria-label="Звуки ответов" @change="setSfx($event.target.checked); $event.target.checked && sfxResult(true)" />
      </label>
      <label class="it">
        <span class="ic"><AppIcon name="bell" :size="18" /></span>
        <span class="tx">Вибрация<small>Отклик телефона: ответ верно / ошибка, «урок проведён»</small></span>
        <input type="checkbox" class="sw" :checked="hapticOn" aria-label="Вибрация" @change="setHaptic($event.target.checked)" />
      </label>
      <label class="it">
        <span class="ic"><AppIcon name="sliders" :size="18" /></span>
        <span class="tx">Блокировать свайп вниз<small>Свайп вниз не сворачивает приложение — удобнее листать и тянуть уроки. Только в Telegram на телефоне</small></span>
        <input type="checkbox" class="sw" :checked="swipeLock" aria-label="Блокировать свайп вниз" @change="setSwipeLock($event.target.checked)" />
      </label>
    </section>

    <!-- Ключи Gemini (19.11.2026): свои у каждого преподавателя, только в этом браузере; на будущее — для озвучки. Свёрнуто, чтобы не мешало -->
    <details class="grp keys">
      <summary class="it">
        <span class="ic"><AppIcon name="lock" :size="18" /></span>
        <span class="tx">Ключи Gemini<small>Свои ключи Google для озвучки — хранятся только в этом браузере</small></span>
        <span class="val">{{ gem.keys.length || '' }} <i class="chev">›</i></span>
      </summary>
      <div class="kp"><GeminiKeys /></div>
    </details>

    <!-- Для разработчика (DEV_IDS): проверка связи с сервером. Обычный преподаватель этого не видит -->
    <template v-if="auth.isDev">
      <h4 class="gh">Для разработчика</h4>
      <section class="grp">
        <!-- кто сейчас в приложении: кружки (зелёная галочка — свежая сборка, оранжевая стрелка — старая) и мини-таблица сборок по коммиту -->
        <details class="fold">
          <summary class="it"><span class="ic"><AppIcon name="users" :size="18" /></span><span class="tx">Версии в приложении<small>на сайте сейчас: <code class="cm">{{ fresh }}</code>{{ site ? '' : ' (локально)' }}</small></span><span class="val">{{ vers.filter((p) => p.old).length ? `↻ ${vers.filter((p) => p.old).length} ` : '' }}<i class="chev">›</i></span></summary>
        <div class="it vr fb">
          <span class="ic" />
          <div class="tx">
            <div v-if="vers.length" class="ppl">
              <span v-for="p in vers" :key="p.uid" class="pp" :class="{ old: p.old, off: !p.on }" :title="(p.on ? '' : seen(p.at) + '. ') + (!p.vers.length ? 'Версия пока неизвестна' : p.old ? 'Старая версия — нажмите «Обновить у всех»' : 'Свежая версия')">
                <span class="pa"><Avatar :s="p" :size="44" /><i v-if="p.vers.length" class="pb">{{ p.old ? '↻' : '✓' }}</i></span>
                <b>{{ p.me ? 'Вы' : p.name.split(' ')[0] }}</b>
              </span>
            </div>
            <table v-if="vers.length" class="vt">
              <thead><tr><th>Кто</th><th>Сборка</th><th>Статус</th></tr></thead>
              <tbody>
                <tr v-for="p in vers" :key="p.uid" :class="{ old: p.old }">
                  <td>{{ p.me ? 'Вы' : p.name }}<small v-if="p.tabs > 1"> · {{ p.tabs }} вкладки</small><small v-if="!p.on" class="off">{{ seen(p.at) }}</small></td>
                  <td><code v-for="v in p.vers" :key="v" class="cm" :class="{ bad: v !== fresh }">{{ v }}</code><small v-if="!p.vers.length">—</small></td>
                  <td><span v-if="p.vers.length" class="st">{{ p.old ? 'старая' : 'свежая' }}</span><small v-else>пока неизвестна</small></td>
                </tr>
              </tbody>
            </table>
            <span v-else class="none">никого нет на связи</span>
          </div>
        </div>
        </details>
        <button class="it" @click="updateEveryone">
          <span class="ic"><AppIcon name="download" :size="18" /></span>
          <span class="tx">Обновить у всех<small>после git push: обновятся, как только новая версия будет на сайте; кто работает — увидит плашку</small></span>
        </button>
        <!-- кэш чтений базы на сервере: дольше срок — меньше Reads в Firestore; любая правка через приложение всё равно сбрасывает нужное сразу -->
        <!-- права: кому «только просмотр» -->
        <details class="fold">
          <summary class="it"><span class="ic"><AppIcon name="lock" :size="18" /></span><span class="tx">Права<small>кому только просмотр</small></span><span class="val"><i class="chev">›</i></span></summary>
        <div class="it vr fb">
          <span class="ic" />
          <div class="tx"><small>«Уроки — просмотр» — нельзя менять только уроки в расписании (создать, перенести, отметить, удалить), остальное можно. «Всё — просмотр» — ничего не сохраняется: уроки, ученики, курсы. Чат работает.</small>
            <div v-for="t in team ?? []" :key="t.uid" class="rw">
              <Avatar :s="{ name: t.name, photoUrl: t.photo, color: '#9aa0a6' }" :size="30" /><b>{{ t.name }}</b>
              <label class="vsw" title="Уроки в расписании: создать, перенести, отметить проведённым / отменённым, удалить — нельзя; остальное можно"><span>уроки — просмотр</span><input type="checkbox" :checked="t.lessonsLock" :disabled="t.viewOnly" @change="setLessons(t, $event.target.checked)" /><i /></label>
              <label class="vsw"><span>всё — просмотр</span><input type="checkbox" :checked="t.viewOnly" @change="setView(t, $event.target.checked)" /><i /></label>
            </div>
            <span v-if="team && !team.length" class="none">нет других преподавателей (TEACHER_IDS) или старая сборка сервера</span>
          </div>
        </div>
        </details>
        <!-- учёт активности: заходы, время «открыто» / «активен» по вкладкам, лента; смотреть — панель разработчика → «Активность» -->
        <details class="fold">
          <summary class="it"><span class="ic"><AppIcon name="chart" :size="18" /></span><span class="tx">Учёт активности<small>{{ !actSet ? 'нет ответа от сервера' : actSet.teachers && actSet.students ? 'включён у всех' : actSet.teachers ? 'включён у преподавателей' : actSet.students ? 'включён у учеников' : 'выключен' }} · очистка логов</small></span><span class="val"><i class="chev">›</i></span></summary>
        <div class="it vr fb">
          <span class="ic" />
          <div class="tx"><small>Сколько времени приложение было на экране и сколько из него были действия (мышь, нажатия, касания) — по вкладкам и лентой. Выключено — ничего не считается и не отправляется.</small>
            <template v-if="actSet">
              <label class="rw"><b>Преподаватели</b><input type="checkbox" class="sw" :checked="actSet.teachers" aria-label="Учёт: преподаватели" @change="setAct('teachers', $event.target.checked)" /></label>
              <label class="rw"><b>Ученики</b><input type="checkbox" class="sw" :checked="actSet.students" aria-label="Учёт: ученики" @change="setAct('students', $event.target.checked)" /></label>
              <button type="button" class="lnk" @click="openActivity">Смотреть — панель разработчика → «Активность»</button>
            </template>
            <span v-else class="none">нет ответа от сервера (спит или старая сборка)</span>
            <small class="lgn">Заходы (время, телефон или компьютер, Telegram или сайт) пишутся всегда, независимо от переключателей.</small>
            <div class="lgc">
              <span>Очистить логи</span>
              <select v-model.number="cleanDays" class="sel" aria-label="Что очистить"><option v-for="[d, t] in CLEAN_OPTS" :key="d" :value="d">{{ t }}</option></select>
              <button type="button" class="lgb" @click="cleanLogs('visits')">логи заходов</button>
              <button type="button" class="lgb" @click="cleanLogs('activity')">учёт</button>
            </div>
          </div>
        </div>
        </details>
        <!-- сеть, консоль сервера, нагрузка на базу, сервер — в панели разработчика (DevTools.vue), открывается на любом экране -->
        <button class="it" @click="devtools.open = !devtools.open">
          <span class="ic"><AppIcon name="sliders" :size="18" /></span>
          <span class="tx">Панель разработчика<small>сеть с чтениями базы, консоль сервера, нагрузка, сервер · на любом экране: жучок в углу или Ctrl + `</small></span>
          <span class="val">{{ devtools.open ? 'закрыть' : 'открыть' }}</span>
        </button>
        <details class="fold">
          <summary class="it"><span class="ic"><AppIcon name="sheet" :size="18" /></span><span class="tx">Кэш базы на сервере<small>{{ cache ? `экономия ${savedPct}% · срок и сброс` : 'нет ответа от сервера' }}</small></span><span class="val"><i class="chev">›</i></span></summary>
        <div class="it vr fb">
          <span class="ic" />
          <div class="tx">
            <span class="ch">Срок
              <select class="sel" :value="cache?.min ?? 10" :disabled="!cache" aria-label="Срок кэша" @change="setCache({ min: +$event.target.value }, +$event.target.value ? 'Срок кэша изменён — кэш начат заново' : 'Кэш выключен')">
                <option v-for="[m, t] in CACHE_OPTS" :key="m" :value="m">{{ t }}</option>
              </select>
            </span>
            <template v-if="cache">
              <div class="cs">
                <span class="cg"><b>{{ savedPct }}%</b>экономия</span>
                <span><b>{{ cache.saved }}</b>из памяти</span>
                <span><b>{{ cache.reads }}</b>из базы</span>
                <span><b>{{ cache.entries }}</b>записей</span>
              </div>
              <small>сервер не засыпал с {{ awake }} · счёт — с этого времени</small>
            </template>
            <small v-else>нет ответа от сервера (спит или старая сборка)</small>
          </div>
        </div>
        <button class="it" :disabled="!cache" @click="setCache({ clear: true }, 'Кэш сброшен — следующие открытия прочитают базу заново')">
          <span class="ic"><AppIcon name="refresh" :size="18" /></span>
          <span class="tx">Сбросить кэш<small>если правили данные руками в консоли Firebase</small></span>
          <span class="val" @click.stop="loadCache" title="Обновить цифры">↻</span>
        </button>
        </details>
        <button class="it" :disabled="busy" @click="ping">
          <span class="ic"><AppIcon name="refresh" :size="18" /></span>
          <span class="tx">Проверить связь с сервером</span>
          <span class="val">{{ busy ? '…' : '' }}</span>
        </button>
      </section>
    </template>

    <section v-if="canLogout" class="grp">
      <button class="it red" @click="auth.logout()"><span class="tx">Выйти</span></button>
    </section>
    <AppVersion />
  </div>
</template>
<style scoped>
.tg { gap: 8px }
.me { display: grid; justify-items: center; gap: 4px; padding: 8px 0 14px; text-align: center }
.me > b { margin-top: 8px; font-size: 22px } .me small { font-size: 14px; font-weight: 600; color: var(--hint) }
.keys > summary { list-style: none } .keys > summary::-webkit-details-marker { display: none }
.chev { display: inline-block; font-style: normal; transition: transform .2s } .keys[open] .chev { transform: rotate(90deg) }
.kp { padding: 4px 16px 14px }
.gh { margin: 10px 16px 2px; font-size: 13px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
/* Группа строк как в Telegram: белая плашка, строки с тонким разделителем от текста (не от края) */
.grp { overflow: hidden; border-radius: 14px; background: var(--card); border: 1px solid var(--border) }
.it { display: flex; align-items: center; gap: 14px; width: 100%; box-sizing: border-box; min-height: 48px; padding: 8px 16px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; text-decoration: none; cursor: pointer }
.it + .it { background: linear-gradient(var(--border), var(--border)) right top / calc(100% - 60px) 1px no-repeat }      /* разделитель — от текста, как в Telegram */
.it:hover:not(:disabled) { background: var(--surface) } .it:disabled { cursor: default; opacity: .6 }
.ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; color: var(--hint) }      /* значки — просто серые, без цветных квадратиков */
.fold > summary { list-style: none } .fold > summary::-webkit-details-marker { display: none }
.fold + .it, .it + .fold, .fold + .fold { background: linear-gradient(var(--border), var(--border)) right top / calc(100% - 60px) 1px no-repeat }
.fold[open] .chev { transform: rotate(90deg) } .fb { padding-top: 0 }
.tx { flex: 1; display: grid; gap: 1px; min-width: 0; font-size: 16px; font-weight: 600 } .tx small { font-size: 12px; font-weight: 500; color: var(--hint) }
.val { flex: none; font-size: 15px; font-weight: 500; color: var(--hint) }
.ttl { display: inline-flex; align-items: center; gap: 6px } .tst { font-style: normal; padding: 1px 6px; border-radius: 6px; background: #ffc800; color: #4b3a00; font-size: 11px; font-weight: 900; letter-spacing: .3px }      /* жёлтый ярлык «ТЕСТ» — как на самой странице песочницы */
.red .tx { color: var(--red-d); text-align: center }
.sw { appearance: none; flex: none; width: 46px; height: 28px; margin: 0; border-radius: 14px; background: var(--border); position: relative; cursor: pointer; transition: background .15s }
.sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .15s }
.sw:checked { background: var(--green) } .sw:checked::after { transform: translateX(18px) }
.sel { flex: none; width: auto; padding: 6px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.vr { align-items: flex-start; cursor: default } .vr:hover { background: none !important } .vr > .ic { margin-top: 2px }
.cm { padding: 1px 6px; border-radius: 6px; background: var(--surface); font-size: 12px; font-weight: 700; color: var(--text) } .cm.bad { background: color-mix(in srgb, var(--orange-d) 15%, transparent); color: var(--orange-d) } .cm + .cm { margin-left: 4px }
/* кружки людей: галочка — свежая, ↻ — старая */
.ppl { display: flex; flex-wrap: wrap; gap: 14px; margin: 10px 0 4px }
.pp.off .pa { opacity: .5 } .vt td small.off { display: block }          /* не в сети — бледнее, под именем «заходил(а) …» */
.pp { display: grid; justify-items: center; gap: 4px; min-width: 52px } .pp b { font-size: 12px; font-weight: 700 }
.pa { position: relative; display: inline-grid; border-radius: 50%; box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--green) } .pp.old .pa { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--orange-d) }
.pb { position: absolute; right: -4px; bottom: -4px; z-index: 2; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: var(--green); color: #fff; font-size: 11px; font-style: normal; font-weight: 900; box-shadow: 0 0 0 2px var(--card) } .pp.old .pb { background: var(--orange-d) }
/* мини-таблица сборок */
.vt { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px } .vt th { padding: 4px 6px; font-size: 11px; font-weight: 700; color: var(--hint); text-align: left; text-transform: uppercase; letter-spacing: .3px }
.vt td { padding: 6px; border-top: 1px solid var(--border); font-weight: 600; vertical-align: middle } .vt td small { font-size: 11px; color: var(--hint) }
.st { padding: 2px 8px; border-radius: 8px; background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green-d); font-size: 12px; font-weight: 800 } .vt tr.old .st { background: color-mix(in srgb, var(--orange-d) 15%, transparent); color: var(--orange-d) }
.rw { display: flex; align-items: center; gap: 10px; margin-top: 8px } .rw b { flex: 1; font-size: 14px; font-weight: 700 }
.vsw { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: var(--hint); cursor: pointer } .vsw input { position: absolute; opacity: 0; width: 1px; height: 1px }
.vsw i { position: relative; width: 36px; height: 22px; border-radius: 11px; background: #34c759; transition: background .2s } .vsw i::after { content: ''; position: absolute; top: 2px; left: 16px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: left .2s }
.vsw input:checked + i { background: #ff9500 } .vsw input:checked + i::after { left: 2px }
.vsw:has(input:disabled) { opacity: .45; cursor: default } .rw:has(.vsw) { flex-wrap: wrap; row-gap: 6px }          /* «всё — просмотр» включено — «уроки» и так закрыты */
.lnk { justify-self: start; margin-top: 8px; padding: 0; border: 0; background: none; color: var(--blue); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.lgn { margin-top: 8px } .lgc { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; font-weight: 700 } .lgc > span { flex: 1 }
.lgb { padding: 6px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--red-d); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer } .lgb:hover { background: var(--surface) }
.none { margin-top: 4px; font-size: 13px; color: var(--hint) }
/* кэш: заголовок со сроком справа, ниже — цифры плитками */
.duw { flex: 1; min-width: 0 }
.ch { display: flex; align-items: center; justify-content: space-between; gap: 10px }
.cs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 4px } .cs span { display: grid; gap: 1px; padding: 6px 8px; border-radius: 10px; background: var(--surface); font-size: 11px; font-weight: 600; color: var(--hint) } .cs b { font-size: 16px; font-weight: 800; color: var(--text) }
.cs .cg { background: color-mix(in srgb, var(--green) 14%, transparent) } .cs .cg b { color: var(--green-d) }
</style>
