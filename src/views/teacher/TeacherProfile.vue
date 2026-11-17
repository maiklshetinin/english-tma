<script setup>
// Профиль преподавателя — как настройки в Telegram: сверху аватар и имя, ниже — группы строк (значок, название, справа значение или переключатель).
// Только настройки. Цифры (ученики, уроки, оплаты, выученные слова) здесь не показываем — это есть на своих экранах.
import { ref, computed } from 'vue'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppVersion from '../../components/AppVersion.vue'
import { showToast } from '../../composables/useToast'
import { hapticOn, setHaptic } from '../../composables/useTelegram'
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
  return [...by.values()].map((p) => ({ ...p, vers: [...p.vers], old: [...p.vers].some((v) => v !== fresh.value) })).sort((a, b) => a.me - b.me)
})
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
        <span class="tx">Как работает курс<small>Куда уходят слова: Review, повторение, чекпоинт</small></span>
        <span class="val">›</span>
      </router-link>
      <router-link class="it" :to="{ name: 'course-sandbox' }">
        <span class="ic"><AppIcon name="sliders" :size="18" /></span>
        <span class="tx"><span class="ttl">Песочница курса <em class="tst">ТЕСТ</em></span><small>Тестовые настройки: чекпоинт, повторение, напоминания</small></span>
        <span class="val">›</span>
      </router-link>
    </section>

    <section class="grp">
      <label class="it">
        <span class="ic"><AppIcon name="bell" :size="18" /></span>
        <span class="tx">Вибрация<small>Отклик телефона: ответ верно / ошибка, «урок проведён»</small></span>
        <input type="checkbox" class="sw" :checked="hapticOn" aria-label="Вибрация" @change="setHaptic($event.target.checked)" />
      </label>
    </section>

    <!-- Для разработчика (DEV_IDS): проверка связи с сервером. Обычный преподаватель этого не видит -->
    <template v-if="auth.isDev">
      <h4 class="gh">Для разработчика</h4>
      <section class="grp">
        <!-- кто сейчас в приложении: кружки (зелёная галочка — свежая сборка, оранжевая стрелка — старая) и мини-таблица сборок по коммиту -->
        <div class="it vr">
          <span class="ic"><AppIcon name="users" :size="18" /></span>
          <div class="tx">Версии в приложении<small>на сайте сейчас: <code class="cm">{{ fresh }}</code>{{ site ? '' : ' (локально)' }}</small>
            <div v-if="vers.length" class="ppl">
              <span v-for="p in vers" :key="p.uid" class="pp" :class="{ old: p.old }" :title="p.old ? 'Старая версия — нажмите «Обновить у всех»' : 'Свежая версия'">
                <span class="pa"><Avatar :s="p" :size="44" /><i class="pb">{{ p.old ? '↻' : '✓' }}</i></span>
                <b>{{ p.me ? 'Вы' : p.name.split(' ')[0] }}</b>
              </span>
            </div>
            <table v-if="vers.length" class="vt">
              <thead><tr><th>Кто</th><th>Сборка</th><th>Статус</th></tr></thead>
              <tbody>
                <tr v-for="p in vers" :key="p.uid" :class="{ old: p.old }">
                  <td>{{ p.me ? 'Вы' : p.name }}<small v-if="p.tabs > 1"> · {{ p.tabs }} вкладки</small></td>
                  <td><code v-for="v in p.vers" :key="v" class="cm" :class="{ bad: v !== fresh }">{{ v }}</code></td>
                  <td><span class="st">{{ p.old ? 'старая' : 'свежая' }}</span></td>
                </tr>
              </tbody>
            </table>
            <span v-else class="none">никого нет на связи</span>
          </div>
        </div>
        <button class="it" @click="updateEveryone">
          <span class="ic"><AppIcon name="download" :size="18" /></span>
          <span class="tx">Обновить у всех<small>после git push: обновятся, как только новая версия будет на сайте; кто работает — увидит плашку</small></span>
        </button>
        <!-- кэш чтений базы на сервере: дольше срок — меньше Reads в Firestore; любая правка через приложение всё равно сбрасывает нужное сразу -->
        <!-- сеть, консоль сервера, нагрузка на базу, сервер — в панели разработчика (DevTools.vue), открывается на любом экране -->
        <button class="it" @click="devtools.open = !devtools.open">
          <span class="ic"><AppIcon name="sliders" :size="18" /></span>
          <span class="tx">Панель разработчика<small>сеть с чтениями базы, консоль сервера, нагрузка, сервер · на любом экране: жучок в углу или Ctrl + `</small></span>
          <span class="val">{{ devtools.open ? 'закрыть' : 'открыть' }}</span>
        </button>
        <div class="it vr">
          <span class="ic"><AppIcon name="sliders" :size="18" /></span>
          <div class="tx">
            <span class="ch">Кэш базы на сервере
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
.gh { margin: 10px 16px 2px; font-size: 13px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
/* Группа строк как в Telegram: белая плашка, строки с тонким разделителем от текста (не от края) */
.grp { overflow: hidden; border-radius: 14px; background: var(--card); border: 1px solid var(--border) }
.it { display: flex; align-items: center; gap: 14px; width: 100%; box-sizing: border-box; min-height: 48px; padding: 8px 16px; border: 0; background: none; font: inherit; color: var(--text); text-align: left; text-decoration: none; cursor: pointer }
.it + .it { background: linear-gradient(var(--border), var(--border)) right top / calc(100% - 60px) 1px no-repeat }      /* разделитель — от текста, как в Telegram */
.it:hover:not(:disabled) { background: var(--surface) } .it:disabled { cursor: default; opacity: .6 }
.ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; color: var(--hint) }      /* значки — просто серые, без цветных квадратиков */
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
.pp { display: grid; justify-items: center; gap: 4px; min-width: 52px } .pp b { font-size: 12px; font-weight: 700 }
.pa { position: relative; display: inline-grid; border-radius: 50%; box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--green) } .pp.old .pa { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--orange-d) }
.pb { position: absolute; right: -4px; bottom: -4px; z-index: 2; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: var(--green); color: #fff; font-size: 11px; font-style: normal; font-weight: 900; box-shadow: 0 0 0 2px var(--card) } .pp.old .pb { background: var(--orange-d) }
/* мини-таблица сборок */
.vt { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px } .vt th { padding: 4px 6px; font-size: 11px; font-weight: 700; color: var(--hint); text-align: left; text-transform: uppercase; letter-spacing: .3px }
.vt td { padding: 6px; border-top: 1px solid var(--border); font-weight: 600; vertical-align: middle } .vt td small { font-size: 11px; color: var(--hint) }
.st { padding: 2px 8px; border-radius: 8px; background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green-d); font-size: 12px; font-weight: 800 } .vt tr.old .st { background: color-mix(in srgb, var(--orange-d) 15%, transparent); color: var(--orange-d) }
.none { margin-top: 4px; font-size: 13px; color: var(--hint) }
/* кэш: заголовок со сроком справа, ниже — цифры плитками */
.duw { flex: 1; min-width: 0 }
.ch { display: flex; align-items: center; justify-content: space-between; gap: 10px }
.cs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 4px } .cs span { display: grid; gap: 1px; padding: 6px 8px; border-radius: 10px; background: var(--surface); font-size: 11px; font-weight: 600; color: var(--hint) } .cs b { font-size: 16px; font-weight: 800; color: var(--text) }
.cs .cg { background: color-mix(in srgb, var(--green) 14%, transparent) } .cs .cg b { color: var(--green-d) }
</style>
