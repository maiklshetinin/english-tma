<script setup>
// Панель разработчика → «Активность» (19.11.2026): учёт по людям (server/activity.ts, src/composables/useActivity.js).
// День: заходы, «активен» (были действия) и «открыто» (просто на экране), лента по времени и таблица по вкладкам.
// Неделя: активное время по дням у каждого; нажать на день — открыть его. Включается в «Профиле → Для разработчика».
import { ref, computed, watch, onMounted } from 'vue'
import { request } from '../stores/api'
import { TABS } from '../store/app'
import Avatar from './Avatar.vue'
import AppIcon from './AppIcon.vue'

const pad = (n) => String(n).padStart(2, '0')
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return dayOf(d) }
const today = dayOf(new Date())
const day = ref(today), view = ref('day')
const data = ref(null), busy = ref(false), err = ref('')

async function load() {
  busy.value = true
  try { data.value = await request(`/dev/activity?from=${shift(day.value, -6)}&to=${day.value}`, undefined, 'Активность'); err.value = '' } catch (e) { err.value = e.message }
  busy.value = false
}
watch(day, load)
onMounted(load)

const off = computed(() => data.value && !data.value.settings?.teachers && !data.value.settings?.students)
const week = computed(() => Array.from({ length: 7 }, (_, i) => shift(day.value, i - 6)))
const dayTitle = (d) => (d === today ? 'Сегодня' : d === shift(today, -1) ? 'Вчера' : new Date(d + 'T12:00:00').toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' }))

// подписи и цвета вкладок
const EXTRA = { courses: 'Редактор курсов', other: 'Другое' }
const ROLE = { teacher: 'преподаватель', student: 'ученик', dev: 'разработчик' }
const label = (role, t) => TABS[role]?.find((x) => x.id === t)?.label ?? TABS.teacher.find((x) => x.id === t)?.label ?? TABS.student.find((x) => x.id === t)?.label ?? EXTRA[t] ?? t
const PAL = ['#4285f4', '#34a853', '#fa7b17', '#a142f4', '#e8453c', '#12b5cb', '#f9ab00', '#e52592', '#5f6368']
const ORDER = ['home', 'path', 'courses', 'students', 'review', 'words', 'info', 'profile', 'lessons', 'cards', 'other']
const color = (t) => { const i = ORDER.indexOf(t); return PAL[(i < 0 ? t.length : i) % PAL.length] }

const dur = (sec) => { const m = Math.round(sec / 60); return sec > 0 && m < 1 ? '<1 мин' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}` }
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

// день: люди по активному времени
// День (вариант «Д», 19.11.2026): строка на человека И источник — «Сайт» или «Telegram» тегом у имени; строки одного человека рядом,
// во второй и дальше — только тег. Учёт активности (если включён) и лог заходов (всегда) сводятся по источнику.
// В раскрытии — вкладки значками нижнего меню: открыто / активен и полоска (светлое — открыто, тёмное — активен) и «Лента по времени».
const SRC = { tg: 'Telegram', web: 'Сайт' }
const EXTRA_ICON = { courses: 'pencil', other: 'sliders', words: 'cards' }
const icon = (role, t) => TABS[role]?.find((x) => x.id === t)?.icon ?? TABS.teacher.find((x) => x.id === t)?.icon ?? TABS.student.find((x) => x.id === t)?.icon ?? EXTRA_ICON[t] ?? 'list'
function combine(x, y) {          // старый документ дня (без источника) + новый «сайт» — сложить
  const tabs = { ...x.tabs }
  for (const [k, v] of Object.entries(y.tabs)) tabs[k] = { open: (tabs[k]?.open ?? 0) + v.open, act: (tabs[k]?.act ?? 0) + v.act }
  return { ...x, ...y, visits: x.visits + y.visits, open: x.open + y.open, act: x.act + y.act, first: Math.min(x.first, y.first), last: Math.max(x.last, y.last), tabs, spans: [...x.spans, ...y.spans].sort((p, q) => p.a - q.a) }
}
const rows = computed(() => {
  const by = new Map(), get = (uid, src) => { const k = uid + '|' + src; let x = by.get(k); if (!x) by.set(k, (x = { k, uid, src, a: null, v: null, vl: [] })); return x }
  for (const d of (data.value?.days ?? []).filter((d) => d.day === day.value)) { const x = get(d.uid, d.src ?? 'web'); x.a = x.a ? combine(x.a, d) : d }
  for (const v of (data.value?.visits ?? []).filter((v) => v.day === day.value)) for (const it of v.list) { const x = get(v.uid, it.app === 'tg' ? 'tg' : 'web'); x.v = v; x.vl.push(it) }
  const list = [...by.values()].map(({ k, uid, src, a: p, v, vl }) => {
    const who = p ?? v, vt = vl.map((x) => x.t)
    const tabs = p ? Object.entries(p.tabs).map(([t, x]) => ({ t, ...x })).sort((x, y) => y.open - x.open) : []
    return { k, uid, src, name: p?.name || v?.name, photo: p?.photo || v?.photo, role: p?.role || who.role,
      dev: vl.at(-1)?.dev ?? p?.dev ?? 'desktop', vl, visits: v ? vl.length : p.visits, hasAct: !!p, act: p?.act ?? 0, open: p?.open ?? 0,
      first: Math.min(...(p ? [p.first] : []), ...vt), last: Math.max(...(p ? [p.last] : []), ...vt), tabs, max: Math.max(1, ...tabs.map((t) => t.open)), spans: p?.spans ?? [] }
  })
  const tot = new Map()          // люди — по общему «активен», внутри человека — источники по «активен»
  for (const r of list) { const t = tot.get(r.uid) ?? { act: 0, visits: 0 }; t.act += r.act; t.visits += r.visits; tot.set(r.uid, t) }
  list.sort((x, y) => (x.uid === y.uid ? y.act - x.act || y.visits - x.visits : tot.get(y.uid).act - tot.get(x.uid).act || tot.get(y.uid).visits - tot.get(x.uid).visits || (x.uid < y.uid ? -1 : 1)))
  return list.map((r, i) => ({ ...r, head: i === 0 || list[i - 1].uid !== r.uid }))
})
const open = ref({})          // раскрытые «Ленты по времени»
const exp = ref({})
const isOpen = (r, i) => exp.value[r.k] ?? i === 0          // первая строка раскрыта сама
const flip = (r, i) => { exp.value[r.k] = !isOpen(r, i) }
const COLORS = ['#1cb0f6', '#58cc02', '#ff9600', '#ce82ff', '#ff4b4b', '#2b70c9', '#ff86d0']
const av = (p) => ({ name: p.name || '?', photoUrl: p.photo || '', tgId: Number(String(p.uid).replace(/^tg:/, '')) || undefined, color: COLORS[[...String(p.uid)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length] })

// неделя: таблица людей по дням
const weekRows = computed(() => {
  const by = new Map()
  const row = (d) => by.get(d.uid) ?? { uid: d.uid, name: d.name, photo: d.photo, role: d.role, days: {}, act: 0, visits: 0 }
  for (const d of data.value?.days ?? []) {
    const r = row(d), c = r.days[d.day] ?? { act: 0, open: 0, visits: 0, has: false }
    c.act += d.act; c.open += d.open; c.has = true; if (!c.fromV) c.visits += d.visits          // сайт и Telegram — в сумму: в «7 днях» итог по человеку
    r.days[d.day] = c; r.act += d.act; r.name = d.name || r.name; r.photo = d.photo || r.photo; r.role = d.role || r.role; by.set(d.uid, r)
  }
  for (const v of data.value?.visits ?? []) {          // заходы — из лога заходов (точнее и есть всегда)
    const r = row(v), c = r.days[v.day] ?? { act: 0, open: 0, visits: 0, has: false }
    c.visits = v.n; c.fromV = true; r.days[v.day] = c; r.name = r.name || v.name; r.photo = r.photo || v.photo; r.role = r.role || v.role; by.set(v.uid, r)
  }
  for (const r of by.values()) r.visits = Object.values(r.days).reduce((s, c) => s + c.visits, 0)
  return [...by.values()].sort((a, b) => b.act - a.act || b.visits - a.visits)
})
const short = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m}м` : `${Math.floor(m / 60)}:${pad(m % 60)}` }
</script>

<template>
  <div class="da">
    <div class="hd">
      <b>Активность</b>
      <span class="seg" role="tablist">
        <button type="button" :class="{ on: view === 'day' }" @click="view = 'day'">День</button>
        <button type="button" :class="{ on: view === 'week' }" @click="view = 'week'">7 дней</button>
      </span>
      <button type="button" class="rf" :class="{ spin: busy }" title="Обновить" @click="load">↻</button>
    </div>
    <div class="nav">
      <button type="button" class="ar" title="Раньше" @click="day = shift(day, view === 'week' ? -7 : -1)">‹</button>
      <b>{{ view === 'week' ? `${dayTitle(week[0])} — ${dayTitle(week[6])}` : dayTitle(day) }}</b>
      <button type="button" class="ar" title="Позже" :disabled="day >= today" @click="day = shift(day, view === 'week' ? 7 : 1) > today ? today : shift(day, view === 'week' ? 7 : 1)">›</button>
      <button v-if="day !== today" type="button" class="td" @click="day = today">сегодня</button>
    </div>

    <p v-if="err" class="er">{{ err }}</p>
    <p v-if="off" class="nt warn">Учёт активности выключен — видны только заходы (они пишутся всегда). Включить учёт — «Профиль → Для разработчика → Учёт активности».</p>
    <p v-else-if="data" class="nt">Учёт: преподаватели — <b>{{ data.settings.teachers ? 'вкл' : 'выкл' }}</b>, ученики — <b>{{ data.settings.students ? 'вкл' : 'выкл' }}</b> · данные раз в 5 минут и при сворачивании</p>

    <!-- День (вариант «Д»): строка на человека и источник, тег у имени; раскрытие — вкладки значками -->
    <template v-if="view === 'day' && data">
      <p v-if="!rows.length" class="nt">За этот день ни заходов, ни учёта.</p>
      <table v-else class="tm">
        <thead><tr><th class="l">Кто</th><th>Заходы</th><th title="вкладка на экране">Открыто</th><th title="были действия: мышь, нажатия, касания, клавиатура, прокрутка">Активен</th><th class="l tcol">Время</th></tr></thead>
        <tbody>
          <template v-for="(r, i) in rows" :key="r.k">
            <tr class="pr" :class="{ on: isOpen(r, i), cont: !r.head }" tabindex="0" :aria-expanded="isOpen(r, i)" @click="flip(r, i)" @keydown.enter.prevent="flip(r, i)" @keydown.space.prevent="flip(r, i)">
              <td>
                <span class="who">
                  <Avatar v-if="r.head" :s="av(r)" :size="28" /><span v-else class="avsp" />
                  <span class="wn2">
                    <span class="nl"><b v-if="r.head">{{ r.name || r.uid }}</b><span class="tag" :title="`${SRC[r.src]} · ${r.dev === 'phone' ? 'телефон' : 'компьютер'}`">
                      <svg v-if="r.dev === 'phone'" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/></svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M9 20h6M12 16.5V20"/></svg>{{ SRC[r.src] }}</span></span>
                    <small v-if="r.head" :class="r.role">{{ ROLE[r.role] ?? r.role }}</small>
                  </span>
                  <i class="car" aria-hidden="true">{{ isOpen(r, i) ? '▾' : '▸' }}</i>
                </span>
              </td>
              <td class="n" :title="r.vl.length ? r.vl.map((x) => hm(x.t)).join(', ') : ''">{{ r.visits }}</td>
              <td class="n m">{{ r.hasAct ? dur(r.open) : '—' }}</td>
              <td class="n g">{{ r.hasAct ? dur(r.act) : '—' }}</td>
              <td class="tcol tm2">{{ hm(r.first) }}{{ r.last > r.first ? ' – ' + hm(r.last) : '' }}</td>
            </tr>
            <template v-if="isOpen(r, i)">
              <tr v-if="!r.hasAct" class="sx"><td colspan="5" class="ind">Учёт активности не вёлся — только заходы: {{ r.vl.map((x) => hm(x.t)).join(', ') }}</td></tr>
              <tr v-for="t in r.tabs" :key="t.t" class="sx">
                <td class="ind"><span class="tn2"><AppIcon :name="icon(r.role, t.t)" :size="15" class="ti" />{{ label(r.role, t.t) }}</span></td>
                <td />
                <td class="n m">{{ dur(t.open) }}</td>
                <td class="n b2">{{ dur(t.act) }}</td>
                <td class="tcol"><span class="bar2" :title="`активен ${Math.round((t.act / Math.max(1, t.open)) * 100)}% времени`"><i class="bo" :style="{ width: (t.open / r.max) * 100 + '%' }" /><i class="ba" :style="{ width: (t.act / r.max) * 100 + '%' }" /></span></td>
              </tr>
              <tr v-if="r.hasAct" class="sx"><td colspan="5" class="ind">
                <button type="button" class="lk" @click.stop="open[r.k] = !open[r.k]">{{ open[r.k] ? 'Скрыть ленту' : `Лента по времени (${r.spans.length}) →` }}</button>
                <ol v-if="open[r.k]" class="ls">
                  <li v-for="(sg, k) in r.spans" :key="k">
                    <span class="lt">{{ hm(sg.a) }}–{{ hm(sg.b) }}</span>
                    <span class="tn2"><AppIcon :name="icon(r.role, sg.tab)" :size="14" class="ti" />{{ label(r.role, sg.tab) }}</span>
                    <span class="lv">активен {{ dur(sg.act) }} из {{ dur((sg.b - sg.a) / 1000) }}</span>
                  </li>
                </ol>
              </td></tr>
            </template>
          </template>
        </tbody>
      </table>
    </template>

    <!-- 7 дней -->
    <template v-if="view === 'week' && data">
      <p v-if="!weekRows.length" class="nt">За эти дни ничего нет.</p>
      <div v-else class="wk">
        <table>
          <thead><tr><th>Кто</th><th v-for="d in week" :key="d">{{ new Date(d + 'T12:00:00').toLocaleDateString('ru', { weekday: 'short' }) }}<small>{{ d.slice(8) }}.{{ d.slice(5, 7) }}</small></th><th>Всего</th></tr></thead>
          <tbody>
            <tr v-for="r in weekRows" :key="r.uid">
              <td class="wn"><span class="who"><Avatar :s="av(r)" :size="24" /><span class="wn2"><b>{{ r.name || r.uid }}</b><small :class="r.role">{{ ROLE[r.role] ?? r.role }}</small></span></span></td>
              <td v-for="d in week" :key="d" class="wc" :class="{ has: r.days[d] }" :title="r.days[d] ? `${r.days[d].has ? `активен ${dur(r.days[d].act)}, открыто ${dur(r.days[d].open)}, ` : ''}заходов ${r.days[d].visits}` : ''" @click="r.days[d] && ((day = d), (view = 'day'))">
                <template v-if="r.days[d]"><b>{{ r.days[d].has ? short(r.days[d].act) : '·' }}</b><small>{{ r.days[d].visits }}×</small></template><span v-else>—</span>
              </td>
              <td class="wc tot"><b>{{ short(r.act) }}</b><small>{{ r.visits }}×</small></td>
            </tr>
          </tbody>
        </table>
        <p class="nt">В ячейке — активное время (ч:мм) и число заходов. Нажмите на день — откроется подробно.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.da { display: grid; gap: 10px; min-width: 0; container-type: inline-size }
.hd { display: flex; align-items: center; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 }
.seg { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface) }
.seg button { padding: 5px 10px; border: 0; border-radius: 8px; background: none; color: var(--hint); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.rf { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); color: var(--hint); font-size: 16px; cursor: pointer } .rf.spin { animation: rf 1s linear infinite } @keyframes rf { to { rotate: 360deg } }
.nav { display: flex; align-items: center; gap: 8px } .nav b { font-size: 14px; font-weight: 700; text-transform: capitalize }
.ar { width: 28px; height: 28px; border: 0; border-radius: 8px; background: var(--surface); color: var(--text); font-size: 18px; line-height: 1; cursor: pointer } .ar:disabled { opacity: .35; cursor: default }
.td { margin-left: auto; padding: 4px 9px; border: 0; border-radius: 8px; background: var(--surface); color: var(--g-acc, #1a73e8); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer }
.nt { margin: 0; font-size: 11.5px; color: var(--hint) } .nt.warn { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, #f9ab00 14%, transparent); color: var(--text); font-size: 12.5px }
.er { margin: 0; padding: 10px; border-radius: 10px; background: color-mix(in srgb, #e8453c 10%, transparent); color: #c5221f; font-size: 13px }
/* карточка человека */
.pc { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card) }
.ph { display: flex; align-items: center; gap: 8px } .ph b { font-size: 15px; font-weight: 700 }
.rl { padding: 2px 7px; border-radius: 7px; background: color-mix(in srgb, #4285f4 14%, transparent); color: #1a73e8; font-size: 11px; font-weight: 700 } .rl.student { background: color-mix(in srgb, #34a853 14%, transparent); color: #188038 } .rl.dev { background: color-mix(in srgb, #a142f4 14%, transparent); color: #8430ce }
.cs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px } .cs span { display: grid; gap: 1px; padding: 6px 8px; border-radius: 10px; background: var(--surface); font-size: 11px; font-weight: 600; color: var(--hint) } .cs b { font-size: 15px; font-weight: 800; color: var(--text); white-space: nowrap }
.cs .cg { background: color-mix(in srgb, #34a853 14%, transparent) } .cs .cg b { color: #188038 }
.tl { display: grid; gap: 2px }
.tb { position: relative; height: 22px; border-radius: 6px; background: var(--surface); overflow: hidden } .tb i { position: absolute; top: 0; bottom: 0; border-radius: 2px }
.hr { position: relative; height: 14px; font-size: 10px; color: var(--hint) } .hr span { position: absolute; translate: -50% 0 } .hr span:first-child { translate: 0 0 } .hr span:last-child { translate: -100% 0 }
.tt { display: grid; gap: 5px }
.tr { display: grid; grid-template-columns: minmax(0, 1.1fr) 1fr 64px 64px; align-items: center; gap: 8px; font-size: 12.5px } .tr > span:nth-child(3), .tr > b { text-align: right; white-space: nowrap } .tr > b { font-weight: 800 }
.tr.th { font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
.tn { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis } .tn i { flex: none; width: 9px; height: 9px; border-radius: 3px }
.bar { position: relative; height: 8px; border-radius: 4px; background: var(--surface); overflow: hidden } .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px } .bar .bo { opacity: .28 }
.lk { justify-self: start; padding: 0; border: 0; background: none; color: var(--g-acc, #1a73e8); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer }
.ls { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; max-height: 320px; overflow: auto }
.ls li { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid var(--border); font-size: 12.5px }
.lt { font-variant-numeric: tabular-nums; font-weight: 700 } .lv { color: var(--hint); font-size: 11.5px; white-space: nowrap }
/* день — вариант «Д»: строгая таблица с тонкими линиями */
.tm { width: 100%; border-collapse: collapse; font-size: 13px }
.tm th { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .4px; text-align: right; white-space: nowrap } .tm th.l { text-align: left }
.tm td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle }
.pr { cursor: pointer } .pr:hover td, .pr.on td { background: var(--surface) } .pr:focus-visible { outline: 2px solid var(--g-acc, #1a73e8); outline-offset: -2px }
.pr.cont td { padding-top: 6px; padding-bottom: 6px }
.sx td { padding: 6px 10px; font-size: 12.5px; background: color-mix(in srgb, var(--surface) 55%, var(--card)) } .sx td.ind { padding-left: 48px }
.who { display: flex; align-items: center; gap: 10px; min-width: 0 } .avsp { width: 28px; flex: none }
.wn2 { display: grid; gap: 2px; min-width: 0; line-height: 1.25 } .nl { display: flex; align-items: center; gap: 8px; min-width: 0 } .nl b { font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.wn2 small { font-size: 11px; font-weight: 600; color: #1a73e8 } .wn2 small.student { color: #188038 } .wn2 small.dev { color: #8430ce }
.tag { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px 1px 5px; border: 1px solid var(--border); border-radius: 99px; background: var(--card); font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap }
.tag svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; color: var(--hint) }
.car { margin-left: auto; font-style: normal; font-size: 11px; color: var(--hint) }
.n { text-align: right; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums } .n.g { color: #1a73e8; font-weight: 800 } .n.m { color: var(--hint); font-weight: 600 } .n.b2 { color: #1a73e8; font-weight: 700 }
.tcol { width: 30%; min-width: 96px } .tm2 { color: var(--hint); font-variant-numeric: tabular-nums; white-space: nowrap }
.tn2 { display: flex; align-items: center; gap: 8px; font-weight: 600 } .ti { flex: none; color: var(--hint) }
.bar2 { position: relative; display: block; height: 6px; border-radius: 3px; background: var(--border); overflow: hidden } .bar2 i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #1a73e8 } .bar2 .bo { opacity: .22 }
@container (max-width: 400px) { .tcol { display: none } }
/* заходы: телефон / компьютер */
.dv { display: inline-flex; gap: 6px; margin-left: 6px; font-size: 11px; font-weight: 700; color: var(--hint) } .dv span { display: inline-flex; align-items: center; gap: 2px }
.dv svg, .vc svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round }
.vl { display: flex; flex-wrap: wrap; gap: 5px }
.vc { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 99px; background: var(--card); border: 1px solid var(--border); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums } .vc small { font-size: 10.5px; font-weight: 600; color: var(--hint) }
/* неделя */
.wk { display: grid; gap: 6px; overflow-x: auto }
.wk table { width: 100%; border-collapse: collapse; font-size: 12.5px }
.wk th { padding: 4px; font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase; text-align: center } .wk th small { display: block; font-weight: 600; text-transform: none } .wk th:first-child { text-align: left }
.wk td { padding: 5px 4px; border-top: 1px solid var(--border) }
.wn { font-weight: 700; white-space: nowrap } .wn small { display: block; font-size: 10.5px; font-weight: 600; color: var(--hint) }
.wc { text-align: center; color: var(--hint) } .wc b { display: block; color: var(--text); font-weight: 800 } .wc small { font-size: 10.5px }
.wc.has { cursor: pointer; border-radius: 6px } .wc.has:hover { background: var(--surface) } .wc.tot b { color: #188038 }
</style>
