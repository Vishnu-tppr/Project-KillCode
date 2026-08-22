#!/usr/bin/env python3
"""Fetch statements + samples for enumerated problems on any CODETUTOR/CODETRACK level.

Usage: python3 fetchlev.py <enum.json> [--lev <2..6|100>] [--out <out.json>]

Reuses enum.py's proven replay chain (root->pack->sub fresh per part, single-use
ViewState) to reach each problem's solve page and extracts statement + samples.

Output: { "<pid>": {id, name, section, part, description, samples:[{input,output}], pre:[]} }
"""
import re, json, sys, time, importlib.util, os
import sack

import tempfile
LOG = os.path.join(tempfile.gettempdir(), 'sack_fetch_progress.txt')


def log(*a):
    with open(LOG, 'a') as f:
        f.write(' '.join(str(x) for x in a) + '\n')


def load_ep():
    if 'ep' in sys.modules:
        return sys.modules['ep']
    spec = importlib.util.spec_from_file_location(
        'ep', os.path.join(os.path.dirname(__file__), 'enum.py'))
    ep = importlib.util.module_from_spec(spec)
    sys.modules['ep'] = ep
    spec.loader.exec_module(ep)
    return ep


def extract_solve(sol_html, pid, name):
    t = re.sub(r'<script.*?</script>', '', sol_html, flags=re.S)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    tt = re.sub(r'<[^>]+>', ' ', t)
    tt = re.sub(r'[ \t]+', ' ', tt)
    lines = [l.strip() for l in tt.split('\n') if l.strip()]
    txt = '\n'.join(lines)
    start = txt.find(name)
    end = txt.find('Proceed to Solve the Program')
    if end == -1:
        end = txt.find('Max Execution Time Limit')
    desc = txt[start:end].strip() if 0 <= start < end else txt.strip()
    samples = []
    for chunk in re.split(r'Example Input/Output\s*\d*:', txt):
        im = re.search(r'Input:\s*\n?(.*?)\n\s*Output:\s*\n?(.*)', chunk, re.S)
        if im:
            out = im.group(2).strip().split('Proceed to Solve the Program')[0].strip()
            samples.append({'input': im.group(1).strip(), 'output': out})
    pres = [re.sub(r'<[^>]+>', '', p).strip()
            for p in re.findall(r'<pre[^>]*>(.*?)</pre>', sol_html, flags=re.S)]
    return {'id': pid, 'name': name, 'description': desc,
            'samples': samples, 'pre': pres}


def main():
    args = sys.argv[1:]
    enum_json = args[0]
    lev = None
    if '--lev' in sys.argv:
        lev = int(sys.argv[sys.argv.index('--lev') + 1])
        sack.BASE = sack.base_for(lev)
    out = os.path.join(tempfile.gettempdir(), 'sack_stmts.json')
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    ep = load_ep()
    raw = json.load(open(enum_json))
    entries = {}   # pid -> {row, name, section, part}
    for sname, parts in raw.items():
        if not isinstance(parts, dict):
            continue
        for pname, plist in parts.items():
            for p in plist or []:
                if p.get('id'):
                    e = dict(p)
                    e['section'] = sname
                    e['part'] = pname
                    entries[p['id']] = e
    print('entries:', len(entries), flush=True)
    # map section names -> sidx live
    root = sack.get(sack.BASE, name='fr_root.html')
    pk = ep.pack_open(root, 0)
    subs = ep.sub_challenges(pk)
    sl = {s['name'].lower(): s['sidx'] for s in subs}
    print('sections mapped:', len(sl), flush=True)
    results = {}
    for pid, e in entries.items():
        name = e['name']
        sidx = sl.get((e['section'] or '').lower())
        if sidx is None:
            log('NO INDEX', pid, name, 'sub=', e['section']); continue
        part_name = e.get('part') or ''
        sol = ''
        done = False
        for attempt in range(4):
            try:
                def fresh_sub():
                    r2 = sack.get(sack.BASE, name='fr.html')
                    p2 = ep.pack_open(r2, 0)
                    s2 = ep.click_sub(p2, sidx)
                    if len(s2) < 5000 or 'Expired' in s2:
                        raise RuntimeError('sub expired')
                    return s2
                cards = ep.part_cards(fresh_sub())
                target = None
                for c in cards:
                    if part_name and (c['name'] == part_name or part_name in c['name']):
                        target = c['row']
                        break
                if target is None:
                    target = cards[0]['row']
                pb = ep.click_part(fresh_sub(), target)
                vs = ep.vs_in_form(pb, 'codetracks')
                found = False
                for pc in ep.extract_problems(pb):
                    if pc['id'] == pid:
                        row = pc['row']
                        found = True
                        break
                if not found:
                    raise RuntimeError('pid not on part page')
                sol = sack.get(sack.CODENV, {
                    'pcform_SUBMIT': '1',
                    'pctbl:{r}:j_id_5w'.format(r=row): 'pctbl:{r}:j_id_5w'.format(r=row),
                    'jakarta.faces.ViewState': vs}, referer=sack.CODENV, name='fsol.html')
            except RuntimeError as ex:
                sol = ''
                continue
            if re.search(r'ProgramID[-:\s]*{pid}\b'.format(pid=pid), sol) and len(sol) > 3000:
                done = True
                break
            time.sleep(0.3)
        if not done:
            log('BAD', pid, name, 'len', len(sol)); continue
        results[pid] = extract_solve(sol, pid, name)
        results[pid]['section'] = e['section']
        results[pid]['part'] = e['part']
        ok = 'Y' if results[pid]['samples'] else 'n'
        log('OK', pid, name, 'samples', ok)
        if len(results) % 10 == 0:
            print('progress', len(results), flush=True)
        json.dump(results, open(out, 'w'), indent=1)
        time.sleep(0.1)
    json.dump(results, open(out, 'w'), indent=1)
    print('DONE', len(results), '->', out, flush=True)


if __name__ == '__main__':
    main()