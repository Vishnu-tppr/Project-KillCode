# SkillRack autonomous solving toolkit

Python + curl scraper/verifier toolset for the CODETUTOR challenge centre.
No third-party Python deps; uses `curl`, `gcc`/`g++`/`javac`/`python3` for code.

## Layout
| Script | Purpose |
|--------|---------|
| `sack.py` | shared HTTP client — reads the session cookie from `cookie.txt` (gitignored) or `$SKILLRACK_COOKIE`; `BASE` points at the CODETUTOR centre; `base_for(lev)` gives CODETRACK pages |
| `enum.py` | enumerate unsolved problems for a pack (CODETUTOR) or level (CODETRACK via `--lev 2..6/100`) |
| `fetch.py` | fetch statements + sample I/O for enumerated ids (CODETUTOR packs) |
| `fetchlev.py` | fetch statements + samples for enumerated ids on any CODETRACK level (`--lev`) |
| `verify.py` | compile & test a `solutions/<id>.md` against recorded samples |
| `compile.py` | language-aware compile/run (C, C++, Java, Python) |
| `mkbatch.py` | split ids into parallel solve batches |
| `status.py` | inventory + tracker: solved vs pending, per-language/section, writes `document.md` |
| `cookie.txt` | **your** session cookie — never committed |
| `data/` | scraped statement/sample caches — gitignored |

## Setup
1. Put a live session cookie in `cookie.txt`:
   `JSESSIONID=<...>; oam.Flash.RENDERMAP.TOKEN=<...>`   (from a logged-in SkillRack tab)
   or export `SKILLRACK_COOKIE="..."`.
2. Language packs (pack index passed to `enum.py` / `fetch.py`):
   `0=C 1=Java 2=Python 3=C++ 4=SQL 5=DS-C 6=DS-Java`

## Typical flow
```
python3 tools/enum.py 0 --json /tmp/sack_c_enum.json              # enumerate C pack
python3 tools/fetch.py /tmp/sack_c_enum.json 0 --out /tmp/sack_c_stmts.json
# CODETRACK levels:
python3 tools/enum.py 0 --lev 3 --json /tmp/sack_lev3.json
python3 tools/fetchlev.py /tmp/sack_lev3.json --lev 3 --out /tmp/sack_lev3_stmts.json
python3 tools/mkbatch.py /tmp/sack_c_stmts.json --n 8 --outdir /tmp/sack_batches
# solve each batch (see ../skill.md) writing solutions/<id>.md
python3 tools/verify.py solutions/6650.md /tmp/sack_stmts.json
python3 tools/status.py /tmp/sack_stmts.json          # solved vs pending
python3 tools/status.py --md document.md              # regenerate the tracker
```

## Crawl caveats
- The problem list only ever shows **unsolved** problems and is LIVE/rotating —
  re-enumerate before each bulk solve.
- Every PrimeFaces step needs its own fresh ViewState; `sack.viewstate()` grabs
  it from the last response body.
- Scraped sample `output` fields are polluted (appended `Explanation:` prose,
  `&nbsp;`, leading newlines). `verify.py` normalises whitespace but the prose
  stays — if a sample FAILs, compare against the clean prefix by eye.
- If the script hangs, requests can take up to curl's `--max-time 20`. Run long
  crawls with `nohup ... &`.
- Structure may drift — if `enum.py` returns empty, re-test the cookie against
  `https://skillrack.com/faces/candidate/codeprogramgroup.xhtml?gt=CODETUTOR`
  (pack buttons `pkglistform:cttbl:<idx>:j_id_41` must be present).