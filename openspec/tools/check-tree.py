#!/usr/bin/env python3
"""Structural checks for the Trellis OpenSpec tree (read-only).

- every spec has the mandated sections in order (project.md §7)
- every requirement header has the form "### Requirement: The system SHALL … [XXX-nn]"
- IDs are contiguous from 01 within each spec and the prefix matches the file
- every requirement has at least one "#### Scenario:" with WHEN and THEN bullets
- every XXX-nn reference anywhere in the tree resolves to a defined requirement
Exit code 1 on any problem.
"""
import re, glob, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTIONS = ['## Purpose', '## Consistency boundary', '## Domain model', '## Requirements',
            '## DynamoDB access patterns', '## Lambda invocation shape and cold-start profile',
            '## Propagation path', '## Cost model', '## Standards conformance', '## Known Tensions']
HDR = re.compile(r'^### Requirement: The system SHALL .+ \[([A-Z]{3})-(\d{2})\]\s*$')
problems, defined = [], set()
for spec in sorted(glob.glob(os.path.join(ROOT, 'specs', '*', 'spec.md'))):
    name = os.path.basename(os.path.dirname(spec))
    text = open(spec, encoding='utf-8').read()
    pos = [text.find(s + '\n') for s in SECTIONS]
    if any(p < 0 for p in pos):
        problems.append(f'{name}: missing sections {[s for s, p in zip(SECTIONS, pos) if p < 0]}')
    elif pos != sorted(pos):
        problems.append(f'{name}: sections out of order')
    lines = text.split('\n')
    ids, prefix = [], None
    for i, line in enumerate(lines):
        if line.startswith('### Requirement:'):
            m = HDR.match(line)
            if not m:
                problems.append(f'{name}:{i+1}: malformed requirement header: {line[:80]}')
                continue
            prefix = prefix or m.group(1)
            if m.group(1) != prefix:
                problems.append(f'{name}:{i+1}: prefix {m.group(1)} differs from {prefix}')
            ids.append(int(m.group(2)))
            defined.add(f'{m.group(1)}-{m.group(2)}')
            j = i + 1
            block = []
            while j < len(lines) and not lines[j].startswith('### ') and not lines[j].startswith('## '):
                block.append(lines[j]); j += 1
            b = '\n'.join(block)
            if not re.search(r'^#### Scenario:', b, re.M):
                problems.append(f'{name}: {m.group(1)}-{m.group(2)} has no scenario')
            if not re.search(r'^- \*\*WHEN\*\*', b, re.M) or not re.search(r'^- \*\*THEN\*\*', b, re.M):
                problems.append(f'{name}: {m.group(1)}-{m.group(2)} scenario lacks WHEN/THEN bullets')
    if ids != list(range(1, len(ids) + 1)):
        problems.append(f'{name}: ids not contiguous: {ids}')
for f in glob.glob(os.path.join(ROOT, '**', '*.md'), recursive=True):
    if '/changes/' in f and '/specs/' in f: continue
    for rid in set(re.findall(r'\b([A-Z]{3}-\d{2})\b', open(f, encoding='utf-8').read())):
        if rid[:3] in ('FLS','DRV','MVA','IDE','CAC','ACT','COM','LTI','DIO','CRD','ADM') and rid not in defined:
            problems.append(f'{os.path.relpath(f, ROOT)}: reference to undefined {rid}')
for p in sorted(set(problems)): print('PROBLEM', p)
print(f'{len(defined)} requirements defined; {len(set(problems))} problems')
sys.exit(1 if problems else 0)
