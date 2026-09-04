"""CLI entry point for SkillRack scraper.

Importers/callers:
- Direct CLI execution: python -m skillrack_scraper [command]
- Used by developers to run scrapes, start API server, export data

Affected API (CLI commands):
- scrape: Run full scrape -> outputs ScrapeResult JSON
- serve: Start FastAPI server on localhost:8000
- export: Convert scrape JSON to json/jsonl/csv with language mapping
- stats: Show statistics from scrape result or fresh scrape
- list-packs: Show available language packs (0-6)
- list-levels: Show available CODETRACK levels (2-6, 100)

Data schemas:
- ScrapeResult: questions[], total_found, scrape_timestamp, packs_scanned[], levels_scanned[], errors[], duration_seconds
- Question: level, language, language_mapped, section, problem_set, question, link, question_id, row, part

User instruction: "Write main.py CLI with commands: scrape, serve, export"
"""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import List, Optional

# Ensure standard output streams support UTF-8 on Windows terminals
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# pyrefly: ignore [missing-import]
import typer
# pyrefly: ignore [missing-import]
from rich.console import Console
# pyrefly: ignore [missing-import]
from rich.progress import Progress, SpinnerColumn, TextColumn
# pyrefly: ignore [missing-import]
from rich.table import Table

from .api import app as fastapi_app
from .scraper import run_scrape, SkillRackScraper
from .session import SkillRackSession
from .models import ScrapeResult, Question
from .config import PACKS, CODETRACK_LEVELS, LANGUAGE_MAP

console = Console(force_terminal=True, highlight=False)
cli = typer.Typer(help="SkillRack Scraper - Find incomplete/unsolved questions")


def setup_logging(verbose: bool = False):
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


@cli.command()
def scrape(
    packs: Optional[List[int]] = typer.Option(
        None, "--pack", "-p", help="Pack indices to scrape (0-6). Default: all."
    ),
    levels: Optional[List[int]] = typer.Option(
        None, "--level", "-l", help="CODETRACK levels to scrape. Default: all."
    ),
    cookie: Optional[str] = typer.Option(
        None, "--cookie", "-c", help="Path to cookie.txt file or raw cookie string"
    ),
    delay: float = typer.Option(0.15, "--delay", "-d", help="Delay between requests (seconds)"),
    output: Optional[str] = typer.Option(
        None, "--output", "-o", help="Output JSON file path"
    ),
    html_report: Optional[str] = typer.Option(
        None, "--html", help="Output interactive HTML report file path"
    ),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
):
    """Run a full scrape and output results as JSON."""
    setup_logging(verbose)

    # Validate packs
    if packs:
        invalid = [p for p in packs if p not in PACKS]
        if invalid:
            console.print(f"[red]Invalid pack indices: {invalid}[/red]")
            console.print(f"Valid packs: {list(PACKS.keys())}")
            raise typer.Exit(1)

    # Validate levels
    if levels:
        invalid = [l for l in levels if l not in CODETRACK_LEVELS]
        if invalid:
            console.print(f"[red]Invalid levels: {invalid}[/red]")
            console.print(f"Valid levels: {CODETRACK_LEVELS}")
            raise typer.Exit(1)

    console.print("[bold]Starting SkillRack scrape...[/bold]")
    if packs:
        console.print(f"Packs: {[PACKS[p] for p in packs]}")
    if levels:
        console.print(f"Levels: {levels}")

    # Determine whether cookie is a raw string or file path
    cookie_str = None
    cookie_file_path = None
    if cookie:
        if "=" in cookie or ";" in cookie:
            cookie_str = cookie
        else:
            cookie_file_path = cookie

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task("Scraping SkillRack...", total=None)

        def _on_progress(pct: int, task_desc: str, count: int):
            progress.update(task, description=f"[{pct}%] {task_desc} ({count} found)")

        async def _run():
            return await run_scrape(
                packs=packs,
                levels=levels,
                cookie=cookie_str,
                cookie_file=cookie_file_path,
                delay=delay,
                on_progress=_on_progress,
            )

        result: ScrapeResult = asyncio.run(_run())
        progress.update(task, description="Done")

    # Print summary
    _print_scrape_summary(result)

    # Output JSON
    if output:
        output_path = Path(output)
        output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        console.print(f"[green]Results written to {output_path}[/green]")
    else:
        # Print to stdout
        console.print(result.model_dump_json(indent=2))

    # Output HTML report if requested
    if html_report:
        import html as html_lib
        questions = result.questions
        rows_html = "".join(f"""<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#8b949e;">{idx+1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><span style="background:#238636;color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">{html_lib.escape(q.level)}</span></td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><span style="background:#1f6feb;color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">{html_lib.escape(q.language)}</span></td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#c9d1d9;">{html_lib.escape(q.section)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#f0f6fc;font-weight:600;">{html_lib.escape(q.question)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><a href="{html_lib.escape(q.link)}" target="_blank" style="display:inline-block;padding:4px 12px;background:#8957e5;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">Solve →</a></td>
        </tr>""" for idx, q in enumerate(questions))
        html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>SkillRack Incomplete Questions ({len(questions)})</title>
        <style>body{{font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:24px;max-width:1200px;margin:auto;}}table{{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;}}th{{padding:10px 12px;background:#21262d;text-align:left;color:#8b949e;font-size:12px;text-transform:uppercase;}}</style>
        </head><body><h1 style="color:#f0f6fc;">⚡ SkillRack Incomplete Questions ({len(questions)})</h1>
        <table><thead><tr><th>#</th><th>Level</th><th>Language</th><th>Section</th><th>Question</th><th>Action</th></tr></thead><tbody>{rows_html}</tbody></table>
        </body></html>"""
        html_path = Path(html_report)
        html_path.write_text(html_doc, encoding="utf-8")
        console.print(f"[green]HTML Report written to {html_path}[/green]")


@cli.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind"),
    port: int = typer.Option(8000, "--port", help="Port to bind"),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
):
    """Start the FastAPI server."""
    setup_logging(verbose)
    console.print(f"[bold]Starting SkillRack API server on http://{host}:{port}[/bold]")
    console.print("Endpoints:")
    console.print("  GET  /health")
    console.print("  GET  /questions")
    console.print("  POST /scrape")
    console.print("  GET  /scrape/{job_id}")
    console.print("  GET  /stats")

    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run(
        "skillrack_scraper.api:app",
        host=host,
        port=port,
        reload=reload,
        log_level="debug" if verbose else "info",
    )


@cli.command()
def export(
    input_file: str = typer.Argument(..., help="Input JSON file from scrape command"),
    output_file: str = typer.Argument(..., help="Output file path"),
    format: str = typer.Option("json", "--format", "-f", help="Output format: json, jsonl, csv"),
    language_map: bool = typer.Option(True, "--map/--no-map", help="Apply language mapping (CPP23, PYTHON311, etc.)"),
):
    """Export scraped data to different formats."""
    import csv

    input_path = Path(input_file)
    if not input_path.exists():
        console.print(f"[red]Input file not found: {input_file}[/red]")
        raise typer.Exit(1)

    data = json.loads(input_path.read_text())
    questions = data.get("questions", [])

    if language_map:
        for q in questions:
            q["language"] = LANGUAGE_MAP.get(q.get("language", ""), q.get("language", ""))

    output_path = Path(output_file)

    if format == "json":
        output_path.write_text(json.dumps(questions, indent=2), encoding="utf-8")
    elif format == "jsonl":
        with output_path.open("w", encoding="utf-8") as f:
            for q in questions:
                f.write(json.dumps(q) + "\n")
    elif format == "csv":
        if questions:
            fieldnames = list(questions[0].keys())
            with output_path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(questions)
        else:
            output_path.write_text("", encoding="utf-8")
    elif format == "html":
        import html as html_lib
        rows_html = "".join(f"""<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#8b949e;">{idx+1}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><span style="background:#238636;color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">{html_lib.escape(q.get('level',''))}</span></td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><span style="background:#1f6feb;color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">{html_lib.escape(q.get('language',''))}</span></td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#c9d1d9;">{html_lib.escape(q.get('section',''))}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;color:#f0f6fc;font-weight:600;">{html_lib.escape(q.get('question',''))}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #30363d;"><a href="{html_lib.escape(q.get('link',''))}" target="_blank" style="display:inline-block;padding:4px 12px;background:#8957e5;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">Solve →</a></td>
        </tr>""" for idx, q in enumerate(questions))
        html_doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>SkillRack Incomplete Questions ({len(questions)})</title>
        <style>body{{font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:24px;max-width:1200px;margin:auto;}}table{{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;}}th{{padding:10px 12px;background:#21262d;text-align:left;color:#8b949e;font-size:12px;text-transform:uppercase;}}</style>
        </head><body><h1 style="color:#f0f6fc;">⚡ SkillRack Incomplete Questions ({len(questions)})</h1>
        <table><thead><tr><th>#</th><th>Level</th><th>Language</th><th>Section</th><th>Question</th><th>Action</th></tr></thead><tbody>{rows_html}</tbody></table>
        </body></html>"""
        output_path.write_text(html_doc, encoding="utf-8")
    else:
        console.print(f"[red]Unknown format: {format}. Choose from: json, jsonl, csv, html[/red]")
        raise typer.Exit(1)

    console.print(f"[green]Exported {len(questions)} questions to {output_path}[/green]")


@cli.command()
def stats(
    input_file: Optional[str] = typer.Option(None, "--file", "-f", help="Input JSON file (optional)"),
):
    """Show statistics about scraped data."""
    if input_file:
        path = Path(input_file)
        if not path.exists():
            console.print(f"[red]File not found: {input_file}[/red]")
            raise typer.Exit(1)
        data = json.loads(path.read_text())
        result = ScrapeResult(**data)
    else:
        # Try to run a quick scrape
        console.print("[yellow]No input file, running quick scrape...[/yellow]")
        result = asyncio.run(run_scrape())

    _print_scrape_summary(result)


def _print_scrape_summary(result: ScrapeResult):
    """Print a nice summary table."""
    console.print("\n[bold]Scrape Summary[/bold]")
    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("Metric")
    table.add_column("Value")

    table.add_row("Total Questions", str(result.total_found))
    table.add_row("Packs Scanned", ", ".join(result.packs_scanned) if result.packs_scanned else "—")
    table.add_row("Levels Scanned", ", ".join(str(l) for l in result.levels_scanned) if result.levels_scanned else "—")
    table.add_row("Duration", f"{result.duration_seconds:.1f}s" if result.duration_seconds else "—")
    table.add_row("Timestamp", result.scrape_timestamp.isoformat())
    table.add_row("Errors", str(len(result.errors)))

    console.print(table)

    if result.errors:
        console.print("\n[bold red]Errors:[/bold red]")
        for err in result.errors[:10]:
            console.print(f"  • {err}")
        if len(result.errors) > 10:
            console.print(f"  ... and {len(result.errors) - 10} more")

    # Language breakdown
    if result.questions:
        lang_counts: dict = {}
        level_counts: dict = {}
        for q in result.questions:
            lang_counts[q.language] = lang_counts.get(q.language, 0) + 1
            level_counts[q.level] = level_counts.get(q.level, 0) + 1

        console.print("\n[bold]By Language:[/bold]")
        lang_table = Table(show_header=True)
        lang_table.add_column("Language")
        lang_table.add_column("Count")
        for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
            lang_table.add_row(lang, str(count))
        console.print(lang_table)

        console.print("\n[bold]By Level:[/bold]")
        level_table = Table(show_header=True)
        level_table.add_column("Level")
        level_table.add_column("Count")
        for level, count in sorted(level_counts.items(), key=lambda x: -x[1]):
            level_table.add_row(level, str(count))
        console.print(level_table)


@cli.command(name="list-packs")
def list_packs():
    """List available language packs."""
    table = Table(show_header=True)
    table.add_column("Index")
    table.add_column("Language")
    for idx, name in PACKS.items():
        table.add_row(str(idx), name)
    console.print(table)


@cli.command(name="list-levels")
def list_levels():
    """List available CODETRACK levels."""
    table = Table(show_header=True)
    table.add_column("Level")
    table.add_column("Description")
    for lvl in CODETRACK_LEVELS:
        desc = "Prime" if lvl == 100 else f"Level {lvl}"
        table.add_row(str(lvl), desc)
    console.print(table)


if __name__ == "__main__":
    cli()