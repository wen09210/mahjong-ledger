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

// ── 共享對局(Trystero WebRTC 點對點)──
// window.trysteroJoinRoom 由 index.html 注入;claude.ai Artifact 環境沒有,功能自動隱藏
let shareRoom = null; // 目前連線中的房間
let shareSend = null; // 房主廣播狀態用(牌友端為 null)
let latestState = DEFAULT_STATE; // 讓 onPeerJoin 閉包拿得到最新狀態
const SHARE_APP_ID = "mahjong-ledger-share-v1";
const genRoomCode = () => String(Math.floor(1000 + Math.random() * 9000));

// ── 胡牌台數表(台灣 16 張常見算法)──
// multi: 可累計的牌型(每張/每組/每連一莊),max 為累計上限
const TAI_TABLE = [
  { name: "莊家", tai: 1, desc: "莊家胡牌或被自摸,多算 1 台" },
  { name: "連莊拉莊", tai: 2, desc: "莊家連 N 拉 N,每連一莊加 2 台", multi: true, max: 8 },
  { name: "自摸", tai: 1, desc: "自己摸進胡牌" },
  { name: "門清", tai: 1, desc: "沒有吃、碰、明槓(暗槓不影響)" },
  { name: "獨聽", tai: 1, desc: "聽單吊、中洞或邊張" },
  { name: "半求人", tai: 1, desc: "吃碰槓到只剩單吊,自摸胡牌(自摸台另計)" },
  { name: "槓上開花", tai: 1, desc: "開槓補牌後自摸" },
  { name: "海底撈月", tai: 1, desc: "摸牆上最後一張牌自摸" },
  { name: "河底撈魚", tai: 1, desc: "胡本局最後一張打出的牌" },
  { name: "搶槓", tai: 1, desc: "胡別人加槓的那張牌" },
  { name: "花牌(正花)", tai: 1, desc: "對應自己門風的花牌,每張 1 台", multi: true, max: 8 },
  { name: "圈風台", tai: 1, desc: "手上有圈風的刻子(如東風圈的東)" },
  { name: "門風台", tai: 1, desc: "手上有自己門風的刻子" },
  { name: "三元牌", tai: 1, desc: "中、發、白的刻子,每組 1 台", multi: true, max: 3 },
  { name: "平胡", tai: 2, desc: "全順子、無字無花、非獨聽、非自摸" },
  { name: "全求人", tai: 2, desc: "全靠吃碰只剩單吊,胡別人打的牌" },
  { name: "三暗刻", tai: 2, desc: "三組自己摸齊的暗刻" },
  { name: "碰碰胡", tai: 4, desc: "全部是刻子,沒有順子" },
  { name: "混一色", tai: 4, desc: "整手只有一種花色加字牌" },
  { name: "小三元", tai: 4, desc: "中發白其中兩組刻子,第三種當眼" },
  { name: "四暗刻", tai: 5, desc: "四組自己摸齊的暗刻" },
  { name: "清一色", tai: 8, desc: "整手同一種花色,沒有字牌" },
  { name: "大三元", tai: 8, desc: "中、發、白三組刻子" },
  { name: "小四喜", tai: 8, desc: "東南西北其中三組刻子,第四種當眼" },
  { name: "五暗刻", tai: 8, desc: "五組自己摸齊的暗刻" },
  { name: "八仙過海", tai: 8, desc: "八張花牌全部收齊" },
  { name: "七搶一", tai: 8, desc: "自己七張花,搶胡別人的第八張花" },
  { name: "天聽", tai: 8, desc: "配完牌(莊家打第一張前)就聽牌" },
  { name: "字一色", tai: 16, desc: "整手全是字牌" },
  { name: "大四喜", tai: 16, desc: "東南西北四組刻子" },
  { name: "天胡", tai: 16, desc: "莊家起手配牌就胡" },
  { name: "地胡", tai: 16, desc: "閒家第一輪摸牌就自摸胡" },
];

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
  // 台數查詢
  const [taiQuery, setTaiQuery] = useState("");
  const [taiSel, setTaiSel] = useState({}); // 已選牌型 {名稱: 次數}
  // 共享對局
  const [share, setShare] = useState({ role: null, code: "", peers: 0 }); // role: null|'host'|'guest'
  const [joinCode, setJoinCode] = useState("");
  const canShare = typeof window !== "undefined" && typeof window.trysteroJoinRoom === "function";
  const isGuest = share.role === "guest";
  latestState = state;

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
    if (shareSend) shareSend(next); // 房主:即時廣播給牌友
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

  // ── 台數查詢 ──
  const taiTotal = TAI_TABLE.reduce((s, t) => s + t.tai * (taiSel[t.name] || 0), 0);

  const toggleTai = (t) => {
    setTaiSel((sel) => {
      const cur = sel[t.name] || 0;
      const next = cur >= (t.multi ? t.max : 1) ? 0 : cur + 1; // 點到上限就取消
      const copy = { ...sel };
      if (next === 0) delete copy[t.name];
      else copy[t.name] = next;
      return copy;
    });
  };

  const applyTaiToRecord = () => {
    setTai(taiTotal);
    if (type === "manual") setType("zimo"); // 手動模式沒有台數,切回自摸
    setTab("record");
  };

  // ── 共享對局 ──
  const startHost = () => {
    const code = genRoomCode();
    const room = window.trysteroJoinRoom({ appId: SHARE_APP_ID }, "mj-" + code);
    const [send] = room.makeAction("state");
    shareRoom = room;
    shareSend = send;
    if (typeof window !== "undefined") window.__mjShare = { room, send }; // 除錯用
    room.onPeerJoin(() => {
      send(latestState); // 新牌友一進來就給完整狀態
      setShare((s) => ({ ...s, peers: s.peers + 1 }));
    });
    room.onPeerLeave(() => setShare((s) => ({ ...s, peers: Math.max(0, s.peers - 1) })));
    setShare({ role: "host", code, peers: 0 });
  };

  const joinAsGuest = () => {
    const code = joinCode.trim();
    if (!/^\d{4}$/.test(code)) {
      alert("請輸入 4 位數房號");
      return;
    }
    const room = window.trysteroJoinRoom({ appId: SHARE_APP_ID }, "mj-" + code);
    shareRoom = room;
    const [, getState] = room.makeAction("state");
    getState((s) => setState({ ...DEFAULT_STATE, ...s })); // 只更新畫面,不動自己的 localStorage
    room.onPeerJoin(() => setShare((s) => ({ ...s, peers: s.peers + 1 })));
    room.onPeerLeave(() => setShare((s) => ({ ...s, peers: Math.max(0, s.peers - 1) })));
    setShare({ role: "guest", code, peers: 0 });
    setJoinCode("");
    setTab("history");
  };

  const leaveShare = async () => {
    const wasGuest = isGuest;
    if (shareRoom) shareRoom.leave();
    shareRoom = null;
    shareSend = null;
    setShare({ role: null, code: "", peers: 0 });
    if (wasGuest) {
      // 還原自己裝置上的紀錄
      try {
        const r = await window.storage.get(STORAGE_KEY);
        setState(r?.value ? { ...DEFAULT_STATE, ...JSON.parse(r.value) } : DEFAULT_STATE);
      } catch (e) {
        setState(DEFAULT_STATE);
      }
      setTab("record");
    }
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
            style={{ ...S.tile, cursor: isGuest ? "default" : "pointer" }}
            onClick={() => !isGuest && editing === null && setEditing(i)}
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

      {/* 共享狀態橫幅 */}
      {share.role && (
        <div style={S.shareBanner}>
          <span>
            {share.role === "host"
              ? `房號 ${share.code}・${share.peers} 位牌友連線中`
              : `觀看中・房間 ${share.code}${share.peers > 0 ? "" : "(等待房主…)"}`}
          </span>
          <button style={S.shareLeave} onClick={leaveShare}>
            離開
          </button>
        </div>
      )}

      {/* 分頁 */}
      <nav style={S.tabs}>
        {[
          ...(isGuest ? [] : [["record", "記一筆"]]),
          ["tai", "台數"],
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
      {tab === "record" && !isGuest && (
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

      {/* ── 台數查詢 ── */}
      {tab === "tai" && (
        <section style={S.card}>
          <input
            type="text"
            placeholder="搜尋牌型,例如:清一色、自摸"
            value={taiQuery}
            onChange={(e) => setTaiQuery(e.target.value)}
            style={{ ...S.input, marginBottom: 4 }}
          />
          {(() => {
            const q = taiQuery.trim();
            const list = TAI_TABLE.filter((t) => !q || t.name.includes(q) || t.desc.includes(q));
            if (list.length === 0)
              return <div style={S.empty}>找不到「{q}」,換個關鍵字試試。</div>;
            const taiValues = [...new Set(list.map((t) => t.tai))];
            return taiValues.map((v) => (
              <div key={v}>
                <div style={S.label}>{v} 台</div>
                {list
                  .filter((t) => t.tai === v)
                  .map((t) => {
                    const n = taiSel[t.name] || 0;
                    return (
                      <button
                        key={t.name}
                        onClick={() => toggleTai(t)}
                        style={{ ...S.taiItem, ...(n > 0 ? S.taiItemOn : {}) }}
                      >
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#3A332A" }}>
                            {t.name}
                            {t.multi && n > 1 && (
                              <span style={{ color: "#B3402E" }}> ×{n}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "#8A7F6E", marginTop: 2 }}>
                            {t.desc}
                          </div>
                        </div>
                        <div style={{ ...S.taiVal, color: n > 0 ? "#B3402E" : "#8A7F6E" }}>
                          {t.multi && n > 1 ? `${t.tai * n}` : t.tai} 台
                        </div>
                      </button>
                    );
                  })}
              </div>
            ));
          })()}

          {taiTotal > 0 && (
            <div style={S.taiBar}>
              <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: "#3A332A" }}>
                合計 <span style={{ color: "#B3402E", fontSize: 20 }}>{taiTotal}</span> 台
              </div>
              <button style={S.autoBtn} onClick={() => setTaiSel({})}>
                清除
              </button>
              {!isGuest && (
                <button style={S.taiApply} onClick={applyTaiToRecord}>
                  帶入記一筆
                </button>
              )}
            </div>
          )}
          <div style={{ ...S.preview, fontSize: 12 }}>
            點牌型累計台數;可疊的牌型(花牌、三元牌…)多點幾下,點到上限會歸零。
            台數以常見算法為準,各家規則略有不同,以牌桌約定優先。
          </div>
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
                {!isGuest && (
                  <button style={S.del} onClick={() => deleteRecord(r.id)}>
                    刪除
                  </button>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* ── 設定 ── */}
      {tab === "settings" && isGuest && (
        <section style={S.card}>
          <div style={S.label}>共享對局</div>
          <div style={S.preview}>
            觀看模式:畫面即時同步自房主,你自己裝置上的紀錄不受影響,離開房間後會還原。
          </div>
          <button style={S.reset} onClick={leaveShare}>
            離開房間
          </button>
        </section>
      )}
      {tab === "settings" && !isGuest && (
        <section style={S.card}>
          <div style={S.label}>共享對局(給牌友看即時分數)</div>
          {!canShare ? (
            <div style={S.preview}>此環境不支援共享功能。</div>
          ) : share.role === "host" ? (
            <div style={S.preview}>
              房號 <b style={{ fontSize: 18, letterSpacing: 3 }}>{share.code}</b>
              ・{share.peers} 位牌友連線中
              <br />
              牌友打開同一個網頁,在設定輸入房號即可觀看。
            </div>
          ) : (
            <>
              <button style={{ ...S.pick, width: "100%", marginBottom: 8 }} onClick={startHost}>
                開房間(我負責記帳)
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="輸入 4 位數房號"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ ...S.input, marginBottom: 0, flex: 1 }}
                />
                <button style={S.autoBtn} onClick={joinAsGuest}>
                  加入觀看
                </button>
              </div>
            </>
          )}

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
  shareBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    background: "rgba(217,164,65,.15)",
    border: "1px solid rgba(217,164,65,.5)",
    borderRadius: 10,
    padding: "8px 12px",
    marginBottom: 12,
    color: "#F0D9A8",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
  },
  shareLeave: {
    border: "1px solid rgba(240,217,168,.6)",
    background: "transparent",
    color: "#F0D9A8",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
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
  taiItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    marginBottom: 6,
    borderRadius: 10,
    border: "1.5px solid #E4DBC6",
    background: "#FFFDF6",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  taiItemOn: { borderColor: "#B3402E", background: "#FBEFE9" },
  taiVal: {
    fontSize: 15,
    fontWeight: 800,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  taiBar: {
    position: "sticky",
    bottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#EFE7D2",
    boxShadow: "0 4px 12px rgba(0,0,0,.18)",
  },
  taiApply: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(180deg,#C24A36,#A93A28)",
    color: "#FFF8EC",
    fontSize: 14,
    fontWeight: 800,
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
