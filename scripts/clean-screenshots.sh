#!/usr/bin/env bash
# 清理 screenshots/：只保留最新的一張 .png，刪除其他檔案（.yml、.log、舊截圖）。
# 只動 screenshots/ 內的一般檔案，不碰子目錄；在沙箱內執行即可（專案目錄可寫）。
cd "$(dirname "$0")/../screenshots" || exit 1

keep=$(ls -t -- *.png 2>/dev/null | head -n 1)
if [ -z "$keep" ]; then
  echo "screenshots/ 沒有 .png，未刪除任何檔案" >&2
  exit 1
fi

find . -maxdepth 1 -type f ! -name "$keep" -delete
echo "已保留：$keep"
ls -la
