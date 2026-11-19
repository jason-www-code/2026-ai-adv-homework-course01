#!/usr/bin/env bash
# 停止佔用本專案埠號（預設 3001）的開發伺服器，只依埠號判斷，不用行程名稱比對。
# 此腳本被列在 .claude/settings.json 的 sandbox.excludedCommands，會在沙箱外執行，
# 修改時請保持最小，並經過 code review。
PORT="${PORT:-3001}"

pids=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN)
if [ -z "$pids" ]; then
  echo "port ${PORT} 沒有行程在監聽"
  exit 0
fi

kill $pids
echo "已停止 port ${PORT} 上的行程：${pids}"
