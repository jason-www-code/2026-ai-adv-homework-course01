#!/usr/bin/env bash
# 以 .nvmrc 指定的 Node 版本啟動開發伺服器（better-sqlite3 需與 Node 版本相符）。
# 此腳本被列在 .claude/settings.json 的 sandbox.excludedCommands，會在沙箱外執行，
# 修改時請保持最小，並經過 code review。
cd "$(dirname "$0")/.." && source ~/.nvm/nvm.sh && nvm use && exec node server.js
