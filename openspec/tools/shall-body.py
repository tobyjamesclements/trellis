#!/usr/bin/env python3
"""Ensure every requirement body opens with its normative SHALL statement.

OpenSpec's strict validation expects SHALL/MUST in the body line after the
"### Requirement:" header, while this tree keeps the full statement in the
header as well (project.md §7). For any requirement whose body lacks the
keyword, this script inserts the header statement (without the ID) as the
first body paragraph. Idempotent. Usage: shall-body.py <spec.md>...
"""
import re, sys
HDR = re.compile(r'^### Requirement: (.+?) \[([A-Z]{3}-\d{2})\]\s*$')
def fix(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    out, i, changed = [], 0, 0
    while i < len(lines):
        m = HDR.match(lines[i])
        out.append(lines[i]); i += 1
        if not m: continue
        # collect body until first scenario/heading
        j = i
        while j < len(lines) and not lines[j].startswith('#### ') and not lines[j].startswith('### ') and not lines[j].startswith('## '):
            j += 1
        body = '\n'.join(lines[i:j])
        if not re.search(r'\b(SHALL|MUST)\b', body):
            stmt = m.group(1).rstrip('.') + '.'
            # skip leading blank lines
            k = i
            while k < j and lines[k].strip() == '': k += 1
            out.append('')
            out.append(stmt)
            out.extend(lines[k:j])
            changed += 1
        else:
            out.extend(lines[i:j])
        i = j
    if changed:
        open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print(f'{path}: {changed} bodies amended')
for p in sys.argv[1:]: fix(p)
