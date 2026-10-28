<script setup>
// Чек за месяц (карточка ученика у преподавателя): проведённые уроки, итог; «Скачать» — картинкой PNG, «В Telegram» — текстом в выбранный чат.
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useTelegram } from '../composables/useTelegram'
import { fmtMoney } from '../utils/price'
import { monthTitle, lineDate, receiptTotal, receiptCount, receiptText, receiptPng, receiptFile } from '../utils/receipt'
const props = defineProps({ receipt: { type: Object, required: true } })
const emit = defineEmits(['close'])
const { shareText, saveFile, haptic, notify } = useTelegram()
const r = computed(() => props.receipt)
const busy = ref(false)
async function download() {
  if (busy.value) return; busy.value = true
  try { await saveFile(await receiptPng(r.value, getComputedStyle(document.body).fontFamily), receiptFile(r.value)); haptic('light') }
  catch { notify('Не удалось сохранить чек') } finally { busy.value = false }
}
const send = () => { haptic('light'); shareText(receiptText(r.value)) }
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <!-- Компактно, как в Telegram: шапка, чек «на бумаге», внизу две кнопки -->
    <div class="sheet-box rs" role="dialog" aria-modal="true" aria-label="Чек за месяц">
      <div class="hd">
        <span class="ri"><AppIcon name="receipt" :size="22" /></span>
        <div class="tt"><b>Чек · {{ monthTitle(r.month) }}</b><small>{{ r.student }} · {{ receiptCount(r) }}</small></div>
        <button class="x" aria-label="Закрыть" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
      </div>
      <div class="paper">
        <div v-for="(l, i) in r.lines" :key="i" class="ln"><span>{{ lineDate(l) }}</span><i /><b>{{ fmtMoney(l.price) }}</b></div>
        <div class="tot"><span>Итого</span><b>{{ fmtMoney(receiptTotal(r)) }}</b></div>
      </div>
      <div class="ft">
        <button class="act" :disabled="busy" @click="download"><AppIcon name="download" :size="18" /> Скачать</button>
        <button class="act tg" @click="send"><AppIcon name="send" :size="18" /> В Telegram</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-box.rs { max-width: 400px; padding: 0; gap: 0; display: block }
.hd { display: flex; align-items: center; gap: 12px; padding: 14px 10px 12px 16px; border-bottom: 1px solid var(--border) }
.ri { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--green); color: #fff }
.tt { flex: 1; display: grid; min-width: 0 } .tt b { font-size: 17px } .tt small { font-size: 12px; font-weight: 600; color: var(--hint) }
.x { flex: none; align-self: flex-start; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
/* Чек «на бумаге»: строки с точками до цены, итог крупно */
.paper { display: grid; gap: 2px; max-height: 46vh; overflow-y: auto; margin: 12px 14px; padding: 10px 14px 12px; border-radius: 14px; background: var(--surface) }
.ln { display: flex; align-items: baseline; gap: 6px; padding: 4px 0; font-size: 14px; font-weight: 700 }
.ln span { flex: none; color: var(--text) } .ln i { flex: 1; min-width: 8px; border-bottom: 2px dotted var(--border) } .ln b { flex: none; font-weight: 800 }
.tot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--hint-2); font-size: 16px; font-weight: 900 }
.tot b { font-size: 22px; color: var(--green-d) }
.ft { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 14px calc(14px + var(--safe-b, 0px)) }
.act { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border: 0; border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; font-size: 15px; font-weight: 800; cursor: pointer }
.act:hover { filter: brightness(.97) } .act:disabled { opacity: .5; cursor: default }
.act.tg { background: var(--blue); color: #fff }
</style>
