<script setup>
// Посылки на парашюте — маленькая 2D-«игра» поверх приложения (useNotes: drops, aim; сервер: live.ts).
//  • Отправитель выбирает груз (сундук, подарок, какашка…) и нажимает на экран — туда, куда сбросить.
//  • У всех, кто в приложении, посылка спускается на парашюте вниз экрана и копится стопкой, как в тетрисе.
//  • Адресат нажимает на посылку — сундук открывается, выезжает записка; «Закрыть» — посылка пропадает у всех,
//    у отправителя «Прочитано». Свою посылку открыть нельзя — она ждёт.
// Экран не темнеет и не перекрывается: посылки живут у нижнего края, клики мимо них проходят в приложение.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { notesState as S, CARGO, noteById, openDrop, openNote } from '../composables/useNotes'
import { showToast } from '../composables/useToast'

const router = useRouter()
const FALL = 2600
const now = ref(Date.now()), vw = ref(innerWidth), mobile = computed(() => vw.value < 720)
const size = computed(() => (mobile.value ? { w: 64, h: 54 } : { w: 92, h: 78 }))
const opened = ref('')                       // открытая мной посылка (записка над ней)
let clock = 0
const onResize = () => { vw.value = innerWidth }
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 200); addEventListener('resize', onResize) })
onUnmounted(() => { clearInterval(clock); removeEventListener('resize', onResize) })

// Стопка: по порядку прихода каждая посылка падает в свою точку x и ложится на те, что под ней (пересекаются по ширине)
const pile = computed(() => {
  const { w, h } = size.value, placed = []
  for (const d of [...S.drops].sort((a, b) => a.at - b.at)) {
    const left = Math.round(Math.min(Math.max(4, d.x * vw.value - w / 2), vw.value - w - 4))
    let y = 0
    for (const p of placed) if (Math.abs(p.left - left) < w * 0.8) y = Math.max(y, p.y + h * 0.9)
    const falling = now.value - d.at < FALL
    placed.push({ d, left, y, falling, mine: d.by.uid === S.me, cargo: CARGO.find((c) => c.id === d.cargo) || CARGO[0], delay: Math.min(0, d.at - now.value) })
  }
  return placed
})
const open = computed(() => {
  const p = pile.value.find((x) => x.d.id === opened.value); if (!p) return null
  const n = noteById(p.d.note), m = n?.msgs.find((x) => x.id === p.d.mid) || n?.msgs.at(-1)
  return { ...p, n, m }
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
const ini = (s) => (s || '?').trim()[0]?.toUpperCase() || '?'
const time = (at) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const base = computed(() => (mobile.value ? 'calc(78px + var(--safe-b))' : '6px'))      // на телефоне — над нижним меню
</script>

<template>
  <div class="pile" :style="{ '--base': base, '--w': size.w + 'px', '--h': size.h + 'px' }">
    <button v-for="p in pile" :key="p.d.id" class="pk" :class="{ fall: p.falling, mine: p.mine, on: opened === p.d.id }" type="button"
      :style="{ left: p.left + 'px', bottom: `calc(var(--base) + ${p.y}px)`, animationDelay: p.falling ? p.delay + 'ms' : '0ms', '--c': p.d.by.color }"
      :title="p.mine ? 'Ваша посылка — ждёт, пока откроют' : `Посылка от ${p.d.by.name} — нажмите, чтобы открыть`"
      :aria-label="p.mine ? 'Ваша посылка' : `Открыть посылку от ${p.d.by.name}`" @click="tap(p)">
      <svg v-if="p.falling" class="chute" viewBox="0 0 200 150" aria-hidden="true">
        <path d="M10 70 Q100 -30 190 70 Z" fill="#ff6b6b" />
        <path d="M10 70 Q40 20 70 70 Z" fill="#ffd166" /><path d="M70 70 Q100 8 130 70 Z" fill="#fff" /><path d="M130 70 Q160 20 190 70 Z" fill="#ffd166" />
        <path d="M10 70 Q25 78 40 70 Q55 78 70 70 Q85 78 100 70 Q115 78 130 70 Q145 78 160 70 Q175 78 190 70" fill="none" stroke="#c94b4b" stroke-width="3" />
        <path d="M12 72 L88 148 M70 72 L94 148 M130 72 L106 148 M188 72 L112 148" stroke="#8a6a4a" stroke-width="1.6" />
      </svg>
      <svg v-if="p.cargo.id === 'chest'" class="cargo" viewBox="0 0 120 100" aria-hidden="true">
        <template v-if="opened === p.d.id">
          <path d="M14 44 L24 2 L96 2 L106 44 Z" fill="#7a4518" /><path d="M20 40 L28 8 L92 8 L100 40 Z" fill="#5a3210" />
        </template>
        <rect x="10" y="44" width="100" height="50" rx="6" fill="#a0612b" /><rect x="10" y="44" width="100" height="10" fill="#8a5121" />
        <rect x="24" y="44" width="10" height="50" fill="#e0b13a" /><rect x="86" y="44" width="10" height="50" fill="#e0b13a" />
        <rect x="10" y="88" width="100" height="6" rx="3" fill="#7a4518" />
        <g v-if="opened !== p.d.id">
          <path d="M10 44 Q10 14 60 14 Q110 14 110 44 Z" fill="#b8722f" /><rect x="24" y="16" width="10" height="28" fill="#e0b13a" /><rect x="86" y="16" width="10" height="28" fill="#e0b13a" />
          <rect x="52" y="34" width="16" height="18" rx="3" fill="#f2c94c" stroke="#a8841f" stroke-width="2" /><circle cx="60" cy="43" r="2.5" fill="#6b4a12" />
        </g>
      </svg>
      <span v-else class="cargo em">{{ p.cargo.em }}</span>
      <span v-if="!p.falling" class="tag" aria-hidden="true">{{ ini(p.d.by.name) }}</span>
    </button>

    <!-- записка из открытой посылки -->
    <div v-if="open" class="scroll" :style="{ left: Math.min(Math.max(10, open.left + size.w / 2 - 160), vw - 330) + 'px', bottom: `calc(var(--base) + ${open.y + size.h + 18}px)` }" role="dialog" aria-label="Записка из посылки">
      <div class="sh"><span class="av" :style="{ '--c': open.d.by.color }"><img v-if="open.d.by.photo" :src="open.d.by.photo" alt="" referrerpolicy="no-referrer" /><b v-else>{{ ini(open.d.by.name) }}</b></span>{{ open.d.by.name }} · {{ time(open.m?.at || open.d.at) }}</div>
      <p class="st">{{ open.m?.text || 'Сообщение удалено' }}</p>
      <div class="btns"><button class="btn p" type="button" @click="reply">Ответить</button><button class="btn g" type="button" @click="close">Закрыть</button></div>
    </div>

    <!-- куда сбросить: вертикальная линия за курсором -->
  </div>
</template>

<style scoped>
.pile { position: fixed; inset: 0; z-index: 35; pointer-events: none }
.pk { position: absolute; width: var(--w); height: var(--h); padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; display: grid; place-items: end center; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .22)); transition: left .3s, bottom .35s cubic-bezier(.3, 1.4, .5, 1) }
.pk.mine { cursor: default }
.cargo { width: var(--w); height: var(--h) } .em { font-size: calc(var(--h) * .95); line-height: var(--h); text-align: center }
.chute { position: absolute; left: 50%; bottom: calc(var(--h) - 6px); width: calc(var(--w) * 1.7); margin-left: calc(var(--w) * -.85); transform-origin: 50% 100%; animation: sway 1.3s ease-in-out infinite }
@keyframes sway { 0%, 100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } }
.pk.fall { animation: fall 2.6s cubic-bezier(.35, .1, .5, 1) both; pointer-events: none }
@keyframes fall { 0% { transform: translateY(-110vh) } 40% { transform: translateY(-55vh) rotate(4deg) } 75% { transform: translateY(-15vh) rotate(-3deg) } 100% { transform: translateY(0) } }
.pk:not(.fall):not(.mine):not(.on) { animation: plop .45s cubic-bezier(.3, 1.6, .5, 1) both, wig 2.4s 1s ease-in-out infinite }
@keyframes plop { 0% { transform: scale(1.18, .78) } 100% { transform: none } }
@keyframes wig { 0%, 82%, 100% { transform: none } 88% { transform: translateY(-8px) rotate(-5deg) } 94% { transform: rotate(4deg) } }
.pk:not(.mine):hover { filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .3)) brightness(1.06) }
.tag { position: absolute; right: -4px; top: -4px; width: 20px; height: 20px; border-radius: 50%; background: var(--c); color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 900; box-shadow: 0 0 0 2px #fff }
.mine .tag { opacity: .7 }
.av { flex: none; width: 26px; height: 26px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--c); color: #fff; font-size: 11px; font-weight: 900 }
.av img { width: 100%; height: 100%; object-fit: cover }
.scroll { position: absolute; width: 320px; box-sizing: border-box; padding: 16px 18px 14px; border-radius: 6px; background: #fff8e1; box-shadow: 0 14px 34px rgba(80, 60, 0, .25), inset 0 0 0 1px #f0dfaa; transform: rotate(-1.5deg); pointer-events: auto; animation: unroll .4s cubic-bezier(.3, 1.4, .5, 1) both }
@keyframes unroll { 0% { opacity: 0; transform: translateY(60px) scale(.4) rotate(-1.5deg) } 100% { opacity: 1; transform: rotate(-1.5deg) } }
.scroll::before, .scroll::after { content: ''; position: absolute; left: -8px; right: -8px; height: 12px; border-radius: 6px; background: #e9d29a }
.scroll::before { top: -6px } .scroll::after { bottom: -6px }
.sh { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 900; color: #a07c00 }
.st { margin: 8px 0 12px; font-size: 16px; font-weight: 800; line-height: 1.35; color: #3b2f00; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 40vh; overflow: auto }
.btns { display: flex; gap: 8px }
.btn { height: 32px; padding: 0 14px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.btn.p { background: var(--blue); color: #fff } .btn.g { background: #f1e8c8; color: #7a5a00 }
@media (max-width: 719px) { .scroll { width: calc(100vw - 20px); left: 10px !important } }
@media (prefers-reduced-motion: reduce) { .pk, .chute { animation: none !important } }
</style>
