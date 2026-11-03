<script setup>
// Окно подтверждения / сообщения / ввода (composables/useDialog.js) — в стиле приложения и Telegram.
import { nextTick, watch, ref, onMounted, onUnmounted } from 'vue'
import { dialog, closeDialog } from '../composables/useDialog'
const input = ref(null), okBtn = ref(null)
watch(() => dialog.open, (v) => { if (v) nextTick(() => (dialog.kind === 'text' ? input.value?.select() : okBtn.value?.focus())) })
const onKey = (e) => {
  if (!dialog.open) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeDialog(false) }
  if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); closeDialog(true) }
}
onMounted(() => addEventListener('keydown', onKey, true)); onUnmounted(() => removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="dlg">
    <div v-if="dialog.open" class="dov" @pointerdown.self="closeDialog(false)">
      <div class="dlg" role="alertdialog" aria-modal="true" :aria-label="dialog.title">
        <h3>{{ dialog.title }}</h3>
        <p v-if="dialog.text">{{ dialog.text }}</p>
        <input v-if="dialog.kind === 'text'" ref="input" v-model="dialog.value" class="din" :placeholder="dialog.placeholder" />
        <div class="dbtns">
          <button v-if="dialog.kind !== 'say'" class="btn" @click="closeDialog(false)">{{ dialog.cancel }}</button>
          <button ref="okBtn" class="btn" :class="dialog.danger ? 'danger' : 'primary'" @click="closeDialog(true)">{{ dialog.ok }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dov { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .4) }
.dlg { width: min(360px, 100%); box-sizing: border-box; padding: 20px 20px 16px; border-radius: 16px; background: var(--card); color: var(--text); box-shadow: 0 16px 40px rgba(0, 0, 0, .22); font-family: var(--font) }
h3 { margin: 0 0 6px; font-size: 17px; font-weight: 800; line-height: 1.3 }
p { margin: 0 0 4px; font-size: 14px; font-weight: 600; line-height: 1.4; color: var(--hint) }
.din { width: 100%; box-sizing: border-box; margin: 10px 0 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); font: inherit; font-size: 15px; color: var(--text); outline: none }
.din:focus { border-color: var(--blue) }
.dbtns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px }
.dbtns .btn { padding: 10px 18px; font-size: 15px }
@media (max-width: 480px) { .dbtns .btn { flex: 1 } }      /* на телефоне — кнопки во всю ширину, как в Telegram */
.dlg-enter-active, .dlg-leave-active { transition: opacity .15s } .dlg-enter-active .dlg, .dlg-leave-active .dlg { transition: transform .15s }
.dlg-enter-from, .dlg-leave-to { opacity: 0 } .dlg-enter-from .dlg { transform: scale(.96) }
</style>
