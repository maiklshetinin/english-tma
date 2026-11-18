<script setup>
// «Собери фразу»: слова вразброс — ученик ставит их на линию по порядку (старые экраны by: 'letters' — слово по буквам).
// Все на линии — проверка сразу; снизу фраза, перевод и пояснение.
// Один шаблон и для ученика, и для правки (p.edit): на линии — сама фраза (правится), под линией — её плашки (ученик увидит вразброс).
// Перевод и пояснение — в подвале правки (у ученика их на экране нет). part: body / fb / tools.
import { computed } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExText from '../parts/ExText.vue'
import ExPop from '../parts/ExPop.vue'
import { usePlay } from '../ctx'
import { orderParts } from '../../utils/lesson'
import J from './order.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay()
const letters = computed(() => props.step.by === 'letters')
const pw = computed(() => orderParts(props.step))
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="letters ? 'Соберите слово по буквам' : J.head" />
    <ExMedia :step="step" xm />
    <ExAudio v-if="p.edit || step.audio" :step="step" at="row" add="＋ Аудио — нажмите или перетащите" />
    <template v-if="!p.edit">
      <div v-if="pw.length < 2" class="empty">{{ letters ? 'Впишите слово хотя бы из 2 букв' : 'Впишите фразу хотя бы из 2 слов' }}</div>
      <template v-else>
        <div class="built" :class="{ ok: p.st.done && p.st.res, no: p.st.done && !p.st.res }"><button v-for="k in p.st.built" :key="'b' + k" class="chip" @click="p.back(k)">{{ pw[k] }}</button></div>
        <div class="pool"><button v-for="k in p.st.pool" :key="'p' + k" class="chip" @click="p.put(k)">{{ pw[k] }}</button></div>
      </template>
    </template>
    <template v-else>
      <div class="built ed" title="Верный ответ — ученик собирает его на этой линии"><ExText v-model="step.phrase" class="bt" :ph="letters ? 'bye' : 'See you later!'" /></div>
      <div class="pool"><span v-for="(w, k) in pw" :key="k" class="chip ro">{{ w }}</span></div>
    </template>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>{{ p.right ? 'Верно!' : 'Правильно так:' }}</b><span class="fs">{{ step.phrase }}</span><small>{{ step.tr }}</small><small v-if="step.note" class="fn">{{ step.note }}</small><small v-if="p.later" class="lt">Вернёмся к этому в конце урока</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExPop v-model="step.tr" label="Перевод" :hint="(letters ? 'Перевод слова' : 'Перевод фразы') + ' — ученик увидит после ответа'" ph="Увидимся!" />
    <ExPop v-model="step.note" label="Пояснение" hint="Пояснение после ответа (необязательно)" ph="«See you» — ждём новой встречи…" multi />
  </template>
</template>

<style scoped>
.empty { margin: 6px 0; padding: 18px; border: 1px dashed var(--border); border-radius: 12px; text-align: center; color: var(--hint); font-size: 14px; font-weight: 700 }
.built { min-height: 50px; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 8px; padding: 10px; border-bottom: 2px solid var(--border); box-sizing: border-box }
.pool { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding-top: 4px }
.chip { padding: 9px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); font: inherit; font-size: 15px; font-weight: 600; color: var(--text); cursor: pointer }
.chip:hover { border-color: #1a73e8 }
.built.ok .chip { background: #e3fbef; border-color: #8ff0c8 } .built.no .chip { background: var(--red-l); border-color: var(--red-l) }
/* правка: фраза — на линии, шрифтом плашек; плашки под линией — как увидит ученик (вразброс), не нажимаются */
.built.ed { align-content: center }
.bt { flex: 1; font-size: 15px; font-weight: 600; line-height: 1.4 }
.chip.ro { cursor: default } .chip.ro:hover { border-color: var(--border) }
@media (min-width: 900px) { .lp:not(.embedded):not(.single) .chip { font-size: 18px; padding: 11px 18px } }
</style>
