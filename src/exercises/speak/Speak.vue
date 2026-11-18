<script setup>
// «Повтори за диктором»: видео или фото с фразой подписью (без фото — фраза плашкой), «Ещё раз», микрофон, «Перевести».
// Пока ученик говорит, сказанное видно строкой, слова фразы зеленеют; совпало — «Верно!» (распознавание — в LessonPlayer).
// Один шаблон и для ученика, и для правки (p.edit): фраза правится прямо в подписи, кнопки ученика — те же, бледно (в правке не нажимаются).
// Перевод — в подвале правки, фото или видео без него — тоже там. part: body / fb / tools.
import ExHead from '../parts/ExHead.vue'
import ExMedia from '../parts/ExMedia.vue'
import ExAudio from '../parts/ExAudio.vue'
import ExText from '../parts/ExText.vue'
import ExTool from '../parts/ExTool.vue'
import ExPop from '../parts/ExPop.vue'
import { usePlay, useEdit } from '../ctx'
import J from './speak.json'
defineProps({ step: { type: Object, required: true }, part: { type: String, default: 'body' } })
const p = usePlay(), ed = useEdit()
const pcm = (s) => ['video', 'image'].map(k => ed.pct(s, k)).find(v => v != null) ?? null
</script>

<template>
  <template v-if="part === 'body'">
    <ExHead :step="step" :def="J.head" />
    <div class="nw">
      <ExMedia :step="step" :controls="p.edit" :autoplay="!p.single && !p.embedded" :vref="p.setVid" :audio="step.video ? false : { add: '＋ Аудио' }" @vclick="p.again">
        <ExText v-if="p.edit || step.phrase" v-model="step.phrase" class="cap" :class="{ up: !step.video && (step.audio || p.edit) }" ph="Hello!">
          <template v-if="p.said"><template v-for="(x, k) in p.said.words" :key="k"><b :class="{ hit: x.ok, miss: p.st.done && !p.rec.on && !x.ok }">{{ x.w }}</b>{{ ' ' }}</template></template><template v-else>{{ step.phrase }}</template>
        </ExText>
      </ExMedia>
      <template v-if="!step.video && !step.image">
        <ExAudio v-if="p.edit || step.audio" :step="step" at="plain" add="＋ Аудио — нажмите или перетащите" />
        <ExText v-if="p.edit || step.phrase" v-model="step.phrase" tag="p" class="q" ph="Hello!">
          <template v-if="p.said"><template v-for="(x, k) in p.said.words" :key="k"><b :class="{ hit: x.ok, miss: p.st.done && !p.rec.on && !x.ok }">{{ x.w }}</b>{{ ' ' }}</template></template><template v-else>{{ step.phrase }}</template>
        </ExText>
      </template>
    </div>
    <p v-if="!p.edit && p.st.showTr && step.tr" class="trl">{{ step.tr }}</p>
    <div class="acts" :class="{ ro: p.edit }" :title="p.edit ? 'Так кнопки увидит ученик — в правке они не нажимаются' : null">
      <button type="button" class="act" @click="p.again"><i><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg></i>Ещё раз</button>
      <button type="button" class="act big" :class="{ on: p.rec.on }" @click="p.recToggle"><i><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg></i>{{ p.rec.on ? 'Стоп' : 'Нажми и повтори' }}</button>
      <button type="button" class="act" :disabled="!p.edit && !step.tr" @click="p.st.showTr = !p.st.showTr"><i><svg viewBox="0 0 24 24"><path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5M6 10c1 2 3 3.5 5 4.5M13 20l4-9 4 9M14.5 17h5" /></svg></i>Перевести</button>
    </div>
    <!-- что услышали — всегда одна строка одной высоты: окно не растёт (18.11.2026); запись себя не показываем -->
    <p v-if="p.edit" class="said" title="Тут ученик увидит, что сказал; засчитывается, когда фраза совпала"><small>Нажмите микрофон и повторите</small><span>—</span></p>
    <p v-else class="said" :class="{ live: p.rec.on, bad: !p.rec.on && (p.rec.miss || p.rec.err), ok: p.st.done && !p.rec.on }"><small>{{ p.rec.on ? 'Слушаю…' : p.rec.err ? p.rec.err : p.rec.miss ? 'Не совпало — послушайте и скажите ещё раз' : p.st.done ? 'Вы сказали' : 'Нажмите микрофон и повторите' }}</small><span>{{ p.rec.heard || (p.rec.on ? '…' : '—') }}</span></p>
  </template>
  <template v-else-if="part === 'fb' && p.st.done">
    <b>Верно!</b><small v-if="step.tr">{{ step.tr }}</small>
  </template>
  <template v-else-if="part === 'tools'">
    <ExTool v-if="!step.video && !step.image" title="Видео или фото (16:9)" @click="ed.pick(step, ['video', 'image'])">＋ Фото{{ pcm(step) != null ? ' ' + pcm(step) + '%' : '' }}</ExTool>
    <ExPop v-model="step.tr" label="Перевод" hint="Перевод — ученик увидит по кнопке «Перевести»" ph="Привет!" />
  </template>
</template>

<style scoped>
.nw { width: 100%; max-width: 380px; align-self: center; display: grid }
.q { margin: 0; padding: 14px; border-radius: 14px; background: #f1f6ff; text-align: center; font-size: 20px; font-weight: 900 }
.cap { position: absolute; left: 50%; bottom: 12px; z-index: 3; transform: translateX(-50%); padding: 4px 12px; border-radius: 6px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 15px; font-weight: 700; white-space: nowrap }
.cap.up { bottom: 52px }          /* подпись над синей плашкой звука, а не под ней */
.cap :deep(.exf) { min-width: 6ch; text-align: center; white-space: nowrap } .cap :deep(.exf:focus) { background: rgba(0, 0, 0, .25) } .cap :deep(.exf::placeholder) { color: rgba(255, 255, 255, .6) }
.cap b, .q b { font-weight: inherit; transition: color .15s } .cap b.hit { color: #8ff0c8 } .q b.hit { color: #1fbe78 } .cap b.miss { color: #ffb4b4 } .q b.miss { color: var(--red-d, #c33) }
.trl { margin: 0; text-align: center; color: var(--hint); font-size: 14px; font-weight: 600 }
.acts { display: flex; justify-content: center; align-items: flex-start; gap: 22px; margin-top: 4px }
.acts.ro { opacity: .45; pointer-events: none }
.act { display: grid; grid-template-rows: auto 30px; align-content: start; justify-items: center; gap: 6px; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: #1a73e8; cursor: pointer; padding: 0; width: 84px }
.act i { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid #c9dcfb; background: var(--card) }
.act svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round }
.act.big i { width: 60px; height: 60px; background: #1a73e8; border-color: #1a73e8; color: #fff } .act.big svg { width: 26px; height: 26px }
.act.on i { background: var(--red); border-color: var(--red); animation: pulse 1s infinite } .act:disabled { opacity: .4; cursor: default }
@keyframes pulse { 50% { box-shadow: 0 0 0 8px rgba(255, 75, 75, .18) } }
.said { display: grid; gap: 2px; width: 100%; max-width: 380px; height: 54px; align-self: center; align-content: center; margin: 0; padding: 0 12px; box-sizing: border-box; border-radius: 12px; background: #eef4ff; color: #1f3f86; font-size: 15px; font-weight: 700; text-align: center }
.said span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis } .said.bad { background: #fdecec } .said.bad small { color: var(--red-d, #c33) } .said.ok { background: #e3f8ee } .said.ok small { color: var(--green-d, #3a9a00) }
.said small { font-size: 10px; font-weight: 800; color: var(--hint); text-transform: uppercase; letter-spacing: .4px } .said.live small { color: #1a73e8 }
@media (min-width: 900px) {
  .lp:not(.embedded):not(.single) .nw { max-width: 700px }
  .lp:not(.embedded):not(.single) .q { font-size: 24px; padding: 20px }
}
</style>
