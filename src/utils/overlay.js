// Свои поля запроса в API (24.11.2026): ключ request в JSON упражнения — объект поверх собранного запроса.
// Вложенные объекты сливаются, остальное (строки, числа, списки) заменяется, null — убрать поле.
// Так любой параметр API (topP, maxOutputTokens, mediaResolution…) настраивается без правки кода
const plainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
export function overlay(base, extra) {
  if (!plainObj(extra)) return base
  const o = { ...(plainObj(base) ? base : {}) }
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) delete o[k]
    else if (plainObj(v) && plainObj(o[k])) o[k] = overlay(o[k], v)
    else o[k] = v
  }
  return o
}
/** request экрана → своё для одного запроса (check, live…); нет — null */
export const reqOf = (c, name) => (plainObj(c?.request) && plainObj(c.request[name]) ? c.request[name] : null)
/** Сравнение настроек: строки — без краёв, объекты — по содержимому */
export const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.trim() === b.trim() : plainObj(a) || plainObj(b) ? JSON.stringify(a ?? {}) === JSON.stringify(b ?? {}) : a === b)
