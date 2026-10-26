// Системная кнопка «Назад» Telegram (в шапке мини-приложения): показывается, пока открыта карточка ученика, и ведёт на шаг назад.
// В обычном браузере и в старых клиентах Telegram (нет BackButton) ничего не делает — там есть кнопка «Назад» в самой странице.
import { watchEffect, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export function useBackButton(visible: Ref<boolean>, onBack: () => void) {
  const btn = window.Telegram?.WebApp?.BackButton
  if (!btn) return
  btn.onClick(onBack)
  const stop = watchEffect(() => { try { visible.value ? btn.show() : btn.hide() } catch { /* старые версии клиента */ } })
  onUnmounted(() => { stop(); try { btn.offClick(onBack); btn.hide() } catch { /* старые версии клиента */ } })
}
