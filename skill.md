# skill.md — SkillRack autonomous solving, end to end

> Version: CODETUTOR structure as of the latest session.
> Read `tools/README.md` for the CLI toolkit; this file is the playbook +
> contribution guide. Contributors: **you solve a problem once, we all get it.**

## 1. Site structure (things that rarely change)

- Centre: `codeprogramgroup.xhtml?gt=CODETUTOR` → **7 language packs**.
- The account must be logged in. Grab `JSESSIONID` (+ `oam.Flash.RENDERMAP.TOKEN`,
  + the `AWSALB*` cookies) from a logged-in browser tab and put it in
  `tools/cookie.txt` (gitignored) or `$SKILLRACK_COOKIE`.
- **Pack indexes** (button id `pkglistform:cttbl:<idx>:j_id_41`):

  | idx | Pack | | idx | Pack |
  |-----|------|---|-----|------|
  | 0 | C Programming | | 4 | SQL |
  | 1 | Java Programming | | 5 | Data Structures in C |
  | 2 | Python Programming | | 6 | Data Structures in Java |
  | 3 | C++ Programming |

- Each pack = ~23 sub-challenges (`pkglistform:j_id_49:<sidx>:j_id_4h`), each with
  parts (`cttbl:<row>:j_id_4u`) and each part shows **only the unsolved problems**
  (`pctbl:<row>:j_id_5w`). The list is LIVE/rotating — solve one and it disappears.
- **The platform has 6 levels + extras**, each a different challenge TYPE, at
  `codeprogramgroup.xhtml` (the `gt`/`lev` query picks them):

  | Level | URL `gt=` | Content |
  |-------|-----------|---------|
  | Level 1 | `CODETUTOR` | 7 **language** packs (C / Java / Python / C++ / SQL / DS-C / DS-Java); each pack = ~23 sub-challenges (INTRO, STARTER, 50 VERY-EASY / EASY / EASY ADD-ON / AVERAGE, LAB ADD-ON, practice, videos). Some problems are **MFIB (fill-in-the-blank)** — the userscript detects and answers those too. Enumerated: C pack = **543 unique unsolved** across 18 sections/55 parts. |
  | Level 2 | `CODETRACK&lev=2` | KICKSTART for ABSOLUTE Beginner → sub-challenge **Recursion** (5 unsolved). |
  | Level 3 | `CODETRACK&lev=3` | **MNC Companies** (TCS/CTS/WIPRO/INFOSYS) → COGNIZANT CTS - 35 PROGRAMS (10 unsolved), InfyTQ Programs (solved), MNC COMPANIES PROGRAMS SET 001-020 (**197 unsolved**, 207 total). |
  | Level 4 | `CODETRACK&lev=4` | Data Structures & Algorithms → Stack / Queue / Binary Tree / Sorting (**25 unsolved**). |
  | Level 5 | `CODETRACK&lev=5` | Product Companies (Higher Salary) → 10 SETs, but **wallet-gated KIT**: the list page shows only a names-only "Programs List" preview (Step Number [ZH], Array LEADERS (ZH), …) with **no problem IDs**; scheduling requires wallet points (balance 0). Capture IDs from the `viewsolved` / solve pages instead. |
  | Level 6 | `CODETRACK&lev=6` | Dream Product Companies (Very High Salary) + Mini Projects — **wallet-gated KIT**, names-only preview. |
  | Prime | `CODETRACK&lev=100` | Dream Companies Placement Pack — **wallet-gated KIT**, names-only preview. |
  | LACS | `webinarcodetrack.xhtml` | Webinar code track |
  | LAB | `labcodeprograms.xhtml?type=LAB` | LAB programs |

  The exact sub-challenge→part table must be re-confirmed per-account by
  `tools/enum.py <idx>` (re-enumerate before every bulk solve; the unsolved list
  is live and the sections that expose "View" change as you clear them).
- Every click is a PrimeFaces POST carrying its own `jakarta.faces.ViewState`
  (fresh per page/form — `tools/sack.py` extracts it from the last response).
- The problem page shows the full statement + samples WITHOUT solving a captcha;
  only server-side **submission** is captcha-gated.

## 2. Solution file format (the one true contract)

One markdown file per problem in `solutions/<ProgramID>.md`:

```md
# Id <id> — <Problem Name>

```c
<full source code>
```

Verified: `<sample input> → <sample output>`
```

- **ProgramID** is the stable key — the userscript looks up `solutions/<pid>.md`
  by it.
- The code fence language tag (`c`, `cpp`, `java`, `python`) is what the userscript
  and `verify.py` use to pick the toolchain.
- `Verified:` line: paste the sample input→output you actually confirmed.

## 3. Solving a batch (the loop)

1. Enumerate: `python3 tools/enum.py <idx> --json /tmp/sack_enum.json` (CODETUTOR)
   or `python3 tools/enum.py 0 --lev <2..6|100> --json /tmp/sack_enum.json` (CODETRACK)
   (fills `{<section>:{<part>:[{row,id,name}]}}`).
2. Fetch statements: `python3 tools/fetch.py /tmp/sack_enum.json <idx> --out /tmp/sack_stmts.json`
   (CODETUTOR) or `python3 tools/fetchlev.py /tmp/sack_enum.json --lev <N> --out /tmp/sack_stmts.json`
   (CODETRACK; reuses enum's replay chain, one part per problem via the `part` field).
3. Split: `python3 tools/mkbatch.py /tmp/sack_stmts.json --n 8 --outdir /tmp/sack_batches`
4. **Search online (GitHub) FIRST** — for each problem, search the web for the
   exact problem name (e.g. `<problem name> skillrack solution`, CTF-style:
   `site:github.com "<problem name>"`). If a matching reference solution is found,
   use/cross-check it against the statement. **Only if nothing is found (or the
   found reference fails) fall back to writing a solution from scratch / AI.** This
   is the priority: GitHub search → verify → AI is the last-resort fallback.
5. Solve each batch (agents or humans), then verify:
   `python3 tools/verify.py solutions/<id>.md /tmp/sack_stmts.json`
   - C/C++ compile w/ `gcc`/`g++ -w -O2`; Java `javac`; Python `python3`.
   - Exit 0 = all samples PASS. Iterate until green.
   - Function-style (no `main()`) problems can't link via verify.py — build a small
     harness `main()` that reads the sample input and calls the function; compare to
     `out_clean`; save only the function in the `.md`.
6. Update the tracker: `python3 tools/status.py /tmp/sack_stmts.json --md document.md`
   (regenerates the solved/pending report).
7. Commit the `.md` (see §5). That's the whole contribution.

## 4. Verification pitfalls (read before trusting a FAIL)

- Scraped sample `output` is **polluted**: appended `Explanation:` prose, `&nbsp;`,
  `&#39;`, leading newlines/tabs. `verify.py` normalises whitespace but not prose,
  so many "FAIL"s are the record, not the code. Check the clean output prefix.
- Function/no-I/O problems have NO samples → cannot be auto-verified; eyeball
  the signature/format against the statement.
- Fixed-width / precision outputs: print exactly the requested decimals.

## 5. Contribution / collaboration model

- **Rules:** one problem = one `solutions/<id>.md`; real code only (compiles);
  `Verified` line reflects a real run; never edit someone else's file without
  adding a note; no personal data, no cookies in any committed file.
- **Flow:** fork → branch `add/<id>` → add `solutions/<id>.md` → run
  `verify.py` → update the tracker (`tools/status.py --md document.md`) → PR.
  A passing verify line in the PR body is the acceptance bar.
- The repo's userscript auto-pulls solved answers straight from this repo by
  default — `raw.githubusercontent.com/ToonTamilIndia/skillrack-userscript/main/solutions/<id>.md`
  (GitHub raw URL, no server needed). For dev/testing you can set the "Solutions
  Base URL" in the settings to a local server (e.g. `http://localhost:3000`, run
  `node solutions-server.js`). AI is the last fallback. So a merged solution is
  instantly live for every user.
- **Failure → AI fallback (userscript v6.1):** if the injected answer (saved `.md`
  or SkillRack built-in) fails the judge, `generateAISolution()` detects the error
  panel (`getErrorInfo()`), skips re-injecting the same code, and hands the failing
  code + judge error (input/expected/actual) to the AI fixer. This applies to manual
  AI clicks and the ⚡ Auto Solver retry loop alike.
- **Search GitHub first (no hardcoded repo list):** for every problem, search the
  web/GitHub by the exact problem name and cross-check the found reference against
  the statement. Where our version diverged from the reference (signature/return
  type, include issues, edge-case conventions), correct it to the judge's contract
  (e.g. `findMinElement` returns an `int*` of both minima; `findSequence` requires
  a ≥2-element strictly-decreasing prefix). AI is the last-resort fallback when no
  reference exists or the reference fails.
- Keep the solution bank moving: when a challenge rotates to a new unsolved set,
  re-enumerate (§3) and claim a batch.

## 6. Key invariants
- **ProgramID** is the join key between `solutions/`, `stmts_all.json`, and the live page.
- The unsolved list rotates — always enumerate fresh before bulk solving.
- `cookie.txt`, `context.md`, `docs/`, `tools/data/` are never committed.
- Bash tool timeout: run long crawls with `nohup ... &`; cap each request with
  curl `--max-time 20` (both already in `tools/sack.py`).