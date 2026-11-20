// Подготовка Lottie-стикера персонажа (TalkAvatar.vue, 21.11.2026): у ртов «замораживаем» анимацию формы — открытый («mouth 3»)
// берём с кадра 50, закрытый («mouth_close») — с 104 — и даём им class ava-mo / ava-mc: тогда нужный рот можно показать на любом кадре.
// Делается прямо при загрузке — работает и со старым (неподготовленным) файлом из кэша браузера; уже подготовленный не меняется.
const at = (kfs, t) => {
  let b = kfs[0]
  for (const k of kfs) if (k && k.t <= t) b = k
  let v = b.s
  if (v === undefined) { const i = kfs.indexOf(b); v = i ? kfs[i - 1].e : undefined }          // старый формат: значение — конец предыдущего ключа
  return v
}
function freeze(o, t) {
  if (Array.isArray(o)) { for (const v of o) freeze(v, t); return }
  if (!o || typeof o !== 'object') return
  for (const [key, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && v.a === 1 && Array.isArray(v.k) && v.k[0] && typeof v.k[0] === 'object' && 't' in v.k[0]) {
      let val = at(v.k, t)
      if (key === 'ks' && o.ty === 'sh') val = Array.isArray(val) ? val[0] : val
      else if (Array.isArray(val) && val.length === 1) val = val[0]
      o[key] = { a: 0, k: val }
    } else freeze(v, t)
  }
}
export const MOUTHS = { open: ['mouth 3', 50, 'ava-mo'], closed: ['mouth_close', 104, 'ava-mc'] }
/** Стикер (Lottie JSON) → с «замороженными» ртами и class у них. Меняет и возвращает тот же объект */
export function prepSticker(data) {
  for (const l of data?.layers ?? []) for (const [nm, t, cl] of Object.values(MOUTHS)) if (l.nm === nm) { freeze(l.shapes, t); l.ks.o = { a: 0, k: 100 }; l.cl = cl }
  return data
}
