// Окна подтверждения, сообщений и ввода — вместо стандартных confirm / alert / prompt браузера.
// Одно окно на всё приложение (AppDialog.vue в App.vue), в стиле приложения и Telegram: заголовок, текст, кнопки.
//   if (!(await ask('Удалить карточку «пример»?', { ok: 'Удалить', danger: true }))) return
//   await say('Файл больше 200 МБ')
//   const url = await askText('Ссылка на фото', { value: '', placeholder: 'https://…' })     // null — отмена
// Enter — главная кнопка, Esc и нажатие мимо — отмена.
import { reactive } from 'vue'

export const dialog = reactive({ open: false, kind: 'ask', title: '', text: '', ok: 'OK', cancel: 'Отмена', danger: false, value: '', placeholder: '', resolve: null })

function show(opts) {
  if (dialog.open) dialog.resolve?.(dialog.kind === 'text' ? null : false)       // новое окно закрывает прежнее как «отмену»
  return new Promise((resolve) => Object.assign(dialog, { cancel: 'Отмена', danger: false, value: '', placeholder: '', title: '', ...opts, open: true, resolve }))
}
// Вопрос «да / нет». Короткий текст становится заголовком, подробности — вторым параметром или opts.text.
export const ask = (title, opts = {}) => show({ kind: 'ask', title, ok: opts.ok ?? 'OK', ...opts })
// Сообщение с одной кнопкой
export const say = (title, opts = {}) => show({ kind: 'say', title, ok: opts.ok ?? 'Понятно', ...opts })
// Строка текста; null — отмена
export const askText = (title, opts = {}) => show({ kind: 'text', title, ok: opts.ok ?? 'Готово', ...opts })

export function closeDialog(yes) {
  if (!dialog.open) return
  const r = dialog.resolve, v = dialog.kind === 'text' ? (yes ? dialog.value : null) : dialog.kind === 'say' ? undefined : !!yes
  dialog.open = false; dialog.resolve = null; r?.(v)
}
