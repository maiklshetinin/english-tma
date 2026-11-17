<script setup>
// Миниатюра экрана — та же, что в меню «Exercise» конструктора (CourseEditor → .mini): по id шаблона (TEMPLATES в utils/lesson.ts).
// size: 'tray' — как в меню «Exercise»; 'rail' — на ветке урока над экраном (17.11.2026, вместо кружка с номером)
defineProps({ id: { type: String, required: true }, size: { type: String, default: 'tray' } })
</script>
<template>
  <span class="mini" :class="[id, size]"><i class="mp" />
    <template v-if="id === 'intro'"><i class="mh" /><span class="mm"><i class="ma" /></span><i class="mw" /><i class="ml" /></template>
    <template v-else-if="id === 'choice'"><i class="mh" /><i class="ma" /><span class="mo"><i /><i class="g" /><i /></span></template>
    <template v-else-if="id === 'audiotest'"><i class="mh" /><span class="mm sm"><i class="ma" /></span><span class="mr"><i /><i class="g" /><i /></span></template>
    <template v-else-if="id === 'pairs'"><i class="mh" /><span class="mq"><i class="g" /><i class="g" /><i /><i /><i /><i /></span></template>
    <template v-else-if="id === 'spell'"><i class="mh" /><i class="ma" /><span class="mc ln"><i class="l" /><i class="l" /><i class="l" /></span><span class="mc"><i class="l" /><i class="l" /><i class="l" /></span></template>
    <template v-else-if="id === 'sayword'"><i class="mh" /><span class="mm"><i class="ma" /></span><span class="mk"><i /><i class="b" /><i /></span></template>
    <template v-else-if="id === 'order'"><i class="mh" /><i class="ma" /><span class="mc ln"><i /><i /></span><span class="mc"><i /><i /><i /></span></template>
    <template v-else-if="id === 'tip'"><i class="mh" /><i class="ml" /><i class="ml s" /><span class="mq t"><i /><i /><i /><i /></span></template>
    <template v-else-if="id === 'speak'"><i class="mh" /><span class="mm"><b class="cp" /></span><span class="mk"><i /><i class="b" /><i /></span></template>
    <template v-else-if="id === 'type'"><i class="mh" /><i class="ma" /><span class="mg"><i /><i class="d" /></span></template>
    <template v-else-if="id === 'fill'"><i class="mh" /><span class="mm sm" /><span class="mg"><i class="d" /></span><span class="mc"><i /><i class="o" /></span></template>
    <template v-else-if="id === 'answer'"><i class="mh" /><span class="mm sm" /><i class="mw" /><span class="mn"><i /><i /></span></template>
    <template v-else><span class="ms"><i /><i /><i /></span></template>
    <i class="mb" />
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
</style>
