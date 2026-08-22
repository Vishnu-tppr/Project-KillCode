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

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from .api import app as fastapi_app
from .scraper import run_scrape, SkillRackScraper
from .session import SkillRackSession
from .models import ScrapeResult, Question
from .config import PACKS, CODETRACK_LEVELS, LANGUAGE_MAP

console = Console()
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
    cookie_file: Optional[str] = typer.Option(
        None, "--cookie", "-c", help="Path to cookie.txt file"
    ),
    delay: float = typer.Option(0.15, "--delay", "-d", help="Delay between requests (seconds)"),
    output: Optional[str] = typer.Option(
        None, "--output", "-o", help="Output JSON file path"
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

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Scraping...", total=None)

        async def _run():
            return await run_scrape(packs=packs, levels=levels, cookie_file=cookie_file, delay=delay)

        result: ScrapeResult = asyncio.run(_run())

        progress.update(task, description="Done")

    # Print summary
    _print_scrape_summary(result)

    # Output JSON
    if output:
        output_path = Path(output)
        output_path.write_text(result.model_dump_json(indent=2))
        console.print(f"[green]Results written to {output_path}[/green]")
    else:
        # Print to stdout
        console.print(result.model_dump_json(indent=2))


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
        output_path.write_text(json.dumps(questions, indent=2))
    elif format == "jsonl":
        with output_path.open("w") as f:
            for q in questions:
                f.write(json.dumps(q) + "\n")
    elif format == "csv":
        if questions:
            fieldnames = list(questions[0].keys())
            with output_path.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(questions)
        else:
            output_path.write_text("")
    else:
        console.print(f"[red]Unknown format: {format}[/red]")
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