#!/usr/bin/env python3
"""
Local Bridge API Server for SkillRack Python Tools
===================================================
This server wraps the Python tools (enum.py, fetch.py, fetchlev.py, verify.py, etc.)
and exposes REST endpoints that the Tampermonkey userscript can call via GM_xmlhttpRequest.

Run: python3 bridge_server.py
Server runs on http://localhost:8765
"""

import os
import sys
import json
import subprocess
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn


# ─── Configuration ──────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent
TOOLS_DIR = REPO_ROOT / "tools"
SCRATCH_DIR = TOOLS_DIR / ".scratch"
SCRATCH_DIR.mkdir(exist_ok=True)

# Python executable (use current interpreter)
PYTHON = sys.executable


# ─── Request/Response Models ────────────────────────────────────
class EnumRequest(BaseModel):
    pack_index: int = Field(..., ge=0, le=6, description="Language pack index (0-6)")
    level: Optional[int] = Field(None, description="CODETRACK level (2-6, 100 for Prime)")


class EnumResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    pack_name: Optional[str] = None
    sub_challenge_count: int = 0
    total_problems: int = 0


class FetchRequest(BaseModel):
    enum_file: str = Field(..., description="Path to enum JSON file")
    pack_index: int = Field(..., ge=0, le=6)
    level: Optional[int] = None
    out_file: Optional[str] = None


class FetchResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    output_file: Optional[str] = None


class VerifyRequest(BaseModel):
    solution_file: str = Field(..., description="Path to solution .md file")
    stmts_file: str = Field(..., description="Path to statements JSON file")


class VerifyResponse(BaseModel):
    success: bool
    passed: bool = False
    output: str = ""
    error: Optional[str] = None


class StatusRequest(BaseModel):
    stmts_file: str = Field(..., description="Path to statements JSON file")
    md_output: Optional[str] = None


class StatusResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    md_file: Optional[str] = None


class CompileRequest(BaseModel):
    solution_file: str = Field(..., description="Path to solution .md file")


class CompileResponse(BaseModel):
    success: bool
    output: str = ""
    error: Optional[str] = None


class BatchRequest(BaseModel):
    stmts_file: str = Field(..., description="Path to statements JSON file")
    n_batches: int = Field(8, ge=1, le=50, description="Number of batches")
    outdir: str = Field(..., description="Output directory for batches")


class BatchResponse(BaseModel):
    success: bool
    batch_files: List[str] = []
    error: Optional[str] = None


class CookieStatusResponse(BaseModel):
    has_cookie: bool
    cookie_preview: str = ""
    scratch_files: List[str] = []


# ─── Tool Runner Helper ─────────────────────────────────────────
async def run_tool(script: str, args: List[str], cwd: Path = None, timeout: int = 120) -> tuple[int, str, str]:
    """Run a Python tool script and return (exit_code, stdout, stderr)."""
    cwd = cwd or TOOLS_DIR
    cmd = [PYTHON, script] + args
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, stdout.decode('utf-8', errors='replace'), stderr.decode('utf-8', errors='replace')
    except asyncio.TimeoutError:
        return -1, "", f"Tool timed out after {timeout}s"
    except Exception as e:
        return -1, "", str(e)


def get_cookie_status() -> CookieStatusResponse:
    """Check if cookie.txt exists and list scratch files."""
    cookie_file = TOOLS_DIR / "cookie.txt"
    has_cookie = cookie_file.exists() and cookie_file.read_text().strip() != ""
    preview = ""
    if has_cookie:
        cookie = cookie_file.read_text().strip()
        preview = cookie[:50] + "..." if len(cookie) > 50 else cookie

    scratch_files = []
    if SCRATCH_DIR.exists():
        scratch_files = [f.name for f in SCRATCH_DIR.iterdir() if f.is_file()]

    return CookieStatusResponse(
        has_cookie=has_cookie,
        cookie_preview=preview,
        scratch_files=scratch_files
    )


# ─── FastAPI App ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[+] Bridge server starting...")
    print(f"   Tools dir: {TOOLS_DIR}")
    print(f"   Scratch dir: {SCRATCH_DIR}")
    cookie_status = get_cookie_status()
    print(f"   Cookie: {'[OK] Found' if cookie_status.has_cookie else '[!!] Missing (tools/cookie.txt)'}")
    yield
    # Shutdown
    print("[-] Bridge server shutting down...")


app = FastAPI(
    title="SkillRack Bridge API",
    description="Local API bridge for SkillRack Python tools",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for local file:// access (userscript runs in browser)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ──────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "skillrack-bridge"}


@app.get("/cookie/status", response_model=CookieStatusResponse)
async def cookie_status():
    """Check cookie and scratch directory status."""
    return get_cookie_status()


@app.post("/enum", response_model=EnumResponse)
async def enumerate_problems(req: EnumRequest):
    """Enumerate unsolved problems for a language pack or track level."""
    # Build args
    args = [str(req.pack_index)]
    if req.level:
        args += ["--lev", str(req.level)]

    # Output to temp file
    out_file = SCRATCH_DIR / f"enum_pack{req.pack_index}_lev{req.level or 'tutor'}.json"
    args += ["--json", str(out_file)]

    code, stdout, stderr = await run_tool("enum.py", args)

    if code != 0:
        return EnumResponse(
            success=False,
            error=f"enum.py failed (exit {code}): {stderr or stdout}",
            pack_name={0:'C',1:'Java',2:'Python',3:'C++',4:'SQL',5:'DS-C',6:'DS-Java'}.get(req.pack_index)
        )

    # Read the output JSON
    try:
        data = json.loads(out_file.read_text())
        # Compute stats
        sub_count = len(data)
        total = sum(len(parts) for sub in data.values() for parts in sub.values())
        return EnumResponse(
            success=True,
            data=data,
            pack_name={0:'C',1:'Java',2:'Python',3:'C++',4:'SQL',5:'DS-C',6:'DS-Java'}.get(req.pack_index),
            sub_challenge_count=sub_count,
            total_problems=total
        )
    except Exception as e:
        return EnumResponse(
            success=False,
            error=f"Failed to read output: {e}",
            pack_name={0:'C',1:'Java',2:'Python',3:'C++',4:'SQL',5:'DS-C',6:'DS-Java'}.get(req.pack_index)
        )


@app.post("/fetch", response_model=FetchResponse)
async def fetch_statements(req: FetchRequest):
    """Fetch problem statements + samples for enumerated IDs."""
    args = [req.enum_file, str(req.pack_index)]
    if req.level:
        args += ["--lev", str(req.level)]
    if req.out_file:
        args += ["--out", req.out_file]

    code, stdout, stderr = await run_tool("fetch.py", args)

    if code != 0:
        return FetchResponse(
            success=False,
            error=f"fetch.py failed (exit {code}): {stderr or stdout}"
        )

    # Determine output file
    out_file = req.out_file or f"/tmp/sack_pack{req.pack_index}_stmts.json"
    try:
        data = json.loads(Path(out_file).read_text())
        return FetchResponse(
            success=True,
            data=data,
            output_file=out_file
        )
    except Exception as e:
        return FetchResponse(
            success=False,
            error=f"Failed to read output: {e}"
        )


@app.post("/fetchlev", response_model=FetchResponse)
async def fetchlev_statements(req: FetchRequest):
    """Fetch statements for CODETRACK levels (uses fetchlev.py)."""
    args = [req.enum_file]
    if req.level:
        args += ["--lev", str(req.level)]
    if req.out_file:
        args += ["--out", req.out_file]

    code, stdout, stderr = await run_tool("fetchlev.py", args)

    if code != 0:
        return FetchResponse(
            success=False,
            error=f"fetchlev.py failed (exit {code}): {stderr or stdout}"
        )

    out_file = req.out_file or f"/tmp/sack_lev{req.level}_stmts.json"
    try:
        data = json.loads(Path(out_file).read_text())
        return FetchResponse(
            success=True,
            data=data,
            output_file=out_file
        )
    except Exception as e:
        return FetchResponse(
            success=False,
            error=f"Failed to read output: {e}"
        )


@app.post("/verify", response_model=VerifyResponse)
async def verify_solution(req: VerifyRequest):
    """Compile and test a solution against recorded samples."""
    code, stdout, stderr = await run_tool("verify.py", [req.solution_file, req.stmts_file], timeout=60)

    passed = code == 0
    return VerifyResponse(
        success=True,
        passed=passed,
        output=stdout,
        error=stderr if not passed else None
    )


@app.post("/status", response_model=StatusResponse)
async def get_status(req: StatusRequest):
    """Get inventory/tracker: solved vs pending."""
    args = [req.stmts_file]
    if req.md_output:
        args += ["--md", req.md_output]

    code, stdout, stderr = await run_tool("status.py", args)

    if code != 0:
        return StatusResponse(
            success=False,
            error=f"status.py failed (exit {code}): {stderr or stdout}"
        )

    # Parse stdout for summary
    try:
        data = {"summary": stdout}
        if req.md_output and Path(req.md_output).exists():
            data["md_content"] = Path(req.md_output).read_text()
        return StatusResponse(
            success=True,
            data=data,
            md_file=req.md_output
        )
    except Exception as e:
        return StatusResponse(
            success=False,
            error=f"Failed to parse output: {e}"
        )


@app.post("/compile", response_model=CompileResponse)
async def compile_solution(req: CompileRequest):
    """Compile a solution (dry-run via compile.py)."""
    code, stdout, stderr = await run_tool("compile.py", [req.solution_file], timeout=30)

    return CompileResponse(
        success=code == 0,
        output=stdout,
        error=stderr if code != 0 else None
    )


@app.post("/batch", response_model=BatchResponse)
async def create_batches(req: BatchRequest):
    """Split IDs into parallel solve batches."""
    args = [req.stmts_file, "--n", str(req.n_batches), "--outdir", req.outdir]

    code, stdout, stderr = await run_tool("mkbatch.py", args)

    if code != 0:
        return BatchResponse(
            success=False,
            error=f"mkbatch.py failed (exit {code}): {stderr or stdout}"
        )

    # List generated batch files
    batch_dir = Path(req.outdir)
    batch_files = []
    if batch_dir.exists():
        batch_files = sorted([str(f) for f in batch_dir.glob("*.json")])

    return BatchResponse(
        success=True,
        batch_files=batch_files
    )


@app.get("/scratch/list")
async def list_scratch():
    """List all files in scratch directory."""
    files = []
    for f in SCRATCH_DIR.iterdir():
        if f.is_file():
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "modified": stat.st_mtime
            })
    return {"files": files}


@app.delete("/scratch/{filename}")
async def delete_scratch(filename: str):
    """Delete a scratch file."""
    if "/" in filename or filename in ("..", "."):
        raise HTTPException(400, "Invalid filename")
    path = SCRATCH_DIR / filename
    if path.exists():
        path.unlink()
        return {"success": True}
    raise HTTPException(404, "File not found")


# ─── Main ───────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("SkillRack Bridge API Server")
    print("=" * 60)
    print(f"Tools: {TOOLS_DIR}")
    print(f"Scratch: {SCRATCH_DIR}")
    print(f"Cookie: {TOOLS_DIR / 'cookie.txt'}")
    print("=" * 60)
    print("Endpoints:")
    print("  GET  /health              - Health check")
    print("  GET  /cookie/status       - Cookie & scratch status")
    print("  POST /enum                - Enumerate problems (pack/level)")
    print("  POST /fetch               - Fetch statements (CODETUTOR)")
    print("  POST /fetchlev            - Fetch statements (CODETRACK)")
    print("  POST /verify              - Verify solution")
    print("  POST /status              - Get status/inventory")
    print("  POST /compile             - Compile solution")
    print("  POST /batch               - Create solve batches")
    print("  GET  /scratch/list        - List scratch files")
    print("  DELETE /scratch/<file>    - Delete scratch file")
    print("=" * 60)
    print("Server: http://localhost:8765")
    print("=" * 60)

    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")