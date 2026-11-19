#!/usr/bin/env bash
# 等待本機開發伺服器（預設 port 3001）回應 HTTP 200，最多等 TIMEOUT 秒（預設 15）。
# 沙箱內的指令有獨立網路、連不到沙箱外的伺服器，因此此腳本被列在
# .claude/settings.json 的 sandbox.excludedCommands，會在沙箱外執行。
# 修改時請保持最小，並經過 code review。
PORT="${PORT:-3001}"
TIMEOUT="${TIMEOUT:-15}"

for _ in $(seq "$TIMEOUT"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:${PORT}/")
  if [ "$code" = "200" ]; then
    echo "server up: http://localhost:${PORT}/ (HTTP ${code})"
    exit 0
  fi
  sleep 1
done

echo "server not responding on port ${PORT} after ${TIMEOUT}s" >&2
exit 1
