<script setup>
// Блокирующее сообщение разработчика (17.11.2026): разработчик в чате включает замок и пишет — у остальных преподавателей
// весь экран закрыт затемнением с этим сообщением, пока не ответят в чат. Ответ отсюда уходит обычным сообщением в общий чат;
// сервер отмечает «ответил» (notes.ts → reply), и экран открывается. Пережидает перезагрузку: флаг хранится у сообщения на сервере.
// Пока закрыто — клавиши (Delete, Ctrl+Z…) до приложения не доходят, только до поля ответа.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { pendingBlocks, chatNote, reply, wireNotes } from '../composables/useNotes'
import { hapticOn } from '../composables/useTelegram'

wireNotes()
const text = ref(''), sending = ref(false), ta = ref(null), box = ref(null)
const on = computed(() => pendingBlocks.value.length > 0)
let st = 0
watch(on, (v) => {
  sending.value = false; clearTimeout(st)
  if (!v) return
  nextTick(() => ta.value?.focus())
  try { if (hapticOn.value) window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning') } catch { /* нет вибрации */ }
}, { immediate: true })

const time = (at) => new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ini = (n) => (n || '?').trim().slice(0, 1).toUpperCase()

function send() {
  const t = text.value.trim(), c = chatNote.value
  if (!t || !c || sending.value) return
  sending.value = true; reply(c.id, t); text.value = ''
  st = setTimeout(() => { sending.value = false }, 8000)      // нет связи — можно отправить ещё раз
}
const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
// пока закрыто: клавиши — только в окно ответа
const guard = (e) => { if (on.value && !box.value?.contains(e.target)) { e.stopPropagation(); e.preventDefault() } }
onMounted(() => { addEventListener('keydown', guard, true); addEventListener('paste', guard, true) })
onUnmounted(() => { removeEventListener('keydown', guard, true); removeEventListener('paste', guard, true); clearTimeout(st) })
</script>

<template>
  <Teleport to="body">
    <div v-if="on" class="bg-bg" role="alertdialog" aria-modal="true" aria-labelledby="bg-h" @wheel.prevent @contextmenu.prevent>
      <div ref="box" class="bg">
        <div class="hd"><span class="lk" aria-hidden="true">🔒</span><b id="bg-h">Нужно ответить</b></div>
        <p class="sub">Приложение откроется, когда вы ответите на {{ pendingBlocks.length > 1 ? 'эти сообщения' : 'это сообщение' }} — ответ уйдёт в общий чат.</p>
        <div class="list">
          <div v-for="m in pendingBlocks" :key="m.id" class="m">
            <span class="av" :style="{ '--c': m.color }"><img v-if="m.photo" :src="m.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(m.name) }}</b></span>
            <span class="mb"><span class="mh">{{ m.name }}<small>{{ time(m.at) }}</small></span><span class="mt">{{ m.text }}</span></span>
          </div>
        </div>
        <div class="in">
          <textarea ref="ta" v-model="text" rows="2" maxlength="1000" placeholder="Ваш ответ…" :disabled="sending" @keydown="onKey" />
          <button class="go" type="button" :disabled="!text.trim() || sending" @click="send">{{ sending ? 'Отправляем…' : 'Ответить' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bg-bg { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .55); backdrop-filter: blur(3px); animation: bgIn .2s ease-out }
@keyframes bgIn { from { opacity: 0 } }
.bg { width: 440px; max-width: 100%; box-sizing: border-box; display: grid; gap: 12px; padding: 20px; border-radius: 20px; background: var(--card); box-shadow: 0 20px 60px rgba(0, 0, 0, .35); animation: bIn .25s cubic-bezier(.34, 1.4, .64, 1) }
@keyframes bIn { from { opacity: 0; transform: scale(.92) } }
.hd { display: flex; align-items: center; gap: 8px } .lk { font-size: 20px } .hd b { font-size: 18px; font-weight: 900; color: var(--text) }
.sub { margin: -4px 0 0; font-size: 13px; font-weight: 700; color: var(--hint); line-height: 1.4 }
.list { display: grid; gap: 10px; max-height: 40vh; overflow: auto; padding: 12px; border-radius: 14px; background: var(--surface) }
.m { display: flex; gap: 10px; align-items: flex-start }
.av { flex: none; width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--c, var(--blue)); color: #fff; font-weight: 900 } .av img { width: 100%; height: 100%; object-fit: cover }
.mb { display: grid; gap: 2px; min-width: 0 }
.mh { font-size: 13px; font-weight: 900; color: var(--text) } .mh small { margin-left: 6px; font-size: 11px; font-weight: 700; color: var(--hint) }
.mt { font-size: 15px; font-weight: 700; line-height: 1.4; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere }
.in { display: grid; gap: 8px }
.in textarea { width: 100%; box-sizing: border-box; min-height: 60px; max-height: 160px; padding: 10px 12px; border: 0; border-radius: 14px; background: var(--surface); font: inherit; font-size: 15px; font-weight: 700; color: var(--text); resize: none; field-sizing: content }
.in textarea:focus { outline: none; box-shadow: inset 0 0 0 2px var(--blue) }
.go { justify-self: end; height: 40px; padding: 0 20px; border: 0; border-radius: 12px; background: var(--blue); color: #fff; font: inherit; font-size: 15px; font-weight: 900; cursor: pointer } .go:disabled { opacity: .45; cursor: default }
</style>
