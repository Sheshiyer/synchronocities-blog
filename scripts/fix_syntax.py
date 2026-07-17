import sys
path = '/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog/scripts/ci-audit.py'
with open(path, 'r') as f:
    content = f.read()
# Replace the broken raw string pattern
old = r'    r"\*\*.*?\*\"\,       # bolded references'
new = r'    r"\*\*.*?\*\*",       # bolded references'
# Try multiple variants
variants = [
    r'    r"\*\*.*?\*\",       # bolded references',
    r'    r\'**.*?*\',       # bolded references',
    '    r"\\*\\*.*?\\*\\"',
]
for v in variants:
    if v in content:
        content = content.replace(v, new)
        print('replaced variant')
        break
else:
    # manual fallback: find line containing 'bolded references'
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'bolded references' in line:
            print(f'line {i+1}: {repr(line)}')
            lines[i] = r'    r"\*\*.*?\*\*",       # bolded references'
            content = '\n'.join(lines)
            break
with open(path, 'w') as f:
    f.write(content)
print('done')
