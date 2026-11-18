// Упражнения-шаблоны (18.11.2026): у каждого типа своя папка — разметка (.vue, один файл и для ученика, и для правки)
// и описание (.json: поля, как засчитывается ответ, какие слова идут в Review, навыки, время, лимиты).
// Общие детали — в parts/ (ExHead, ExMedia, ExAudio, ExText, ExRich, ExSay, ExTool, ExPop).
// Тип, которого здесь ещё нет, LessonPlayer и LessonRail рисуют по-старому — переезжают по одному.
import './parts/ex.css'
import Intro from './intro/Intro.vue'
import Choice from './choice/Choice.vue'
import Tip from './tip/Tip.vue'
import Pairs from './pairs/Pairs.vue'
import Order from './order/Order.vue'
import Speak from './speak/Speak.vue'
import intro from './intro/intro.json'
import choice from './choice/choice.json'
import tip from './tip/tip.json'
import pairs from './pairs/pairs.json'
import order from './order/order.json'
import speak from './speak/speak.json'

export const EX = {
  intro: { ...intro, view: Intro },
  choice: { ...choice, view: Choice },
  tip: { ...tip, view: Tip },
  pairs: { ...pairs, view: Pairs },
  order: { ...order, view: Order },
  speak: { ...speak, view: Speak },
}
/** Шаблон экрана — или null, если его тип ещё рисуется по-старому */
export const exOf = (s) => (s && !s.bk && EX[s.kind]) || null
