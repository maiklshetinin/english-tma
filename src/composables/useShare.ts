// Копирование ссылки и «поделиться» через Telegram (для ссылок-приглашений).
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = Object.assign(document.createElement('textarea'), { value: text }); document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  }
}
/** «Поделиться» — окно выбора контакта в Telegram с готовым текстом и ссылкой. */
export function shareInvite(url: string): void {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Ссылка для входа в приложение для занятий английским 👇')}`
  const tg = window.Telegram?.WebApp
  tg?.initData ? tg.openTelegramLink(link) : window.open(link, '_blank')
}
