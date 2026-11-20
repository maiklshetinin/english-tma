// Упражнения-шаблоны (18.11.2026): у каждого типа своя папка — разметка (.vue, один файл и для ученика, и для правки)
// и описание (.json: поля, как засчитывается ответ, какие слова идут в Review, навыки, время, лимиты).
// Общие детали — в parts/ (ExHead, ExMedia, ExAudio, ExText, ExRich, ExSay, ExTool, ExPop).
import './parts/ex.css'
import Intro from './intro/Intro.vue'
import Choice from './choice/Choice.vue'
import Tip from './tip/Tip.vue'
import Pairs from './pairs/Pairs.vue'
import Order from './order/Order.vue'
import Speak from './speak/Speak.vue'
import Gap from './gap/Gap.vue'
import Answer from './answer/Answer.vue'
import Odd from './odd/Odd.vue'
import Sort from './sort/Sort.vue'
import Kp from './kp/Kp.vue'
import Talk from './talk/Talk.vue'
import intro from './intro/intro.json'
import choice from './choice/choice.json'
import tip from './tip/tip.json'
import pairs from './pairs/pairs.json'
import order from './order/order.json'
import speak from './speak/speak.json'
import gap from './gap/gap.json'
import answer from './answer/answer.json'
import odd from './odd/odd.json'
import sort from './sort/sort.json'
import kp from './kp/kp.json'
import talk from './talk/talk.json'

export const EX = {
  intro: { ...intro, view: Intro },
  choice: { ...choice, view: Choice },
  tip: { ...tip, view: Tip },
  pairs: { ...pairs, view: Pairs },
  order: { ...order, view: Order },
  speak: { ...speak, view: Speak },
  gap: { ...gap, view: Gap },
  answer: { ...answer, view: Answer },
  odd: { ...odd, view: Odd },
  sort: { ...sort, view: Sort },
  kp: { ...kp, view: Kp },
  talk: { ...talk, view: Talk },     // «Разговор с Gemini» — живой голосовой диалог, Live API (20.11.2026, эксперимент)          // «Ответ по смыслу» — Karta Polaka, проверяет Gemini (19.11.2026)
}
/** Шаблон экрана по его типу (все 11 типов — тут) */
export const exOf = (s) => (s && EX[s.kind]) || null
