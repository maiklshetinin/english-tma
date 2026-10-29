<script setup>
import { ref, computed, onMounted } from 'vue'
import { isOnline, seenLabel } from '../../utils/online'
import { useRoute, useRouter } from 'vue-router'
import { pctOf, unitOf } from '../../store/app'
import { goUp } from '../../router'
import AddStudent from '../../components/AddStudent.vue'
import ArchivePanel from '../../components/ArchivePanel.vue'
import Avatar from '../../components/Avatar.vue'
import AppIcon from '../../components/AppIcon.vue'
import { useGroups } from '../../composables/useGroups'
import StudentDetail from './StudentDetail.vue'
import { useStudentsStore } from '../../stores/students'
import { usePathStore } from '../../stores/path'
import { useContentStore } from '../../stores/content'
const pathStore = usePathStore()
const contentStore = useContentStore()
const studentStore = useStudentsStore()
const adding = ref(false)
const route = useRoute(), router = useRouter()
onMounted(() => { studentStore.load().catch(() => {}); contentStore.load().catch(() => {}) })      // подтянуть новых учеников, статусы «В приложении» и отметки учеников в пути
// Группы — сверху, каждая своим блоком с цветной полосой слева (цвета чередуются, чтобы соседние группы не сливались); ниже — «Индивидуально».
// Ученик из нескольких групп показан в каждой. Группы — отдельная сущность (stores/groups), состав меняется в панели на «Главной».
const groups = useGroups()
const GCOL = ['var(--blue)', 'var(--purple)', 'var(--orange)', 'var(--green)', 'var(--red)']
const solo = computed(() => { const inG = new Set(groups.value.flatMap(g => g.members.map(m => m.id))); return studentStore.list.filter(s => !inG.has(s.id)) })
const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'ученик' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'ученика' : 'учеников')
const rows = computed(() => {
  const out = []
  groups.value.forEach((g, gi) => {
    const c = GCOL[gi % GCOL.length]
    out.push({ t: 'gh', key: 'gh' + g.key, g, c, first: gi === 0 })
    g.members.forEach((s, i) => out.push({ t: 'row', key: g.key + '/' + s.id, s, c, last: i === g.members.length - 1 }))
  })
  if (groups.value.length && solo.value.length) out.push({ t: 'sl', key: 'sl' })
  for (const s of solo.value) out.push({ t: 'row', key: 's/' + s.id, s })
  return out
})
const open = (id) => router.push({ name: 'students', params: { id } })
const PAY = { paid: ['Оплачено', 'ok'], due: ['Ждёт оплаты', 'warn'], overdue: ['Просрочено', 'bad'] }
</script>
<template>
  <StudentDetail v-if="route.params.id" :id="route.params.id" @back="goUp(router)" />
  <div v-else class="page wide">
    <div class="row2" style="justify-content:space-between"><h2 style="margin:6px 0">Ученики</h2><button v-if="!adding" class="btn" @click="adding = true">+ Добавить ученика</button></div>
    <AddStudent v-if="adding" @close="adding = false" />
    <div v-if="!studentStore.list.length && !adding" class="card" style="text-align:center"><b>Пока никого нет</b><p class="hint" style="margin:6px 0 0">Нажмите «Добавить ученика», введите имя и отправьте ему ссылку-приглашение.</p></div>
    <div v-else class="card tbl">
      <div class="tr th"><span>Ученик</span><span class="uc">Юнит</span><span>Оплата</span><span>Прогресс</span></div>
      <!-- Один список: заголовок группы → её ученики (цветная полоса слева, серая подложка) → … → «Индивидуально» → остальные -->
      <template v-for="it in rows" :key="it.key">
        <div v-if="it.t === 'gh'" class="gh" :class="{ first: it.first }" :style="{ '--gc': it.c }"><AppIcon name="users" :size="15" /> Группа · {{ it.g.label }}<span>{{ it.g.members.length }} {{ word(it.g.members.length) }}</span></div>
        <div v-else-if="it.t === 'sl'" class="sl">Индивидуально</div>
        <button v-else class="tr" :class="{ ing: it.c, last: it.last }" :style="it.c ? { '--gc': it.c } : null" @click="open(it.s.id)">
          <span class="who"><Avatar :s="it.s" :size="56" :online="isOnline(it.s)" /><span class="tx"><b>{{ it.s.name }}</b><small v-if="it.s.status === 'invited'" class="inv">ждёт приглашения</small><small v-else-if="isOnline(it.s)" class="onl">в сети</small><small v-else class="sub">{{ seenLabel(it.s) || (it.s.username ? '@' + it.s.username : '') }}</small><small class="sub ui">{{ unitOf(pathStore.of(it.s.id)) }}</small></span></span>
          <span class="hint uc">{{ unitOf(pathStore.of(it.s.id)) }}</span>
          <span><span class="badge" :class="PAY[it.s.payment.status][1]">{{ PAY[it.s.payment.status][0] }}</span></span>
          <span class="prog"><span class="bar"><i :style="{ width: pctOf(pathStore.of(it.s.id)) + '%' }" /></span>{{ pctOf(pathStore.of(it.s.id)) }}%</span>
        </button>
      </template>
    </div>
    <ArchivePanel />
  </div>
</template>
<style scoped>
/* Компактные строки, как список чатов в Telegram: кружок 56px, имя и серая подпись под ним («ждёт приглашения» — оранжевым), высота строки ~58px */
.tbl { padding: 4px 0 } .tr { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 10px; align-items: center; width: 100%; padding: 6px 14px; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; border-radius: 0 }
button.tr:hover { background: var(--surface) } .th { padding-top: 8px; padding-bottom: 6px; font-size: 12px; font-weight: 800; color: var(--hint); cursor: default; text-transform: uppercase; letter-spacing: .3px }
.who { display: flex; align-items: center; gap: 12px; min-width: 0 } .tx { display: grid; min-width: 0; line-height: 1.25 } .tx b { font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.sub { font-size: 14px; font-weight: 500; color: var(--hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .inv { font-size: 14px; font-weight: 700; color: var(--orange-d, var(--orange)) }
.onl { font-size: 14px; font-weight: 600; color: var(--blue) }
.ui { display: block } .uc { display: none } .uc.hint { font-size: 13px }
.tr .badge { font-size: 12px; padding: 2px 8px }
.prog { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700 } .bar { flex: 1; height: 8px; border-radius: 9px; background: var(--border); overflow: hidden; min-width: 40px } .bar i { display: block; height: 100%; background: var(--green); border-radius: 9px }
.tr .badge { white-space: nowrap }
/* Телефон: имя и юнит слева, оплата справа, прогресс — тонкой полосой под текстом */
.tr { grid-template-columns: minmax(0, 1fr) auto; row-gap: 0 } .tr > :nth-child(4) { grid-column: 1 / -1; padding-left: 68px } .th > :nth-child(4) { display: none }
@media (max-width: 767px) { .tx .sub:not(.ui) { display: none } .prog { font-size: 11px; margin-top: -4px } .bar { height: 5px } }
@media (min-width: 768px) { .tr { grid-template-columns: 1.4fr 1.4fr 1fr 1.2fr } .uc { display: block } .ui { display: none } .tr > :nth-child(4) { grid-column: auto; padding-left: 0 } .th > :nth-child(4) { display: block } }
/* Группы: заголовок и строки учеников на серой подложке с цветной полосой слева; между группами — отступ */
.gh { display: flex; align-items: center; gap: 6px; margin: 10px 10px 0; padding: 8px 12px 4px; border-radius: 14px 14px 0 0; background: var(--group); box-shadow: inset 4px 0 0 var(--gc);
  font-size: 12px; font-weight: 900; color: var(--gc); text-transform: uppercase; letter-spacing: .3px }
.gh.first { margin-top: 4px } .gh span { margin-left: auto; color: var(--hint); font-weight: 700; text-transform: none; letter-spacing: 0 }
.tr.ing { width: calc(100% - 20px); margin: 0 10px; background: var(--group); box-shadow: inset 4px 0 0 var(--gc) }
.tr.ing.last { border-radius: 0 0 14px 14px; margin-bottom: 4px }
button.tr.ing:hover { background: var(--border) }
.sl { margin: 12px 14px 2px; font-size: 12px; font-weight: 900; color: var(--hint); text-transform: uppercase; letter-spacing: .3px }
</style>
