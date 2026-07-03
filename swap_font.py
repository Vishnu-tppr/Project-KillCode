import sys

path = r'D:\Skillrack-Script\Anti-Cheat Bypass 5.0.user.js'
src = open(path, encoding='utf-8').read()

before = src.count('Inter')

# 1. Swap the Google Fonts URL
src = src.replace(
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    'https://fonts.googleapis.com/css2?family=VT323&display=swap'
)

# 2. Swap every 'Inter' font-family reference
PAIRS = [
    ("'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
     "'VT323', monospace"),
    ("'Inter', sans-serif",   "'VT323', monospace"),
    ('"Inter", sans-serif',   '"VT323", monospace'),
    ("'Inter', monospace",    "'VT323', monospace"),
    ('"Inter", monospace',    '"VT323", monospace'),
    ('font-family: Inter',    'font-family: VT323'),
]

for old, new in PAIRS:
    src = src.replace(old, new)

after = src.count('Inter')
open(path, 'w', encoding='utf-8').write(src)
print(f'Done. Inter refs: {before} -> {after}')
