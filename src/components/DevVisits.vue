<script setup>
// Панель разработчика → «Заходы» (19.11.2026): журнал входов — кто, когда и с чего (server/visits.ts, src/composables/useVisits.js).
// Пишется всегда, даже при выключенном учёте активности. Новые сверху, разделители по дням со счётчиком.
// Строка на высоту кружка: время, аватар, имя, роль, тег «Сайт» / «Telegram», справа устройство. Нажатие — человек в «Активности» за этот день.
import { ref, computed, watch, onMounted } from 'vue'
import { request } from '../stores/api'
import Avatar from './Avatar.vue'
import { devtools, devJump } from '../composables/useNetLog'

const pad = (n) => String(n).padStart(2, '0')
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return dayOf(d) }
const today = dayOf(new Date())
const span = ref(7), who = ref('all')
const data = ref(null), busy = ref(false), err = ref('')
async function load() {
  busy.value = true
  try { data.value = await request(`/dev/visits?from=${shift(today, -(span.value - 1))}&to=${today}`, undefined, 'Заходы'); err.value = '' } catch (e) { err.value = e.message }
  busy.value = false
}
watch(span, load)
onMounted(load)

const ROLE = { teacher: 'преподаватель', student: 'ученик', dev: 'разработчик' }
const SRC = { tg: 'Telegram', web: 'Сайт' }
const PF = { ios: 'iPhone', android: 'Android', android_x: 'Android', tdesktop: 'Telegram Desktop', macos: 'Telegram macOS', weba: 'Telegram Web', webk: 'Telegram Web', web: 'Telegram Web' }
const device = (x) => (x.pf && PF[x.pf]) || (x.dev === 'phone' ? 'телефон' : 'компьютер')
const COLORS = ['#1cb0f6', '#58cc02', '#ff9600', '#ce82ff', '#ff4b4b', '#2b70c9', '#ff86d0']
const av = (p) => ({ name: p.name || '?', photoUrl: p.photo || '', tgId: Number(String(p.uid).replace(/^tg:/, '')) || undefined, color: COLORS[[...String(p.uid)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length] })
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayTitle = (d) => (d === today ? 'Сегодня' : d === shift(today, -1) ? 'Вчера' : new Date(d + 'T12:00:00').toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' }))
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c }

// дни сверху вниз (новые первыми), внутри — заходы по времени, новые первыми
const days = computed(() => {
  const ok = (r) => who.value === 'all' || (who.value === 'students' ? r === 'student' : r !== 'student')
  const by = new Map()
  for (const v of data.value?.visits ?? []) {
    if (!ok(v.role)) continue
    const d = by.get(v.day) ?? []
    for (const x of v.list) d.push({ ...x, uid: v.uid, name: v.name, photo: v.photo, role: v.role, day: v.day })
    by.set(v.day, d)
  }
  return [...by].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, list]) => {
    list.sort((a, b) => b.t - a.t)
    const people = new Set(list.map((x) => x.uid)).size
    return { day, list, sum: `${list.length} ${plural(list.length, 'заход', 'захода', 'заходов')}, ${people} ${plural(people, 'человек', 'человека', 'человек')}` }
  })
})
function open(x) { Object.assign(devJump, { day: x.day, uid: x.uid, n: devJump.n + 1 }); devtools.tab = 'activity' }
</script>

<template>
  <div class="dvz">
    <div class="hd">
      <b>Заходы</b>
      <span class="seg" role="tablist" aria-label="Кто">
        <button v-for="[k, t] in [['all', 'Все'], ['teachers', 'Преподаватели'], ['students', 'Ученики']]" :key="k" type="button" :class="{ on: who === k }" @click="who = k">{{ t }}</button>
      </span>
      <span class="seg" role="tablist" aria-label="Период">
        <button v-for="n in [7, 30]" :key="n" type="button" :class="{ on: span === n }" @click="span = n">{{ n }} дней</button>
      </span>
      <button type="button" class="rf" :class="{ spin: busy }" title="Обновить" @click="load">↻</button>
    </div>
    <p v-if="err" class="er">{{ err }}</p>
    <p v-else-if="data && !days.length" class="nt">За эти дни заходов нет (журнал ведётся с 19.11.2026).</p>
    <table v-if="days.length" class="vz">
      <tbody>
        <template v-for="d in days" :key="d.day">
          <tr class="dh"><td colspan="4"><b>{{ dayTitle(d.day) }}</b> · {{ d.sum }}</td></tr>
          <tr v-for="(x, i) in d.list" :key="d.day + i" class="vr" tabindex="0" :title="`Открыть в «Активности»: ${x.name} за ${dayTitle(d.day).toLowerCase()}`" @click="open(x)" @keydown.enter.prevent="open(x)">
            <td class="t">{{ hm(x.t) }}</td>
            <td><span class="who"><Avatar :s="av(x)" :size="24" /><b>{{ x.name || x.uid }}</b><small :class="x.role">{{ ROLE[x.role] ?? x.role }}</small></span></td>
            <td><span class="tag">
              <svg v-if="x.dev === 'phone'" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/></svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M9 20h6M12 16.5V20"/></svg>{{ SRC[x.app] ?? x.app }}</span></td>
            <td class="pf">{{ device(x) }}</td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.dvz { display: grid; gap: 10px; min-width: 0 }
.hd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px } .hd > b { flex: 1; font-size: 16px; font-weight: 600 }
.seg { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface) }
.seg button { padding: 5px 10px; border: 0; border-radius: 8px; background: none; color: var(--hint); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer } .seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12) }
.rf { width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--surface); color: var(--hint); font-size: 16px; cursor: pointer } .rf.spin { animation: rf 1s linear infinite } @keyframes rf { to { rotate: 360deg } }
.nt { margin: 0; font-size: 12px; color: var(--hint) } .er { margin: 0; padding: 10px; border-radius: 10px; background: color-mix(in srgb, #e8453c 10%, transparent); color: #c5221f; font-size: 13px }
/* журнал: тонкие линии, строка на высоту кружка */
.vz { width: 100%; border-collapse: collapse; font-size: 13px }
.vz td { padding: 4px 10px; height: 36px; box-sizing: border-box; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap }
.dh td { height: auto; padding: 14px 10px 6px; font-size: 11px; font-weight: 600; color: var(--hint) } .dh b { font-weight: 800; text-transform: uppercase; letter-spacing: .4px }
.vr { cursor: pointer } .vr:hover td { background: var(--surface) } .vr:focus-visible { outline: 2px solid var(--g-acc, #1a73e8); outline-offset: -2px }
.t { width: 48px; font-weight: 700; font-variant-numeric: tabular-nums }
.who { display: flex; align-items: center; gap: 8px; min-width: 0 } .who b { font-weight: 700; overflow: hidden; text-overflow: ellipsis }
.who small { font-size: 11px; font-weight: 600; color: #1a73e8 } .who small.student { color: #188038 } .who small.dev { color: #8430ce }
.tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px 1px 5px; border: 1px solid var(--border); border-radius: 99px; background: var(--card); font-size: 11px; font-weight: 700 }
.tag svg { width: 12px; height: 12px; fill: none; stroke: var(--hint); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round }
.pf { text-align: right; font-size: 12px; color: var(--hint) }
@container (max-width: 420px) { .pf { display: none } }
.dvz { container-type: inline-size }
</style>
