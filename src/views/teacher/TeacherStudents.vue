<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pctOf, unitOf } from '../../store/app'
import { goUp } from '../../router'
import AddStudent from '../../components/AddStudent.vue'
import ArchivePanel from '../../components/ArchivePanel.vue'
import Avatar from '../../components/Avatar.vue'
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
      <button class="tr" v-for="s in studentStore.list" :key="s.id" @click="router.push({ name: 'students', params: { id: s.id } })">
        <span class="who"><Avatar :s="s" :size="56" /><span class="tx"><b>{{ s.name }}</b><small v-if="s.status === 'invited'" class="inv">ждёт приглашения</small><small v-else-if="s.username" class="sub">@{{ s.username }}</small><small class="sub ui">{{ unitOf(pathStore.of(s.id)) }}</small></span></span>
        <span class="hint uc">{{ unitOf(pathStore.of(s.id)) }}</span>
        <span><span class="badge" :class="PAY[s.payment.status][1]">{{ PAY[s.payment.status][0] }}</span></span>
        <span class="prog"><span class="bar"><i :style="{ width: pctOf(pathStore.of(s.id)) + '%' }" /></span>{{ pctOf(pathStore.of(s.id)) }}%</span>
      </button>
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
.ui { display: block } .uc { display: none } .uc.hint { font-size: 13px }
.tr .badge { font-size: 12px; padding: 2px 8px }
.prog { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700 } .bar { flex: 1; height: 8px; border-radius: 9px; background: var(--border); overflow: hidden; min-width: 40px } .bar i { display: block; height: 100%; background: var(--green); border-radius: 9px }
.tr .badge { white-space: nowrap }
/* Телефон: имя и юнит слева, оплата справа, прогресс — тонкой полосой под текстом */
.tr { grid-template-columns: minmax(0, 1fr) auto; row-gap: 0 } .tr > :nth-child(4) { grid-column: 1 / -1; padding-left: 68px } .th > :nth-child(4) { display: none }
@media (max-width: 767px) { .tx .sub:not(.ui) { display: none } .prog { font-size: 11px; margin-top: -4px } .bar { height: 5px } }
@media (min-width: 768px) { .tr { grid-template-columns: 1.4fr 1.4fr 1fr 1.2fr } .uc { display: block } .ui { display: none } .tr > :nth-child(4) { grid-column: auto; padding-left: 0 } .th > :nth-child(4) { display: block } }
</style>
