<script setup>
// Посылки — маленькая 2D-«игра» поверх приложения (useNotes: drops, aim; сервер: live.ts).
//  • Отправитель собирает посылку (чем доставить, во что упаковать, эмодзи внутрь) и нажимает на экран — туда, куда сбросить.
//  • У всех, кто в приложении, посылка прибывает вниз экрана и копится стопкой, как в тетрисе. Доставка (d.via):
//    парашют — спускается, покачиваясь; кран — тележка по балке вверху экрана привозит и опускает на крюке;
//    птица — аист еле тащит посылку на верёвке, над местом отпускает и улетает.
//  • Груз: сундук, подарок, конверт, записка-стикер (текст виден сразу, ещё в полёте) и крупные эмодзи.
//  • Адресат нажимает на посылку — сундук открывается, эмодзи из неё бьют фонтаном и падают вокруг, следом выезжает письмо;
//    «Закрыть» — посылка пропадает у всех, у отправителя «Прочитано». Свою посылку открыть нельзя — она ждёт.
// Экран не темнеет и не перекрывается: посылки живут у нижнего края, клики мимо них проходят в приложение.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { notesState as S, CARGO, noteById, openDrop, openNote } from '../composables/useNotes'
import { showToast } from '../composables/useToast'

const router = useRouter()
const FALL = { chute: 2600, crane: 3600, bird: 3800 }        // сколько длится доставка, мс (совпадает с анимациями ниже)
const now = ref(Date.now()), vw = ref(innerWidth), mobile = computed(() => vw.value < 720)
const size = computed(() => (mobile.value ? { w: 64, h: 54 } : { w: 92, h: 78 }))
const opened = ref('')                       // открытая мной посылка (письмо над ней)
let clock = 0
const onResize = () => { vw.value = innerWidth }
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 200); addEventListener('resize', onResize) })
onUnmounted(() => { clearInterval(clock); removeEventListener('resize', onResize) })

// Когда посылка впервые появилась у меня и сколько её доставки уже прошло (зашёл позже — анимация с середины, давно — сразу лежит).
// Запоминаем один раз: задержка анимации не должна меняться на ходу, иначе она дёргается и ускоряется.
const seen = new Map()
function timing(d) {
  let t = seen.get(d.id)
  if (!t) { const dur = FALL[d.via] || FALL.chute; t = { t0: Date.now(), e0: Math.min(dur, Math.max(0, Date.now() - d.at)), dur }; seen.set(d.id, t) }
  return t
}

// Стопка: по порядку прихода каждая посылка опускается в свою точку x и ложится на те, что под ней (пересекаются по ширине)
const pile = computed(() => {
  const { w, h } = size.value, placed = []
  for (const id of seen.keys()) if (!S.drops.some((d) => d.id === id)) seen.delete(id)
  for (const d of [...S.drops].sort((a, b) => a.at - b.at)) {
    const left = Math.round(Math.min(Math.max(4, d.x * vw.value - w / 2), vw.value - w - 4))
    let y = 0
    for (const p of placed) if (Math.abs(p.left - left) < w * 0.8) y = Math.max(y, p.y + h * 0.9)
    const t = timing(d), via = FALL[d.via] ? d.via : 'chute'
    placed.push({ d, left, y, via, falling: now.value - t.t0 + t.e0 < t.dur, mine: d.by.uid === S.me, cargo: CARGO.find((c) => c.id === d.cargo) || CARGO[0], delay: -t.e0 })
  }
  return placed
})
const open = computed(() => {
  const p = pile.value.find((x) => x.d.id === opened.value); if (!p) return null
  const n = noteById(p.d.note), m = n?.msgs.find((x) => x.id === p.d.mid) || n?.msgs.at(-1)
  return { ...p, n, m }
})
// Эмодзи из открытой посылки: вылетают фонтаном и ложатся на «пол» слева и справа от неё
const ROT = [-22, 14, -8, 25, -16, 6, 19, -12], SIZE = [34, 27, 38, 30, 25, 36, 29]
const bits = computed(() => {
  const o = open.value, list = o?.d.emoji || []; if (!list.length) return []
  const { w } = size.value, m = mobile.value, step = m ? 24 : 34, n = m ? 14 : 22, cx = o.left + w / 2, out = []
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / 2), side = i % 2 ? 1 : -1
    const x = Math.round(Math.min(Math.max(2, cx + side * (w / 2 + 4 + k * step) - 22), vw.value - 46))
    out.push({ i, em: list[i % list.length], x, from: cx - 22 - x, up: o.y, r: ROT[i % ROT.length], size: Math.round(SIZE[i % SIZE.length] * (m ? 0.8 : 1)), hop: (i % 3) + 1, delay: i * 45 })
  }
  return out
})
function tap(p) {
  if (p.falling) return
  if (p.mine) return showToast('Посылка ждёт, пока её откроют')
  opened.value = opened.value === p.d.id ? '' : p.d.id
}
function close() { const id = opened.value; opened.value = ''; if (id) openDrop(id) }
function reply() {
  const o = open.value; close()
  if (!o?.n) return
  if (router.currentRoute.value.fullPath !== o.n.path) router.push(o.n.path)
  setTimeout(() => openNote(o.n.id), 60)
}
// записка-стикер: её текст виден сразу, ещё в полёте
const textOf = (d) => { const n = noteById(d.note); return (n?.msgs.find((x) => x.id === d.mid) || n?.msgs.at(-1))?.text || '' }
const ini = (s) => (s || '?').trim()[0]?.toUpperCase() || '?'
const time = (at) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const base = computed(() => (mobile.value ? 'calc(78px + var(--safe-b))' : '6px'))      // на телефоне — над нижним меню
const btm = (p) => `calc(var(--base) + ${p.y}px)`
const mid = (p) => p.left + size.value.w / 2 + 'px'
// след за аистом: 'f' — перья, иначе эмодзи
const TRAIL = { chest: 'f', heart: '❤️', flowers: '🌸' }
const craning = computed(() => pile.value.some((p) => p.falling && p.via === 'crane'))
</script>

<template>
  <div class="pile" :style="{ '--base': base, '--w': size.w + 'px', '--h': size.h + 'px', '--bs': mobile ? 0.62 : 0.8 }">
    <div v-if="craning" class="rail" aria-hidden="true" />
    <template v-for="p in pile" :key="p.d.id">
      <button class="pk" :class="[{ fall: p.falling, mine: p.mine, on: opened === p.d.id }, p.falling ? ['via-' + p.via, 'c-' + p.cargo.id] : '']" type="button"
        :style="{ left: p.left + 'px', bottom: btm(p), '--btm': btm(p), animationDelay: p.falling ? p.delay + 'ms' : '0ms', '--c': p.d.by.color }"
        :title="p.mine ? 'Ваша посылка — ждёт, пока откроют' : `Посылка от ${p.d.by.name} — нажмите, чтобы открыть`"
        :aria-label="p.mine ? 'Ваша посылка' : `Открыть посылку от ${p.d.by.name}`" @click="tap(p)">
        <svg v-if="p.falling && p.via === 'chute'" class="chute" viewBox="0 0 200 150" aria-hidden="true">
          <path d="M10 70 Q100 -30 190 70 Z" fill="#ff6b6b" />
          <path d="M10 70 Q40 20 70 70 Z" fill="#ffd166" /><path d="M70 70 Q100 8 130 70 Z" fill="#fff" /><path d="M130 70 Q160 20 190 70 Z" fill="#ffd166" />
          <path d="M10 70 Q25 78 40 70 Q55 78 70 70 Q85 78 100 70 Q115 78 130 70 Q145 78 160 70 Q175 78 190 70" fill="none" stroke="#c94b4b" stroke-width="3" />
          <path d="M12 72 L88 148 M70 72 L94 148 M130 72 L106 148 M188 72 L112 148" stroke="#8a6a4a" stroke-width="1.6" />
        </svg>
        <svg v-if="p.cargo.id === 'chest'" class="cargo chest" viewBox="0 0 120 100" aria-hidden="true">
          <template v-if="opened === p.d.id">
            <path d="M14 44 L24 2 L96 2 L106 44 Z" fill="#7a4518" /><path d="M20 40 L28 8 L92 8 L100 40 Z" fill="#5a3210" />
          </template>
          <template v-else>
            <!-- при наведении: крышка приоткрывается, из щели свет и искорки -->
            <path class="glow" d="M12 46 L108 46 L112 18 L60 30 Z" fill="#ffe58a" />
            <g class="spark"><path d="M84 -6 L87 2 L95 5 L87 8 L84 16 L81 8 L73 5 L81 2 Z" fill="#ffc800" /><path d="M104 12 L106 17 L111 19 L106 21 L104 26 L102 21 L97 19 L102 17 Z" fill="#ffc800" /><path d="M62 0 L64 5 L69 7 L64 9 L62 14 L60 9 L55 7 L60 5 Z" fill="#ffd84d" /></g>
          </template>
          <rect x="10" y="44" width="100" height="50" rx="6" fill="#a0612b" /><rect x="10" y="44" width="100" height="10" fill="#8a5121" />
          <rect x="24" y="44" width="10" height="50" fill="#e0b13a" /><rect x="86" y="44" width="10" height="50" fill="#e0b13a" />
          <rect x="10" y="88" width="100" height="6" rx="3" fill="#7a4518" />
          <g v-if="opened !== p.d.id" class="lid">
            <path d="M10 44 Q10 14 60 14 Q110 14 110 44 Z" fill="#b8722f" /><rect x="24" y="16" width="10" height="28" fill="#e0b13a" /><rect x="86" y="16" width="10" height="28" fill="#e0b13a" />
            <rect x="52" y="34" width="16" height="18" rx="3" fill="#f2c94c" stroke="#a8841f" stroke-width="2" /><circle cx="60" cy="43" r="2.5" fill="#6b4a12" />
          </g>
        </svg>
        <svg v-else-if="p.cargo.id === 'mail'" class="cargo mail" viewBox="0 0 60 44" aria-hidden="true">
          <path v-if="opened === p.d.id" d="M3 6 L30 -16 L57 6 Z" fill="#fffdf5" stroke="#b9a66e" stroke-width="2" stroke-linejoin="round" />
          <rect x="2" y="4" width="56" height="38" rx="4" fill="#fffdf5" stroke="#b9a66e" stroke-width="2" />
          <template v-if="opened !== p.d.id"><path d="M3 7 L30 27 L57 7" fill="none" stroke="#b9a66e" stroke-width="2" /><circle cx="30" cy="28" r="6" fill="#e5484d" /></template>
          <path v-else d="M3 7 L30 24 L57 7" fill="none" stroke="#d8cba0" stroke-width="2" />
        </svg>
        <span v-else-if="p.cargo.id === 'note'" class="cargo sticky">{{ textOf(p.d) }}</span>
        <span v-else class="cargo em">{{ p.cargo.em }}</span>
        <span v-if="!p.falling" class="tag" aria-hidden="true">{{ ini(p.d.by.name) }}</span>
      </button>

      <!-- кран: тележка едет по балке, опускает посылку на крюке, поднимает крюк и уезжает -->
      <div v-if="p.falling && p.via === 'crane'" class="rig" aria-hidden="true" :style="{ left: mid(p), '--btm': btm(p), animationDelay: p.delay + 'ms' }">
        <span class="trolley"><i /><i /></span>
        <span class="cable" :style="{ animationDelay: p.delay + 'ms' }">
          <svg viewBox="0 0 36 36"><rect x="12" y="0" width="12" height="8" rx="2" fill="#4b4b4b" /><path d="M18 8 L18 18 Q30 18 30 26 Q30 34 20 34 Q11 34 10 26" fill="none" stroke="#e0b13a" stroke-width="5" stroke-linecap="round" /></svg>
        </span>
      </div>

      <!-- птица: аист еле тащит посылку на верёвке, отпускает — его подбрасывает, летят перья -->
      <template v-if="p.falling && p.via === 'bird'">
        <div v-if="TRAIL[p.cargo.id]" class="trail" :class="'c-' + p.cargo.id" aria-hidden="true" :style="{ left: mid(p), bottom: btm(p), '--btm': btm(p) }">
          <i v-for="n in 4" :key="n" :class="'t' + n" :style="{ animationDelay: p.delay + n * 418 + 'ms' }"><svg v-if="TRAIL[p.cargo.id] === 'f'" viewBox="0 0 30 12"><path d="M1 6 Q10 -2 29 6 Q10 14 1 6 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="1.5" /></svg><template v-else>{{ TRAIL[p.cargo.id] }}</template></i>
        </div>
        <div class="fth" :class="'c-' + p.cargo.id" aria-hidden="true" :style="{ left: mid(p), bottom: btm(p), '--btm': btm(p) }">
          <svg v-for="f in 2" :key="f" :class="'f' + f" viewBox="0 0 30 12" :style="{ animationDelay: p.delay + 'ms' }"><path d="M1 6 Q10 -2 29 6 Q10 14 1 6 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="1.5" /><path d="M3 6 L27 6" stroke="#8fa3ad" stroke-width="1" fill="none" /></svg>
        </div>
        <div class="bird" :class="'c-' + p.cargo.id" aria-hidden="true" :style="{ left: mid(p), bottom: btm(p), '--btm': btm(p), '--d': p.delay + 'ms', animationDelay: p.delay + 'ms' }">
          <span class="rope" />
          <svg viewBox="0 0 220 140">
            <g class="wing b"><path d="M104 68 Q92 18 46 8 Q58 24 54 36 Q68 34 70 46 Q82 46 86 62 Z" fill="#c9d5dc" stroke="#8fa3ad" stroke-width="2" /></g>
            <g class="legs">
              <path d="M62 84 L14 96 L4 92 M14 96 L4 102" fill="none" stroke="#ff8a00" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M64 90 L18 108 L8 106 M18 108 L10 115" fill="none" stroke="#e07800" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
            </g>
            <path d="M58 70 L28 60 L36 72 L26 82 L56 88 Z" fill="#3d3d3d" />
            <path d="M132 70 Q160 70 158 46" fill="none" stroke="#8fa3ad" stroke-width="17" stroke-linecap="round" />
            <path d="M52 78 Q56 54 98 54 Q138 54 142 76 Q140 100 98 102 Q60 102 52 78 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
            <path d="M172 32 L210 46 Q213 50 207 51 L170 47 Z" fill="#ff8a00" />
            <circle cx="160" cy="40" r="15" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
            <path d="M132 70 Q160 70 158 46" fill="none" stroke="#f6f9fb" stroke-width="13" stroke-linecap="round" />
            <g class="hard">
              <circle cx="165" cy="35" r="6.5" fill="#fff" stroke="#555" stroke-width="1.5" /><circle cx="167" cy="38" r="2" fill="#222" />
              <path d="M156 27 L170 23" fill="none" stroke="#555" stroke-width="2.2" stroke-linecap="round" />
              <path class="sw s1" d="M148 22 q-3 -6 0 -9 q3 3 0 9 Z" fill="#1cb0f6" /><path class="sw s2" d="M160 16 q-3 -6 0 -9 q3 3 0 9 Z" fill="#1cb0f6" /><path class="sw s3" d="M140 34 q-3 -6 0 -9 q3 3 0 9 Z" fill="#1cb0f6" />
            </g>
            <path class="easy" d="M159 37 Q165 30 171 37" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" />
            <path class="shut" d="M160 31 L169 36 L160 41" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <g class="wing a">
              <path d="M106 72 Q92 16 40 4 Q54 22 50 34 Q64 32 66 46 Q80 46 84 64 Z" fill="#f6f9fb" stroke="#8fa3ad" stroke-width="2" />
              <path d="M40 4 Q54 22 50 34 Q64 32 66 46 L74 47 Q66 22 40 4 Z" fill="#3d3d3d" />
            </g>
          </svg>
        </div>
      </template>
    </template>

    <!-- письмо из открытой посылки: тетрадный лист; если внутри эмодзи — выезжает после фонтана -->
    <div v-if="open" class="letter" :class="{ late: bits.length }" :style="{ left: Math.min(Math.max(10, open.left + size.w / 2 - 170), vw - 350) + 'px', bottom: `calc(var(--base) + ${open.y + size.h + 18}px)` }" role="dialog" aria-label="Письмо из посылки">
      <div class="sh"><span class="av" :style="{ '--c': open.d.by.color }"><img v-if="open.d.by.photo" :src="open.d.by.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(open.d.by.name) }}</b></span>{{ open.d.by.name }} · {{ time(open.m?.at || open.d.at) }}</div>
      <p class="st">{{ open.m?.text || 'Сообщение удалено' }}</p>
      <div class="btns"><button class="btn p" type="button" @click="reply">Ответить</button><button class="btn g" type="button" @click="close">Закрыть</button></div>
    </div>

    <!-- эмодзи из открытой посылки -->
    <span v-for="b in bits" :key="opened + b.i" class="bit" aria-hidden="true"
      :style="{ left: b.x + 'px', '--from': b.from + 'px', '--up': b.up + 'px', '--r': b.r + 'deg', animationDelay: b.delay + 'ms' }">
      <i :class="'h' + b.hop" :style="{ fontSize: b.size + 'px', animationDelay: b.delay + 'ms' }">{{ b.em }}</i>
    </span>
  </div>
</template>

<style scoped>
.pile { position: fixed; inset: 0; z-index: 35; pointer-events: none; overflow: hidden }
.pk { position: absolute; width: var(--w); height: var(--h); padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; display: grid; place-items: end center; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .22)); transition: left .3s, bottom .35s cubic-bezier(.3, 1.4, .5, 1); transform-origin: 50% 100% }
.pk.mine { cursor: default }
.cargo { width: var(--w); height: var(--h) } .em { font-size: calc(var(--h) * .95); line-height: var(--h); text-align: center }
.chest { overflow: visible }
.mail { overflow: visible; height: calc(var(--h) * .86) }
.sticky { display: block; box-sizing: border-box; padding: 7px 5px; overflow: hidden; background: #ffe58a; transform: rotate(-3deg); font-family: 'Caveat', 'Segoe Print', 'Bradley Hand', cursive; font-size: 17px; font-weight: 700; line-height: 1; color: #3b2f00; text-align: center; overflow-wrap: anywhere }
@media (max-width: 719px) { .sticky { padding: 4px 3px; font-size: 13px } }
.pk.fall { pointer-events: none }

/* --- парашют --- */
.chute { position: absolute; left: 50%; bottom: calc(var(--h) - 6px); width: calc(var(--w) * 1.7); margin-left: calc(var(--w) * -.85); transform-origin: 50% 100%; animation: sway 1.3s ease-in-out infinite }
@keyframes sway { 0%, 100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } }
.pk.fall.via-chute { animation: fall 2.6s cubic-bezier(.35, .1, .5, 1) both }
@keyframes fall { 0% { transform: translateY(-110vh) } 40% { transform: translateY(-55vh) rotate(4deg) } 75% { transform: translateY(-15vh) rotate(-3deg) } 100% { transform: translateY(0) } }

/* --- кран: --lift — на какой высоте везут, --len — длина троса, когда посылка на месте --- */
.pk.via-crane, .rig { --len: calc(100vh - var(--btm) - var(--h) - 46px); --lift: max(0px, min(66vh, var(--len) - 30px)) }
.rail { position: absolute; left: 0; right: 0; top: 0; height: 10px; background: #f2c94c; border-bottom: 2px solid #a8841f; animation: rail .3s both }
@keyframes rail { from { transform: translateY(-12px) } }
.pk.fall.via-crane { animation: craneBox 3.6s ease-in-out both }
@keyframes craneBox {
  0% { transform: translate(-110vw, calc(var(--lift) * -1)) } 30% { transform: translate(0, calc(var(--lift) * -1)) }
  60% { transform: translate(0, 0) } 63% { transform: scale(1.1, .86) } 67%, 100% { transform: none }
}
.rig { position: absolute; top: 0; width: 0; animation: craneX 3.6s ease-in-out both }
@keyframes craneX { 0% { transform: translateX(-110vw) } 30%, 74% { transform: translateX(0) } 100% { transform: translateX(110vw) } }
.trolley { position: absolute; left: -30px; top: 5px; width: 60px; height: 20px; border-radius: 5px; background: #4b4b4b }
.trolley i { position: absolute; top: -4px; width: 12px; height: 12px; border-radius: 50%; background: #777 } .trolley i:first-child { left: 8px } .trolley i:last-child { right: 8px }
.cable { position: absolute; left: -2px; top: 25px; width: 4px; height: calc(var(--len) - var(--lift)); background: #4b4b4b; animation: craneY 3.6s ease-in-out both }
.cable svg { position: absolute; left: -16px; bottom: -34px; width: 36px; height: 36px }
@keyframes craneY { 0%, 30% { height: calc(var(--len) - var(--lift)) } 60%, 64% { height: var(--len) } 78%, 100% { height: calc(var(--len) - var(--lift)) } }

/* --- птица: --lift — на какой высоте несёт; до 55% птица и посылка летят одной волной, дальше посылка падает --- */
.pk.via-bird, .bird, .fth, .trail { --lift: max(0px, min(58vh, calc(100vh - var(--btm) - var(--h) - 150px))) }
.pk.fall.via-bird { animation: birdBox 3.8s ease-in-out both }
@keyframes birdBox {
  0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 14px)) }
  22% { transform: translate(-66vw, calc(var(--lift) * -1 - 12px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 16px)) }
  44% { transform: translate(-22vw, calc(var(--lift) * -1 - 8px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 10px)) }
  55% { transform: translate(0, calc(var(--lift) * -1 + 4px)); animation-timing-function: ease-in }
  68% { transform: translate(0, 0); animation-timing-function: linear } 71% { transform: scale(1.2, .76) } 74% { transform: scale(.94, 1.06) } 77%, 100% { transform: none }
}
.bird { position: absolute; width: 0; height: 0; margin-bottom: calc(var(--h) - 4px); animation: birdFly 3.8s ease-in-out both }
@keyframes birdFly {
  0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 14px)) }
  22% { transform: translate(-66vw, calc(var(--lift) * -1 - 12px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 16px)) }
  44% { transform: translate(-22vw, calc(var(--lift) * -1 - 8px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 10px)) }
  55% { transform: translate(0, calc(var(--lift) * -1 + 4px)) rotate(4deg) }
  59% { transform: translate(4px, calc(var(--lift) * -1 - 64px)) rotate(-12deg) } 66% { transform: translate(14px, calc(var(--lift) * -1 - 38px)) rotate(0deg) }
  100% { transform: translate(110vw, calc(var(--lift) * -1 - 26vh)) rotate(-6deg) }
}
.bird > svg { position: absolute; left: calc(-206px * var(--bs)); bottom: calc(56px - 92px * var(--bs)); width: calc(220px * var(--bs)); height: calc(140px * var(--bs)); overflow: visible }
.rope { position: absolute; left: -1px; bottom: 0; width: 2px; height: 56px; background: #8a6a4a; transform-origin: 50% 0; animation: rope 3.8s ease-in-out both; animation-delay: var(--d) }
@keyframes rope { 0%, 55% { transform: none } 59% { transform: rotate(40deg) } 65% { transform: rotate(-20deg) } 72% { transform: rotate(30deg) } 80%, 100% { transform: rotate(22deg) } }
.wing, .legs { transform-box: fill-box }
.wing { transform-origin: 94% 97%; animation: flap .17s ease-in-out infinite alternate } .wing.b { animation-name: flapB }
@keyframes flap { from { transform: rotate(14deg) } to { transform: rotate(-80deg) } }
@keyframes flapB { from { transform: rotate(8deg) } to { transform: rotate(-70deg) } }
.legs { transform-origin: 97% 6%; animation: legs .26s ease-in-out infinite alternate }
@keyframes legs { from { transform: rotate(-8deg) } to { transform: rotate(10deg) } }
.hard { animation: hard 3.8s linear both; animation-delay: var(--d) } .easy { animation: easy 3.8s linear both; animation-delay: var(--d) }
@keyframes hard { 0%, 55% { opacity: 1 } 56%, 100% { opacity: 0 } }
@keyframes easy { 0%, 55% { opacity: 0 } 56%, 100% { opacity: 1 } }
.sw { animation: sweat .5s linear infinite } .s2 { animation-delay: .17s } .s3 { animation-delay: .33s }
@keyframes sweat { from { transform: none; opacity: 1 } to { transform: translate(-16px, -12px); opacity: 0 } }
.fth { position: absolute; width: 0; height: 0; margin-bottom: calc(var(--h) + 60px); transform: translateY(calc(var(--lift) * -1)) }
.fth svg { position: absolute; left: -70px; top: -20px; width: 26px; height: 11px; opacity: 0; animation: feather 3.8s ease-in-out both }
.fth .f2 { left: -30px; top: 0; width: 20px; animation-name: feather2 }
@keyframes feather { 0%, 55% { opacity: 0; transform: none } 57% { opacity: 1; transform: none } 70% { opacity: 1; transform: translate(-26px, 90px) rotate(50deg) } 84% { opacity: 1; transform: translate(18px, 180px) rotate(-40deg) } 100% { opacity: 0; transform: translate(-10px, 260px) rotate(30deg) } }
@keyframes feather2 { 0%, 56% { opacity: 0; transform: none } 58% { opacity: 1; transform: none } 72% { opacity: 1; transform: translate(30px, 80px) rotate(-60deg) } 86% { opacity: 1; transform: translate(-14px, 160px) rotate(40deg) } 100% { opacity: 0; transform: translate(20px, 230px) rotate(-20deg) } }

/* --- характер аиста зависит от груза (класс c-<груз> на посылке, птице, перьях и следе) ---
   сундук — тяжело: проседает, перья сыплются всю дорогу, после сброса подбрасывает сильнее;
   подарок и торт — несёт ровно, сам ставит на место и делает круг почёта; письмо — почтальон: бросает на лету, не тормозя;
   записка — планирует листочком; какашка — зажмурился и улетает вдвое быстрее; сердечко и цветы — за ним след. */
.pk.fall.via-bird.c-chest { animation-name: birdBoxH } .bird.c-chest { animation-name: birdFlyH }
@keyframes birdBoxH { 0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 34px)) } 22% { transform: translate(-66vw, calc(var(--lift) * -1 - 6px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 44px)) } 44% { transform: translate(-22vw, calc(var(--lift) * -1 + 0px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 40px)) } 55% { transform: translate(0, calc(var(--lift) * -1 + 30px)); animation-timing-function: ease-in } 68% { transform: translate(0, 0); animation-timing-function: linear } 71% { transform: scale(1.2, .76) } 74% { transform: scale(.94, 1.06) } 77%, 100% { transform: none } }
@keyframes birdFlyH { 0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 34px)) } 22% { transform: translate(-66vw, calc(var(--lift) * -1 - 6px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 44px)) } 44% { transform: translate(-22vw, calc(var(--lift) * -1 + 0px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 40px)) } 55% { transform: translate(0, calc(var(--lift) * -1 + 30px)) rotate(6deg) } 59% { transform: translate(4px, calc(var(--lift) * -1 - 90px)) rotate(-14deg) } 66% { transform: translate(14px, calc(var(--lift) * -1 - 50px)) rotate(0deg) } 100% { transform: translate(110vw, calc(var(--lift) * -1 - 26vh)) rotate(-6deg) } }
.pk.fall.via-bird.c-gift, .pk.fall.via-bird.c-cake { animation-name: birdBoxG } .bird.c-gift, .bird.c-cake { animation-name: birdFlyG }
@keyframes birdBoxG { 0% { transform: translate(-110vw, calc(var(--lift) * -1)) } 40% { transform: translate(0, calc(var(--lift) * -1)) } 62%, 100% { transform: translate(0, 0) } }
@keyframes birdFlyG { 0% { transform: translate(-110vw, calc(var(--lift) * -1)) rotate(0deg) } 40% { transform: translate(0, calc(var(--lift) * -1)) rotate(0deg) } 62% { transform: translate(0, 0) rotate(0deg) } 70% { transform: translate(0, -60px) rotate(0deg) } 100% { transform: translate(110vw, -50vh) rotate(-360deg) } }
.pk.fall.via-bird.c-mail { animation-name: birdBoxM; animation-timing-function: linear } .bird.c-mail { animation-name: birdFlyM; animation-timing-function: linear }
@keyframes birdBoxM { 0% { transform: translate(-110vw, calc(var(--lift) * -1)) rotate(0deg) } 35% { transform: translate(-13.75vw, calc(var(--lift) * -1)) rotate(0deg) } 42% { transform: translate(-7vw, calc(var(--lift) * -.78)) rotate(-120deg) } 49% { transform: translate(-2.5vw, calc(var(--lift) * -.4)) rotate(-250deg) } 56% { transform: translate(0, 0) rotate(-360deg) } 59% { transform: translate(0, 0) rotate(-360deg) scale(1.15, .8) } 63%, 100% { transform: translate(0, 0) rotate(-360deg) } }
@keyframes birdFlyM { 0% { transform: translate(-110vw, calc(var(--lift) * -1)) } 40% { transform: translate(0, calc(var(--lift) * -1)) } 80%, 100% { transform: translate(110vw, calc(var(--lift) * -1 - 12vh)) } }
.pk.fall.via-bird.c-note { animation-name: birdBoxN }
@keyframes birdBoxN { 0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 14px)) } 22% { transform: translate(-66vw, calc(var(--lift) * -1 - 12px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 16px)) } 44% { transform: translate(-22vw, calc(var(--lift) * -1 - 8px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 10px)) } 55% { transform: translate(0, calc(var(--lift) * -1 + 4px)) rotate(0deg) } 62% { transform: translate(-22px, calc(var(--lift) * -.62)) rotate(-14deg) } 70% { transform: translate(20px, calc(var(--lift) * -.3)) rotate(12deg) } 78% { transform: translate(-8px, calc(var(--lift) * -.08)) rotate(-6deg) } 84%, 100% { transform: translate(0, 0) rotate(0deg) } }
.bird.c-poo { animation-name: birdFlyP }
@keyframes birdFlyP { 0% { transform: translate(-110vw, calc(var(--lift) * -1 - 10px)) } 11% { transform: translate(-88vw, calc(var(--lift) * -1 + 14px)) } 22% { transform: translate(-66vw, calc(var(--lift) * -1 - 12px)) } 33% { transform: translate(-44vw, calc(var(--lift) * -1 + 16px)) } 44% { transform: translate(-22vw, calc(var(--lift) * -1 - 8px)) } 52% { transform: translate(0, calc(var(--lift) * -1 + 10px)) } 55% { transform: translate(0, calc(var(--lift) * -1 + 4px)) rotate(4deg) } 59% { transform: translate(4px, calc(var(--lift) * -1 - 64px)) rotate(-12deg) } 76%, 100% { transform: translate(110vw, calc(var(--lift) * -1 - 30vh)) rotate(-8deg) } }
/* глаза: доволен с самого начала / зажмурился */
.shut { display: none }
.c-mail .hard, .c-note .hard, .c-heart .hard, .c-flowers .hard, .c-gift .hard, .c-poo .hard, .c-poo .easy { display: none }
.c-mail .easy, .c-note .easy, .c-heart .easy, .c-flowers .easy, .c-gift .easy { animation: none; opacity: 1 }
.c-poo .shut { display: inline }
.fth.c-gift, .fth.c-cake, .fth.c-mail, .fth.c-note, .fth.c-heart, .fth.c-flowers { display: none }
/* след за птицей: перья (сундук), сердечки, лепестки — появляются там, где она пролетела */
.trail { position: absolute; width: 0; height: 0; margin-bottom: calc(var(--h) + 50px); transform: translateY(calc(var(--lift) * -1)) }
.trail i { position: absolute; top: 0; font-style: normal; font-size: 20px; line-height: 1; opacity: 0; animation: trailFall 1.6s ease-in both }
.trail svg { display: block; width: 24px; height: 10px }
.trail .t1 { left: -88vw } .trail .t2 { left: -66vw } .trail .t3 { left: -44vw } .trail .t4 { left: -22vw }
.trail.c-heart i { animation-name: trailRise; animation-timing-function: ease-out }
@keyframes trailFall { 0% { opacity: 0; transform: none } 8% { opacity: 1 } 50% { opacity: 1; transform: translate(-20px, 110px) rotate(50deg) } 100% { opacity: 0; transform: translate(14px, 240px) rotate(-40deg) } }
@keyframes trailRise { 0% { opacity: 0; transform: scale(.4) } 12% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: translateY(-90px) scale(1.2) } }

/* --- лежит и ждёт --- */
.pk:not(.fall):not(.mine):not(.on) { animation: plop .45s cubic-bezier(.3, 1.6, .5, 1) both, wig 2.4s 1s ease-in-out infinite }
@keyframes plop { 0% { transform: scale(1.18, .78) } 100% { transform: none } }
@keyframes wig { 0%, 82%, 100% { transform: none } 88% { transform: translateY(-8px) rotate(-5deg) } 94% { transform: rotate(4deg) } }
.lid { transform-box: fill-box; transform-origin: 0 79%; transition: transform .25s cubic-bezier(.3, 1.6, .5, 1) }
.glow { opacity: 0; transition: opacity .2s }
.spark { opacity: 0; transform: translateY(8px) scale(.4); transform-box: fill-box; transform-origin: 50% 100%; transition: opacity .2s, transform .35s cubic-bezier(.3, 1.6, .5, 1) }
/* наведение: посылка подпрыгивает и покачивается, у сундука приоткрывается крышка — свет и искорки */
@media (hover: hover) {
  .pk:not(.fall):not(.mine):not(.on):hover { animation: peek .55s ease-in-out infinite; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .3)) }
  .pk:not(.fall):not(.mine):hover .lid { transform: rotate(-13deg) }
  .pk:not(.fall):not(.mine):hover .glow { opacity: 1 }
  .pk:not(.fall):not(.mine):hover .spark { opacity: 1; transform: none }
}
@keyframes peek { 0%, 100% { transform: none } 25% { transform: translateY(-5px) rotate(-4deg) } 50% { transform: none } 75% { transform: translateY(-3px) rotate(4deg) } }
.tag { position: absolute; right: -4px; top: -4px; width: 20px; height: 20px; border-radius: 50%; background: var(--c); color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 900; box-shadow: 0 0 0 2px #fff }
.mine .tag { opacity: .7 }
.av { flex: none; width: 26px; height: 26px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--c); color: #fff; font-size: 11px; font-weight: 900 }
.av img { width: 100%; height: 100%; object-fit: cover }

/* --- письмо: тетрадный лист в линейку с красным полем --- */
.letter { position: absolute; width: 340px; box-sizing: border-box; padding: 14px 20px 14px 46px; border-radius: 4px; background-color: #fffdf5; background-image: linear-gradient(#f0a8a8, #f0a8a8), repeating-linear-gradient(to bottom, transparent 0, transparent 29px, #d9e4ee 29px, #d9e4ee 30px); background-size: 1px 100%, 100% 30px; background-position: 34px 0, 0 22px; background-repeat: no-repeat, repeat; box-shadow: 0 14px 34px rgba(60, 50, 20, .22), inset 0 0 0 1px #ece5cf; transform: rotate(-1.5deg); pointer-events: auto; animation: unroll .45s cubic-bezier(.3, 1.4, .5, 1) both }
.letter.late { animation-delay: 1.3s }
@keyframes unroll { 0% { opacity: 0; transform: translateY(60px) scale(.4) rotate(-1.5deg) } 100% { opacity: 1; transform: rotate(-1.5deg) } }
.sh { display: flex; align-items: center; gap: 8px; height: 30px; font-size: 12px; font-weight: 900; color: #6b6b6b }
.st { margin: 8px 0 14px; font-family: 'Caveat', 'Segoe Print', 'Bradley Hand', cursive; font-size: 27px; font-weight: 700; line-height: 30px; color: #2c3e63; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 40vh; overflow: auto }
.btns { display: flex; gap: 8px }
.btn { height: 32px; padding: 0 14px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.btn.p { background: var(--blue); color: #fff } .btn.g { background: #eef0f3; color: #4b4b4b }

/* --- эмодзи: наружный слой разлетается в стороны, внутренний — подпрыгивает дугой --- */
.bit { position: absolute; bottom: var(--base); width: 44px; height: 44px; transform: rotate(var(--r)); animation: bitX 1s cubic-bezier(.3, .5, .6, 1) both }
@keyframes bitX { 0% { transform: translate(var(--from), calc(var(--up) * -1)) scale(.2); opacity: 0 } 12% { opacity: 1 } }
.bit i { display: grid; place-items: center; width: 44px; height: 44px; font-style: normal; line-height: 1; animation: 1.15s both }
.bit .h1 { animation-name: hop1 } .bit .h2 { animation-name: hop2 } .bit .h3 { animation-name: hop3 }
@keyframes hop1 { 0% { transform: none; animation-timing-function: ease-out } 42% { transform: translateY(-62vh) rotate(200deg); animation-timing-function: ease-in } 82% { transform: rotate(360deg); animation-timing-function: ease-out } 90% { transform: translateY(-26px) rotate(360deg); animation-timing-function: ease-in } 100% { transform: rotate(360deg) } }
@keyframes hop2 { 0% { transform: none; animation-timing-function: ease-out } 42% { transform: translateY(-46vh) rotate(-180deg); animation-timing-function: ease-in } 82% { transform: rotate(-360deg); animation-timing-function: ease-out } 90% { transform: translateY(-18px) rotate(-360deg); animation-timing-function: ease-in } 100% { transform: rotate(-360deg) } }
@keyframes hop3 { 0% { transform: none; animation-timing-function: ease-out } 42% { transform: translateY(-30vh); animation-timing-function: ease-in } 82% { transform: none; animation-timing-function: ease-out } 90% { transform: translateY(-12px); animation-timing-function: ease-in } 100% { transform: none } }
@media (max-width: 719px) { .letter { width: calc(100vw - 20px); left: 10px !important } .st { font-size: 24px } }
@media (prefers-reduced-motion: reduce) { .pk, .chute, .rig, .cable, .bird, .bird *, .fth svg, .bit, .bit i, .letter { animation: none !important } .rig, .bird, .fth, .trail { display: none } }
</style>
