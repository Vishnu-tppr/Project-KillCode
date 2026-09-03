#!/usr/bin/env python3
"""Inventory + tracker for the solutions bank.

Usage:
  python3 status.py                        # list every solutions/<id>.md
  python3 status.py <enum.json>             # solved/pending vs an enumeration
  python3 status.py <stmts.json>            # solved/missing vs fetched statements
  python3 status.py <enum-or-stmts.json> --md document.md   # write tracker to file
  python3 status.py --langs                 # just the per-language counts

Tracks "completed" (a solutions/<id>.md exists), "pending" (known via the
enum/statements but no solution yet), and per-language/per-section breakdown.
"""
import os, re, sys, json, argparse, html

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOL = os.path.join(REPO, 'solutions')
FENCE = re.compile(r'^```(\w+)', re.M)


def lang_of(tag):
    t = (tag or '').lower().replace('c++', 'cpp')
    return {'c': 'c', 'cpp': 'cpp', 'java': 'java',
            'py': 'python', 'python3': 'python', 'python': 'python'}.get(t, t or '?')

def iter_solutions():
    out = {}
    if not os.path.isdir(SOL):
        return out
    for fn in sorted(os.listdir(SOL)):
        if not fn.endswith('.md'):
            continue
        pid = fn[:-3]
        text = open(os.path.join(SOL, fn), encoding='utf-8', errors='replace').read()
        nm = re.search(r'^#\s*Id\s+\S+?\s*[—-]\s*(.+)$', text, re.M)
        m = FENCE.search(text)
        out[pid] = {'id': pid, 'name': (html.unescape(nm.group(1).strip()) if nm else '?'),
                    'lang': lang_of(m.group(1)) if m else '?'}
    return out

def flatten_enum(raw):
    """enum.json (nested sections->parts->[rows]) -> {pid: {name, sub, part}}."""
    ents = {}
    for sname, parts in raw.items():
        if not isinstance(parts, dict):
            continue
        for pname, plist in parts.items():
            for p in plist or []:
                if p.get('id'):
                    ents[p['id']] = {**{k: v for k, v in p.items() if k != 'id'},
                                     'id': p['id'], 'sub': sname, 'part': pname}
    return ents

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('data', nargs='?', help='enum.json or stmts.json for pending/solved cross-check')
    ap.add_argument('--md', help='write a full markdown tracker to this file')
    ap.add_argument('--langs', action='store_true', help='only print per-language counts')
    args = ap.parse_args()

    sol = iter_solutions()
    langs = {}
    for p in sol.values():
        langs[p['lang']] = langs.get(p['lang'], 0) + 1

    if args.langs:
        for k in sorted(langs):
            print('{:8s} {:4d}'.format(k, langs[k]))
        return 0

    lines = []
    lines.append('# Status — solved / pending')
    lines.append('')
    lines.append('Scanned {n} solution files in `solutions/` (per-language: {L}).'.format(
        n=len(sol), L=', '.join('{}={}'.format(k, v) for k, v in sorted(langs.items()))))
    lines.append('')
    lines.append('The userscript fetches these by **ProgramID** from this repo by '
                 'default — `https://raw.githubusercontent.com/ToonTamilIndia/'
                 'skillrack-userscript/main/solutions/<id>.md` (GitHub raw URL, '
                 'no server needed). For dev/testing point Settings → "Solutions '
                 'Base URL" at a local server (e.g. `http://localhost:3000`, run '
                 '`node solutions-server.js`); AI is the final fallback.')
    lines.append('')

    if not args.data:
        lines.append('## Solved solutions')
        lines.append('')
        lines.extend(md_table(sorted(sol.values(), key=lambda p: int(p['id']))))
        print('\n'.join(lines))
        return 0

    raw = json.load(open(args.data))
    # detect: flat stmts (values contain 'samples'/'description') vs nested enum
    flat = any(isinstance(v, dict) and ('samples' in v or 'description' in v) for v in raw.values())
    if flat:
        known = {k: {'id': k, 'name': v.get('name', '?'),
                     'sub': v.get('section') or v.get('sub') or '?',
                     'part': v.get('part') or '?'}
                 for k, v in raw.items() if isinstance(v, dict)}
        kind = 'statement set'
    else:
        known = flatten_enum(raw)
        kind = 'enumeration'
    pending = sorted((p for pid, p in known.items() if pid not in sol), key=lambda p: int(p['id']))
    missing_stmt = sorted((pid for pid in sol if pid not in known), key=lambda x: int(x))
    sections = {}
    for pid, p in known.items():
        sec = p.get('sub') or '?'
        parts = sections.setdefault(sec, {'solved': 0, 'pending': 0})
        if pid in sol:
            parts['solved'] += 1
        else:
            parts['pending'] += 1

    lines.append('## Summary vs {} ({} problems)'.format(kind, len(known)))
    lines.append('')
    lines.append('| Section | Solved | Pending |')
    lines.append('|---------|-------:|--------:|')
    for sec in sorted(sections):
        s = sections[sec]
        lines.append('| {} | {} | {} |'.format(sec, s['solved'], s['pending']))
    lines.append('')
    lines.append('**Total solved:** {} / {}'.format(len(known) - len(pending), len(known)))
    lines.append('')
    lines.append('### Pending (enumerated but no solution yet) — {}'.format(len(pending)))
    lines.append('')
    if pending:
        lines.append('| Id | Problem | Section |')
        lines.append('|----|---------|---------|')
        for p in pending:
            lines.append('| {} | {} | {} |'.format(p['id'], p['name'], p.get('sub', '?')))
    else:
        lines.append('_none_')
    lines.append('')
    if missing_stmt:
        lines.append('### Solutions not present in the {} — {}'.format(kind, len(missing_stmt)))
        lines.append('')
        lines.append(', '.join(missing_stmt))
        lines.append('')

    lines.append('## Solved solutions (all)')
    lines.append('')
    lines.extend(md_table(sorted(sol.values(), key=lambda p: int(p['id']))))

    md = '\n'.join(lines) + '\n'
    if args.md:
        open(args.md, 'w').write(md)
        print('wrote tracker ->', args.md, '({} problems, {} pending)'.format(len(known), len(pending)))
    else:
        print(md)
    return 0

def md_table(items):
    rows = ['| Id | Problem | Lang |', '|----|---------|------|']
    for p in items:
        rows.append('| {} | {} | {} |'.format(p['id'], p['name'], p['lang']))
    return rows

if __name__ == '__main__':
    sys.exit(main())