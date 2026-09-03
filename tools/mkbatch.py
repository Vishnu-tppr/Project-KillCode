#!/usr/bin/env python3
"""Split problem ids into balanced JSON batches for parallel solve agents.

Usage: python3 mkbatch.py <stmts.json> [--n 8] [--outdir batches]
Writes batches/b0.json .. b(n-1).json, each a JSON list of ids.
"""
import json, sys, os


def main():
    stmts = sys.argv[1]
    n = 8
    outdir = 'batches'
    if '--n' in sys.argv:
        n = int(sys.argv[sys.argv.index('--n') + 1])
    if '--outdir' in sys.argv:
        outdir = sys.argv[sys.argv.index('--outdir') + 1]
    data = json.load(open(stmts))
    ids = sorted(data.keys(), key=lambda x: int(x))
    os.makedirs(outdir, exist_ok=True)
    buckets = [[] for _ in range(n)]
    for i, pid in enumerate(ids):
        buckets[i % n].append(pid)
    for i, b in enumerate(buckets):
        path = os.path.join(outdir, 'b{}.json'.format(i))
        json.dump(b, open(path, 'w'), indent=1)
    print('wrote {} batches, total {} ids'.format(n, len(ids)))
    for i, b in enumerate(buckets):
        print('  b{}: {} ids'.format(i, len(b)))


if __name__ == '__main__':
    main()