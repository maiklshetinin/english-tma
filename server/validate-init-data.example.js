// Пример серверной проверки Telegram initData (Node 18+). Вызывайте на каждом защищённом запросе.
import crypto from 'node:crypto'
export function validateInitData(initData, botToken, maxAgeSec = 86400) {
  const p = new URLSearchParams(initData)
  const hash = p.get('hash'); p.delete('hash')
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex')
  if (!hash || hash.length !== calc.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null
  if (Date.now() / 1000 - Number(p.get('auth_date')) > maxAgeSec) return null
  return JSON.parse(p.get('user'))           // { id, first_name, username, ... } → ищем роль по user.id в БД
}
