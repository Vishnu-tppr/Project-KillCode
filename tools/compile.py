#!/usr/bin/env python3
"""Language-aware compile+run machinery used by verify.py and doc tools.

Supported languages: c, cpp, java, python.
"""
import os, subprocess, tempfile, shutil


def compiler_for(lang):
    if lang in ('c', 'cpp'):
        cc = 'g++' if lang == 'cpp' else 'gcc'
        return lambda exe, src: subprocess.run(
            [cc, '-w', '-O2', '-o', exe, src], capture_output=True, text=True)
    if lang == 'java':
        return lambda jdir, src: subprocess.run(
            ['javac', '-d', jdir, src], capture_output=True, text=True)
    # python: interpreted
    return None


def run(lang, pobj):
    """pobj holds prepared artifact dir. Run one case from a fed input string.
    Returns (stdout, returncode)."""
    if lang == 'python':
        r = subprocess.run(['python3', pobj['src']], input=(
            pobj.get('inp', '') + '\n'), capture_output=True, text=True, timeout=30)
        return r.stdout, r.returncode
    if lang == 'java':
        main = os.path.join(pobj['dir'], pobj['classname'] + '.class')
        r = subprocess.run(['java', '-cp', pobj['dir'], pobj['classname']],
                           input=pobj.get('inp', '') + '\n', capture_output=True,
                           text=True, timeout=30)
        return r.stdout, r.returncode
    r = subprocess.run([pobj['exe']], input=pobj.get('inp', '') + '\n',
                       capture_output=True, text=True, timeout=30)
    return r.stdout, r.returncode


def prepare(lang, code, tmp):
    """Compile/validate `code` and return a dict prepared for run(payload)."""
    if lang == 'python':
        return {'src': os.path.join(tmp, 'main.py'), 'lang': lang}
    if lang == 'java':
        import re
        m = re.search(r'\bpublic\s+class\s+(\w+)', code)
        cls = m.group(1) if m else 'Main'
        src = os.path.join(tmp, cls + '.java')
        jdir = os.path.join(tmp, 'classes')
        os.makedirs(jdir, exist_ok=True)
        open(src, 'w').write(code)
        r = subprocess.run(['javac', '-d', jdir, src], capture_output=True, text=True)
        return {'dir': jdir, 'classname': cls, 'lang': lang, 'ok': r.returncode,
                'err': r.stderr}
    exe = os.path.join(tmp, 'a.out')
    open(os.path.join(tmp, 'main'), 'w').write('')  # placeholder not needed
    if lang == 'cpp':
        cc = 'g++'
    else:
        cc = 'gcc'
    src = os.path.join(tmp, 'main.c' if lang == 'c' else 'main.cpp')
    open(src, 'w').write(code)
    r = subprocess.run([cc, '-w', '-O2', '-o', exe, src], capture_output=True, text=True)
    return {'exe': exe, 'lang': lang, 'ok': r.returncode, 'err': r.stderr, 'src': src}