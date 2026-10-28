<script setup>
// Единый набор иконок в духе Telegram: 24x24, тонкая линия 1.8, скруглённые концы и углы. Добавляйте новые в карту P.
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 24 } })
const P = {
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.8"/><path d="M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7"/>',
  check: '<path d="M5.5 12.5l4 4L18.5 7.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="3"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',
  pencil: '<path d="M14.6 6.1l3.3 3.3"/><path d="M4.5 19.5l.8-3.9 10.4-10.4a2 2 0 0 1 2.9 0l.2.2a2 2 0 0 1 0 2.9L8.4 18.7z"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="2"/><rect x="17" y="14" width="4" height="7" rx="2"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 14v4M8 21h8"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/>',
  calendar: '<rect x="3.8" y="5" width="16.4" height="15" rx="3.2"/><path d="M3.8 9.8h16.4M8.2 3.2v3.4M15.8 3.2v3.4"/>',
  user: '<circle cx="12" cy="8.3" r="3.8"/><path d="M5 19.6c.7-3.3 3.4-5.1 7-5.1s6.3 1.8 7 5.1"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>',
  bell: '<path d="M6.2 10.3a5.8 5.8 0 0 1 11.6 0v3.9l1.5 2.3a.8.8 0 0 1-.7 1.3H5.4a.8.8 0 0 1-.7-1.3l1.5-2.3z"/><path d="M9.8 20.2a2.5 2.5 0 0 0 4.4 0"/>',
  wallet: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.8h17M15.5 14.2h1.5"/>',
  chat: '<path d="M12 4.2c4.6 0 8.3 3.1 8.3 7s-3.7 7-8.3 7c-.9 0-1.8-.1-2.6-.4L5 19.6l1.1-3.4c-1.5-1.3-2.4-3-2.4-5 0-3.9 3.7-7 8.3-7z"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  users: '<circle cx="9.5" cy="8.5" r="3.3"/><path d="M3.5 19c.6-3 3-4.7 6-4.7s5.4 1.7 6 4.7"/><path d="M15.5 5.6a3.1 3.1 0 0 1 0 5.8M17.6 14.6c1.6.6 2.6 2 2.9 4"/>',
  home: '<path d="M4 10.4l7-5.9a1.5 1.5 0 0 1 2 0l7 5.9"/><path d="M5.8 9v9.5A1.5 1.5 0 0 0 7.3 20H10v-5h4v5h2.7a1.5 1.5 0 0 0 1.5-1.5V9"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5l4 4"/>',
  next: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>', up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"/><path d="M6.2 6.5l.8 12a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l.8-12M10 10.5v6M14 10.5v6"/>', back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 9h16M4 15h16M10 9v12"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  download: '<path d="M12 4.5v10.5M7.5 10.8L12 15.2l4.5-4.4"/><path d="M5 19.5h14"/>',
  send: '<path d="M20.2 4.2L3.8 10.7c-.6.2-.6 1.1 0 1.3l4.6 1.6 1.7 5c.2.6 1 .7 1.4.2l2.6-3.1 4.2 3c.5.3 1.1 0 1.2-.5l2.1-13.2c.1-.5-.4-.9-.9-.7z"/><path d="M8.4 13.6l9.4-7.2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2"/><path d="M20 20v-5h-5"/>',
  copy: '<rect x="8.2" y="8.2" width="11.5" height="11.5" rx="2.8"/><path d="M15.8 8.2V6.8a2.5 2.5 0 0 0-2.5-2.5H6.8a2.5 2.5 0 0 0-2.5 2.5v6.5a2.5 2.5 0 0 0 2.5 2.5h1.4"/>',
  link: '<path d="M10.3 13.7a3.8 3.8 0 0 0 5.4 0l2.8-2.8a3.8 3.8 0 0 0-5.4-5.4l-.9.9"/><path d="M13.7 10.3a3.8 3.8 0 0 0-5.4 0l-2.8 2.8a3.8 3.8 0 0 0 5.4 5.4l.9-.9"/>',
}
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="P[name]" />
</template>
