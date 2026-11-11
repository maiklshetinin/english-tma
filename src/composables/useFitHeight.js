// Высота SVG-графика «до низа окна»: в панели «Графики» курса на широком экране график растягивается по высоте,
// а не стоит маленьким с пустым местом снизу. viewBox ширины W — высоту считаем так, чтобы на экране он кончался
// над подписью (below px от низа окна). Узкий экран / выключено — обычная высота base.
import { ref, onMounted, onUnmounted } from 'vue'

export function useFitHeight(el, W, base, on, below = 64, max = 0.9) {
  const H = ref(base)
  let ro = null, w = 0
  const fit = () => {
    if (!on() || !el.value || typeof matchMedia !== 'function' || !matchMedia('(min-width: 900px)').matches) { H.value = base; return }
    const r = el.value.getBoundingClientRect(); if (!r.width) return
    H.value = Math.round(Math.max(base, Math.min(W * max, W * (innerHeight - r.top - below) / r.width)))
  }
  onMounted(() => {
    fit(); addEventListener('resize', fit)
    const p = el.value?.parentElement                         // ширина панели меняется перегородкой — пересчитать
    if (p && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(([e]) => { if (Math.abs(e.contentRect.width - w) > 2) { w = e.contentRect.width; fit() } }); ro.observe(p) }
  })
  onUnmounted(() => { removeEventListener('resize', fit); ro?.disconnect() })
  return H
}
