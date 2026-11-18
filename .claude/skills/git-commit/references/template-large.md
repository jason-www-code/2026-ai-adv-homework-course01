# 大型變更模板

適用：6 個以上檔案，或跨模組的重大變更。

## 格式

```
<emoji> <type>: <繁體中文簡述>

主要變更：
- <核心修改 1>
- <核心修改 2>

影響範圍：
- <檔案或模組 1>
- <檔案或模組 2>

注意事項：
- <需要提醒 reviewer 的點>
```

## 範例

```
♻️ refactor: 重構驗證模組架構

主要變更：
- 將 auth 邏輯從 components 抽到獨立 hooks
- 統一錯誤處理與 token 刷新流程

影響範圍：
- src/components/Login.tsx
- src/hooks/useAuth.ts
- src/api/client.ts

注意事項：
- 需要重新登入測試 token 刷新
- localStorage 的 key 名稱有調整
```