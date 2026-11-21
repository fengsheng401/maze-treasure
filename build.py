#!/usr/bin/env python3
"""把 src/ 下的分文件源码合并成单文件 迷宫寻宝.html。

用法：
    python build.py

规则：
  · 只改 src/ 里的文件，迷宫寻宝.html 是生成物，不要手改。
  · 合并后会自检，任何一项不对就报错退出、不写文件。
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
# 产物放仓库根目录并命名为 index.html：
# 1) 本地双击直接玩  2) GitHub Pages 部署时自动成为网站首页
OUT = os.path.join(ROOT, "index.html")

# 含内嵌音乐时产物约 2.9 MB；低于这个数说明音频丢了
MIN_BYTES = 2_800_000


def read_part(name):
    path = os.path.join(SRC, name)
    if not os.path.exists(path):
        sys.exit("缺少文件：" + path)
    return open(path, encoding="utf-8").read().rstrip("\n")


def main():
    index_path = os.path.join(SRC, "index.html")
    if not os.path.exists(index_path):
        sys.exit("缺少文件：" + index_path)

    html = open(index_path, encoding="utf-8").read()
    css_count = 0
    js_count = 0
    js_names = []

    def css_repl(m):
        nonlocal css_count
        css_count += 1
        return "<style>\n" + read_part(m.group(1)) + "\n  </style>"

    def js_repl(m):
        nonlocal js_count
        js_count += 1
        js_names.append(m.group(1))
        return "<script>\n" + read_part(m.group(1)) + "\n  </script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+\.css)">', css_repl, html)
    html = re.sub(r'<script src="([^"]+\.js)"></script>', js_repl, html)

    # ---------- 产物自检 ----------
    problems = []

    if css_count != 1:
        problems.append("样式表引用数应为 1，实际 %d" % css_count)
    if js_count < 2:
        problems.append("脚本引用数过少（%d），index.html 可能被改坏" % js_count)

    if re.search(r'<script\s+src=|rel="stylesheet"\s+href=', html):
        problems.append("产物里还有没内联的外部引用")

    style_blocks = len(re.findall(r"<style[^>]*>", html))
    if style_blocks != 1:
        problems.append("<style> 块应为 1，实际 %d" % style_blocks)

    script_blocks = len(re.findall(r"<script[^>]*>", html))
    if script_blocks != js_count + 1:      # +1 是内嵌音乐那个 text/plain 块
        problems.append("<script> 块应为 %d，实际 %d" % (js_count + 1, script_blocks))

    for must in ("function loadLevel", "const LEVELS", "function render", 'id="bgm-data"'):
        if must not in html:
            problems.append("缺少关键内容：%s" % must)

    size = len(html.encode("utf-8"))
    if size < MIN_BYTES:
        problems.append("产物只有 %s 字节，低于 %s，内嵌音乐可能缺失"
                        % (format(size, ","), format(MIN_BYTES, ",")))

    if problems:
        print("构建失败，未写入文件：")
        for item in problems:
            print("  x", item)
        sys.exit(1)

    open(OUT, "w", encoding="utf-8", newline="").write(html)

    print("构建成功：%s" % os.path.basename(OUT))
    print("  大小 %s 字节（%.2f MB）" % (format(size, ","), size / 1048576))
    print("  内联样式表 %d 个、脚本 %d 个、<script> 块共 %d 个"
          % (css_count, js_count, script_blocks))
    print("  脚本顺序：" + " -> ".join(js_names))


if __name__ == "__main__":
    main()
