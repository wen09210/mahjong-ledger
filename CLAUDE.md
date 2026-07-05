# 麻將記帳程式(Mahjong Ledger)

## 專案背景
這是在 claude.ai 對話中完成的台灣麻將記帳 React 應用,單一檔案 `mahjong-ledger.jsx`。
原本是 claude.ai Artifact,使用 `window.storage` API 做跨 session 儲存(key: `mahjong-ledger-v1`)。

## 功能現況(已完成)
- 四家分數以麻將牌造型顯示於頂端,紅色=贏、綠色=輸(台灣習慣)
- 點分數牌可直接改玩家名字(設定分頁也可改)
- 三種記帳方式:
  - **自摸**:三家各付(底 + 台 × 每台),贏家 +3 倍
  - **放槍**:放槍者付(底 + 台 × 每台)
  - **手動**:四家金額各自輸入,每列有 +/− 切換鈕(因手機數字鍵盤無減號),
    下方即時顯示四家合計是否為 0
- 台數 stepper;金額欄可手動覆寫(點欄位自動全選),有「恢復自動」按鈕
- 歷史紀錄:每筆可刪除,手動筆會標示
- 設定:玩家名、底(預設 100)、每台(預設 20)、清空紀錄
- 所有狀態自動存入 window.storage

## 重要技術注意事項
- `window.storage` 是 claude.ai Artifact 專屬 API。若要改成獨立網頁/App,
  需替換為 localStorage 或後端(這是移植的第一件事)
- 樣式全部是 inline style(S 物件)+ 一小段 <style> CSS,無 Tailwind 依賴
- 僅依賴 React(useState/useEffect),無其他套件
- 金額輸入使用 type="text" + inputMode="numeric"(避免受控數字輸入的編輯問題)

## 使用者接下來想做的事
1. git init、建立分支(feature/mahjong-ledger)、推到 GitHub
2. 之後可能:自摸加一台、連莊/莊家台等台灣規則選項

## 慣例
- 介面與註解使用繁體中文(台灣用語:底、台、自摸、放槍、連莊)
- 正數顯示紅色 #B3402E,負數綠色 #2E6B4F(台灣金融紅漲綠跌習慣)
