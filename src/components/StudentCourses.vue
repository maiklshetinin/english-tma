<script setup>
// Карточка ученика → «Путь и слова» → «Курсы»: назначить курс ученику и смотреть, как он его проходит
// (сколько пройдено, где он сейчас, результат и дата каждого урока). Сервер — server/learn.ts.
import { ref, watch } from 'vue'
import { API, apiRequest, fb, isDemo } from '../firebase'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'

const props = defineProps({ studentId: { type: [String, Number], required: true } })
const online = !isDemo && !!API && !!fb
const list = ref(null), err = ref(''), openId = ref(null), busy = ref(null)
const TYPE = { lesson: 'Урок', checkpoint: 'Чекпоинт', words: 'Слова', hw: 'Домашка', test: 'Тест', tutor: 'С репетитором', video: 'Кружок', photo: 'Фото', reward: 'Награда' }
async function load() {
  if (!online) { list.value = []; return }
  try { const r = await apiRequest(`/students/${encodeURIComponent(props.studentId)}/courses`); if (!r.ok) throw new Error(`(${r.status})`); list.value = (await r.json()).courses; err.value = '' }
  catch (e) { err.value = e.message; list.value ??= [] }
}
watch(() => props.studentId, load, { immediate: true })
async function toggle(c) {
  busy.value = c.id
  try {
    const r = await apiRequest(`/courses/${c.id}/assign`, { method: 'POST', body: JSON.stringify({ studentId: String(props.studentId), on: !c.assigned }) })
    if (!r.ok) throw new Error()
    showToast(c.assigned ? `Курс «${c.title}» снят` : `Курс «${c.title}» назначен`); await load()
  } catch { showToast('Не удалось — попробуйте ещё раз', null, 'bad') } finally { busy.value = null }
}
const pct = (c) => (c.total ? Math.round(Math.min(c.run.done, c.total) / c.total * 100) : 0)
const when = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const mins = (s) => (s >= 60 ? `${Math.round(s / 60)} мин` : `${s} с`)
</script>

<template>
  <div class="card">
    <h3 class="h"><AppIcon name="route" /> Курсы</h3>
    <p v-if="!online" class="hint" style="margin:0">Курсы назначаются, когда приложение работает с сервером.</p>
    <p v-else-if="err" class="hint" style="margin:0">Не удалось загрузить курсы {{ err }}</p>
    <p v-else-if="!list" class="hint" style="margin:0">Загрузка…</p>
    <template v-else>
      <div v-for="c in list" :key="c.id" class="r" :class="{ on: c.assigned }">
        <div class="top">
          <div class="in" role="button" tabindex="0" @click="c.assigned && (openId = openId === c.id ? null : c.id)">
            <b>{{ c.title || 'Без названия' }}</b>
            <div v-if="c.assigned" class="pr"><span class="bar"><i :style="{ width: pct(c) + '%' }" /></span><small>{{ Math.min(c.run.done, c.total) }} из {{ c.total }} · {{ pct(c) }}%</small></div>
            <div v-else class="hint">{{ c.total }} заданий</div>
          </div>
          <button v-if="c.assigned" class="btn ghost sm" :disabled="busy === c.id" @click="toggle(c)"><AppIcon name="check" :size="16" /> Назначен</button>
          <button v-else class="btn sm" :disabled="busy === c.id" @click="toggle(c)">Назначить</button>
        </div>
        <!-- прохождение: каждое задание — пройдено (результат, время, когда), «Сейчас» или ещё впереди -->
        <ol v-if="openId === c.id" class="tl">
          <li v-for="(t, k) in c.tasks" :key="t.id" :class="k < c.run.done ? 'd' : k === c.run.done ? 'n' : 't'">
            <span class="dot">{{ k < c.run.done ? '✓' : k + 1 }}</span>
            <span class="tt">{{ t.title || TYPE[t.type] || 'Задание' }}<small>{{ TYPE[t.type] }}</small></span>
            <span v-if="c.run.lessons[t.id]" class="res"><b v-if="c.run.lessons[t.id].all">{{ Math.round(c.run.lessons[t.id].ok / c.run.lessons[t.id].all * 100) }}%</b>
              <small>{{ c.run.lessons[t.id].all ? c.run.lessons[t.id].ok + ' из ' + c.run.lessons[t.id].all + ' · ' : '' }}{{ c.run.lessons[t.id].sec ? mins(c.run.lessons[t.id].sec) + ' · ' : '' }}{{ when(c.run.lessons[t.id].at) }}</small></span>
            <span v-else-if="k === c.run.done" class="now">Сейчас</span>
          </li>
        </ol>
        <button v-if="c.assigned" class="more" @click="openId = openId === c.id ? null : c.id">{{ openId === c.id ? 'Скрыть прохождение' : 'Смотреть прохождение' }}</button>
      </div>
      <p v-if="!list.length" class="hint" style="margin:0">Курсов пока нет — создайте их во вкладке «Курсы».</p>
    </template>
  </div>
</template>

<style scoped>
.h { display: flex; gap: 8px; align-items: center }
.r { padding: 10px 0; border-top: 1px solid var(--border) } .top { display: flex; align-items: center; gap: 10px } .in { flex: 1; min-width: 0; cursor: default } .r.on .in { cursor: pointer }
.pr { display: flex; align-items: center; gap: 8px; margin-top: 4px } .bar { flex: 1; max-width: 220px; height: 8px; border-radius: 4px; background: var(--surface); overflow: hidden } .bar i { display: block; height: 100%; background: #1fbe78; border-radius: 4px }
.pr small { font-size: 12px; font-weight: 800; color: var(--hint) }
.more { border: 0; background: none; padding: 6px 0 0; font: inherit; font-size: 13px; font-weight: 800; color: var(--blue); cursor: pointer }
.tl { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px }
.tl li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--surface) }
.dot { flex: 0 0 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 900; background: #e5e5e5; color: #8a8a8a }
.d .dot { background: #1fbe78; color: #fff } .n .dot { background: #fff; color: #1fbe78; box-shadow: 0 0 0 2px #1fbe78 } .t { opacity: .6 }
.tt { flex: 1; min-width: 0; font-weight: 800; font-size: 14px; display: grid } .tt small { font-size: 11px; font-weight: 700; color: var(--hint) }
.res { display: grid; justify-items: end; text-align: right } .res b { font-size: 14px; color: #1fbe78 } .res small { font-size: 11px; color: var(--hint); font-weight: 700 }
.now { font-size: 11px; font-weight: 900; color: #fff; background: #1fbe78; padding: 3px 8px; border-radius: 8px }
</style>
