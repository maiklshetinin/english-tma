<script setup>
// «Ответь на вопрос» (и книжный «Answer the questions about you»): фото и вопрос, подсказка по ссылке;
// ответ голосом или письменно, без проверки — после ответа снизу пример ответа. «Как в учебнике» — сразу пишем, как в книге.
// Один шаблон и для ученика, и для правки (p.edit): вопрос и подсказка правятся в голубой карточке, кнопки ученика — те же, бледно.
// Пример ответа и «＋ Фото» — в подвале правки. part: body / fb / tools.
import { computed } from 'vue'
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExTool from '../parts/ExTool.vue'
import ExPop from '../parts/ExPop.vue'
import { usePlay, useEdit } from '../ctx'
import J from './answer.json'
const props = defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const page = computed(() => !!props.step.bk && props.step.bs === 'page')
const media = computed(() => !!(props.step.video || props.step.image))
const pcm = () => ['video', 'image'].map(k => ed.pct(props.step, k)).find(v => v != null) ?? null
const MIC = 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21', PEN = 'M4 20l1-4L16 5l3 3L8 19z'
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div class="nw">
      <ExMedia :step="step" joined />
      <div v-if="!p.edit" class="word" :class="{ joined: media }"><b class="qq">{{ step.text || '…' }}</b>
        <template v-if="step.note"><button v-if="!p.st.hint" class="lnk" @click="p.st.hint = true">Показать подсказку</button><span v-else>{{ step.note }}</span></template></div>
      <div v-else class="word" :class="{ joined: media }">
        <textarea v-model="step.text" class="exf vqq" rows="1" placeholder="What’s your name?" @input="ed.changed()" />
        <input v-model="step.note" class="exf vhn" placeholder="Подсказка (необязательно) — у ученика по ссылке" @input="ed.changed()" />
      </div>
    </div>
    <template v-if="!p.edit">
      <template v-if="!p.st.mode">
        <p class="how">Как ты хочешь выполнить это упражнение?</p>
        <div class="two"><button class="out" @click="p.st.mode = 'say'"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path :d="MIC" /></svg>Говорить</button>
          <button class="out" @click="p.st.mode = 'write'"><svg viewBox="0 0 24 24"><path :d="PEN" /></svg>Письменно</button></div>
      </template>
      <div v-else-if="p.st.mode === 'say'" class="acts">
        <button class="act big" :class="{ on: p.rec.on }" @click="p.recToggle"><i><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path :d="MIC" /></svg></i>{{ p.rec.on ? 'Стоп' : 'Нажми и говори' }}</button>
      </div>
      <div v-else class="wr2"><textarea v-model="p.st.text" rows="3" placeholder="Напиши ответ по-английски" :readonly="p.st.done" /><button v-if="!p.st.done" class="out" :disabled="!p.st.text.trim()" @click="p.sendText">Отправить</button></div>
      <p v-if="p.st.mode === 'say'" class="said" :class="{ live: p.rec.on, bad: !p.rec.on && p.rec.err, ok: p.st.done && !p.rec.on }"><small>{{ p.rec.on ? 'Слушаю…' : p.rec.err ? p.rec.err : p.st.done ? 'Ваш ответ' : 'Нажмите микрофон и говорите' }}</small><span>{{ p.rec.heard || (p.rec.on ? '…' : '—') }}</span></p>
    </template>
    <template v-else-if="page">
      <div class="vwr" title="Тут ученик пишет ответ — как в книге, на пунктире">Напиши ответ по-английски</div>
      <span class="vsend" title="Так кнопку увидит ученик">Отправить</span>
    </template>
    <template v-else>
      <p class="how">Как ты хочешь выполнить это упражнение?</p>
      <div class="two ro" title="Так кнопки увидит ученик — в правке они не нажимаются"><span class="out"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path :d="MIC" /></svg>Говорить</span><span class="out"><svg viewBox="0 0 24 24"><path :d="PEN" /></svg>Письменно</span></div>
    </template>
  </template>
  <template v-else-if="part === 'fb' && p.st.done && step.tr">
    <small>Пример ответа</small><span class="fs">{{ step.tr }}</span>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="!media" title="Видео или фото к вопросу" @click="ed.pick(step, ['video', 'image'])">＋ Фото{{ pcm() != null ? ' ' + pcm() + '%' : '' }}</ExTool>
    <ExPop v-model="step.tr" label="Пример ответа" hint="Пример ответа — ученик увидит после своего" ph="My name’s Anna." multi />
  </template>
</template>

<style scoped>
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.word { position: relative; display: grid; justify-items: center; gap: 4px; padding: 12px; border-radius: 12px; background: #f1f6ff; text-align: center }
.word.joined { border-radius: 0 0 12px 12px }
.word span { font-size: 12px; color: var(--hint); font-weight: 600 }
.qq { font-size: 15px !important; font-weight: 600 !important }          /* как было: и у «Как в учебнике» вопрос 15/600 */
.lnk { border: 0; background: none; padding: 0; color: #1a73e8; text-decoration: underline; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer }
.how { margin: 4px 0 0; text-align: center; font-size: 13px; font-weight: 600 }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 380px; align-self: center }
.two.ro { opacity: .45; pointer-events: none }
.out { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1.5px solid #1a73e8; border-radius: 22px; background: var(--card); color: #1a73e8; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.out svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round } .out:disabled { opacity: .45; cursor: default }
.wr2 { display: grid; gap: 8px; width: 100%; max-width: 380px; align-self: center } .wr2 .out { justify-self: end }
.wr2 textarea { resize: none; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; font: inherit; font-size: 15px; outline: none } .wr2 textarea:focus { border-color: #1a73e8 }
.acts { display: flex; justify-content: center; align-items: flex-start; gap: 22px; margin-top: 4px }
.act { display: grid; grid-template-rows: auto 30px; align-content: start; justify-items: center; gap: 6px; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: #1a73e8; cursor: pointer; padding: 0; width: 84px }
.act i { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid #c9dcfb; background: var(--card) }
.act svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.act.big i { width: 60px; height: 60px; background: #1a73e8; border-color: #1a73e8; color: #fff } .act.big svg { width: 26px; height: 26px }
.act.on i { background: var(--red); border-color: var(--red); animation: pulse 1s infinite }
@keyframes pulse { 50% { box-shadow: 0 0 0 8px rgba(255, 75, 75, .18) } }
.said { display: grid; gap: 2px; width: 100%; max-width: 380px; height: 54px; align-self: center; align-content: center; margin: 0; padding: 0 12px; box-sizing: border-box; border-radius: 12px; background: #eef4ff; color: #1f3f86; font-size: 15px; font-weight: 700; text-align: center }
.said span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis } .said.bad { background: #fdecec } .said.bad small { color: var(--red-d, #c33) } .said.ok { background: #e3f8ee } .said.ok small { color: var(--green-d, #3a9a00) }
.said small { font-size: 10px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .4px } .said.live small { color: #1a73e8 }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .nw, .lp:not(.embedded):not(.single) .two, .lp:not(.embedded):not(.single) .wr2 { max-width: 700px }
  .lp:not(.embedded):not(.single) .word { padding: 18px } .lp:not(.embedded):not(.single) .word span { font-size: 15px }
}
/* книжные */
.lp.book .word { background: #f1efe8 }
.lp.book.bkpg .word { padding: 0; justify-items: start; background: none; text-align: left }
.lp.book.bkpg .wr2 textarea { border: 0; border-bottom: 1.5px dotted #231f20; border-radius: 0; background: none; box-shadow: none; padding: 4px 0; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; font-size: 16px; color: #1f5fbf; resize: none; line-height: 1.8 }
.lp.book.bkpg .wr2 textarea::placeholder { font-family: Arial, sans-serif; font-size: 13px; color: #b4b2a9 }
.lp.book.bkpg .wr2 .out { align-self: flex-start }
/* правка: вопрос и подсказка — в голубой карточке на месте текста ученика */
.vqq { font-size: 15px; font-weight: 600; line-height: normal }
.vhn { width: 80%; font-size: 12px; font-weight: 600; color: #1a73e8; line-height: normal }
.lp.book .vqq { line-height: 21px } .lp.book .vhn { line-height: 17px; padding: 0 }
.lp.book.bkpg .vqq { text-align: left; font-size: 15px; font-weight: 600 } .lp.book.bkpg .vhn { width: 100%; text-align: left }
.vwr { padding: 4px 0; border-bottom: 1.5px dotted #231f20; color: #b4b2a9; font-size: 13px; text-align: left }
.lp.book.bkpg .vwr { height: 95px; box-sizing: border-box; margin-bottom: 4px }
.vsend { align-self: flex-end; display: grid; place-items: center; width: 101px; height: 40px; box-sizing: border-box; border: 1.5px solid #c9dcfb; border-radius: 99px; color: #1a73e8; font-size: 14px; font-weight: 800; opacity: .45 }
</style>
