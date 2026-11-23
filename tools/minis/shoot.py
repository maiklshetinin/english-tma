#!/usr/bin/env python3
"""Миниатюры шаблонов экранов → картинки public/minis/<шаблон>.webp и <шаблон>.dark.webp (23.11.2026).

Плитки на ветке урока и в меню «Exercise» показывают эти картинки, а не живые экраны (src/components/ExerciseMini.vue):
у шаблона одна картинка на все плитки — DOM не растёт с числом экранов. Поменяли шаблон или плеер — переснимите:

    npm run dev                      (в одном окне; адрес — http://localhost:5173/english-tma/)
    python tools/minis/shoot.py      (в другом)

Нужны: pip install playwright pillow  и  python -m playwright install chromium
Нет картинки у шаблона (новый) — плитка рисует себя живой, как раньше.
"""
import argparse, asyncio, io, os
from playwright.async_api import async_playwright
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'minis')
FISH = os.path.join(HERE, '..', '..', 'public', 'fish')
# миниатюра — «как в обычной работе»: ключ Gemini есть (только в этом браузере, запросов с ним нет), мост на связи,
# картинки «рыбы» — из public/fish (на localhost приложение берёт их с GitHub Pages)
INIT = "try { localStorage.setItem('tma.ai.keys.v1', JSON.stringify([{ key: 'AIza-minis-only', ok: true, err: '', until: 0, n: 0 }])) } catch {}"
MIME = {'.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4'}


async def fish(route):
    f = os.path.join(FISH, os.path.basename(route.request.url.split('?')[0]))
    if os.path.exists(f): await route.fulfill(path=f, content_type=MIME.get(os.path.splitext(f)[1], 'application/octet-stream'))
    else: await route.abort()
ap = argparse.ArgumentParser(description='Снять миниатюры шаблонов в public/minis/')
ap.add_argument('--url', default='http://localhost:5173/english-tma/', help='адрес npm run dev')
ap.add_argument('--scale', type=int, default=3, help='чёткость (во сколько раз больше 122×154)')
ap.add_argument('--chrome', help='путь к Chrome, если не ставили chromium через playwright')
ARGS = ap.parse_args()


async def shoot(pg, theme):
    await pg.goto(ARGS.url.rstrip('/') + '/tools/minis/minis.html?theme=' + theme)
    await pg.wait_for_function('window.__minis && document.querySelectorAll("[data-mini] .mini").length === window.__minis.length')
    await pg.evaluate('document.fonts.ready')
    await pg.wait_for_timeout(1500)          # картинки «рыбы» и шрифты домашки
    n = 0
    for id in await pg.evaluate('window.__minis'):
        el = pg.locator(f'[data-mini="{id}"] .mini')
        b = await el.bounding_box()
        png = await pg.screenshot(clip={'x': b['x'] + 1, 'y': b['y'] + 1, 'width': b['width'] - 2, 'height': b['height'] - 2})          # без рамки — её рисует плитка
        Image.open(io.BytesIO(png)).convert('RGB').save(os.path.join(OUT, id + ('.dark' if theme == 'dark' else '') + '.webp'), 'WEBP', quality=88, method=6)
        n += 1
    return n


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': ARGS.chrome} if ARGS.chrome else {}))
        ctx = await b.new_context(viewport={'width': 1600, 'height': 2400}, device_scale_factor=ARGS.scale)
        await ctx.add_init_script(INIT)
        await ctx.route('**/fish/*', fish)
        await ctx.route('**/ai/status*', lambda r: r.fulfill(status=200, content_type='application/json', body='{"online":true,"sites":["Gemini"]}'))
        await ctx.route('https://generativelanguage.googleapis.com/**', lambda r: r.abort())
        pg = await ctx.new_page()
        for theme in ('light', 'dark'):
            print(f'{theme}: {await shoot(pg, theme)} шаблонов')
        await b.close()
    print('Готово:', os.path.normpath(OUT))

asyncio.run(main())
