#!/usr/bin/env python3
"""Verify a solution (markdown solution file) against recorded sample I/O.

Usage:
  python3 verify.py <solutions/<id>.md> [<samples json>] [--lang c|cpp|java|python]

Lang is auto-detected from the code fence tag inside the .md unless overridden.
Reads samples for <id> from the samples JSON (default tools/data/stmts_all.json),
compiles the extracted code with the right toolchain, runs every sample and
reports PASS/FAIL. Exits nonzero if any sample mismatches.

Semantics: whitespace-insensitive per line, trailing-newline insensitive.
"""
import json, re, sys, os, tempfile, shutil, subprocess
import compile as cc

def norm(s):
    lines = [ln.rstrip() for ln in (s or '').expandtabs().replace('&nbsp;', ' ').split('\n')]
    while lines and lines[-1] == '':
        lines.pop()
    return '\n'.join(lines)

FENCE = re.compile(r'```(\w*)\n(.*?)```', re.S)

def detect_lang(tag):
    t = (tag or '').lower().replace('c++', 'cpp')
    aliases = {'c': 'c', 'cpp': 'cpp', 'c++': 'cpp', 'java': 'java',
               'python': 'python', 'py': 'python', 'python3': 'python'}
    return aliases.get(t, t or None)

def main():
    args = sys.argv[1:]
    mdpath = args[0]
    data_path = None
    lang_override = None
    for a in args[1:]:
        if a.startswith('--lang'):
            lang_override = args[args.index(a) + 1]
        elif not a.startswith('--') and data_path is None:
            data_path = a
    if data_path is None:
        data_path = os.path.join(os.path.dirname(__file__), 'data', 'stmts_all.json')
    pid = re.sub(r'\.md$', '', os.path.basename(mdpath))
    md = open(mdpath, encoding='utf-8', errors='replace').read()
    m = FENCE.search(md)
    if not m:
        print('NO CODE BLOCK in', mdpath); sys.exit(5)
    code = m.group(2)
    lang = lang_override or detect_lang(m.group(1))
    if not lang:
        print('UNKNOWN language fence:', repr(m.group(1))); sys.exit(5)
    try:
        allstmts = json.load(open(data_path))
    except OSError:
        print('Cannot open samples json:', data_path); sys.exit(2)
    p = allstmts.get(pid)
    if not p:
        print('NO STATEMENT for', pid); sys.exit(2)
    samples = p.get('samples') or []
    if not samples:
        print('NO SAMPLES for', pid, '(', p.get('name'), '); cannot auto-verify'); sys.exit(3)
    tmp = tempfile.mkdtemp(prefix='sack_')
    try:
        prep = cc.prepare(lang, code, tmp)
        if prep.get('ok', 0) != 0:
            print('COMPILE FAIL:', (prep.get('err') or '')[:1500]); sys.exit(4)
        allpass = True
        for i, s in enumerate(samples):
            try:
                prep['inp'] = s.get('input') or ''
                got, rc = cc.run(lang, prep)
                exp = norm(s.get('out_clean') if s.get('out_clean') is not None else s.get('output'))
                g = norm(got)
                status = 'PASS' if g == exp else 'FAIL'
                if status == 'FAIL': allpass = False
                print('sample{}: {}'.format(i + 1, status))
                if status == 'FAIL':
                    print('  EXPECTED:', repr(exp))
                    print('  GOT     :', repr(g))
                    if rc: print('  EXIT', rc)
            except subprocess.TimeoutExpired:
                allpass = False
                print('sample{}: TIMEOUT'.format(i + 1))
    finally:
        shutil.rmtree(tmp)
    sys.exit(0 if allpass else 1)

if __name__ == '__main__':
    main()