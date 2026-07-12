---
name: publish-site
description: >-
  麻將記帳專案的「文件 + 上線」工作流:開啟/定位 repo、撰寫或更新 README.md、
  製作或修改使用簡報 slides.html,並推送讓 GitHub Pages 自動部署。
  當使用者說「寫 readme」「做 ppt / 簡報 / slides」「推到 gh-page / 部署 / 上線」時使用。
---

# 麻將記帳:文件與上線工作流

這支 skill 記錄本專案「開 repo → 寫 README → 做簡報 → 上線」整條流程與慣例。
照著走就能保持風格一致、部署不出錯。

## 0. 上線機制(先懂這個)

- **沒有 `.github/workflows`、也沒有 `gh-pages` 分支。** GitHub Pages 設定為
  **「Deploy from a branch: `main` / root」**,所以**推到 `main` 就會自動部署**。
  觸發的是 GitHub 內建的 workflow「pages build and deployment」。
- 線上網址:**https://wen09210.github.io/mahjong-ledger/**
- 簡報網址:**https://wen09210.github.io/mahjong-ledger/slides.html**
- 「推送到 gh-page」≠ 推到某個 gh-pages 分支,而是**讓變更進到 `main`**。

## 1. 開啟 / 定位 repo

- 進 repo 先讀 `CLAUDE.md`,掌握:單一檔案架構(`mahjong-ledger.jsx`)、
  台灣用語慣例、`window.storage` 是 Artifact API(移植第一件事是換 localStorage)。
- 檔案地圖:
  - `mahjong-ledger.jsx` — 全部邏輯與畫面(單一 React 元件)
  - `index.html` — 載入 React/Babel,提供 `window.storage` localStorage 墊片
  - `README.md` — 給使用者的說明(繁中)
  - `slides.html` — 使用簡報(獨立 HTML,自帶樣式與翻頁邏輯)
- **分支規範**:在 `CLAUDE.md` 指定的開發分支上做。**若對應 PR 已合併,
  視為全新變更**:`git fetch origin main && git checkout -B <branch> origin/main`
  後再開工(不要疊在已合併的歷史上)。

## 2. 寫 / 更新 README.md

慣例(對齊現有 `README.md`):
- **繁體中文、台灣用語**(底、台、自摸、放槍、連莊)。第一段一句話講清楚用途,
  緊接著放**線上網址**與**簡報連結**。
- 保留既有結構:設定 → 記帳三種方式(用**表格**:方式 / 什麼時候用 / 怎麼算)
  → 歷史 → 共享對局 → 注意事項 → 本機開發 → 未來想做的。
- 新增功能時,同步更新對應段落(例:台數查詢就補在「記帳」相關說明或另立段落)。
- 顏色語彙若提到:**紅=贏、綠=輸**(台灣紅漲綠跌),別寫反。
- 本機開發段落維持:純前端、零建置,`python3 -m http.server` 即可。

## 3. 做 / 改簡報 slides.html

`slides.html` 是**獨立單檔**,自帶設計系統與翻頁邏輯。改它時沿用既有 tokens 與結構,
不要另起爐灶。

**設計系統(`:root` CSS 變數):**
- 主色:牌桌氈綠 `--color-background:#122B20`、`--color-primary:#2E6B4F`;
  金色點綴 `--color-accent:#D9B665`。贏 `--win:#E8846F`、輸 `--lose:#7FBF9E`。
- 字體:標題 `--font-display`(Noto Serif TC)、內文 `--font-body`(Noto Sans TC),
  皆從 Google Fonts 載入(線上 Pages 可載;離線/Artifact 環境會 fallback 系統字,可接受)。
- 麻將牌用**純 CSS `.tile`**(象牙面漸層 + 多層陰影)呈現,條列符號是迷你「中」字牌
  (`ul.steps li::before`),**不要用 emoji 當 icon**。

**一張投影片的結構:**
```html
<section class="slide">          <!-- 第一張加 active -->
  <h2><span class="tag">STEP N</span>標題</h2>
  <ul class="steps"><li>…</li></ul>   <!-- 或 .cards / .big-formula / .url -->
</section>
```
- 加投影片:複製一個 `<section class="slide">` 貼到 `<nav>` 之前即可;
  導覽點、頁碼、進度條由底部 script 依 `.slide` 數量**自動生成**,不用手改。
- 翻頁已內建:方向鍵/空白/PageUp-Down、點左三分之一往前、觸控滑動、導覽點。
- 保留 `@media (prefers-reduced-motion: reduce)` 與 `max-width:640px` 手機樣式。
- 文案吻合 App 實際行為與 README(例:自摸「三家各付 = 底 + 台 × 每台」)。

## 4. 推送上線(= 進 main)

1. 在開發分支 commit(訊息用繁中、清楚描述);commit 訊息尾端照 repo 慣例附
   `Co-Authored-By` 與 `Claude-Session`。
2. `git push -u origin <branch>`(網路失敗才重試,2/4/8/16s 退避)。
3. 開 PR → **squash merge 進 `main`**(標題如「更新使用簡報 (#N)」)。
   PR 已合併就是新變更,別重用舊 PR。
4. 合併後 **Pages 自動部署**。確認部署成功(見下)。線上看不到新內容時,
   多半是瀏覽器快取,**強制重新整理**即可。

## 5. 驗證

- **部署狀態**:用 GitHub Actions 工具列出 workflow runs,確認最新一筆
  「pages build and deployment」的 branch=main、conclusion=success、head_sha 對應你的 merge commit。
- **簡報改動**:本機用瀏覽器開 `slides.html` 點過翻頁(方向鍵、導覽點、手機寬度),
  或用 Playgright + 內建 Chromium(`executablePath:"/opt/pw-browsers/chromium"`)截圖。
- **App 改動**:見 `.claude/skills/verify`(內含在遠端環境本地供應 React/Babel 的方法)。
- 遠端容器可能連不到 `*.github.io`,無法實際打開線上頁面;以部署 run 成功 + 本地驗證為準。
