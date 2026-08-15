#!/usr/bin/env python3
"""Fetch statements + samples for enumerated problem ids.

Usage: python3 fetch.py <enum.json> <pack_index> --out <out.json>

<enum.json> = output of enum.py (nested sections -> parts -> rows) and each row
has {row, id, name}. We rebuild the section-name -> sub-challenge-index map by a
live scan (like enum), then per problem open its sub-challenge and click its row
to reach the solve page, and extract the statement + samples.

Output: { "<pid>": {id,name,description,samples:[{input,output}],pre} }

CRAWL CAVEAT: scraped output blocks are polluted with appended `Explanation:`
prose / HTML entities / leading newline. The verifier normalises whitespace but
sees the appended prose, so a FAIL may be data pollution, not a code bug.
"""
import re, json, sys, time, os
import sack

LOG = '/tmp/sack_fetch_progress.txt'


def log(*a):
    with open(LOG, 'a') as f:
        f.write(' '.join(str(x) for x in a) + '\n')


def part_cards(list_html):
    cards = []
    for m in re.finditer(r'<button id="cttbl:(\d+):j_id_4u"', list_html):
        idx = m.start()
        seg = list_html[max(0, idx - 1800):idx]
        nm = re.findall(r'<b>([^<]+)</b>', seg)
        cards.append({'row': int(m.group(1)), 'name': nm[-1].strip() if nm else '?'})
    return sorted(cards, key=lambda c: c['row'])


def extract_problems(list_html):
    probs = []
    for m in re.finditer(r'<button id="pctbl:(\d+):j_id_5w"', list_html):
        idx = m.start()
        seg = list_html[max(0, idx - 900):idx]
        idm = re.search(r'\(Id-(\d+)\)', seg)
        nm = re.search(r'>\s*([^<>]*?)\s*\(Id-', seg)
        probs.append({'row': int(m.group(1)),
                      'id': idm.group(1) if idm else None,
                      'name': nm.group(1).strip() if nm else '?'})
    return sorted(probs, key=lambda p: p['row'])


def extract_solve(sol_html, pid, name):
    t = re.sub(r'<script.*?</script>', '', sol_html, flags=re.S)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    tt = re.sub(r'<[^>]+>', ' ', t)
    tt = re.sub(r'[ \t]+', ' ', tt)
    lines = [l.strip() for l in tt.split('\n') if l.strip()]
    txt = '\n'.join(lines)
    start = txt.find(name)
    end = txt.find('Max Execution Time Limit')
    desc = txt[start:end].strip() if 0 <= start < end else (txt[:end].strip() if end > 0 else txt.strip())
    samples = []
    for chunk in re.split(r'Example Input/Output\s*\d*:', txt):
        im = re.search(r'Input:\s*\n?(.*?)\n\s*Output:\s*\n?(.*)', chunk, re.S)
        if im:
            samples.append({'input': im.group(1).strip(), 'output': im.group(2).strip()})
    if samples:
        samples[-1]['output'] = samples[-1]['output'].split('Max Execution Time Limit')[0].strip()
    pres = [re.sub(r'<[^>]+>', '', p).strip() for p in re.findall(r'<pre[^>]*>(.*?)</pre>', sol_html, flags=re.S)]
    return {'id': pid, 'name': name, 'description': desc, 'samples': samples, 'pre': pres}


def open_pack(body, pack):
    vs = sack.viewstate(body)
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        'pkglistform:cttbl:{p}:j_id_41'.format(p=pack): 'pkglistform:cttbl:{p}:j_id_41'.format(p=pack),
        'jakarta.faces.ViewState': vs}, name='pack.html')


def open_section(pack, sidx):
    body = sack.get(sack.BASE, name='sec.html')
    body = open_pack(body, pack)
    vs_pack = sack.viewstate(body)
    b = sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx): 'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx),
        'jakarta.faces.ViewState': vs_pack}, name='sub.html')
    return b


def get_list(sub_vs):
    return sack.get(sack.CODENV, {
        'codetracks_SUBMIT': '1', 'cttbl:0:j_id_4u': 'cttbl:0:j_id_4u',
        'jakarta.faces.ViewState': sub_vs}, referer=sack.BASE, name='list.html')


def open_section_wrap(pack, sidx):
    body = sack.get(sack.BASE, name='s{}.html'.format(sidx))
    body = open_pack(body, pack)
    vs_pack = sack.viewstate(body)
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx): 'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx),
        'jakarta.faces.ViewState': vs_pack}, name='sub{}.html'.format(sidx))


def main():
    enum_json = sys.argv[1]
    pack = int(sys.argv[2])
    out = '/tmp/sack_stmts.json'
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    raw = json.load(open(enum_json))
    # Build entries {pid: {name, row, sub}}
    entries = {}
    for sname, parts in raw.items():
        if not isinstance(parts, dict):
            continue
        for pname, plist in parts.items():
            for p in plist or []:
                if p.get('id'):
                    e = dict(p); e['sub'] = sname
                    entries[p['id']] = e
    print('entries:', len(entries), flush=True)
    name2sidx = fetch_to_sidx(pack)
    print('sections mapped:', len(name2sidx), flush=True)
    results = {}
    for pid, e in entries.items():
        sidx = name2sidx.get((e.get('sub') or '').lower())
        if sidx is None:
            log('NO INDEX', pid, e.get('name'), 'sub=', e.get('sub')); continue
        sol = ''
        for attempt in range(3):
            b = open_section_wrap(pack, sidx)
            liste = get_list(sack.viewstate(b))
            lcvs = sack.viewstate(liste)
            sol = sack.get(sack.CODENV, {
                'pcform_SUBMIT': '1',
                'pctbl:{r}:j_id_5w'.format(r=e['row']): 'pctbl:{r}:j_id_5w'.format(r=e['row']),
                'jakarta.faces.ViewState': lcvs}, referer=sack.CODENV, name='sol.html')
            if re.search(r'ProgramID[:-]?\s*{pid}\b'.format(pid=pid), sol) and len(sol) > 3000:
                break
            time.sleep(0.4)
        if not re.search(r'ProgramID[:-]?\s*{pid}\b'.format(pid=pid), sol):
            log('BAD', pid, e.get('name'), 'len', len(sol)); continue
        results[pid] = extract_solve(sol, pid, e.get('name', '?'))
        ok = 'Y' if results[pid]['samples'] else 'n'
        log('OK', pid, e.get('name'), 'samples', ok)
        json.dump(results, open(out, 'w'), indent=1)
        time.sleep(0.12)
    json.dump(results, open(out, 'w'), indent=1)
    log('DONE', len(results))


def fetch_to_sidx(pack):
    m = {}
    for sidx in range(23):
        b = open_section_wrap(pack, sidx)
        if len(b) < 1000:
            continue
        name = sack.crumb(b)
        if name and name != '?':
            m[name.lower()] = sidx
    return m


def json_dump(results, out, pid):
    json.dump(results, open(out, 'w'), indent=1)


if __name__ == '__main__':
    import time
    main()