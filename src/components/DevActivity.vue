<script setup>
// Панель разработчика → «Активность» (19.11.2026): учёт по людям (server/activity.ts, src/composables/useActivity.js).
// День: заходы, «активен» (были действия) и «открыто» (просто на экране), лента по времени и таблица по вкладкам.
// Неделя: активное время по дням у каждого; нажать на день — открыть его. Включается в «Профиле → Для разработчика».
import { ref, computed, watch, onMounted } from 'vue'
import { request } from '../stores/api'
import { TABS } from '../store/app'
import Avatar from './Avatar.vue'

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
const people = computed(() => (data.value?.days ?? []).filter((d) => d.day === day.value).sort((a, b) => b.act - a.act).map((p) => {
  const h0 = new Date(p.first); h0.setMinutes(0, 0, 0)
  const h1 = new Date(p.last); if (h1.getMinutes() || h1.getSeconds()) { h1.setHours(h1.getHours() + 1); h1.setMinutes(0, 0, 0) }
  const a = h0.getTime(), b = Math.max(h1.getTime(), a + 3600_000), span = b - a
  const step = span > 8 * 3600_000 ? 2 : 1
  const hours = []; for (let t = a, i = 0; t <= b; t += 3600_000, i++) if (i % step === 0) hours.push({ x: ((t - a) / span) * 100, t: new Date(t).getHours() })
  const segs = p.spans.map((s) => ({ ...s, x: ((s.a - a) / span) * 100, w: Math.max(0.4, ((s.b - s.a) / span) * 100), k: Math.min(1, s.act / Math.max(1, (s.b - s.a) / 1000)) }))
  const tabs = Object.entries(p.tabs).map(([t, v]) => ({ t, ...v })).sort((x, y) => y.open - x.open)
  const max = Math.max(1, ...tabs.map((t) => t.open))
  return { ...p, hours, segs, tabs, max }
}))
const open = ref({})          // раскрытые ленты по uid
// Вариант «В» (19.11.2026): строка на человека, нажатие раскрывает подробности; первая строка раскрыта сама
const exp = ref({})
const isOpen = (p, i) => exp.value[p.uid] ?? i === 0
const flip = (p, i) => { exp.value[p.uid] = !isOpen(p, i) }
const COLORS = ['#1cb0f6', '#58cc02', '#ff9600', '#ce82ff', '#ff4b4b', '#2b70c9', '#ff86d0']
const av = (p) => ({ name: p.name || '?', photoUrl: p.photo || '', tgId: Number(String(p.uid).replace(/^tg:/, '')) || undefined, color: COLORS[[...String(p.uid)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length] })

// неделя: таблица людей по дням
const weekRows = computed(() => {
  const by = new Map()
  for (const d of data.value?.days ?? []) {
    const r = by.get(d.uid) ?? { uid: d.uid, name: d.name, photo: d.photo, role: d.role, days: {}, act: 0, visits: 0 }
    r.days[d.day] = d; r.act += d.act; r.visits += d.visits; r.name = d.name || r.name; r.photo = d.photo || r.photo; r.role = d.role || r.role; by.set(d.uid, r)
  }
  return [...by.values()].sort((a, b) => b.act - a.act)
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
    <p v-if="off" class="nt warn">Учёт выключен. Включить — «Профиль → Для разработчика → Учёт активности» (отдельно для преподавателей и учеников).</p>
    <p v-else-if="data" class="nt">Учёт: преподаватели — <b>{{ data.settings.teachers ? 'вкл' : 'выкл' }}</b>, ученики — <b>{{ data.settings.students ? 'вкл' : 'выкл' }}</b>.
      «Активен» — были действия (мышь, нажатия, касания, клавиатура, прокрутка), «открыто» — просто на экране. Данные приходят раз в 5 минут и при сворачивании.</p>

    <!-- День: таблица — строка на человека, нажатие раскрывает вкладки и ленту -->
    <template v-if="view === 'day' && data">
      <p v-if="!people.length" class="nt">За этот день ничего нет.</p>
      <table v-else class="tm">
        <thead><tr><th class="l">Кто</th><th>Заходы</th><th>Активен</th><th>Открыто</th><th class="l dcol">День</th></tr></thead>
        <tbody>
          <template v-for="(p, i) in people" :key="p.uid">
            <tr class="pr" :class="{ on: isOpen(p, i) }" tabindex="0" :aria-expanded="isOpen(p, i)" @click="flip(p, i)" @keydown.enter.prevent="flip(p, i)" @keydown.space.prevent="flip(p, i)">
              <td><span class="who"><Avatar :s="av(p)" :size="28" /><span class="wn2"><b>{{ p.name || p.uid }}</b><small :class="p.role">{{ ROLE[p.role] ?? p.role }}</small></span></span></td>
              <td class="n">{{ p.visits }}</td>
              <td class="n g">{{ dur(p.act) }}</td>
              <td class="n m">{{ dur(p.open) }}</td>
              <td class="dcol">
                <div class="tb sm"><i v-for="(sg, k) in p.segs" :key="k" :style="{ left: sg.x + '%', width: sg.w + '%', background: color(sg.tab), opacity: 0.25 + 0.75 * sg.k }" /></div>
                <small class="tr2">{{ hm(p.first) }}–{{ hm(p.last) }}</small>
              </td>
            </tr>
            <tr v-if="isOpen(p, i)" class="dx">
              <td colspan="5">
                <div class="dd">
                  <div class="tl">
                    <div class="tb">
                      <i v-for="(sg, k) in p.segs" :key="k" :style="{ left: sg.x + '%', width: sg.w + '%', background: color(sg.tab), opacity: 0.25 + 0.75 * sg.k }"
                        :title="`${hm(sg.a)}–${hm(sg.b)} · ${label(p.role, sg.tab)} · активен ${dur(sg.act)} из ${dur((sg.b - sg.a) / 1000)}`" />
                    </div>
                    <div class="hr"><span v-for="h in p.hours" :key="h.x" :style="{ left: h.x + '%' }">{{ h.t }}:00</span></div>
                  </div>
                  <div v-for="t in p.tabs" :key="t.t" class="tr">
                    <span class="tn"><i :style="{ background: color(t.t) }" />{{ label(p.role, t.t) }}</span>
                    <span class="bar" :title="`активен ${Math.round((t.act / Math.max(1, t.open)) * 100)}% времени`"><i class="bo" :style="{ width: (t.open / p.max) * 100 + '%', background: color(t.t) }" /><i class="ba" :style="{ width: (t.act / p.max) * 100 + '%', background: color(t.t) }" /></span>
                    <span>{{ dur(t.open) }}</span><b>{{ dur(t.act) }}</b>
                  </div>
                  <button type="button" class="lk" @click.stop="open[p.uid] = !open[p.uid]">{{ open[p.uid] ? 'Скрыть ленту' : `Лента по времени (${p.spans.length})` }}</button>
                  <ol v-if="open[p.uid]" class="ls">
                    <li v-for="(sg, k) in p.spans" :key="k">
                      <span class="lt">{{ hm(sg.a) }}–{{ hm(sg.b) }}</span>
                      <span class="tn"><i :style="{ background: color(sg.tab) }" />{{ label(p.role, sg.tab) }}</span>
                      <span class="lv">активен {{ dur(sg.act) }} из {{ dur((sg.b - sg.a) / 1000) }}</span>
                    </li>
                  </ol>
                </div>
              </td>
            </tr>
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
              <td v-for="d in week" :key="d" class="wc" :class="{ has: r.days[d] }" :title="r.days[d] ? `активен ${dur(r.days[d].act)}, открыто ${dur(r.days[d].open)}, заходов ${r.days[d].visits}` : ''" @click="r.days[d] && ((day = d), (view = 'day'))">
                <template v-if="r.days[d]"><b>{{ short(r.days[d].act) }}</b><small>{{ r.days[d].visits }}×</small></template><span v-else>—</span>
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
/* день — таблица команды (вариант «В») */
.tm { width: 100%; border-collapse: collapse; font-size: 12.5px }
.tm th { padding: 0 6px 6px; font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase; letter-spacing: .3px; text-align: right; white-space: nowrap } .tm th.l { text-align: left }
.tm td { padding: 7px 6px; border-top: 1px solid var(--border); vertical-align: middle }
.pr { cursor: pointer } .pr:hover td, .pr.on td, .dx td { background: var(--surface) } .pr:focus-visible { outline: 2px solid var(--g-acc, #1a73e8); outline-offset: -2px }
.dx td { border-top: 0; padding: 2px 8px 12px 40px }
.who { display: flex; align-items: center; gap: 8px; min-width: 0 } .wn2 { display: grid; min-width: 0; line-height: 1.2 } .wn2 b { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.wn2 small { font-size: 10.5px; font-weight: 600; color: #1a73e8 } .wn2 small.student { color: #188038 } .wn2 small.dev { color: #8430ce }
.n { text-align: right; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums } .n.g { color: #188038; font-weight: 800 } .n.m { color: var(--hint); font-weight: 600 }
.dcol { width: 34%; min-width: 110px } .tb.sm { height: 6px; border-radius: 3px } .tr2 { font-size: 10px; color: var(--hint); font-variant-numeric: tabular-nums }
.dd { display: grid; gap: 7px }
@container (max-width: 400px) { .dcol { display: none } }
/* неделя */
.wk { display: grid; gap: 6px; overflow-x: auto }
.wk table { width: 100%; border-collapse: collapse; font-size: 12.5px }
.wk th { padding: 4px; font-size: 10.5px; font-weight: 700; color: var(--hint); text-transform: uppercase; text-align: center } .wk th small { display: block; font-weight: 600; text-transform: none } .wk th:first-child { text-align: left }
.wk td { padding: 5px 4px; border-top: 1px solid var(--border) }
.wn { font-weight: 700; white-space: nowrap } .wn small { display: block; font-size: 10.5px; font-weight: 600; color: var(--hint) }
.wc { text-align: center; color: var(--hint) } .wc b { display: block; color: var(--text); font-weight: 800 } .wc small { font-size: 10.5px }
.wc.has { cursor: pointer; border-radius: 6px } .wc.has:hover { background: var(--surface) } .wc.tot b { color: #188038 }
</style>
