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
  for (const u of live.users) { const p = by.get(u.uid) ?? { uid: u.uid, name: u.name, me: false, vers: new Set() }; p.vers.add(u.ver || '?'); if (u.cid === live.cid) p.me = true; by.set(u.uid, p) }
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
        <div class="it vr">
          <span class="ic"><AppIcon name="users" :size="18" /></span>
          <span class="tx">Версии в приложении<small>на сайте: {{ fresh }}{{ site ? '' : ' (локально)' }}</small>
            <span v-for="p in vers" :key="p.uid" class="vl" :class="{ old: p.old }">{{ p.me ? 'Вы' : p.name }} — {{ p.old ? 'старая' : 'свежая' }} <code>{{ p.vers.join(', ') }}</code></span>
            <span v-if="!vers.length" class="vl">никого нет на связи</span>
          </span>
        </div>
        <button class="it" @click="updateEveryone">
          <span class="ic"><AppIcon name="download" :size="18" /></span>
          <span class="tx">Обновить у всех<small>после git push: обновятся, как только новая версия будет на сайте; кто работает — увидит плашку</small></span>
        </button>
        <!-- кэш чтений базы на сервере: дольше срок — меньше Reads в Firestore; любая правка через приложение всё равно сбрасывает нужное сразу -->
        <label class="it">
          <span class="ic"><AppIcon name="sliders" :size="18" /></span>
          <span class="tx">Кэш базы на сервере<small v-if="cache">из памяти {{ cache.saved }} · из базы {{ cache.reads }} — экономия {{ savedPct }}%<br />сервер не засыпал с {{ awake }} · записей {{ cache.entries }}</small><small v-else>нет ответа от сервера (спит или старая сборка)</small></span>
          <select class="sel" :value="cache?.min ?? 10" :disabled="!cache" aria-label="Срок кэша" @change="setCache({ min: +$event.target.value }, +$event.target.value ? 'Срок кэша изменён — кэш начат заново' : 'Кэш выключен')">
            <option v-for="[m, t] in CACHE_OPTS" :key="m" :value="m">{{ t }}</option>
          </select>
        </label>
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
.sel { flex: none; padding: 6px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.vr { align-items: flex-start; cursor: default } .vl { display: block; margin-top: 3px; font-size: 13px; font-weight: 700; color: var(--green-d) } .vl.old { color: var(--orange-d) } .vl code { font-size: 11px; color: var(--hint) }
</style>
