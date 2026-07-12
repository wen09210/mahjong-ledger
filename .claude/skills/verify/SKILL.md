---
name: verify
description: 在無頭瀏覽器中啟動並驅動麻將記帳頁面,驗證改動實際可用
---

# 驗證方式(GUI:靜態頁 + Babel standalone)

本專案沒有 build step:`index.html` 直接 fetch `mahjong-ledger.jsx`,
用 Babel standalone 轉譯後執行。驗證 = 在瀏覽器裡跑起來、點過改動的流程。

## 已知環境限制
- `unpkg.com`、`cdn.jsdelivr.net` 被遠端環境的網路政策擋掉(CONNECT 403)。
  改從 `registry.npmjs.org`(在 noProxy 清單,可直連)抓 tarball 取出 UMD:
  ```bash
  curl -sSfL -o react.tgz https://registry.npmjs.org/react/-/react-18.3.1.tgz
  tar xzf react.tgz package/umd/react.production.min.js --strip-components=2 -O > react.js
  # react-dom、@babel/standalone(package/babel.min.js)同理
  ```
- Trystero(共享對局)載不進來沒關係:`canShare` 會自動隱藏該功能。

## 步驟
1. 在 scratchpad 建 `serve/` 目錄:`vendor/` 放上面三個 UMD 檔,
   `mahjong-ledger.jsx` 用 symlink 指向 repo 裡的真檔,
   `index.html` 用 sed 把三個 unpkg URL 換成 `./vendor/*.js`。
2. `python3 -m http.server 8788 --bind 127.0.0.1`(在 serve/ 目錄)。
3. Playwright 驅動:`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`,
   viewport 建議 420×900(手機版型)。`npm i playwright` 於 scratchpad 即可。

## 注意
- 頁面等待:`getByRole("button", { name: "記一筆", exact: true })` 出現即載入完成。
  一定要 `exact: true` —「帶入記一筆」也含「記一筆」會撞 strict mode。
- 資料存 localStorage(index.html 有 window.storage 墊片),
  reload 後紀錄應保留;每次 `chromium.launch` 是乾淨 profile。
- 值得跑的流程:記一筆(自摸/放槍/手動)、台數分頁選牌型帶入、歷史刪除、設定改底/台。
