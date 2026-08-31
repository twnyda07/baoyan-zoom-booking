# 寶嚴禪寺 Zoom 會議室預約系統

線上預約網頁：**https://twnyda07.github.io/baoyan-zoom-booking/**

## 架構
- **前端**：本 repo 的 `index.html`，GitHub Pages 靜態頁
- **後端**：Google Apps Script Web App（twnyda07@gmail.com 帳號下，專案名「寶嚴禪寺zoom會議室預約系統後端」）
  - 資料存於 Script Properties：`config`（會議室／固定課程／管理密碼）、`bookings_YYYY-MM`（每月預約）
  - **單筆 Script Property 上限 9KB**，因此每月預約超過約 30 筆就會自動分片存成 `bookings_YYYY-MM`、`bookings_YYYY-MM~1`、`~2`……；讀取時由 `loadMonth()` 併回一份。每月上限 300 筆（`MAX_MONTH_BOOKINGS`）
  - ⚠️ 2026-08-31 修正：舊版把整月塞在單一 property 並在 8300 字元處硬擋，7 月與 8 月都在月中被塞滿，之後該月任何會議室都回「該月份預約已滿」——外觀上很像「某間會議室不能約」。改分片後解除
  - API 網址寫在 `index.html` 的 `API_URL`
  - 後端原始碼備份：`Code.gs`

## 功能
- 週曆檢視：固定課程（灰色斜紋，不開放申請）＋已核准預約（彩色），可按會議室篩選
- 申請預約：申請人／**Email（必填，忘記取消碼用）**／活動名稱（必填，顯示在行事曆）／日期／時間（限整點半點）／Zoom 號碼；Zoom 號碼＝下拉可約清單＋「其他」自填強制 10 碼（前後端雙重驗證，不開放的會議室兩邊都擋）；無衝突即自動放行，成功後發 4 位數取消碼
- 取消預約：行事曆區塊 ✕ 或列表 🗑️ → 輸入取消碼；忘記取消碼 → 近期預約下方輸入 Email 寄回未到期預約
- 管理後台（頁面底部「管理人登入」）：刪除任何預約、增修刪固定課程時段、增刪會議室、更改管理密碼
  - **管理密碼不寫在這個 repo 裡**。初次初始化時取自 Script Property `ADMIN_PASSWORD`（沒設就隨機產生並寫回該 property），可在「專案設定 → 指令碼屬性」查看，或在管理後台自行更改

## 固定規則
- **可申請**：8896316212／2023101199（觀心一支香）／4079019912／8865224678
- **不開放申請**（`roomCatalog().bannedRooms`，行事曆仍顯示其既有時段）：
  - 5224676123（華嚴經共修專用）
  - 8865224676、2328956604、3215224676（特殊會議室）
- 清單改在 `roomCatalog()` 一處維護；改完在編輯器執行 `套用會議室清單()` 即可套用到線上設定（可重複執行，不動密碼、固定課程與既有預約）
- Email 必填供「忘記取消碼」寄信（MailApp，已授權 send_mail）
- 固定課程時段依寶嚴國際佛學研修院課表（baoyanedu.com/schedule）＋指定安排：
  - 2023101199：觀心一支香（每日 07:00–07:40）、晨讀教觀綱宗（每日 07:40–08:20）、英文課（一三四五 20:00–21:00）、英文禪修（三 19:00–20:00）、瑜伽師地論（二 19:30–21:30）
  - 5224676123：騰雲華嚴六卷組（每日 06:20–08:30）、童童華嚴（一三四五 20:30–21:00）
  - 8865224676：華嚴經三卷（每日 05:00–06:30、07:00–08:30、16:30–18:00、20:00–21:30）
    ※ 原本掛在 8835224601，該號碼不存在，2026-08-31 已刪除
  - 3215224676：常住會議（每週五 08:00–12:00）
- 以上皆可由管理後台調整

## 修改後端
到 script.google.com（twnyda07 帳號，本機 Chrome 是 `authuser=1`）→ 專案「寶嚴禪寺zoom會議室預約系統後端」
（script id `1W60KzdiA8M8GXhmY-rSnbP322ig_iBfJ4EuVfYeFwo1BXjXemkpWJN_h`）→ 改完程式後
**Deploy → Manage deployments → 鉛筆編輯 → Version 選「New version」→ Deploy**（沿用同一網址）。
改完務必直接打 API 驗證，不要只看網頁有沒有開起來：

```bash
curl -sL 'https://script.google.com/macros/s/AKfycbzky2B5IWWe7niSYCkAyHe5mVtpc5iNlcGecL89iy4tvq-F7IGYcmtMXl8q6w_2YsREwg/exec' | head -c 300
```
