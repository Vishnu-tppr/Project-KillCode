"""
Bump font-size values inside CSS style strings in the UI sections ONLY.
The settings panel + dialogs live approximately in lines 1-4100.
Everything after that is functional JS (AI solver, captcha, etc.) — skip it.
Bump amount: +4px (VT323 needs ~4px more than Inter at the same visual size).
"""
import re

path = r'D:\Skillrack-Script\Anti-Cheat Bypass 5.0.user.js'
src = open(path, encoding='utf-8').read()

# Split at the boundary between UI code and functional code.
# "AI SOLUTION GENERATOR" section marker sits around line 5236 in the original
# but after our edits is around line 5300. We split on a stable string.
BOUNDARY = '// ============================================\n    // 10. AI SOLUTION GENERATOR'
parts = src.split(BOUNDARY, 1)

if len(parts) != 2:
    print('ERROR: boundary not found!')
    exit(1)

ui_part, rest_part = parts

before = len(re.findall(r'font-size[\s]*:[\s]*[\d.]+px', ui_part))

def bump(m):
    px = float(m.group(1))
    bumped = px + 4
    return f'font-size: {int(bumped) if bumped == int(bumped) else bumped}px'

def bump_nospace(m):
    px = float(m.group(1))
    bumped = px + 4
    return f'font-size:{int(bumped) if bumped == int(bumped) else bumped}px'

ui_part = re.sub(r'font-size: ([\d.]+)px',  bump,          ui_part)
ui_part = re.sub(r'font-size:([\d.]+)px',   bump_nospace,  ui_part)

after = len(re.findall(r'font-size[\s]*:[\s]*[\d.]+px', ui_part))

result = ui_part + BOUNDARY + rest_part
open(path, 'w', encoding='utf-8').write(result)
print(f'Bumped {before} font-size declarations in UI section (+4px each).')
print(f'Remaining in UI: {after} | Functional code untouched.')
