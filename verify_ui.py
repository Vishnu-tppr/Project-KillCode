src = open(r'D:\Skillrack-Script\Anti-Cheat Bypass 5.0.user.js', encoding='utf-8').read()

checks = [
    ('Inter font injected',          'bypass-gfont' in src),
    ('Keyframe animations injected',  'bypassPulse' in src),
    ('Custom icon (base64) used',     'data:image/png;base64' in src),
    ('Gear emoji removed',            "settingsBtn.innerHTML = '\u2699\ufe0f'" not in src),
    ('Glassmorphism panel',           'backdrop-filter: blur(20px)' in src),
    ('SlideIn animation',             'bypassSlideIn' in src),
    ('Red gradient branding',         '#ef4444' in src),
    ('Inter font in toggles',         "'Inter', sans-serif" in src),
    ('SVG refresh icon',              'M17.65 6.35' in src),
    ('SVG heart icon',                'M12 21.35l-1.45' in src),
    ('Section headers upgraded',      'letter-spacing: 1.4px' in src),
    ('Panel slide-in on open',        'bypassSlideIn 0.28s' in src),
    ('Dialog glassmorphism',          'bypassSlideIn 0.3s cubic-bezier' in src),
]

all_pass = True
for name, passed in checks:
    status = 'PASS' if passed else 'FAIL'
    if not passed:
        all_pass = False
    print(f'  [{status}] {name}')

print()
print('[ALL PASS]' if all_pass else '[SOME CHECKS FAILED]')
