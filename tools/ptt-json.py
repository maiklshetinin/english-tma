#!/usr/bin/env python3
"""PDF домашки Karta Polaka → JSON экранов «Разговор · рация»: нажал — говоришь, нажал ещё раз — отправил; один вопрос — один экран.

Один скрипт — одно упражнение (21.11.2026). Проще всего: положить PDF в tools/pdf/ и дважды щёлкнуть «Сделать рацию.bat» —
JSON появятся в tools/json/рация/.
Из терминала:
    python tools/ptt-json.py                          # все PDF из tools/pdf/ → tools/json/рация/
    python tools/ptt-json.py "ДЗ 8. Кухня.pdf"         # рядом появится «ДЗ 8. Кухня.рация.json»
    python tools/ptt-json.py "ДЗ 8.pdf" --no-avatar    # без персонажа

Экраны (роль консула, вопрос, эталон) собирает tools/talk-json.py — тот же разговор; этот скрипт ставит им "ptt": true
(шаблон «Разговор · рация»: речь пишет Transcribe Live, отвечает Gemini Live, язык закреплён).
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TALK = os.path.join(HERE, 'talk-json.py')

ap = argparse.ArgumentParser(description='PDF домашки Karta Polaka → JSON экранов «Разговор · рация»')
ap.add_argument('src', nargs='?', help='PDF домашки или JSON «Ответа по смыслу» (без него — все PDF из tools/pdf/ → tools/json/рация/)')
ap.add_argument('-o', '--out', help='куда сохранить JSON (по умолчанию — рядом, «<имя>.рация.json»)')
ap.add_argument('--no-avatar', action='store_true', help='без персонажа')
ap.add_argument('--lesson', help='название урока, если в PDF его нет текстом')
ARGS = ap.parse_args()


def talk(src):
    """Экраны разговора — через talk-json.py во временный файл"""
    fd, tmp = tempfile.mkstemp(suffix='.json'); os.close(fd)
    try:
        cmd = [sys.executable, TALK, src, '-o', tmp] + (['--no-avatar'] if ARGS.no_avatar else []) + (['--lesson', ARGS.lesson] if ARGS.lesson else [])
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0: sys.exit((r.stderr or r.stdout).strip() or 'Не получилось собрать экраны')
        return json.load(open(tmp, encoding='utf-8'))
    finally:
        os.remove(tmp)


def one(src, out):
    if not os.path.exists(src): sys.exit(f'Нет файла: {src}')
    d = talk(src)
    for s in d.get('steps', []): s['ptt'] = True
    json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Готово: {out}')
    print(f'  экранов: {len(d.get("steps", []))} (один вопрос — один экран) · рация' + ('' if ARGS.no_avatar else ' · с персонажем'))


if ARGS.src:
    one(ARGS.src, ARGS.out or re.sub(r'\.(pdf|json)$', '', ARGS.src, flags=re.I) + '.рация.json')
else:
    IN, OUT = os.path.join(HERE, 'pdf'), os.path.join(HERE, 'json', 'рация')
    os.makedirs(IN, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(IN) if f.lower().endswith('.pdf'))
    if not pdfs: sys.exit(f'В папке {IN} нет PDF — положите туда домашки и запустите ещё раз')
    ok = 0
    for f in pdfs:
        print(f'\n— {f}')
        try: one(os.path.join(IN, f), os.path.join(OUT, os.path.splitext(f)[0] + '.json')); ok += 1
        except SystemExit as e: print(e)
    print(f'\nИтого: готово {ok} из {len(pdfs)} · JSON — в {OUT}')
    sys.exit(0 if ok == len(pdfs) else 1)
