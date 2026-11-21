#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扫描一个包含 .url 文件的目录树，生成 data.js。

用法:
    python build_data.py urls -o data.js
"""
import argparse
import datetime
import json
import os
import uuid


def read_url_file(path):
    """从 Windows .url 文件里取出 URL 行。"""
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.lower().startswith('url='):
                    return line[4:].strip()
    except OSError:
        pass
    return None


def main():
    ap = argparse.ArgumentParser(description='把 .url 文件目录转成 data.js')
    ap.add_argument('input', help='包含 .url 文件的根目录')
    ap.add_argument('-o', '--output', default='data.js', help='输出文件（默认 data.js）')
    args = ap.parse_args()

    items = []
    for root, dirs, files in os.walk(args.input):
        dirs.sort()
        rel = os.path.relpath(root, args.input)
        path_parts = [] if rel == '.' else rel.split(os.sep)
        for fn in sorted(files):
            if not fn.lower().endswith('.url'):
                continue
            url = read_url_file(os.path.join(root, fn))
            if not url:
                continue
            items.append({
                'id': str(uuid.uuid4()),
                'title': os.path.splitext(fn)[0],
                'url': url,
                'path': path_parts,
            })

    data = {
        'generated': datetime.date.today().isoformat(),
        'items': items,
    }
    js = 'window.BOOKMARKS = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'共 {len(items)} 条 -> {args.output}')


if __name__ == '__main__':
    main()