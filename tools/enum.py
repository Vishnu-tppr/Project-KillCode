#!/usr/bin/env python3
"""Enumerate unsolved problems for a language/level page.

Usage: python3 enum.py <pack_or_level> [--json <out.json>]
       python3 enum.py 0            # CODETUTOR pack 0 (C)
       python3 enum.py 3 --lev 3    # CODETRACK level 3

CODETUTOR pack_index:
  0 = C         1 = Java         2 = Python
  3 = C++       4 = SQL          5 = Data Structures in C
  6 = Data Structures in Java

CODETRACK level (--lev): 2..6, or 100 for Prime.

Flow (PrimeFaces POSTs, each with its own form-scoped ViewState):
  BASE page -> POST pack button (pkglistform form)
            -> POST sub-challenge (pkglistform form)
            -> POST part          (codetracks form -> codeprogram.xhtml)
            -> problem cards (pctbl:<row>:j_id_5w)

Outputs a JSON dict: { "<sub-challenge name>": { "<part name>": [ {row, id, name} ] } }
Only unsolved problems are shown by SkillRack.
The site's problem list is LIVE/rotating (solved entries disappear).
"""
import re, json, sys, time, html, tempfile, os
import sack

PACKS = {0: 'C', 1: 'Java', 2: 'Python', 3: 'C++', 4: 'SQL', 5: 'DS-C', 6: 'DS-Java'}


def vs_in_form(body, fid):
    """ViewState belonging to a specific form id (each form carries its own)."""
    pos = body.find('id="%s"' % fid)
    if pos == -1:
        return sack.viewstate(body)
    m = re.search(r'name="jakarta.faces.ViewState"[^>]*value="([^"]*)"', body[pos:])
    return m.group(1) if m else None


def pack_open(body, pack):
    vs = vs_in_form(body, 'pkglistform')
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        'pkglistform:cttbl:{p}:j_id_41'.format(p=pack): 'pkglistform:cttbl:{p}:j_id_41'.format(p=pack),
        'jakarta.faces.ViewState': vs}, name='pack.html')


def sub_challenges(body):
    """[{sidx, name}] — the ~23 sub-challenges in a pack."""
    out = []
    for m in re.finditer(r'id="pkglistform:j_id_49:(\d+):j_id_4h"', body):
        sidx = m.group(1)
        seg = body[max(0, m.start() - 1200):m.start()]
        nm = re.findall(r'<div class="ui header black">([^<]+)</div>', seg)
        out.append({'sidx': int(sidx), 'name': nm[-1].strip() if nm else '?'})
    return sorted(out, key=lambda s: s['sidx'])


def click_sub(body, sidx):
    vs = vs_in_form(body, 'pkglistform')
    return sack.get(sack.BASE, {
        'pkglistform_SUBMIT': '1',
        'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx): 'pkglistform:j_id_49:{s}:j_id_4h'.format(s=sidx),
        'jakarta.faces.ViewState': vs}, name='sub.html')


def part_cards(body):
    """[{row, name}] — parts of a sub-challenge (cttbl buttons)."""
    cards = []
    for m in re.finditer(r'<button id="cttbl:(\d+):j_id_4u"', body):
        idx = m.start()
        seg = body[max(0, idx - 1800):idx]
        nm = re.findall(r'<b>([^<]+)</b>', seg)
        cards.append({'row': int(m.group(1)), 'name': nm[-1].strip() if nm else '?'})
    return sorted(cards, key=lambda c: c['row'])


def click_part(body, row):
    vs = vs_in_form(body, 'codetracks')
    return sack.get(sack.CODENV, {
        'codetracks_SUBMIT': '1',
        'cttbl:{r}:j_id_4u'.format(r=row): 'cttbl:{r}:j_id_4u'.format(r=row),
        'jakarta.faces.ViewState': vs}, referer=sack.BASE, name='part.html')


def extract_problems(part_html):
    """Problem cards hold `Name (Id-<id>)` INSIDE the card, before the button."""
    probs = []
    for m in re.finditer(r'<b>([^<]*?)\s*\(Id-(\d+)\)', part_html):
        nm, pid = m.group(1).strip(), m.group(2)
        seg = part_html[m.start():m.start() + 1200]
        rowm = re.search(r'id="pctbl:(\d+):j_id_5w"', seg)
        if not rowm:
            continue
        probs.append({'row': int(rowm.group(1)), 'id': pid, 'name': html.unescape(nm)})
    return sorted(probs, key=lambda p: p['row'])


def main():
    pack = int(sys.argv[1])
    lev = None
    if '--lev' in sys.argv:
        lev = int(sys.argv[sys.argv.index('--lev') + 1])
        sack.BASE = sack.base_for(lev)
    outjson = None
    if '--json' in sys.argv:
        outjson = sys.argv[sys.argv.index('--json') + 1]
    print('Pack', pack, '=', PACKS.get(pack), '| lev =', lev, flush=True)
    sack.get(sack.BASE, name='root.html')  # warm session
    body = pack_open(open(sack.scratch('root.html')).read(), pack)
    if 'Expired' in body or 'j_security_check' in body or len(body) < 5000:
        raise SystemExit('Pack open FAILED (bad/rotated cookie or ' +
                         '2025 layout drift). Check tools/cookie.txt.')
    subs = sub_challenges(body)
    print('sub-challenges:', len(subs), flush=True)
    out = {}
    for s in subs:
        def fresh_sub():
            # ViewStates are single-use; replay root->pack->sub fresh each call.
            root = sack.get(sack.BASE, name='root.html')
            pk = pack_open(root, pack)
            sb = click_sub(pk, s['sidx'])
            if len(sb) < 5000 or 'Expired' in sb:
                raise RuntimeError('sub expired')
            return sb

        try:
            cards = part_cards(fresh_sub())
        except RuntimeError:
            print('[{sidx}] {name}: SHORT/expired — skip'.format(**s), flush=True)
            continue
        out[s['name']] = {}
        for card in cards:
            try:
                pb = click_part(fresh_sub(), card['row'])
            except RuntimeError:
                print('  part', card['name'], 'short/expired', flush=True)
                continue
            probs = extract_problems(pb)
            out[s['name']][card['name']] = probs
            first = probs[0]['name'] if probs else 'NONE'
            print('[{sidx}] {name} | {c} => {n} first={f}'.format(
                sidx=s['sidx'], name=s['name'][:40], c=card['name'], n=len(probs), f=first),
                flush=True)
            time.sleep(0.15)
        _default = os.path.join(tempfile.gettempdir(), 'sack_enum.json')
        json.dump(out, open(outjson or _default, 'w'), indent=1)
    if outjson:
        json.dump(out, open(outjson, 'w'), indent=1)
        print('wrote', outjson)
    else:
        _default = os.path.join(tempfile.gettempdir(), 'sack_enum.json')
        json.dump(out, open(_default, 'w'), indent=1)
        print('wrote', _default)


if __name__ == '__main__':
    main()