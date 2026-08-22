#!/usr/bin/env python3
"""Find all incomplete/unsolved questions on SkillRack using the provided cookie.

Usage:
  python3 find_incomplete.py                        # scan all packs
  python3 find_incomplete.py --lang c               # only C
  python3 find_incomplete.py --lang java python      # Java + Python
  python3 find_incomplete.py --out results.json      # save to JSON
  python3 find_incomplete.py --html results.html     # save clickable HTML report
  python3 find_incomplete.py --lang c --html r.html  # filter + HTML

Language aliases (case-insensitive):
  c, java, python, cpp/c++, sql, ds-c/dsc, ds-java/dsjava

Options:
  --lang LANG [LANG...]   Filter to specific languages
  --out FILE              Save JSON output to FILE
  --html FILE             Save an HTML report to FILE (auto-opens in browser)
  --no-open               Don't auto-open the HTML file
  -v, --verbose           Show all parts (even complete ones)
  -h, --help              Show this help
"""

from __future__ import annotations
import re, json, sys, time, html, tempfile, os, argparse, webbrowser
from datetime import datetime

# ── Path setup so we can import sack from tools/ ─────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)  # tools/ is on the path
import sack

# ── Constants ─────────────────────────────────────────────────────────────────
PACKS = {
    0: ('C',       'c'),
    1: ('Java',    'java'),
    2: ('Python',  'python'),
    3: ('C++',     'cpp'),
    4: ('SQL',     'sql'),
    5: ('DS-C',    'dsc'),
    6: ('DS-Java', 'dsjava'),
}

CODENV = 'https://skillrack.com/faces/candidate/codeprogram.xhtml'

LANG_ALIASES: dict[str, int] = {
    'c':      0,
    'java':   1,
    'python': 2,
    'py':     2,
    'cpp':    3,
    'c++':    3,
    'sql':    4,
    'ds-c':   5,
    'dsc':    5,
    'ds-java':6,
    'dsjava': 6,
}

LANG_ICONS = {
    'C':       '🅲 ',
    'Java':    '☕ ',
    'Python':  '🐍 ',
    'C++':     '➕ ',
    'SQL':     '🗄️  ',
    'DS-C':    '📊 ',
    'DS-Java': '📈 ',
}

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET   = '\033[0m'
BOLD    = '\033[1m'
GREEN   = '\033[32m'
YELLOW  = '\033[33m'
CYAN    = '\033[36m'
RED     = '\033[31m'
DIM     = '\033[2m'
BLUE    = '\033[34m'

def c(text: str, *codes: str) -> str:
    """Wrap text in ANSI codes (only if stdout is a tty)."""
    if not sys.stdout.isatty():
        return text
    return ''.join(codes) + text + RESET


# ── ViewState helpers ─────────────────────────────────────────────────────────
def vs_in_form(body: str, fid: str) -> str | None:
    pos = body.find(f'id="{fid}"')
    if pos == -1:
        return sack.viewstate(body)
    m = re.search(r'name="jakarta\.faces\.ViewState"[^>]*value="([^"]*)"', body[pos:])
    return m.group(1) if m else None


# ── HTTP helpers ──────────────────────────────────────────────────────────────
def pack_open(body: str, pack: int) -> str:
    vs = vs_in_form(body, 'pkglistform')
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        f'pkglistform:cttbl:{pack}:j_id_41': f'pkglistform:cttbl:{pack}:j_id_41',
        'jakarta.faces.ViewState': vs,
    }, name='pack.html')


def sub_challenges(body: str) -> list[dict]:
    out = []
    for m in re.finditer(r'id="pkglistform:j_id_49:(\d+):j_id_4h"', body):
        sidx = m.group(1)
        seg  = body[max(0, m.start() - 1200): m.start()]
        nm   = re.findall(r'<div class="ui header black">([^<]+)</div>', seg)
        out.append({'sidx': int(sidx), 'name': nm[-1].strip() if nm else '?'})
    return sorted(out, key=lambda s: s['sidx'])


def click_sub(body: str, sidx: int) -> str:
    vs = vs_in_form(body, 'pkglistform')
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        f'pkglistform:j_id_49:{sidx}:j_id_4h': f'pkglistform:j_id_49:{sidx}:j_id_4h',
        'jakarta.faces.ViewState': vs,
    }, name='sub.html')


def part_cards(body: str) -> list[dict]:
    cards = []
    for m in re.finditer(r'<button id="cttbl:(\d+):j_id_4u"', body):
        idx = m.start()
        seg = body[max(0, idx - 1800): idx]
        nm  = re.findall(r'<b>([^<]+)</b>', seg)
        cards.append({'row': int(m.group(1)), 'name': nm[-1].strip() if nm else '?'})
    return sorted(cards, key=lambda c: c['row'])


def click_part(body: str, row: int) -> str:
    vs = vs_in_form(body, 'codetracks')
    return sack.get(sack.CODENV, {
        'codetracks_SUBMIT': '1',
        f'cttbl:{row}:j_id_4u': f'cttbl:{row}:j_id_4u',
        'jakarta.faces.ViewState': vs,
    }, referer=sack.BASE, name='part.html')


def extract_problems(part_html: str) -> list[dict]:
    """Return unsolved problem entries from a part page."""
    probs = []
    for m in re.finditer(r'<b>([^<]*?)\s*\(Id-(\d+)\)', part_html):
        nm, pid = m.group(1).strip(), m.group(2)
        seg  = part_html[m.start(): m.start() + 1200]
        rowm = re.search(r'id="pctbl:(\d+):j_id_5w"', seg)
        if not rowm:
            continue
        probs.append({
            'row':  int(rowm.group(1)),
            'id':   pid,
            'name': html.unescape(nm),
            'link': f'{CODENV}?id={pid}',
        })
    return sorted(probs, key=lambda p: p['row'])


# ── Progress bar ──────────────────────────────────────────────────────────────
class ProgressBar:
    def __init__(self, total: int, width: int = 30):
        self.total   = total
        self.current = 0
        self.width   = width
        self.start   = time.time()

    def step(self, label: str = '') -> None:
        self.current += 1
        pct     = self.current / max(self.total, 1)
        filled  = int(self.width * pct)
        bar     = '█' * filled + '░' * (self.width - filled)
        elapsed = time.time() - self.start
        eta     = (elapsed / self.current) * (self.total - self.current) if self.current else 0
        eta_str = f'ETA {eta:.0f}s' if eta > 0 else 'done'
        label   = (label[:40] + '…') if len(label) > 40 else label.ljust(41)
        print(f'\r  [{bar}] {self.current}/{self.total} {eta_str}  {label}', end='', flush=True)

    def done(self) -> None:
        print()  # newline after bar


# ── Scan a single pack ────────────────────────────────────────────────────────
def scan_pack(pack_index: int, verbose: bool = False) -> dict:
    pack_name = PACKS[pack_index][0]
    icon      = LANG_ICONS.get(pack_name, '📝 ')
    print(f'\n{c("─"*60, DIM)}')
    print(f'{icon}{c(pack_name, BOLD, CYAN)}  (pack {pack_index})')
    print(f'{c("─"*60, DIM)}')

    # ── Fetch root / open pack ────────────────────────────────────────────────
    root = sack.get(sack.BASE, name='root.html')
    if _is_expired(root):
        print(f'  {c("[ERROR]", RED, BOLD)} Session expired or base page failed.')
        return {}

    pack_html = pack_open(root, pack_index)
    if _is_expired(pack_html):
        print(f'  {c("[ERROR]", RED, BOLD)} Failed to open pack — cookie may be stale.')
        return {}

    subs = sub_challenges(pack_html)
    if not subs:
        print(f'  {c("[WARN]", YELLOW)} No sub-challenges found (layout drift?).')
        return {}

    print(f'  {c(str(len(subs)), BOLD)} sub-challenges found')
    bar = ProgressBar(total=len(subs))

    pack_results: dict = {}

    for sub in subs:
        bar.step(sub['name'])

        def fresh_sub() -> str:
            root_ = sack.get(sack.BASE, name='root.html')
            pk_   = pack_open(root_, pack_index)
            sb_   = click_sub(pk_, sub['sidx'])
            if len(sb_) < 5000 or 'Expired' in sb_:
                raise RuntimeError('sub expired')
            return sb_

        try:
            sub_html = fresh_sub()
        except RuntimeError:
            continue

        cards = part_cards(sub_html)
        sub_results: dict = {}

        for card in cards:
            try:
                part_html = click_part(fresh_sub(), card['row'])
            except RuntimeError:
                continue

            probs = extract_problems(part_html)
            if probs:
                sub_results[card['name']] = probs
            elif verbose:
                sub_results[card['name']] = []

            time.sleep(0.15)

        if sub_results:
            pack_results[sub['name']] = sub_results

    bar.done()
    return pack_results


def _is_expired(body: str) -> bool:
    return 'Expired' in body or 'j_security_check' in body or len(body) < 5000


# ── Print summary to terminal ─────────────────────────────────────────────────
def print_results(all_results: dict) -> int:
    total = 0
    for pack_data in all_results.values():
        for sub_data in pack_data.values():
            for probs in sub_data.values():
                total += len(probs)

    print(f'\n{"="*60}')
    print(c('SUMMARY', BOLD))
    print(f'{"="*60}')
    print(f'Total incomplete questions: {c(str(total), BOLD, RED if total else GREEN)}')

    if total == 0:
        print(f'\n{c("✓  All questions are complete!", GREEN, BOLD)}')
        return 0

    for pack_name, pack_data in all_results.items():
        icon = LANG_ICONS.get(pack_name, '📝 ')
        print(f'\n{icon}{c(pack_name, BOLD, CYAN)}')

        for sub_name, sub_data in pack_data.items():
            has_incomplete = any(p for p in sub_data.values())
            if not has_incomplete:
                continue
            print(f'  {c("▸", BLUE)} {sub_name}')

            for part_name, probs in sub_data.items():
                if not probs:
                    continue
                print(f'    {c("↳", DIM)} {part_name}  {c(f"({len(probs)} incomplete)", YELLOW)}')
                for p in probs:
                    print(f'      {c("•", RED)} {c(p["name"], BOLD)}')
                    print(f'        {c(p["link"], DIM)}')

    return total


# ── HTML report ───────────────────────────────────────────────────────────────
def build_html(all_results: dict, scanned_at: str) -> str:
    total = sum(
        len(probs)
        for pd in all_results.values()
        for sd in pd.values()
        for probs in sd.values()
    )

    rows_html = ''
    row_num   = 0

    for pack_name, pack_data in all_results.items():
        icon = LANG_ICONS.get(pack_name, '📝')
        for sub_name, sub_data in pack_data.items():
            for part_name, probs in sub_data.items():
                for p in probs:
                    row_num += 1
                    rows_html += f'''
                    <tr>
                        <td class="num">{row_num}</td>
                        <td><span class="badge badge-{pack_name.lower().replace("+","p").replace("-","")}">{icon}{pack_name}</span></td>
                        <td class="sub">{html.escape(sub_name)}</td>
                        <td class="part">{html.escape(part_name)}</td>
                        <td class="name">{html.escape(p["name"])}</td>
                        <td class="id">#{p["id"]}</td>
                        <td><a href="{p["link"]}" target="_blank" class="solve-btn">Solve →</a></td>
                    </tr>'''

    badge_colors = {
        'c':      '#4285f4',
        'java':   '#ea4335',
        'python': '#34a853',
        'cpp':    '#9c27b0',
        'cpppp':  '#9c27b0',
        'sql':    '#ff9800',
        'dsc':    '#00bcd4',
        'dsjava': '#607d8b',
    }
    badge_css = '\n'.join(
        f'.badge-{k} {{ background: {v}; }}'
        for k, v in badge_colors.items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SkillRack — Incomplete Questions ({total})</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            min-height: 100vh;
            padding: 32px 16px;
        }}
        .container {{ max-width: 1100px; margin: 0 auto; }}
        h1 {{
            font-size: 2rem;
            font-weight: 700;
            background: linear-gradient(90deg, #667eea, #f093fb);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }}
        .meta {{
            color: #8b949e;
            font-size: 0.85rem;
            margin-bottom: 28px;
        }}
        .stat-row {{
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }}
        .stat-card {{
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 10px;
            padding: 16px 24px;
            flex: 1;
            min-width: 160px;
        }}
        .stat-card .val {{
            font-size: 2rem;
            font-weight: 700;
            color: #f85149;
        }}
        .stat-card .lbl {{ color: #8b949e; font-size: 0.85rem; }}

        /* Search bar */
        .toolbar {{
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            align-items: center;
        }}
        #search {{
            flex: 1;
            min-width: 220px;
            padding: 10px 16px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            color: #c9d1d9;
            font-size: 0.9rem;
            outline: none;
        }}
        #search:focus {{ border-color: #667eea; }}
        select.filter {{
            padding: 10px 14px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            color: #c9d1d9;
            font-size: 0.9rem;
            cursor: pointer;
            outline: none;
        }}
        select.filter:focus {{ border-color: #667eea; }}

        /* Table */
        .table-wrap {{
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            overflow: hidden;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        thead tr {{
            background: #21262d;
            border-bottom: 1px solid #30363d;
        }}
        th {{
            padding: 12px 14px;
            text-align: left;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #8b949e;
            font-weight: 600;
        }}
        tbody tr {{
            border-bottom: 1px solid #21262d;
            transition: background 0.15s;
        }}
        tbody tr:hover {{ background: #1c2128; }}
        tbody tr:last-child {{ border-bottom: none; }}
        td {{
            padding: 11px 14px;
            font-size: 0.9rem;
            vertical-align: middle;
        }}
        td.num {{ color: #8b949e; width: 42px; }}
        td.id  {{ color: #8b949e; font-family: monospace; white-space: nowrap; }}
        td.sub {{ color: #8b949e; font-size: 0.82rem; max-width: 180px; }}
        td.part {{ color: #8b949e; font-size: 0.82rem; max-width: 150px; }}
        td.name {{ color: #e6edf3; font-weight: 500; }}

        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            color: #fff;
            white-space: nowrap;
        }}
        {badge_css}

        .solve-btn {{
            display: inline-block;
            padding: 5px 14px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: #fff;
            text-decoration: none;
            border-radius: 6px;
            font-size: 0.82rem;
            font-weight: 600;
            transition: opacity 0.2s;
            white-space: nowrap;
        }}
        .solve-btn:hover {{ opacity: 0.85; }}

        #no-results {{
            text-align: center;
            padding: 48px;
            color: #8b949e;
            display: none;
        }}
        footer {{
            text-align: center;
            color: #30363d;
            font-size: 0.78rem;
            margin-top: 32px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Incomplete Questions</h1>
        <div class="meta">Scanned: {scanned_at}</div>

        <div class="stat-row">
            <div class="stat-card">
                <div class="val" id="total-count">{total}</div>
                <div class="lbl">Total Incomplete</div>
            </div>
            <div class="stat-card">
                <div class="val">{len(all_results)}</div>
                <div class="lbl">Languages Affected</div>
            </div>
        </div>

        <div class="toolbar">
            <input id="search" type="text" placeholder="🔎  Search by name, section, ID…" oninput="filterTable()">
            <select class="filter" id="lang-filter" onchange="filterTable()">
                <option value="">All Languages</option>
                {''.join(f'<option value="{p}">{p}</option>' for p in all_results.keys())}
            </select>
        </div>

        <div class="table-wrap">
            <table id="main-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Lang</th>
                        <th>Section</th>
                        <th>Part</th>
                        <th>Problem</th>
                        <th>ID</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="tbody">
                    {rows_html}
                </tbody>
            </table>
            <div id="no-results">No matching questions found.</div>
        </div>

        <footer>Generated by KillCode · Project-KillCode</footer>
    </div>

    <script>
    function filterTable() {{
        const q    = document.getElementById('search').value.toLowerCase();
        const lang = document.getElementById('lang-filter').value.toLowerCase();
        const rows = document.querySelectorAll('#tbody tr');
        let shown  = 0;
        rows.forEach(row => {{
            const text = row.textContent.toLowerCase();
            const badge = row.querySelector('.badge');
            const rowLang = badge ? badge.textContent.trim().toLowerCase() : '';
            const matchQ    = !q    || text.includes(q);
            const matchLang = !lang || rowLang.includes(lang.toLowerCase());
            if (matchQ && matchLang) {{
                row.style.display = '';
                shown++;
            }} else {{
                row.style.display = 'none';
            }}
        }});
        document.getElementById('no-results').style.display = shown ? 'none' : 'block';
        document.getElementById('total-count').textContent = shown;
    }}
    </script>
</body>
</html>"""


# ── CLI entry point ───────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description='Find incomplete SkillRack questions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        '--lang', nargs='+', metavar='LANG',
        help='Filter to specific language(s): c java python cpp sql ds-c ds-java',
    )
    p.add_argument('--out',     metavar='FILE', help='Save JSON output to FILE')
    p.add_argument('--html',    metavar='FILE', help='Save clickable HTML report to FILE')
    p.add_argument('--no-open', action='store_true', help="Don't auto-open the HTML file")
    p.add_argument('-v', '--verbose', action='store_true',
                   help='Show all parts, including fully complete ones')
    return p.parse_args()


def resolve_pack_indices(lang_args: list[str] | None) -> list[int]:
    if not lang_args:
        return list(PACKS.keys())
    indices = []
    for l in lang_args:
        key = l.lower()
        if key in LANG_ALIASES:
            idx = LANG_ALIASES[key]
            if idx not in indices:
                indices.append(idx)
        else:
            print(f'{c("[WARN]", YELLOW)} Unknown language "{l}" — skipping.')
    return sorted(indices)


def main() -> None:
    args = parse_args()

    print(c('\nSkillRack — Incomplete Questions Finder', BOLD))
    print(c('=' * 45, DIM))
    print(f'  Cookie: {c("tools/cookie.txt", CYAN)}')

    pack_indices = resolve_pack_indices(args.lang)
    if not pack_indices:
        print(c('[ERROR] No valid languages specified.', RED))
        sys.exit(1)

    scanning_names = [PACKS[i][0] for i in pack_indices]
    print(f'  Scanning: {c(", ".join(scanning_names), YELLOW)}')

    # Warm up session
    print(f'\n{c("Warming up session…", DIM)}', end=' ', flush=True)
    warmup = sack.get(sack.BASE, name='warmup.html')
    if _is_expired(warmup):
        print(c('FAILED', RED, BOLD))
        print(f'\n{c("[ERROR]", RED, BOLD)} Cookie appears expired or invalid.')
        print('  → Update tools/cookie.txt with a fresh cookie from your browser.')
        sys.exit(1)
    print(c('OK ✓', GREEN, BOLD))

    all_results: dict = {}
    total_incomplete = 0
    started_at = datetime.now()

    for idx in pack_indices:
        pack_name    = PACKS[idx][0]
        pack_results = scan_pack(idx, verbose=args.verbose)
        if pack_results:
            all_results[pack_name] = pack_results
            for sub in pack_results.values():
                for probs in sub.values():
                    total_incomplete += len(probs)
        time.sleep(0.5)

    scanned_at = started_at.strftime('%Y-%m-%d %H:%M:%S')
    total_incomplete = print_results(all_results)

    # JSON output
    out_json = args.out or os.path.join(tempfile.gettempdir(), 'skillrack_incomplete.json')
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f'\n{c("JSON saved →", DIM)} {out_json}')

    # HTML report
    if args.html or total_incomplete > 0:
        html_path = args.html or os.path.join(tempfile.gettempdir(), 'skillrack_incomplete.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(build_html(all_results, scanned_at))
        print(f'{c("HTML saved →", DIM)} {html_path}')
        if not args.no_open and total_incomplete > 0:
            webbrowser.open(f'file://{html_path}')


if __name__ == '__main__':
    main()