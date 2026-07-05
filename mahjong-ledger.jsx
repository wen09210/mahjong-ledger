import { useState, useEffect } from "react";

// ── 麻將記帳 ──
// 台灣麻將常用算法:底 + 台
// 自摸:三家各付(底 + 台×台數);放槍:放槍者付(底 + 台×台數)

const STORAGE_KEY = "mahjong-ledger-v1";

const DEFAULT_STATE = {
  players: ["東", "南", "西", "北"],
  base: 100, // 底
  perTai: 20, // 每台
  records: [], // {id, winner, type: 'zimo'|'discard', loser, tai, amounts:[...], time}
};

const fmt = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

export default function MahjongLedger() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("record"); // record | history | settings
  // 記帳表單
  const [winner, setWinner] = useState(0);
  const [type, setType] = useState("zimo");
  const [loser, setLoser] = useState(1);
  const [tai, setTai] = useState(1);
  const [customAmt, setCustomAmt] = useState(null); // null = 依台數自動計算;字串 = 手動輸入中
  const [manualAmts, setManualAmts] = useState(["", "", "", ""]); // 手動模式:各家金額
  const [flash, setFlash] = useState(null);
  const [editing, setEditing] = useState(null); // 正在改名的玩家 index

  // 載入
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) setState({ ...DEFAULT_STATE, ...JSON.parse(r.value) });
      } catch (e) {
        /* 尚無資料 */
      }
      setLoaded(true);
    })();
  }, []);

  const save = async (next) => {
    setState(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("儲存失敗", e);
    }
  };

  // 各家總計
  const totals = [0, 0, 0, 0];
  state.records.forEach((r) => r.amounts.forEach((a, i) => (totals[i] += a)));

  const parseSigned = (s) => {
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  };

  const addRecord = () => {
    // 手動模式:直接使用各家填的金額
    if (type === "manual") {
      const amounts = manualAmts.map(parseSigned);
      if (amounts.every((a) => a === 0)) return;
      const rec = {
        id: Date.now(),
        winner: null,
        type: "manual",
        loser: null,
        tai: null,
        amt: null,
        manual: true,
        amounts,
        time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
      };
      save({ ...state, records: [rec, ...state.records] });
      const top = amounts.indexOf(Math.max(...amounts));
      setManualAmts(["", "", "", ""]);
      setFlash(top);
      setTimeout(() => setFlash(null), 900);
      return;
    }

    const amt = customAmt !== null ? parseInt(customAmt, 10) || 0 : state.base + state.perTai * tai;
    if (amt <= 0) return;
    const amounts = [0, 0, 0, 0];
    if (type === "zimo") {
      for (let i = 0; i < 4; i++) {
        if (i === winner) amounts[i] = amt * 3;
        else amounts[i] = -amt;
      }
    } else {
      if (loser === winner) return;
      amounts[winner] = amt;
      amounts[loser] = -amt;
    }
    const rec = {
      id: Date.now(),
      winner,
      type,
      loser: type === "discard" ? loser : null,
      tai,
      amt,
      manual: customAmt !== null,
      amounts,
      time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
    };
    save({ ...state, records: [rec, ...state.records] });
    setCustomAmt(null);
    setFlash(winner);
    setTimeout(() => setFlash(null), 900);
  };

  const deleteRecord = (id) =>
    save({ ...state, records: state.records.filter((r) => r.id !== id) });

  const resetGame = () => {
    if (confirm("確定要清空所有紀錄嗎?此動作無法復原。")) {
      save({ ...state, records: [] });
    }
  };

  const setPlayerName = (i, name) => {
    const players = [...state.players];
    players[i] = name;
    save({ ...state, players });
  };

  if (!loaded)
    return (
      <div style={S.page}>
        <div style={{ color: "#EFE7D2", padding: 40, textAlign: "center", fontSize: 15 }}>
          載入中…
        </div>
      </div>
    );

  const autoAmt = state.base + state.perTai * tai;
  const amt = customAmt !== null ? parseInt(customAmt, 10) || 0 : autoAmt;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* 標題 */}
      <header style={S.header}>
        <div style={S.titleTile}>
          <span style={{ color: "#B3402E", fontSize: 22 }}>中</span>
        </div>
        <div>
          <h1 style={S.h1}>麻將記帳</h1>
          <div style={S.sub}>
            底 {state.base}/{state.perTai}・共 {state.records.length} 局
          </div>
        </div>
      </header>

      {/* 四家分數(麻將牌造型) */}
      <div style={S.tileRow}>
        {state.players.map((p, i) => (
          <div
            key={i}
            className={flash === i ? "tile win-flash" : "tile"}
            style={{ ...S.tile, cursor: "pointer" }}
            onClick={() => editing === null && setEditing(i)}
          >
            {editing === i ? (
              <input
                autoFocus
                value={p}
                maxLength={6}
                onChange={(e) => setPlayerName(i, e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                onClick={(e) => e.stopPropagation()}
                style={S.tileNameInput}
              />
            ) : (
              <div style={S.tileName}>{p || "點我改名"}</div>
            )}
            <div
              style={{
                ...S.tileScore,
                color: totals[i] > 0 ? "#B3402E" : totals[i] < 0 ? "#2E6B4F" : "#6B6154",
              }}
            >
              {fmt(totals[i])}
            </div>
          </div>
        ))}
      </div>

      {/* 分頁 */}
      <nav style={S.tabs}>
        {[
          ["record", "記一筆"],
          ["history", "歷史"],
          ["settings", "設定"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ ...S.tabBtn, ...(tab === k ? S.tabActive : {}) }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── 記一筆 ── */}
      {tab === "record" && (
        <section style={S.card}>
          <div style={S.label}>記帳方式</div>
          <div style={S.btnRow}>
            <button
              onClick={() => setType("zimo")}
              style={{ ...S.pick, flex: 1, ...(type === "zimo" ? S.pickOn : {}) }}
            >
              自摸
            </button>
            <button
              onClick={() => setType("discard")}
              style={{ ...S.pick, flex: 1, ...(type === "discard" ? S.pickOn : {}) }}
            >
              放槍
            </button>
            <button
              onClick={() => setType("manual")}
              style={{ ...S.pick, flex: 1, ...(type === "manual" ? S.pickOn : {}) }}
            >
              手動
            </button>
          </div>

          {type !== "manual" && (
            <>
              <div style={S.label}>胡牌的人</div>
              <div style={S.btnRow}>
                {state.players.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setWinner(i)}
                    style={{ ...S.pick, ...(winner === i ? S.pickOn : {}) }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}

          {type === "discard" && (
            <>
              <div style={S.label}>放槍的人</div>
              <div style={S.btnRow}>
                {state.players.map((p, i) => (
                  <button
                    key={i}
                    disabled={i === winner}
                    onClick={() => setLoser(i)}
                    style={{
                      ...S.pick,
                      ...(loser === i ? S.pickLose : {}),
                      opacity: i === winner ? 0.3 : 1,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}

          {type === "manual" ? (
            <>
              <div style={S.label}>各家金額(點 +/− 切換贏或輸)</div>
              {state.players.map((p, i) => {
                const isNeg = manualAmts[i].startsWith("-");
                const digits = manualAmts[i].replace(/[^0-9]/g, "");
                const setVal = (neg, d) => {
                  const next = [...manualAmts];
                  next[i] = d === "" ? (neg ? "-" : "") : (neg ? "-" : "") + d;
                  setManualAmts(next);
                };
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 56, fontWeight: 700, fontSize: 15, color: "#3A332A" }}>{p}</div>
                    <button
                      onClick={() => setVal(!isNeg, digits)}
                      style={{
                        ...S.signBtn,
                        background: isNeg ? "#2E6B4F" : "#B3402E",
                      }}
                    >
                      {isNeg ? "−" : "+"}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={digits}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setVal(isNeg, e.target.value.replace(/[^0-9]/g, ""))}
                      style={{
                        ...S.input,
                        marginBottom: 0,
                        flex: 1,
                        fontSize: 17,
                        fontWeight: 800,
                        color: digits === "" || digits === "0" ? "#3A332A" : isNeg ? "#2E6B4F" : "#B3402E",
                      }}
                    />
                  </div>
                );
              })}
              <div style={S.preview}>
                {(() => {
                  const sum = manualAmts.reduce((s, v) => s + parseSigned(v), 0);
                  return sum === 0
                    ? "四家合計 0,收支平衡 ✓"
                    : `四家合計 ${fmt(sum)},注意:通常應該要是 0`;
                })()}
              </div>
            </>
          ) : (
            <>
              <div style={S.label}>台數</div>
              <div style={S.stepper}>
                <button style={S.stepBtn} onClick={() => setTai(Math.max(0, tai - 1))}>
                  −
                </button>
                <div style={S.taiNum}>
                  {tai} <span style={{ fontSize: 14, color: "#8A7F6E" }}>台</span>
                </div>
                <button style={S.stepBtn} onClick={() => setTai(tai + 1)}>
                  +
                </button>
              </div>

              <div style={S.label}>
                金額{customAmt !== null ? "(手動)" : `(自動:底 ${state.base} + ${tai} 台 × ${state.perTai})`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={String(autoAmt)}
                  value={customAmt !== null ? customAmt : String(autoAmt)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setCustomAmt(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 18, fontWeight: 800 }}
                />
                {customAmt !== null && (
                  <button style={S.autoBtn} onClick={() => setCustomAmt(null)}>
                    恢復自動
                  </button>
                )}
              </div>

              <div style={S.preview}>
                {type === "zimo"
                  ? `${state.players[winner]} 自摸 ${tai} 台,三家各付 ${amt.toLocaleString()},共 +${(amt * 3).toLocaleString()}`
                  : `${state.players[loser]} 放槍,付 ${state.players[winner]} ${amt.toLocaleString()}`}
              </div>
            </>
          )}

          <button className="go" style={S.go} onClick={addRecord}>
            {type === "manual" ? "記下來" : "胡了!記下來"}
          </button>
        </section>
      )}

      {/* ── 歷史 ── */}
      {tab === "history" && (
        <section style={S.card}>
          {state.records.length === 0 ? (
            <div style={S.empty}>還沒有紀錄。開打之後到「記一筆」登記吧。</div>
          ) : (
            state.records.map((r) => (
              <div key={r.id} style={S.rec}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#3A332A" }}>
                    {r.type === "manual" ? (
                      <>手動記帳</>
                    ) : (
                      <>
                        {state.players[r.winner]}{" "}
                        {r.type === "zimo" ? "自摸" : `胡 ${state.players[r.loser]}`}
                        <span style={{ color: "#B3402E" }}>
                          {" "}
                          {r.manual ? `$${r.amt.toLocaleString()}(手動)` : `${r.tai} 台`}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A7F6E", marginTop: 2 }}>
                    {r.time}・{r.amounts.map((a, i) => `${state.players[i]} ${fmt(a)}`).join("  ")}
                  </div>
                </div>
                <button style={S.del} onClick={() => deleteRecord(r.id)}>
                  刪除
                </button>
              </div>
            ))
          )}
        </section>
      )}

      {/* ── 設定 ── */}
      {tab === "settings" && (
        <section style={S.card}>
          <div style={S.label}>玩家名字</div>
          {state.players.map((p, i) => (
            <input
              key={i}
              value={p}
              maxLength={6}
              onChange={(e) => setPlayerName(i, e.target.value)}
              style={S.input}
            />
          ))}

          <div style={S.label}>底(每局基本)</div>
          <input
            type="number"
            value={state.base}
            onChange={(e) => save({ ...state, base: Number(e.target.value) || 0 })}
            style={S.input}
          />

          <div style={S.label}>每台金額</div>
          <input
            type="number"
            value={state.perTai}
            onChange={(e) => save({ ...state, perTai: Number(e.target.value) || 0 })}
            style={S.input}
          />

          <button style={S.reset} onClick={resetGame}>
            清空所有紀錄
          </button>
        </section>
      )}

      <footer style={S.footer}>紀錄會自動儲存,下次打開還在。</footer>
    </div>
  );
}

const CSS = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  input:focus, button:focus-visible { outline: 2px solid #D9A441; outline-offset: 1px; }
  .tile { transition: transform .15s ease; }
  .win-flash { animation: pop .8s ease; }
  @keyframes pop {
    0% { transform: scale(1); }
    30% { transform: scale(1.12) rotate(-2deg); box-shadow: 0 0 0 3px #D9A441; }
    100% { transform: scale(1); }
  }
  .go:active { transform: scale(.97); }
  @media (prefers-reduced-motion: reduce) { .win-flash { animation: none; } }
`;

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1E4D3A 0%, #163C2D 100%)",
    fontFamily:
      "'PingFang TC','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif",
    padding: "20px 14px 30px",
    maxWidth: 480,
    margin: "0 auto",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
  titleTile: {
    width: 44,
    height: 54,
    background: "linear-gradient(175deg,#FAF6EA 70%,#E8E0CB 100%)",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 3px 0 #C9BFA6, 0 5px 10px rgba(0,0,0,.35)",
    fontWeight: 800,
  },
  h1: { margin: 0, fontSize: 22, color: "#F3EDDC", letterSpacing: 2, fontWeight: 800 },
  sub: { fontSize: 12, color: "#A8C4B4", marginTop: 2, letterSpacing: 1 },
  tileRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 },
  tile: {
    background: "linear-gradient(175deg,#FAF6EA 72%,#E8E0CB 100%)",
    borderRadius: 10,
    padding: "10px 4px 12px",
    textAlign: "center",
    boxShadow: "0 4px 0 #C9BFA6, 0 6px 12px rgba(0,0,0,.3)",
  },
  tileName: { fontSize: 13, color: "#6B6154", fontWeight: 700, letterSpacing: 1 },
  tileNameInput: {
    width: "100%",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
    border: "1.5px solid #D9A441",
    borderRadius: 6,
    background: "#FFFDF6",
    color: "#3A332A",
    padding: "2px 2px",
  },
  tileScore: { fontSize: 17, fontWeight: 800, marginTop: 4, fontVariantNumeric: "tabular-nums" },
  tabs: {
    display: "flex",
    gap: 6,
    background: "rgba(0,0,0,.25)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    padding: "9px 0",
    border: "none",
    borderRadius: 9,
    background: "transparent",
    color: "#BFD6C8",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 1,
  },
  tabActive: { background: "#F3EDDC", color: "#1E4D3A" },
  card: {
    background: "#F7F2E4",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
  },
  label: {
    fontSize: 12,
    fontWeight: 800,
    color: "#8A7F6E",
    letterSpacing: 2,
    margin: "14px 0 8px",
  },
  btnRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  pick: {
    flex: 1,
    minWidth: 64,
    padding: "12px 0",
    borderRadius: 10,
    border: "1.5px solid #D8CFBA",
    background: "#FFFDF6",
    fontSize: 15,
    fontWeight: 700,
    color: "#3A332A",
    cursor: "pointer",
  },
  pickOn: { background: "#B3402E", borderColor: "#B3402E", color: "#FFF8EC" },
  pickLose: { background: "#2E6B4F", borderColor: "#2E6B4F", color: "#FFF8EC" },
  stepper: { display: "flex", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    border: "1.5px solid #D8CFBA",
    background: "#FFFDF6",
    fontSize: 26,
    fontWeight: 700,
    color: "#3A332A",
    cursor: "pointer",
  },
  taiNum: {
    flex: 1,
    textAlign: "center",
    fontSize: 30,
    fontWeight: 800,
    color: "#3A332A",
    fontVariantNumeric: "tabular-nums",
  },
  preview: {
    marginTop: 16,
    padding: "10px 12px",
    background: "#EFE7D2",
    borderRadius: 10,
    fontSize: 13.5,
    color: "#5B5346",
    lineHeight: 1.5,
  },
  go: {
    width: "100%",
    marginTop: 12,
    padding: "15px 0",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(180deg,#C24A36,#A93A28)",
    color: "#FFF8EC",
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: 3,
    cursor: "pointer",
    boxShadow: "0 4px 0 #7E2A1C",
  },
  rec: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 0",
    borderBottom: "1px solid #E4DBC6",
  },
  del: {
    border: "none",
    background: "transparent",
    color: "#B3402E",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    padding: "6px 8px",
  },
  empty: { textAlign: "center", color: "#8A7F6E", fontSize: 14, padding: "26px 0" },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 10,
    border: "1.5px solid #D8CFBA",
    background: "#FFFDF6",
    fontSize: 15,
    marginBottom: 8,
    color: "#3A332A",
  },
  signBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: "none",
    color: "#FFF8EC",
    fontSize: 22,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1,
  },
  autoBtn: {
    padding: "0 14px",
    borderRadius: 10,
    border: "1.5px solid #D8CFBA",
    background: "#FFFDF6",
    color: "#8A7F6E",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  reset: {
    width: "100%",
    marginTop: 18,
    padding: "12px 0",
    borderRadius: 10,
    border: "1.5px solid #B3402E",
    background: "transparent",
    color: "#B3402E",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: "#7FA491",
    marginTop: 16,
    letterSpacing: 1,
  },
};
