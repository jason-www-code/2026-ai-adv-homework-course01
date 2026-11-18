---
name: git-commit
description: 撰寫 git commit 訊息時使用，會先檢查 staged 變更內容，依據修改規模選擇合適的模板，並在訊息開頭加上對應的 emoji。當使用者要求寫 commit、執行 git commit、整理變更紀錄、或想 commit 目前進度時觸發。
---

# Git Commit with Emoji

## 執行流程

收到 commit 請求時，依照下列順序執行，不要跳步驟。

### 步驟 1：檢查當前變更

```bash
git status
git diff --staged
```

如果沒有 staged 檔案，停下來詢問使用者要 commit 哪些檔案，不要擅自決定要 `git add` 什麼。

### 步驟 2：判斷類型

依據 diff 內容判斷類型，從 `references/emoji-types.md` 查出對應的 emoji 與 type。

### 步驟 3：判斷規模並載入模板

| 規模 | 判斷標準 | 載入檔案 |
|---|---|---|
| 小型 | 1 至 2 個檔案，邏輯單純 | `references/template-small.md` |
| 中型 | 3 至 5 個檔案，或單一功能的多檔協作 | `references/template-medium.md` |
| 大型 | 6 個以上檔案，或跨模組變更 | `references/template-large.md` |

只載入對應規模的那一個模板檔案，不要全部讀取。

## 必須遵守的規則

第一行（subject line）：

1. 開頭一定要有 emoji，後面空一格接 type
2. type 後接冒號與一個空格
3. 描述使用繁體中文，動詞開頭
4. 整行不超過 50 字元（中文字計 2 字元）
5. 結尾不加句號

內文：

1. 第一行與內文之間一定要空一行
2. 列點與分區段說明使用繁體中文
3. 技術名詞、檔案路徑、套件名保留英文
4. 每個 commit 只用一個 type 與一個 emoji

## 產出後的處理

1. 把訊息完整顯示給使用者確認
2. 詢問是否要直接執行 commit
3. 多行訊息使用 heredoc 寫入：

```bash
git commit -F- <<EOF
<commit message>
EOF
```

單行訊息可直接用 `-m`。