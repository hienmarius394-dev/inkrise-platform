import glob, os

real_key = 'eyJhbG...fb44'

path = os.path.dirname(os.path.abspath(__file__))
count = 0
for f in sorted(glob.glob(os.path.join(path, '*.html'))):
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    old = content
    content = content.replace("'eyJhbG...fb44'", f"'{real_key}'")
    content = content.replace("'eyJhbG...Tvkk'", f"'{real_key}'")
    
    if content != old:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        print(f'OK {os.path.basename(f)}')
        count += 1
    else:
        print(f'-- {os.path.basename(f)} (unchanged)')

print(f'\nDone: {count} files updated')