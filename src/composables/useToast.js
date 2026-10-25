import { reactive } from 'vue'
export const toast = reactive({ open: false, text: '', kind: 'ok', undo: null })
let timer = 0
export function showToast(text, undo = null, kind = 'ok') {
  clearTimeout(timer)
  Object.assign(toast, { open: true, text, undo, kind })
  timer = setTimeout(() => { toast.open = false }, undo ? 6000 : 3000)
}
export const hideToast = () => { clearTimeout(timer); toast.open = false }
