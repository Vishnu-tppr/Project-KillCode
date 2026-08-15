#!/usr/bin/env python3
"""Shared HTTP client for the SkillRack scraper toolkit.

Credentials are NEVER hardcoded. They are read (in priority order):
  1. $SKILLRACK_COOKIE env var
  2. a local (gitignored) file:  <repo>/tools/cookie.txt
Format of the cookie: a raw Cookie header value, e.g.
    JSESSIONID=ABC...; oam.Flash.RENDERMAP.TOKEN=xyz
"""
import os, re, subprocess, pickle

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = os.environ.get('SACK_SCRATCH', os.path.join(REPO, 'tools', '.scratch'))
UA = 'Mozilla/5.0'
CODETUTOR = 'https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR'
CODETRACK = 'https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETRACK&lev={lev}'
CODENV = 'https://skillrack.com/faces/candidate/codeprogram.xhtml'
BASE = CODETUTOR


def base_for(lev):
    """Level-aware base page: lev=2..6 or 100 (Prime) -> CODETRACK, else CODETUTOR."""
    return CODETRACK.format(lev=lev) if lev else CODETUTOR


def ensure_scratch():
    os.makedirs(SCRATCH, exist_ok=True)


def scratch(name):
    """Absolute path of a scratch file (name must be a bare filename)."""
    if os.sep in name or name in ('..', '.'):
        raise ValueError('scratch name must be a bare filename')
    ensure_scratch()
    return os.path.join(SCRATCH, name)


def cookie_value():
    c = os.environ.get('SKILLRACK_COOKIE', '').strip()
    if c:
        return c
    jar = os.path.join(os.path.dirname(__file__), 'cookie.txt')
    try:
        c = open(jar).read().strip()
    except OSError:
        c = ''
    if not c:
        raise SystemExit(
            'No cookie. Set $SKILLRACK_COOKIE or put your cookie line in '
            'tools/cookie.txt (==> this file is gitignored, never commit it).')
    return c


def get(url, data=None, referer=None, name='out.html'):
    """curl GET/POST. data -> urlencoded POST (PrimeFaces form submit)."""
    ensure_scratch()
    out = os.path.join(SCRATCH, name)
    hdrs = os.path.join(SCRATCH, 'hd.txt')
    cmd = ['curl', '-s', '-L', '--max-time', '20', '-b', cookie_value(),
           '-A', UA, '-D', hdrs]
    if referer:
        cmd += ['-e', referer]
    if data:
        for k, v in data.items():
            cmd += ['--data-urlencode', '{}={}'.format(k, v)]
    cmd += ['-o', out, url]
    subprocess.run(cmd, capture_output=True, text=True, timeout=25)
    try:
        return open(out, encoding='utf-8', errors='replace').read()
    except OSError:
        return '<ERR>'


def viewstate(body, nth=0):
    vals = re.findall(r'name="jakarta.faces.ViewState" id="[^"]*" value="([^"]*)"',
                      body)
    return vals[nth] if len(vals) > nth else (vals[0] if vals else None)


def crumb(body):
    m = re.search(r'aria-current="page"[^>]*>\s*'
                  r'<span class="ui-menuitem-text">([^<]+)</span>', body)
    return m.group(1).strip() if m else '?'


def lang_ext(lang):
    return {'c': 'c', 'cpp': 'cpp', 'java': 'java', 'python': 'py'}[lang]