<script setup>
// Миниатюра экрана — та же, что в меню «Exercise» конструктора (CourseEditor → .mini): по id шаблона (TEMPLATES в utils/lesson.ts).
// size: 'tray' — как в меню «Exercise»; 'rail' — на ветке урока над экраном (17.11.2026, вместо кружка с номером)
import { computed } from 'vue'
import { BOOK } from '../utils/lesson'
const props = defineProps({ id: { type: String, required: true }, size: { type: String, default: 'tray' } })
const bid = computed(() => props.id.replace(/^pg_/, ''))          // «Учебник 1:1» (pg_…) — та же миниатюра, что у Настиного типа, но белая
const page = computed(() => props.id.startsWith('pg_'))
</script>
<template>
  <!-- Тест · упражнения Насти: миниатюра — как задание в учебнике (номер в оранжевом кружке, задание по-английски, строчки с пунктиром) -->
  <span v-if="BOOK[bid]" class="mini bkm" :class="[size, { page }]">
    <span class="bh"><b>{{ BOOK[bid].n }}</b><em>{{ BOOK[bid].en }}</em></span>
    <span v-if="BOOK[bid].pic" class="bpic" />
    <template v-if="bid === 'sort'"><span class="btb"><i v-for="h in ['-s', '-es', '-ies', '-ves', 'other']" :key="h">{{ h }}</i></span><span class="btb e"><i v-for="k in 5" :key="k" /></span></template>
    <template v-else-if="bid === 'odd'"><span class="br">potato / biscuit / <u>sugar</u> / cherry</span><span class="br">coffee / egg / apple / banana</span></template>
    <template v-else-if="bid === 'bkpick'"><span class="br">Pat cooks dinner <b>now</b> / <u>in the evening</u>.</span><span class="br">Alex is wearing <b>today</b> / <b>on</b>…</span></template>
    <template v-else-if="bid === 'bkpic'"><span class="br">on · between · <s>in</s> · at · under</span><span class="br">They’re <i class="dt">in</i> the car.</span></template>
    <template v-else-if="bid === 'bkqa'"><span class="br">Is he a teacher?</span><span class="br"><i class="dt">Yes, he is.</i></span></template>
    <template v-else-if="bid === 'bkword'"><span class="br"><b>(He)</b> <i class="dt">His</i> father is…</span><span class="br"><b>(I)</b> <i class="dt" /> sister is…</span><span class="br"><b>(They)</b> <i class="dt" /> car…</span></template>
    <template v-else-if="bid === 'brackets'"><span class="br">What <i class="dt">are you doing</i> <b>(you/do)</b>?</span><span class="br">I <i class="dt" /> <b>(write)</b> an email…</span></template>
    <template v-else-if="bid === 'translate'"><span class="br">◀) <i class="dt w" /></span><span class="br">◀) <i class="dt w" /></span></template>
    <template v-else-if="bid === 'bkfree'"><span class="br">1 Do you like pizza? <i class="dt" /></span><span class="br">2 Does your dad work…<i class="dt" /></span><span class="br">3 Do your friends go…<i class="dt" /></span></template>
  </span>
  <!-- Как в Busuu (18.11.2026): миниатюра — настоящий экран в миниатюре, с живыми словами (вариант А) -->
  <span v-else class="mini xm2" :class="[id, size]">
    <template v-if="id === 'intro'"><b class="h">Смотрите, новое слово!</b><span class="ph" style="height: 30px"><span class="pl ov"><b /><i /></span></span><span class="wc">Hello<small>Привет</small></span></template>
    <template v-else-if="id === 'tip'"><b class="h">Подсказка!</b><span class="tx">Скажи <b>see you</b>, если увидитесь</span><span class="tbl"><span><b>Hello</b>привет</span><span><b>Hi</b>дружеский</span><span><b>Hey</b>совсем просто</span></span></template>
    <template v-else-if="id === 'choice'"><b class="h">Выберите вариант</b><span class="pl"><b /><i /></span><span class="ops"><span class="op"><i class="a1" />good</span><span class="op ok"><i class="a2" />night</span><span class="op"><i class="a3" />hello</span></span></template>
    <template v-else-if="id === 'audiotest'"><b class="h">Выберите вариант</b><span class="ph" style="height: 22px"><span class="pl ov"><b /><i /></span></span><span class="rw"><span class="r">How are you?</span><span class="r ok">See you later!</span></span></template>
    <template v-else-if="id === 'fill'"><b class="h">Заполни пропуск</b><span class="ph" style="height: 24px" /><span class="s">And <span class="gp">you</span>?</span><span class="cs"><span class="ch">you</span><span class="ch">me</span></span></template>
    <template v-else-if="id === 'pairs'"><b class="h">Соедините пары</b><span class="pr"><span class="ok">hello</span><span class="ok">привет</span><span>bye</span><span>спасибо</span><span>thanks</span><span>пока</span></span></template>
    <template v-else-if="id === 'order' || id === 'spell'"><b class="h">Расставьте слова</b><span class="pl"><b /><i /></span><span class="ln"><span class="ch">See</span><span class="ch">you</span></span><span class="cs"><span class="ch">later!</span></span></template>
    <template v-else-if="id === 'type'"><b class="h">Закончи предложение</b><span class="pl"><b /><i /></span><span class="s" style="margin-top: 4px">I’m fine. And <span class="gp e">&nbsp;</span>?</span></template>
    <template v-else-if="id === 'translate'"><b class="h">Переведите фразу</b><span class="pl"><b /><i /></span><span class="s" style="margin-top: 4px"><span class="gp e" style="min-width: 70px">See you later!</span></span></template>
    <template v-else-if="id === 'sayword' || id === 'speak'"><b class="h">Повторите за диктором</b><span class="ph" style="height: 30px"><span class="cc">go ahead</span></span><span class="mic"><i /><b /><i /></span></template>
    <template v-else-if="id === 'answer'"><b class="h">Ответь на вопрос</b><span class="ph" style="height: 24px" /><span class="wc q">What’s your name?</span><span class="two"><span>Сказать</span><span>Написать</span></span></template>
    <template v-else><span class="ms"><i /><i /><i /></span></template>
  </span>
</template>
<style scoped>
.mini .mm { position: relative; display: block } .mini .mm .ma { position: absolute; left: 8%; right: 8%; bottom: 3px; width: auto; height: 5px; background: #1a73e8 } .mini .mm.sm { height: 24px }
.mini .mr { display: grid; gap: 3px; width: 100% } .mini .mr i { height: 7px; border: 1px solid #e3e3e3; background: var(--card) } .mini .mr i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mc { display: flex; gap: 3px; justify-content: center; width: 100% } .mini .mc i.l { width: 9px }          /* «Собери слово» — плашки-буквы */ .mini .mc i { width: 18px; height: 8px; border: 1px solid #d5d5d5; background: var(--card) } .mini .mc i.o { border-color: #1a73e8 }
.mini .mc.ln { justify-content: flex-start; padding-bottom: 3px; border-bottom: 1.5px solid #e3e3e3 }
.mini .ml.s { width: 60% } .mini .mq.t { gap: 0 } .mini .mq.t i { height: 7px; border-radius: 0 }
.mini .cp { position: absolute; left: 50%; bottom: 3px; width: 26px; height: 5px; margin-left: -13px; border-radius: 2px; background: rgba(0, 0, 0, .55) }
.mini .mk { display: flex; gap: 6px; align-items: center } .mini .mk i { width: 9px; height: 9px; border-radius: 50%; border: 1px solid #c9dcfb; background: var(--card) } .mini .mk i.b { width: 13px; height: 13px; background: #1a73e8; border-color: #1a73e8 }
.mini .mg { display: flex; gap: 4px; align-items: flex-end; justify-content: center; width: 100%; margin-top: 3px } .mini .mg i { width: 28px; height: 5px; background: #cfcfcf } .mini .mg i.d { width: 26px; height: 2px; background: none; border-bottom: 2px dotted #1a73e8; border-radius: 0 }
.mini .mn { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; width: 100% } .mini .mn i { height: 8px; border: 1px solid #1a73e8; border-radius: 5px; background: var(--card) }
/* мини-окошко экрана */
.mini { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 150px; height: 104px; box-sizing: border-box; padding: 8px 12px; border: 1px solid #e3e3e3; border-radius: 10px; background: var(--card); transition: transform .15s, box-shadow .15s }
.mini i { display: block; border-radius: 3px; background: #e9e9e9 }
.mini .mp { width: 60px; height: 4px; background: linear-gradient(90deg, #1fbe78 45%, #e6e6e6 45%) }
.mini .mh { width: 70px; height: 5px; background: #cfcfcf }
.mini .mm { width: 100%; height: 30px; border-radius: 5px; background: #8fb8e8 } .mini .mw { width: 90%; height: 10px; background: #e6f0ff } .mini .ml { width: 80%; height: 4px }
.mini .ma { width: 100%; height: 8px; border-radius: 5px; background: #1cb0f6 }
.mini .mo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; width: 100% } .mini .mo i { height: 30px; border: 1px solid #e3e3e3; background: var(--surface) } .mini .mo i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mq { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: 100% } .mini .mq i { height: 11px; border: 1px solid #e3e3e3; background: var(--card) } .mini .mq i.g { background: #8ff0c8; border-color: #5fe0aa }
.mini .mb { position: absolute; right: 8px; bottom: 7px; width: 34px; height: 9px; border-radius: 5px; background: #1cb0f6 }
.mini.lesson { background: none; border: 0; padding: 4px } .mini.lesson .mp, .mini.lesson .mb { display: none }
.mini .ms { position: relative; width: 120px; height: 90px } .mini .ms i { position: absolute; width: 84px; height: 62px; border: 1px solid #e3e3e3; border-radius: 8px; background: var(--card); box-shadow: 0 2px 5px rgba(0, 0, 0, .08) }
.mini .ms i:nth-child(1) { left: 0; top: 0; background: linear-gradient(#fff 20%, #8fb8e8 20% 60%, #fff 60%) } .mini .ms i:nth-child(2) { left: 18px; top: 13px; background: linear-gradient(#fff 35%, #8ff0c8 35% 70%, #fff 70%) } .mini .ms i:nth-child(3) { left: 36px; top: 26px; background: radial-gradient(circle at 50% 40%, #ffc800 12px, #fff 13px) }
/* размер «как в меню Exercise» (CourseEditor → .tray.inter .mini) */
.mini.tray, .mini.rail { width: 112px; height: 86px; padding: 6px 9px 16px; gap: 4px; overflow: hidden }
.mini.tray .mb, .mini.rail .mb { right: 6px; bottom: 5px; width: 26px; height: 7px }
.mini.lesson { overflow: visible } .mini .ms { transform: scale(.82); transform-origin: top center }
/* книжные и «Переведи фразу» / «Раскрой скобки» (17.11.2026) */
.mini .mg i.d.w { width: 70px }
.mini .mg i.bx { width: 22px; height: 9px; border: 1px solid #1a73e8; border-radius: 3px; background: var(--card) } .mini .mg i.bh { width: 18px; height: 5px; background: #8fb8e8 }
.mini .mt { display: flex; gap: 3px; justify-content: center; width: 100% } .mini .mt i { width: 18px; height: 7px; border-radius: 4px }
.mini .mt.q { display: grid; grid-template-columns: 1fr 1fr; gap: 4px } .mini .mt.q i { width: auto; height: 20px; border-radius: 5px } .mini .mt i.s { box-shadow: 0 0 0 1.5px #1fbe78 }
.mini .mt i.o { background: #fbe1c8 } .mini .mt i.g { background: #cfeccf } .mini .mt i.y { background: #fbedb0 } .mini .mt i.p { background: #f8d3e2 } .mini .mt i.b { background: #cfe6f7 }
.mini .mcol { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: 100% } .mini .mcol i { height: 32px; border: 1px dashed #c9dcfb; border-radius: 5px; background: #f6faff }
/* Тест · упражнения Насти — как страница учебника */
.mini.bkm { align-items: stretch; gap: 3px; padding: 6px 7px; background: #fffdf6; border-color: #eadfc4; font-family: Arial, Helvetica, sans-serif; color: #2c2c2a; text-align: left }
.bkm .bh { display: flex; align-items: flex-start; gap: 4px; font-size: 8px; font-weight: 700; line-height: 1.15 }
.bkm .bh b { flex: none; display: grid; place-items: center; width: 13px; height: 13px; border-radius: 50%; background: #f0997b; color: #4a1b0c; font-size: 7.5px }
.bkm .bh em { font-style: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.bkm .br { font-size: 7px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .bkm .br b { font-weight: 700 } .bkm .br u { color: #185fa5 } .bkm .br s { color: #185fa5 }
.bkm i.dt { display: inline-block; min-width: 22px; border-bottom: 1px dotted #2c2c2a; color: #185fa5; font-style: italic; vertical-align: bottom; background: none; border-radius: 0 } .bkm i.dt.w { width: 70% }
.bkm .bpic { flex: none; height: 22px; border-radius: 3px; background: linear-gradient(135deg, #f6c99a, #8fb8e8 60%, #9fd28a) }
.bkm .btb { display: grid; grid-template-columns: repeat(5, 1fr); font-size: 6px; text-align: center } .bkm .btb i { background: #378add; color: #fff; font-style: normal; border-radius: 0; padding: 1px 0 }
.bkm .btb.e i { height: 6px; background: none; border-bottom: .5px solid #85b7eb }

/* ---- Как в Busuu: мини-скриншот (вариант А, 18.11.2026) ---- */
.mini.xm2 { align-items: center; gap: 4px; padding: 6px 7px; font-family: var(--font); color: var(--text); text-align: center }
.mini.xm2.tray, .mini.xm2.rail { padding: 6px 7px }
.xm2 .h { font-size: 7.5px; font-weight: 800; white-space: nowrap; color: var(--text) }
.xm2 .ph { position: relative; flex: none; display: block; width: 100%; border-radius: 4px; background: linear-gradient(135deg, #f6c99a, #e4a77a 45%, #8fb8e8) }
.xm2 .ph::after { content: ''; position: absolute; left: 42%; top: 20%; width: 16%; height: 42%; border-radius: 50% 50% 40% 40%; background: #5f5e5a; opacity: .5 }
.xm2 .pl { flex: none; display: flex; align-items: center; gap: 3px; width: 100%; height: 9px; padding: 0 3px; border-radius: 5px; background: #1a73e8; box-sizing: border-box }
.xm2 .pl.ov { position: absolute; left: 8%; right: 8%; bottom: 3px; width: auto; z-index: 1 }
.xm2 .pl b { width: 0; height: 0; border-left: 4px solid #fff; border-top: 2.5px solid transparent; border-bottom: 2.5px solid transparent; background: none } .xm2 .pl i { flex: 1; height: 1.5px; border-radius: 1px; background: rgba(255, 255, 255, .6) }
.xm2 .wc { display: block; width: 100%; padding: 1px 0; border-radius: 0 0 4px 4px; background: #e6f1fb; color: #0c447c; font-size: 8px; font-weight: 800; line-height: 1.3 } .xm2 .wc small { display: block; font-size: 6px; font-weight: 600; color: #185fa5 }
.xm2 .wc.q { border-radius: 3px; font-size: 7px }
.xm2 .tx { font-size: 6.5px; line-height: 1.3; text-align: left; width: 100% } .xm2 .tx b { font-weight: 800 }
.xm2 .tbl { display: grid; width: 100%; border: .5px solid #d3d1c7; border-radius: 3px; font-size: 6px } .xm2 .tbl span { display: grid; grid-template-columns: auto 1fr; gap: 3px; padding: 1px 3px; text-align: left } .xm2 .tbl span + span { border-top: .5px solid #e9e9e9 } .xm2 .tbl b { font-weight: 800 }
.xm2 .ops { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; width: 100% } .xm2 .op { overflow: hidden; border: .5px solid #d3d1c7; border-radius: 3px; background: var(--card); font-size: 5.5px; font-weight: 700 } .xm2 .op i { display: block; height: 16px; border-radius: 0 } .xm2 .op.ok { border-color: #1fbe78; box-shadow: 0 0 0 1px #1fbe78 }
.xm2 .a1 { background: #f6c99a } .xm2 .a2 { background: #9fd28a } .xm2 .a3 { background: #8fb8e8 }
.xm2 .rw { display: grid; gap: 2px; width: 100% } .xm2 .r { padding: 2px 0; border: .5px solid #d3d1c7; border-radius: 3px; font-size: 6.5px; font-weight: 700 } .xm2 .r.ok { background: #e1f5ee; border-color: #5dcaa5; color: #085041 }
.xm2 .pr { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: 100% } .xm2 .pr span { padding: 3px 0; border: .5px solid #d3d1c7; border-radius: 3px; font-size: 6.5px; font-weight: 700 } .xm2 .pr .ok { background: #e1f5ee; border-color: #5dcaa5; color: #085041 }
.xm2 .ln { display: flex; gap: 2px; width: 100%; min-height: 12px; padding-bottom: 2px; border-bottom: 1px solid #d3d1c7 }
.xm2 .ch { padding: 1px 3px; border: .5px solid #d3d1c7; border-radius: 3px; background: var(--card); font-size: 6.5px; font-weight: 700 }
.xm2 .cs { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px }
.xm2 .s { font-size: 8px; font-weight: 700 } .xm2 .gp { display: inline-block; min-width: 20px; border-bottom: 1px dotted #1a73e8; color: #1a73e8; font-size: 7px; text-align: center } .xm2 .gp.e { min-width: 24px }
.xm2 .mic { display: flex; align-items: center; gap: 6px } .xm2 .mic i { width: 9px; height: 9px; border: .5px solid #85b7eb; border-radius: 50%; background: var(--card) } .xm2 .mic b { display: grid; place-items: center; width: 15px; height: 15px; border-radius: 50%; background: #1a73e8 } .xm2 .mic b::after { content: ''; width: 3px; height: 6px; border-radius: 2px; background: #fff }
.xm2 .two { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: 100% } .xm2 .two span { padding: 2px 0; border: .5px solid #1a73e8; border-radius: 6px; color: #185fa5; font-size: 6px; font-weight: 700 }
.xm2 .cc { position: absolute; left: 50%; bottom: 3px; z-index: 1; padding: 0 3px; border-radius: 2px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 5.5px; white-space: nowrap; transform: translateX(-50%) }
.bkm > * { flex: none } .bkm .bpic { height: 16px } .bkm .br { line-height: 1.4; min-height: 10px }          /* строчки не сжимаются и не обрезаются по высоте */
.mini.bkm.page { background: #fff; border-color: #d3d1c7 } .bkm.page .bh b { border: 1px solid #d85a30 }          /* «Учебник 1:1» — белая страница */
</style>
