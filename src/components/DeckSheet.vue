<script setup>
// Настройки колоды (окно из редактора колоды): название, лимит новых в день, Google Таблица, удаление.
// Колода в «Словах» — только база преподавателя: назначают её ученику в его карточке («Путь и слова» → «Колоды», StudentDecks.vue).
import { ref } from 'vue'
import { showToast } from '../composables/useToast'
import AppIcon from './AppIcon.vue'
import SheetLink from './SheetLink.vue'
import { useDecksStore } from '../stores/decks'
const deckStore = useDecksStore()
const props = defineProps({ deck: { type: Object, required: true } })
const emit = defineEmits(['close'])
const d = ref(props.deck), sure = ref(false)
const step = (n) => { d.value.newPerDay = Math.min(500, Math.max(0, (Number(d.value.newPerDay) || 0) + n)) }
function remove() {
  const gone = deckStore.remove(d.value); emit('close')
  showToast(`Колода удалена: ${gone.deck.title}`, () => deckStore.restore(gone))
}
</script>

<template>
  <div class="sheet-bg" @click.self="emit('close')">
    <!-- Компактно, как настройки в Telegram: шапка с названием, строки с иконками, выбор учеников — отдельной страницей, опасное — красным внизу -->
    <div class="sheet-box ds" role="dialog" aria-modal="true">
      <template v-if="d">
        <div class="hd">
          <span class="dicon"><AppIcon name="cards" :size="22" /></span>
          <div class="tt"><input v-model="d.title" class="title" aria-label="Название колоды" /><small>{{ d.cards.length }} карт.</small></div>
          <button class="x" aria-label="Закрыть" @click="emit('close')"><AppIcon name="x" :size="18" /></button>
        </div>

        <div class="sec">
          <div class="r"><span class="ic"><AppIcon name="plus" :size="20" /></span><span class="lb">Новых карточек в день</span>
            <span class="stp"><button aria-label="Меньше" @click="step(-5)">−</button><input v-model.number="d.newPerDay" type="number" min="0" max="500" aria-label="Новых карточек в день" /><button aria-label="Больше" @click="step(5)">+</button></span></div>
          <div class="r sl"><SheetLink :deck="d" /></div>
        </div>

        <div class="ft">
          <button v-if="!sure" class="lnk red" @click="sure = true"><AppIcon name="trash" :size="15" /> Удалить</button>
          <button v-else class="lnk red on" @click="remove">Точно удалить ({{ d.cards.length }} карт.)?</button>
          <button class="lnk" @click="emit('close')">Готово</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Окно как настройки в Telegram: узкое, без внешних отступов, строки 44px с иконкой слева */
.sheet-box.ds { max-width: 440px; padding: 0; gap: 0; display: block; overflow-y: auto }
.hd { display: flex; align-items: center; gap: 12px; padding: 14px 10px 12px 16px; border-bottom: 1px solid var(--border) }
.hd > b { flex: 1; font-size: 18px }
.dicon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--green); color: #fff }
.tt { flex: 1; display: grid; min-width: 0 } .tt small { font-size: 12px; font-weight: 600; color: var(--hint) }
.title { margin: 0; padding: 2px 0; border: 0; border-bottom: 1px dashed transparent; border-radius: 0; background: none; font-size: 18px; font-weight: 800 }
.title:hover { border-bottom-color: var(--border) } .title:focus { background: none; border-bottom-color: var(--hint-2) } .title:focus-visible { outline: none }
.x { flex: none; align-self: flex-start; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--hint); cursor: pointer } .x:hover { background: var(--surface) }
.sec { display: grid; padding: 4px 0 }
.r { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 46px; padding: 4px 14px 4px 16px; border: 0; background: none; font: inherit; color: var(--text); text-align: left }
.r.tap { cursor: pointer } .r.tap:hover { background: var(--surface) }
.ic { flex: none; display: grid; place-items: center; width: 28px; color: var(--hint) } .ic.sh { color: var(--green-d) }
.lb { flex: 1; font-size: 15px; font-weight: 700 }
.stp { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; overflow: hidden }
.stp button { width: 30px; height: 30px; border: 0; background: var(--surface); color: var(--text); font: inherit; font-size: 17px; font-weight: 900; cursor: pointer } .stp button:hover { background: var(--blue-l); color: var(--blue) }
.stp input { width: 46px; margin: 0; padding: 4px 0; border: 0; border-radius: 0; background: var(--card); text-align: center; font-size: 14px; -moz-appearance: textfield }
.stp input::-webkit-outer-spin-button, .stp input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0 }
.r.sl { display: block; padding-top: 8px; padding-bottom: 8px; border-top: 1px solid var(--border) }
.ft { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border) }
.lnk { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 0; border-radius: 10px; background: none; font: inherit; font-size: 15px; font-weight: 800; color: var(--blue); cursor: pointer }
.lnk:hover { background: var(--surface) } .lnk.grey { color: var(--hint) } .lnk.red { color: var(--red-d); font-size: 14px } .lnk.red.on { background: var(--red); color: #fff }
</style>
