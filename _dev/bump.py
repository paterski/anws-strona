"""Ustawia numer wersji (?v=...) przy plikach CSS/JS we wszystkich stronach HTML,
żeby po wdrożeniu przeglądarki nie używały starych plików z pamięci podręcznej.
Uruchom przed każdym commitem:  python _dev/bump.py"""
import pathlib, re, time
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M')
for html in root.glob('*.html'):
    s = html.read_text(encoding='utf-8')
    s2 = re.sub(r'((?:src|href)="(?:js|css)/[\w.-]+\.(?:js|css))(?:\?v=\w+)?"', r'\1?v=' + v + '"', s)
    if s2 != s:
        html.write_text(s2, encoding='utf-8')
print('wersja', v)
