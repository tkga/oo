import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home, Package, Users, Repeat, MoreHorizontal, Plus, X, ChevronRight,
  Wallet, TrendingUp, TrendingDown, Settings as SettingsIcon, Download,
  Upload, Gamepad2, Heart, Clock, CheckCircle2, Circle, ArrowLeft,
  Trash2, Edit2, FileDown, Printer, Search, BarChart3, Coins, ChevronDown,
  Ban, RotateCcw, AlertTriangle, Copy, Calendar, Boxes, ListFilter, Receipt
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart,
  Pie, Cell, CartesianGrid
} from "recharts";
import * as XLSX from "xlsx";

const STORAGE_KEY = "pgs-shop-data-v1";

// localStorage wrapper — mimics the shape of the old window.storage API
// (get/set return { key, value } or null) so the rest of the app didn't
// need to change. Works in any normal browser / deployed site.
const storage = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === null) return null;
      return { key, value };
    } catch (e) {
      console.error("storage.get failed", e);
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      console.error("storage.set failed", e);
      return null;
    }
  },
};

const ORDER_TYPES = {
  sell_pokemon: { label: "ขาย Pokémon", short: "ขาย", emoji: "🐉", color: "#FFCB05" },
  hire_boss: { label: "จ้างตีบอส", short: "ตีบอส", emoji: "🎯", color: "#3B5DC9" },
  hire_invite: { label: "จ้างเชิญตี", short: "เชิญตี", emoji: "📨", color: "#33C481" },
};

const PAYMENT_STATUS = {
  pending: { label: "รอชำระ", color: "#FF5470" },
  partial: { label: "ชำระบางส่วน", color: "#FFCB05" },
  paid: { label: "ชำระแล้ว", color: "#33C481" },
};

const TRADE_STATUS = {
  waiting: { label: "รอเทรด", color: "#8B8DA3" },
  traded: { label: "เทรดแล้ว", color: "#33C481" },
  three_hearts: { label: "ทำ 3 ใจ", color: "#FFCB05" },
};

const INVEST_TYPES = {
  topup: { label: "เติม Coin" },
  buy_pokemon: { label: "ซื้อ Pokémon" },
};

const POKEMON_VARIANTS = {
  normal: { label: "ปกติ", emoji: "⭐" },
  shiny: { label: "Shiny", emoji: "✨" },
  shadow: { label: "Shadow", emoji: "🌑" },
  purified: { label: "Purified", emoji: "💠" },
  lucky: { label: "Lucky", emoji: "🍀" },
  alolan: { label: "Alolan", emoji: "🌴" },
  galarian: { label: "Galarian", emoji: "⚔️" },
  hisuian: { label: "Hisuian", emoji: "🏔️" },
  mega: { label: "Mega", emoji: "💥" },
  xl_perfect: { label: "XL Perfect(100%)", emoji: "💯" },
};

const HIRE_MODES = {
  scheduled: { label: "ตั้งรอบ" },
  anytime: { label: "ไม่ระบุรอบ (ตีเมื่อสะดวก)" },
};

function emptyData() {
  return {
    settings: { shopName: "Pokémon GO Shop", createdAt: Date.now() },
    customers: [],
    gameAccounts: [],
    orders: [],
    investmentHistory: [],
    manualTx: [],
    counters: { order: 0 },
  };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  } catch { return d; }
}
function daysBetween(a, b) {
  const A = new Date(a); const B = new Date(b);
  return Math.round((B - A) / 86400000);
}
function clamp0(n) { return Math.max(0, Number(n) || 0); }

// balance still owed on an order, considering partial payments
function orderBalance(o) {
  const price = Number(o.price) || 0;
  if (o.paymentStatus === "paid") return 0;
  if (o.paymentStatus === "partial") return clamp0(price - (Number(o.paidAmount) || 0));
  return price;
}

// migrate older saved data shapes to the current schema (safe to re-run)
function migrateData(parsed) {
  const d = { ...emptyData(), ...parsed };
  d.customers = (d.customers || []).map(c => ({
    ...c,
    gameIds: c.gameIds && c.gameIds.length ? c.gameIds : [{ id: genId(), value: c.name || "" }],
  }));
  d.gameAccounts = (d.gameAccounts || []).map(a => ({
    ...a,
    stock: (a.stock || []).map(s => ({ lowStockThreshold: 2, variants: ["normal"], ...s })),
  }));
  d.manualTx = (d.manualTx || []).map(t => ({
    ...t,
    accountId: t.accountId || "",
  }));
  d.orders = (d.orders || []).map(o => {
    const price = Number(o.price) || 0;
    return {
      ...o,
      paymentStatus: o.paymentStatus === "partial" || o.paymentStatus === "paid" ? o.paymentStatus : "pending",
      paidAmount: o.paymentStatus === "paid" ? price : clamp0(o.paidAmount),
      cancelled: !!o.cancelled,
      cancelledAt: o.cancelledAt || null,
      pokemonVariants: o.pokemonVariants || (o.type === "sell_pokemon" ? ["normal"] : []),
      stockItemId: o.stockItemId || null,
      customerGameId: o.customerGameId || "",
      hireMode: o.hireMode || "anytime",
      rounds: o.rounds || [],
    };
  });
  return d;
}

// adjust a stock item's quantity by delta (+restore / -deduct); no-op if ids missing
function adjustStock(gameAccounts, accountId, stockItemId, delta) {
  if (!accountId || !stockItemId || !delta) return gameAccounts;
  return gameAccounts.map(a => {
    if (a.id !== accountId) return a;
    return {
      ...a,
      stock: (a.stock || []).map(s => s.id === stockItemId ? { ...s, quantity: clamp0((Number(s.quantity) || 0) + delta) } : s),
    };
  });
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    .pgs-root {
      --bg: #12131c;
      --surface: #1b1d2a;
      --surface2: #232538;
      --border: #2c2f42;
      --yellow: #ffcb05;
      --blue: #4d68e0;
      --green: #33c481;
      --red: #ff5470;
      --text: #f2f3f8;
      --muted: #8b8da6;
      --radius: 16px;
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      width: 100%;
      max-width: 430px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow-x: hidden;
    }
    .pgs-root * { box-sizing: border-box; }
    .pgs-display { font-family: 'Baloo 2', 'Inter', sans-serif; }
    .pgs-mono { font-family: 'JetBrains Mono', monospace; }
    .pgs-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px 96px 16px;
    }
    .pgs-scroll::-webkit-scrollbar { width: 0; }
    .pgs-header {
      position: sticky; top: 0; z-index: 20;
      background: linear-gradient(180deg, var(--bg) 80%, transparent);
      padding: 18px 16px 8px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .pgs-ball {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(180deg, #ee1515 0%, #ee1515 46%, #14151f 46%, #14151f 54%, #fff 54%, #fff 100%);
      border: 2px solid #14151f; position: relative; flex-shrink: 0;
    }
    .pgs-ball::after {
      content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 9px; height: 9px; border-radius: 50%; background: #fff; border: 2px solid #14151f;
    }
    .pgs-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
    }
    .pgs-statcard {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .pgs-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 12px; padding: 10px 16px; font-weight: 600; font-size: 14px;
      border: none; cursor: pointer; transition: transform .1s ease;
    }
    .pgs-btn:active { transform: scale(0.96); }
    .pgs-btn-primary { background: var(--yellow); color: #14151f; }
    .pgs-btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .pgs-btn-danger { background: rgba(255,84,112,0.15); color: var(--red); }
    .pgs-input, .pgs-select, .pgs-textarea {
      width: 100%; background: var(--surface2); border: 1px solid var(--border);
      color: var(--text); border-radius: 10px; padding: 10px 12px; font-size: 14px;
      outline: none; font-family: inherit;
    }
    .pgs-input:focus, .pgs-select:focus, .pgs-textarea:focus { border-color: var(--yellow); }
    .pgs-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; display: block; font-weight: 500; }
    .pgs-field { margin-bottom: 14px; }
    .pgs-badge {
      display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;
      padding: 3px 9px; border-radius: 999px;
    }
    .pgs-bottomnav {
      position: sticky; bottom: 0; z-index: 30;
      background: rgba(27,29,42,0.92); backdrop-filter: blur(10px);
      border-top: 1px solid var(--border);
      display: flex; justify-content: space-around; padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      max-width: 430px; margin: 0 auto; width: 100%;
    }
    .pgs-navitem {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      color: var(--muted); font-size: 10px; font-weight: 600; background: none; border: none;
      padding: 6px 10px; border-radius: 10px; cursor: pointer;
    }
    .pgs-navitem.active { color: var(--yellow); }
    .pgs-overlay {
      position: fixed; inset: 0; background: rgba(8,9,14,0.7); z-index: 50;
      display: flex; align-items: flex-end; justify-content: center;
    }
    .pgs-sheet {
      background: var(--bg); width: 100%; max-width: 430px; border-radius: 20px 20px 0 0;
      max-height: 88vh; overflow-y: auto; padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
      border: 1px solid var(--border); border-bottom: none;
      animation: pgs-up .22s ease;
    }
    @keyframes pgs-up { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .pgs-sectiontitle {
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted);
      font-weight: 700; margin: 18px 0 8px 2px;
    }
    .pgs-empty {
      text-align: center; padding: 36px 12px; color: var(--muted); font-size: 13px;
    }
    .pgs-row { display: flex; align-items: center; justify-content: space-between; }
    .pgs-chip {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 999px;
      padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer;
    }
    .pgs-chip.active { background: var(--yellow); color: #14151f; border-color: var(--yellow); }
    .pgs-toast {
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: var(--surface2); border: 1px solid var(--border); color: var(--text);
      padding: 10px 18px; border-radius: 999px; font-size: 13px; z-index: 80; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .pgs-strike { text-decoration: line-through; opacity: 0.55; }
    .pgs-iconbtn {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
      padding: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    }
    .pgs-roundrow {
      display: flex; align-items: center; gap: 6px; background: var(--surface2);
      border: 1px solid var(--border); border-radius: 10px; padding: 8px; margin-bottom: 6px;
    }
    .pgs-cancelbanner {
      background: rgba(255,84,112,0.12); color: var(--red); border: 1px solid rgba(255,84,112,0.35);
      border-radius: 10px; padding: 8px 10px; font-size: 12px; font-weight: 600; margin-bottom: 12px;
      display: flex; align-items: center; gap: 6px;
    }
    .pgs-receiptbox {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px; white-space: pre-wrap; font-size: 12px; line-height: 1.6; margin-bottom: 12px;
    }
  `}</style>
);

function StatusDot({ payment, trade, cancelled }) {
  if (cancelled) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <span className="pgs-badge" style={{ background: "rgba(255,84,112,0.15)", color: "var(--red)" }}>
          <Ban size={9} /> ยกเลิกแล้ว
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {payment && (
        <span className="pgs-badge" style={{ background: PAYMENT_STATUS[payment].color + "22", color: PAYMENT_STATUS[payment].color }}>
          <Circle size={7} fill={PAYMENT_STATUS[payment].color} stroke="none" /> {PAYMENT_STATUS[payment].label}
        </span>
      )}
      {trade && (
        <span className="pgs-badge" style={{ background: TRADE_STATUS[trade].color + "22", color: TRADE_STATUS[trade].color }}>
          {trade === "three_hearts" ? <Heart size={9} fill={TRADE_STATUS[trade].color} stroke="none" /> : <Circle size={7} fill={TRADE_STATUS[trade].color} stroke="none" />} {TRADE_STATUS[trade].label}
        </span>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="pgs-statcard">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon size={14} color={color || "var(--muted)"} />
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      </div>
      <div className="pgs-mono pgs-display" style={{ fontSize: 20, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="pgs-overlay" onClick={onClose}>
      <div className="pgs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pgs-row" style={{ marginBottom: 14 }}>
          <h3 className="pgs-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="pgs-empty">
      <div style={{ fontSize: 30, marginBottom: 6 }}>🎾</div>
      {text}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);
  const saveTimer = useRef(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData(migrateData(parsed));
        }
      } catch (e) {
        // no existing data yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- save (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.error("save failed", e);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // ---------- derived ----------
  const stats = useMemo(() => {
    const orders = data.orders.filter(o => !o.cancelled);
    const today = todayStr();
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);

    const incomeEntries = [
      ...orders.filter(o => o.paymentStatus === "paid").map(o => ({ date: (o.paidDate || o.createdAt).slice(0, 10), amount: Number(o.price) || 0 })),
      ...orders.filter(o => o.paymentStatus === "partial").map(o => ({ date: (o.paidDate || o.createdAt).slice(0, 10), amount: Number(o.paidAmount) || 0 })),
      ...data.manualTx.filter(t => t.type === "income").map(t => ({ date: t.date, amount: Number(t.amount) || 0 })),
    ];
    const expenseEntries = [
      ...data.investmentHistory.map(h => ({ date: h.date, amount: Number(h.amount) || 0 })),
      ...data.manualTx.filter(t => t.type === "expense").map(t => ({ date: t.date, amount: Number(t.amount) || 0 })),
    ];
    const sumBy = (arr, prefix) => arr.filter(e => e.date && e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0);

    const incomeToday = sumBy(incomeEntries, today);
    const incomeMonth = sumBy(incomeEntries, month);
    const incomeYear = sumBy(incomeEntries, year);
    const expenseToday = sumBy(expenseEntries, today);
    const expenseMonth = sumBy(expenseEntries, month);
    const expenseYear = sumBy(expenseEntries, year);

    const totalInvestment = data.investmentHistory.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const investByAccount = {};
    data.investmentHistory.forEach(h => { investByAccount[h.accountId] = (investByAccount[h.accountId] || 0) + (Number(h.amount) || 0); });

    const pendingPayment = orders.filter(o => o.paymentStatus === "pending" || o.paymentStatus === "partial").length;
    const totalDue = orders.reduce((s, o) => s + orderBalance(o), 0);
    const pendingTrade = orders.filter(o => o.type === "sell_pokemon" && o.tradeStatus === "waiting").length;
    const threeHearts = orders.filter(o => o.type === "sell_pokemon" && o.tradeStatus === "three_hearts").length;
    const cancelledCount = data.orders.filter(o => o.cancelled).length;

    let lowStockCount = 0;
    const lowStockItems = [];
    data.gameAccounts.forEach(a => {
      (a.stock || []).forEach(s => {
        const th = s.lowStockThreshold ?? 2;
        if (clamp0(s.quantity) <= th) { lowStockCount++; lowStockItems.push({ accountId: a.id, accountName: a.name, ...s }); }
      });
    });

    // appointments / hit-rounds coming due (or overdue) within the next 7 days
    const dueSoonItems = [];
    orders.forEach(o => {
      if (o.appointmentDate) {
        const remain = daysBetween(today, o.appointmentDate);
        if (remain <= 7) dueSoonItems.push({ orderId: o.id, customerId: o.customerId, date: o.appointmentDate, remain, kind: "appointment" });
      }
      (o.rounds || []).forEach(r => {
        if (!r.done && r.date) {
          const remain = daysBetween(today, r.date);
          if (remain <= 7) dueSoonItems.push({ orderId: o.id, customerId: o.customerId, date: r.date, remain, kind: "round" });
        }
      });
    });
    dueSoonItems.sort((a, b) => a.remain - b.remain);

    return {
      incomeToday, incomeMonth, incomeYear, expenseToday, expenseMonth, expenseYear,
      profitToday: incomeToday - expenseToday, profitMonth: incomeMonth - expenseMonth, profitYear: incomeYear - expenseYear,
      totalInvestment, investByAccount, pendingPayment, totalDue, pendingTrade, threeHearts, cancelledCount,
      totalOrders: orders.length, incomeEntries, expenseEntries, lowStockCount, lowStockItems,
      dueSoonCount: dueSoonItems.length, dueSoonItems,
    };
  }, [data]);

  const custName = (id) => data.customers.find(c => c.id === id)?.name || "-";
  const accName = (id) => data.gameAccounts.find(a => a.id === id)?.name || "-";

  // ---------- CRUD ----------
  function saveCustomer(item) {
    setData(d => {
      const exists = d.customers.some(c => c.id === item.id);
      return { ...d, customers: exists ? d.customers.map(c => c.id === item.id ? item : c) : [...d.customers, item] };
    });
    showToast(item._isNew ? "เพิ่มลูกค้าแล้ว" : "บันทึกแล้ว");
  }
  function deleteCustomer(id) {
    setData(d => ({ ...d, customers: d.customers.filter(c => c.id !== id) }));
    showToast("ลบลูกค้าแล้ว");
  }
  function saveAccount(item) {
    setData(d => {
      const exists = d.gameAccounts.some(a => a.id === item.id);
      return { ...d, gameAccounts: exists ? d.gameAccounts.map(a => a.id === item.id ? item : a) : [...d.gameAccounts, item] };
    });
    showToast("บันทึกไอดีแล้ว");
  }
  function deleteAccount(id) {
    setData(d => ({ ...d, gameAccounts: d.gameAccounts.filter(a => a.id !== id) }));
    showToast("ลบไอดีแล้ว");
  }
  function saveOrder(item, isNew) {
    setData(d => {
      let counters = d.counters;
      let orders;
      let gameAccounts = d.gameAccounts;
      if (isNew) {
        const n = (d.counters.order || 0) + 1;
        counters = { ...d.counters, order: n };
        item.code = `ORD-${String(n).padStart(4, "0")}`;
        orders = [item, ...d.orders];
        if (!item.cancelled && item.type === "sell_pokemon" && item.stockItemId) {
          gameAccounts = adjustStock(gameAccounts, item.sourceAccountId, item.stockItemId, -clamp0(item.quantity));
        }
      } else {
        const old = d.orders.find(o => o.id === item.id);
        orders = d.orders.map(o => o.id === item.id ? item : o);
        // only reconcile stock when the order stays "active" through the edit; cancel/restore handle stock separately
        if (old && !old.cancelled && !item.cancelled) {
          if (old.type === "sell_pokemon" && old.stockItemId) {
            gameAccounts = adjustStock(gameAccounts, old.sourceAccountId, old.stockItemId, clamp0(old.quantity));
          }
          if (item.type === "sell_pokemon" && item.stockItemId) {
            gameAccounts = adjustStock(gameAccounts, item.sourceAccountId, item.stockItemId, -clamp0(item.quantity));
          }
        }
      }
      return { ...d, orders, counters, gameAccounts };
    });
    showToast(isNew ? "สร้างออเดอร์แล้ว" : "บันทึกออเดอร์แล้ว");
  }
  function cancelOrder(id) {
    setData(d => {
      const order = d.orders.find(o => o.id === id);
      if (!order || order.cancelled) return d;
      let gameAccounts = d.gameAccounts;
      if (order.type === "sell_pokemon" && order.stockItemId) {
        gameAccounts = adjustStock(gameAccounts, order.sourceAccountId, order.stockItemId, clamp0(order.quantity));
      }
      const orders = d.orders.map(o => o.id === id ? { ...o, cancelled: true, cancelledAt: new Date().toISOString() } : o);
      return { ...d, orders, gameAccounts };
    });
    showToast("ยกเลิกออเดอร์แล้ว");
  }
  function restoreOrder(id) {
    setData(d => {
      const order = d.orders.find(o => o.id === id);
      if (!order || !order.cancelled) return d;
      let gameAccounts = d.gameAccounts;
      if (order.type === "sell_pokemon" && order.stockItemId) {
        gameAccounts = adjustStock(gameAccounts, order.sourceAccountId, order.stockItemId, -clamp0(order.quantity));
      }
      const orders = d.orders.map(o => o.id === id ? { ...o, cancelled: false, cancelledAt: null } : o);
      return { ...d, orders, gameAccounts };
    });
    showToast("กู้คืนออเดอร์แล้ว");
  }
  function deleteOrder(id) {
    setData(d => {
      const order = d.orders.find(o => o.id === id);
      let gameAccounts = d.gameAccounts;
      if (order && !order.cancelled && order.type === "sell_pokemon" && order.stockItemId) {
        gameAccounts = adjustStock(gameAccounts, order.sourceAccountId, order.stockItemId, clamp0(order.quantity));
      }
      return { ...d, orders: d.orders.filter(o => o.id !== id), gameAccounts };
    });
    showToast("ลบออเดอร์ถาวรแล้ว");
  }
  function saveStock(accountId, item) {
    setData(d => ({
      ...d,
      gameAccounts: d.gameAccounts.map(a => {
        if (a.id !== accountId) return a;
        const stock = a.stock || [];
        const exists = stock.some(s => s.id === item.id);
        return { ...a, stock: exists ? stock.map(s => s.id === item.id ? item : s) : [item, ...stock] };
      }),
    }));
    showToast("บันทึกสต๊อกแล้ว");
  }
  function deleteStock(accountId, stockId) {
    setData(d => ({
      ...d,
      gameAccounts: d.gameAccounts.map(a => a.id === accountId ? { ...a, stock: (a.stock || []).filter(s => s.id !== stockId) } : a),
    }));
    showToast("ลบสต๊อกแล้ว");
  }
  function saveInvestment(item) {
    setData(d => ({ ...d, investmentHistory: [item, ...d.investmentHistory] }));
    showToast("บันทึกรายการลงทุนแล้ว");
  }
  function deleteInvestment(id) {
    setData(d => ({ ...d, investmentHistory: d.investmentHistory.filter(h => h.id !== id) }));
  }
  function saveManualTx(item) {
    setData(d => ({ ...d, manualTx: [item, ...d.manualTx] }));
    showToast("บันทึกรายการแล้ว");
  }
  function deleteManualTx(id) {
    setData(d => ({ ...d, manualTx: d.manualTx.filter(t => t.id !== id) }));
  }

  // ---------- export ----------
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pgs-backup-${todayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("ดาวน์โหลด Backup แล้ว");
  }
  function restoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setData(migrateData(parsed));
        showToast("กู้คืนข้อมูลสำเร็จ");
      } catch { showToast("ไฟล์ไม่ถูกต้อง"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const ordersSheet = data.orders.map(o => ({
      รหัสออเดอร์: o.code, ลูกค้า: custName(o.customerId), ไอดีที่ใช้: o.customerGameId || "", ประเภท: ORDER_TYPES[o.type]?.label,
      Pokemon: o.pokemonName || "", ประเภทพิเศษ: (o.pokemonVariants || []).map(v => POKEMON_VARIANTS[v]?.label).filter(Boolean).join(", "),
      จำนวน: o.quantity || "", ราคา: o.price, ชำระแล้ว: o.paymentStatus === "paid" ? o.price : (o.paidAmount || 0),
      คงค้าง: orderBalance(o),
      ไอดีต้นทาง: o.sourceAccountId ? accName(o.sourceAccountId) : "", สถานะชำระ: PAYMENT_STATUS[o.paymentStatus]?.label,
      สถานะเทรด: o.tradeStatus ? TRADE_STATUS[o.tradeStatus]?.label : "",
      โหมดตี: (o.type !== "sell_pokemon") ? HIRE_MODES[o.hireMode]?.label : "",
      จำนวนรอบ: (o.rounds || []).length || "",
      สถานะออเดอร์: o.cancelled ? "ยกเลิกแล้ว" : "ปกติ",
      วันนัด: o.appointmentDate || "",
      หมายเหตุ: o.note || "", วันที่สร้าง: (o.createdAt || "").slice(0, 10),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersSheet), "Orders");
    const custSheet = data.customers.map(c => ({ ชื่อในเกม: c.name, ไอดีในเกมทั้งหมด: (c.gameIds || []).map(g => g.value).filter(Boolean).join(", "), Facebook: c.facebook || "", หมายเหตุ: c.note || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custSheet), "Customers");
    const accSheet = data.gameAccounts.map(a => ({ ชื่อไอดี: a.name, จำนวนรายการสต๊อก: (a.stock || []).length, หมายเหตุ: a.note || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accSheet), "GameAccounts");
    const stockRows = [];
    data.gameAccounts.forEach(a => (a.stock || []).forEach(s => stockRows.push({
      ไอดี: a.name, Pokemon: s.name, ประเภทพิเศษ: (s.variants || []).map(v => POKEMON_VARIANTS[v]?.label).filter(Boolean).join(", "),
      คงเหลือ: s.quantity, แจ้งเตือนเมื่อเหลือ: s.lowStockThreshold ?? 2,
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), "Stock");
    const invSheet = data.investmentHistory.map(h => ({ ไอดี: accName(h.accountId), ประเภท: INVEST_TYPES[h.type]?.label, จำนวนเงิน: h.amount, วันที่: h.date, หมายเหตุ: h.note || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invSheet), "InvestmentHistory");
    const manualSheet = data.manualTx.map(t => ({
      ประเภท: t.type === "income" ? "รายรับ" : "รายจ่าย", รายการ: t.category || "อื่นๆ", จำนวนเงิน: t.amount,
      วันที่: t.date, ไอดีที่เกี่ยวข้อง: t.accountId ? accName(t.accountId) : "", หมายเหตุ: t.note || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(manualSheet), "ManualTransactions");
    XLSX.writeFile(wb, `pgs-export-${todayStr()}.xlsx`);
    showToast("Export Excel แล้ว");
  }
  function exportPDF() { window.print(); }

  if (!loaded) {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <div className="pgs-ball" style={{ animation: "pgs-up 1s infinite alternate" }} />
      </div>
    );
  }

  return (
    <div className="pgs-root">
      <GlobalStyle />
      <Header data={data} onMore={() => setMoreOpen(true)} />
      <div className="pgs-scroll">
        {tab === "dashboard" && <Dashboard data={data} stats={stats} custName={custName} accName={accName} goTab={setTab} />}
        {tab === "orders" && <OrdersTab data={data} custName={custName} accName={accName} openNew={() => setModal({ type: "order", mode: "add" })} openEdit={(o) => setModal({ type: "order", mode: "edit", item: o })} openReceipt={(o) => setModal({ type: "receipt", item: o })} />}
        {tab === "customers" && <CustomersTab data={data} openNew={() => setModal({ type: "customer", mode: "add" })} openEdit={(c) => setModal({ type: "customer", mode: "edit", item: c })} openDetail={(c) => setDetail({ type: "customer", item: c })} />}
        {tab === "trade" && <TradeTab data={data} custName={custName} accName={accName} openEdit={(o) => setModal({ type: "order", mode: "edit", item: o })} />}
      </div>
      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          go={(t) => { setTab(t); setMoreOpen(false); }}
        />
      )}
      {tab === "accounts" && (
        <div className="pgs-scroll" style={{ position: "fixed", inset: "60px 0 74px 0", maxWidth: 430, margin: "0 auto", background: "var(--bg)", zIndex: 15 }}>
          <AccountsTab
            data={data} stats={stats}
            openNew={() => setModal({ type: "account", mode: "add" })}
            openDetail={(a) => setDetail({ type: "account", item: a })}
            back={() => setTab("dashboard")}
          />
        </div>
      )}
      {tab === "finance" && (
        <div className="pgs-scroll" style={{ position: "fixed", inset: "60px 0 74px 0", maxWidth: 430, margin: "0 auto", background: "var(--bg)", zIndex: 15 }}>
          <FinanceTab data={data} stats={stats} custName={custName} accName={accName} openNew={() => setModal({ type: "tx", mode: "add" })} back={() => setTab("dashboard")} onDeleteManual={deleteManualTx} />
        </div>
      )}
      {tab === "reports" && (
        <div className="pgs-scroll" style={{ position: "fixed", inset: "60px 0 74px 0", maxWidth: 430, margin: "0 auto", background: "var(--bg)", zIndex: 15 }}>
          <ReportsTab data={data} custName={custName} accName={accName} back={() => setTab("dashboard")} />
        </div>
      )}
      {tab === "settings" && (
        <div className="pgs-scroll" style={{ position: "fixed", inset: "60px 0 74px 0", maxWidth: 430, margin: "0 auto", background: "var(--bg)", zIndex: 15 }}>
          <SettingsTab data={data} setData={setData} onBackup={exportBackup} onRestore={restoreBackup} onExportExcel={exportExcel} onExportPDF={exportPDF} back={() => setTab("dashboard")} />
        </div>
      )}

      <BottomNav tab={tab} setTab={setTab} onMore={() => setMoreOpen(true)} />

      {modal?.type === "order" && (
        <OrderModal
          data={data} mode={modal.mode} item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => { saveOrder(item, modal.mode === "add"); setModal(null); }}
          onCancel={(id) => { cancelOrder(id); setModal(null); }}
          onRestore={(id) => { restoreOrder(id); setModal(null); }}
          onDelete={(id) => { deleteOrder(id); setModal(null); }}
          onReceipt={(o) => setModal({ type: "receipt", item: o })}
        />
      )}
      {modal?.type === "receipt" && (
        <ReceiptModal
          order={modal.item} data={data} custName={custName} accName={accName}
          onClose={() => setModal(null)}
          onToast={showToast}
        />
      )}
      {modal?.type === "stock" && (
        <StockModal
          mode={modal.mode} item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => { saveStock(modal.accountId, item); setModal(null); }}
          onDelete={modal.mode === "edit" ? () => { deleteStock(modal.accountId, modal.item.id); setModal(null); } : null}
        />
      )}
      {modal?.type === "customer" && (
        <CustomerModal
          mode={modal.mode} item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => { saveCustomer(item); setModal(null); }}
        />
      )}
      {modal?.type === "account" && (
        <AccountModal
          mode={modal.mode} item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => { saveAccount(item); setModal(null); }}
        />
      )}
      {modal?.type === "tx" && (
        <TxModal
          data={data}
          onClose={() => setModal(null)}
          onSaveInvestment={(item) => { saveInvestment(item); setModal(null); }}
          onSaveManual={(item) => { saveManualTx(item); setModal(null); }}
        />
      )}

      {detail?.type === "customer" && (
        <CustomerDetail
          item={detail.item} data={data}
          onClose={() => setDetail(null)}
          onEdit={() => { setModal({ type: "customer", mode: "edit", item: detail.item }); setDetail(null); }}
          onDelete={() => { deleteCustomer(detail.item.id); setDetail(null); }}
        />
      )}
      {detail?.type === "account" && (
        <AccountDetail
          item={data.gameAccounts.find(a => a.id === detail.item.id) || detail.item} data={data} stats={stats}
          onClose={() => setDetail(null)}
          onEdit={() => { setModal({ type: "account", mode: "edit", item: detail.item }); setDetail(null); }}
          onDelete={() => { deleteAccount(detail.item.id); setDetail(null); }}
          onAddInvestment={() => { setModal({ type: "tx", mode: "add", presetAccount: detail.item.id }); setDetail(null); }}
          onDeleteInvestment={deleteInvestment}
          onAddStock={() => setModal({ type: "stock", mode: "add", accountId: detail.item.id })}
          onEditStock={(s) => setModal({ type: "stock", mode: "edit", item: s, accountId: detail.item.id })}
        />
      )}

      {toast && <div className="pgs-toast">{toast}</div>}
    </div>
  );
}

// =================== HEADER / NAV ===================
function Header({ data, onMore }) {
  return (
    <div className="pgs-header">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="pgs-ball" />
        <div>
          <div className="pgs-display" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{data.settings.shopName}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>ระบบจัดการร้าน</div>
        </div>
      </div>
      <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={onMore}><MoreHorizontal size={16} /></button>
    </div>
  );
}

function BottomNav({ tab, setTab, onMore }) {
  const items = [
    { id: "dashboard", label: "หน้าแรก", icon: Home },
    { id: "orders", label: "ออเดอร์", icon: Package },
    { id: "customers", label: "ลูกค้า", icon: Users },
    { id: "trade", label: "เทรด", icon: Repeat },
  ];
  return (
    <div className="pgs-bottomnav">
      {items.map(it => (
        <button key={it.id} className={"pgs-navitem" + (tab === it.id ? " active" : "")} onClick={() => setTab(it.id)}>
          <it.icon size={19} />
          {it.label}
        </button>
      ))}
      <button className={"pgs-navitem" + (["accounts", "finance", "reports", "settings"].includes(tab) ? " active" : "")} onClick={onMore}>
        <MoreHorizontal size={19} />
        เพิ่มเติม
      </button>
    </div>
  );
}

function MoreSheet({ onClose, go }) {
  const items = [
    { id: "accounts", label: "ไอดีเกม", icon: Gamepad2, desc: "จัดการไอดี & เงินลงทุน" },
    { id: "finance", label: "การเงิน", icon: Wallet, desc: "รายรับ-รายจ่ายทั้งหมด" },
    { id: "reports", label: "รายงาน", icon: BarChart3, desc: "สรุปผลประกอบการ" },
    { id: "settings", label: "ตั้งค่า", icon: SettingsIcon, desc: "ร้าน, Backup, Export" },
  ];
  return (
    <div className="pgs-overlay" onClick={onClose}>
      <div className="pgs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pgs-row" style={{ marginBottom: 14 }}>
          <h3 className="pgs-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>เมนูเพิ่มเติม</h3>
          <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={onClose}><X size={16} /></button>
        </div>
        {items.map(it => (
          <button key={it.id} onClick={() => go(it.id)} className="pgs-card" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginBottom: 10, cursor: "pointer", textAlign: "left" }}>
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 10 }}><it.icon size={18} color="var(--yellow)" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{it.desc}</div>
            </div>
            <ChevronRight size={16} color="var(--muted)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SubHeader({ title, back }) {
  return (
    <div className="pgs-row" style={{ marginBottom: 14 }}>
      <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={back}><ArrowLeft size={16} /></button>
      <h2 className="pgs-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
      <div style={{ width: 34 }} />
    </div>
  );
}

// =================== DASHBOARD ===================
const PERIODS = {
  today: { label: "วันนี้" },
  month: { label: "เดือนนี้" },
  year: { label: "ปีนี้" },
};

function Dashboard({ data, stats, custName, accName, goTab }) {
  const [period, setPeriod] = useState("today");
  const recentOrders = data.orders.filter(o => !o.cancelled).slice(0, 4);

  const income = period === "today" ? stats.incomeToday : period === "month" ? stats.incomeMonth : stats.incomeYear;
  const expense = period === "today" ? stats.expenseToday : period === "month" ? stats.expenseMonth : stats.expenseYear;
  const profit = period === "today" ? stats.profitToday : period === "month" ? stats.profitMonth : stats.profitYear;

  return (
    <div>
      <div className="pgs-row" style={{ marginBottom: 10 }}>
        <div className="pgs-sectiontitle" style={{ margin: 0 }}>ภาพรวม</div>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(PERIODS).map(([k, v]) => (
            <button key={k} className={"pgs-chip" + (period === k ? " active" : "")} onClick={() => setPeriod(k)}>{v.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard icon={TrendingUp} label={"รายรับ" + PERIODS[period].label} value={"฿" + fmtMoney(income)} color="var(--green)" />
        <StatCard icon={TrendingDown} label={"รายจ่าย" + PERIODS[period].label} value={"฿" + fmtMoney(expense)} color="var(--red)" />
      </div>

      <div className="pgs-sectiontitle">สรุปกำไร</div>
      <div className="pgs-card" style={{ marginBottom: 4 }}>
        <div className="pgs-row">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>กำไรสุทธิ ({PERIODS[period].label})</span>
          <span className="pgs-mono pgs-display" style={{ fontSize: 22, fontWeight: 700, color: profit >= 0 ? "var(--green)" : "var(--red)" }}>฿{fmtMoney(profit)}</span>
        </div>
      </div>

      <div className="pgs-sectiontitle">เงินลงทุน</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard icon={Coins} label="ลงทุนทั้งหมด" value={"฿" + fmtMoney(stats.totalInvestment)} color="var(--yellow)" />
        <StatCard icon={Package} label="ออเดอร์ทั้งหมด" value={stats.totalOrders} />
      </div>

      <div className="pgs-sectiontitle">รอดำเนินการ</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button onClick={() => goTab("orders")} className="pgs-statcard" style={{ cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>รอชำระ/ค้าง</div>
          <div className="pgs-mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--red)" }}>{stats.pendingPayment}</div>
        </button>
        <button onClick={() => goTab("trade")} className="pgs-statcard" style={{ cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>รอเทรด</div>
          <div className="pgs-mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>{stats.pendingTrade}</div>
        </button>
        <button onClick={() => goTab("trade")} className="pgs-statcard" style={{ cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>ทำ 3 ใจ</div>
          <div className="pgs-mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--yellow)" }}>{stats.threeHearts}</div>
        </button>
      </div>

      {stats.totalDue > 0 && (
        <div className="pgs-card" style={{ marginTop: 10, borderColor: "rgba(255,84,112,0.4)" }}>
          <div className="pgs-row">
            <span style={{ fontSize: 12, color: "var(--muted)" }}>ยอดค้างชำระรวม</span>
            <span className="pgs-mono" style={{ fontWeight: 700, fontSize: 16, color: "var(--red)" }}>฿{fmtMoney(stats.totalDue)}</span>
          </div>
        </div>
      )}

      {stats.dueSoonCount > 0 && (
        <button onClick={() => goTab("orders")} className="pgs-card" style={{ marginTop: 10, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderColor: "rgba(255,203,5,0.4)" }}>
          <Clock size={18} color="var(--yellow)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--yellow)" }}>นัดหมาย/รอบตีใกล้ถึงกำหนด {stats.dueSoonCount} รายการ</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>ภายใน 7 วัน · แตะเพื่อดูออเดอร์</div>
          </div>
          <ChevronRight size={16} color="var(--muted)" />
        </button>
      )}

      {stats.lowStockCount > 0 && (
        <button onClick={() => goTab("accounts")} className="pgs-card" style={{ marginTop: 10, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderColor: "rgba(255,84,112,0.4)" }}>
          <AlertTriangle size={18} color="var(--red)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--red)" }}>สต๊อกใกล้หมด {stats.lowStockCount} รายการ</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>แตะเพื่อดูไอดีเกม</div>
          </div>
          <ChevronRight size={16} color="var(--muted)" />
        </button>
      )}

      <div className="pgs-row" style={{ marginTop: 18, marginBottom: 8 }}>
        <div className="pgs-sectiontitle" style={{ margin: 0 }}>ออเดอร์ล่าสุด</div>
        <button onClick={() => goTab("orders")} style={{ background: "none", border: "none", color: "var(--yellow)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>ดูทั้งหมด</button>
      </div>
      {recentOrders.length === 0 ? <EmptyState text="ยังไม่มีออเดอร์" /> : recentOrders.map(o => (
        <div key={o.id} className="pgs-card" style={{ marginBottom: 8 }}>
          <div className="pgs-row">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{ORDER_TYPES[o.type].emoji}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{custName(o.customerId)}</div>
                <div className="pgs-mono" style={{ fontSize: 10, color: "var(--muted)" }}>{o.code}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="pgs-mono" style={{ fontWeight: 700, fontSize: 13 }}>฿{fmtMoney(o.price)}</div>
              <StatusDot payment={o.paymentStatus} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =================== ORDERS ===================
function OrdersTab({ data, custName, accName, openNew, openEdit, openReceipt }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [cancelFilter, setCancelFilter] = useState("active");

  const filtered = data.orders.filter(o => {
    if (cancelFilter === "active" && o.cancelled) return false;
    if (cancelFilter === "cancelled" && !o.cancelled) return false;
    if (filter !== "all" && o.type !== filter) return false;
    if (paymentFilter !== "all" && o.paymentStatus !== paymentFilter) return false;
    if (tradeFilter !== "all" && o.tradeStatus !== tradeFilter) return false;
    if (q && !(custName(o.customerId).toLowerCase().includes(q.toLowerCase()) || (o.pokemonName || "").toLowerCase().includes(q.toLowerCase()) || o.code.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div>
      <div className="pgs-row" style={{ marginBottom: 12 }}>
        <h2 className="pgs-display" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>ออเดอร์</h2>
        <button className="pgs-btn pgs-btn-primary" onClick={openNew}><Plus size={15} /> เพิ่ม</button>
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={14} color="var(--muted)" style={{ position: "absolute", left: 12, top: 12 }} />
        <input className="pgs-input" style={{ paddingLeft: 32 }} placeholder="ค้นหาลูกค้า, Pokémon, รหัส..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 2 }}>
        <button className={"pgs-chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>ทั้งหมด</button>
        {Object.entries(ORDER_TYPES).map(([k, v]) => (
          <button key={k} className={"pgs-chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)}>{v.emoji} {v.short}</button>
        ))}
        <button className={"pgs-chip" + (showAdv ? " active" : "")} onClick={() => setShowAdv(s => !s)}><ListFilter size={12} style={{ verticalAlign: -2 }} /> ตัวกรอง</button>
      </div>
      {showAdv && (
        <div className="pgs-card" style={{ marginBottom: 12 }}>
          <div className="pgs-field" style={{ marginBottom: 10 }}>
            <label className="pgs-label">สถานะชำระ</label>
            <select className="pgs-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
              <option value="all">ทั้งหมด</option>
              {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="pgs-field" style={{ marginBottom: 10 }}>
            <label className="pgs-label">สถานะเทรด</label>
            <select className="pgs-select" value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}>
              <option value="all">ทั้งหมด</option>
              {Object.entries(TRADE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="pgs-field" style={{ marginBottom: 0 }}>
            <label className="pgs-label">สถานะออเดอร์</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={"pgs-chip" + (cancelFilter === "active" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setCancelFilter("active")}>ปกติ</button>
              <button className={"pgs-chip" + (cancelFilter === "cancelled" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setCancelFilter("cancelled")}>ยกเลิกแล้ว</button>
              <button className={"pgs-chip" + (cancelFilter === "all" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setCancelFilter("all")}>ทั้งหมด</button>
            </div>
          </div>
        </div>
      )}
      {filtered.length === 0 ? <EmptyState text="ไม่พบออเดอร์" /> : filtered.map(o => {
        const balance = orderBalance(o);
        return (
          <div key={o.id} className="pgs-card" style={{ marginBottom: 8, opacity: o.cancelled ? 0.7 : 1 }} onClick={() => openEdit(o)}>
            <div className="pgs-row" style={{ alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{ORDER_TYPES[o.type].emoji}</span>
                <div>
                  <div className={"pgs-row" + (o.cancelled ? " pgs-strike" : "")} style={{ gap: 6, justifyContent: "flex-start" }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{custName(o.customerId)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {o.type === "sell_pokemon"
                      ? `${o.pokemonName || ""}${(o.pokemonVariants || []).filter(v => v !== "normal").length ? " (" + o.pokemonVariants.filter(v => v !== "normal").map(v => POKEMON_VARIANTS[v]?.label).join(", ") + ")" : ""} x${o.quantity || 1}`
                      : `${ORDER_TYPES[o.type].label} · ${HIRE_MODES[o.hireMode]?.label || ""}`}
                    {o.sourceAccountId ? ` · ${accName(o.sourceAccountId)}` : ""}
                  </div>
                  <div className="pgs-mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{o.code} · {fmtDate(o.createdAt)}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="pgs-mono" style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>฿{fmtMoney(o.price)}</div>
                <StatusDot payment={o.paymentStatus} trade={o.type === "sell_pokemon" ? o.tradeStatus : null} cancelled={o.cancelled} />
              </div>
            </div>
            {!o.cancelled && o.paymentStatus === "partial" && (
              <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>ค้างชำระ ฿{fmtMoney(balance)}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button className="pgs-iconbtn" onClick={(e) => { e.stopPropagation(); openReceipt(o); }} title="ใบเสร็จ"><Receipt size={13} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VariantChips({ value, onChange }) {
  const toggle = (k) => {
    const has = value.includes(k);
    if (k === "normal") { onChange(["normal"]); return; }
    let next = has ? value.filter(v => v !== k) : [...value.filter(v => v !== "normal"), k];
    if (next.length === 0) next = ["normal"];
    onChange(next);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {Object.entries(POKEMON_VARIANTS).map(([k, v]) => (
        <button key={k} type="button" className={"pgs-chip" + (value.includes(k) ? " active" : "")} onClick={() => toggle(k)}>{v.emoji} {v.label}</button>
      ))}
    </div>
  );
}

function RoundsEditor({ mode, rounds, onChange }) {
  const addRound = () => onChange([...rounds, { id: genId(), date: mode === "scheduled" ? todayStr() : "", count: 1, done: false }]);
  const updateRound = (id, patch) => onChange(rounds.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRound = (id) => onChange(rounds.filter(r => r.id !== id));

  if (mode === "anytime") {
    const r = rounds[0] || { id: genId(), date: "", count: 1, done: false };
    return (
      <div className="pgs-field">
        <label className="pgs-label">จำนวนรอบที่ต้องตี (ไม่ระบุวัน)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="pgs-input pgs-mono" type="number" min="1" style={{ flex: 1 }} value={r.count}
            onChange={e => onChange([{ ...r, count: e.target.value }])} />
          <button type="button" className={"pgs-chip" + (r.done ? " active" : "")} onClick={() => onChange([{ ...r, done: !r.done }])}>
            {r.done ? "เสร็จแล้ว ✓" : "ยังไม่เสร็จ"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="pgs-field">
      <label className="pgs-label">รอบที่ตั้งไว้ ({rounds.filter(r => r.done).length}/{rounds.length} เสร็จ)</label>
      {rounds.map((r, i) => (
        <div key={r.id} className="pgs-roundrow">
          <span style={{ fontSize: 11, color: "var(--muted)", width: 16 }}>{i + 1}</span>
          <input className="pgs-input" type="date" style={{ flex: 1.4 }} value={r.date} onChange={e => updateRound(r.id, { date: e.target.value })} />
          <input className="pgs-input pgs-mono" type="number" min="1" style={{ flex: 0.7 }} value={r.count} onChange={e => updateRound(r.id, { count: e.target.value })} />
          <button type="button" className="pgs-iconbtn" style={{ color: r.done ? "var(--green)" : "var(--muted)" }} onClick={() => updateRound(r.id, { done: !r.done })}><CheckCircle2 size={15} /></button>
          <button type="button" className="pgs-iconbtn" onClick={() => removeRound(r.id)}><X size={14} /></button>
        </div>
      ))}
      <button type="button" className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginTop: 4 }} onClick={addRound}><Plus size={14} /> เพิ่มรอบ</button>
    </div>
  );
}

function OrderModal({ data, mode, item, onClose, onSave, onCancel, onRestore, onDelete, onReceipt }) {
  const [form, setForm] = useState(item || {
    id: genId(), customerId: data.customers[0]?.id || "", customerGameId: data.customers[0]?.gameIds?.[0]?.value || "",
    type: "sell_pokemon", pokemonName: "", pokemonVariants: ["normal"], quantity: 1, stockItemId: null,
    price: "", sourceAccountId: data.gameAccounts[0]?.id || "",
    paymentStatus: "pending", paidAmount: 0, tradeStatus: "waiting",
    hireMode: "anytime", rounds: [],
    appointmentDate: "", note: "",
    createdAt: new Date().toISOString(), paidDate: "", cancelled: false, cancelledAt: null,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isSell = form.type === "sell_pokemon";
  const isHire = !isSell;

  const selectedCustomer = data.customers.find(c => c.id === form.customerId);
  const selectedAccount = data.gameAccounts.find(a => a.id === form.sourceAccountId);
  const stockOptions = selectedAccount?.stock || [];

  function pickCustomer(id) {
    const c = data.customers.find(x => x.id === id);
    setForm(f => ({ ...f, customerId: id, customerGameId: c?.gameIds?.[0]?.value || "" }));
  }
  function pickStock(stockId) {
    if (!stockId) { set("stockItemId", null); return; }
    const s = stockOptions.find(x => x.id === stockId);
    if (!s) return;
    setForm(f => ({ ...f, stockItemId: stockId, pokemonName: s.name, pokemonVariants: s.variants && s.variants.length ? s.variants : ["normal"] }));
  }

  function submit() {
    if (!form.customerId) return;
    const price = Number(form.price) || 0;
    let paidAmount = 0;
    if (form.paymentStatus === "paid") paidAmount = price;
    else if (form.paymentStatus === "partial") paidAmount = clamp0(Math.min(Number(form.paidAmount) || 0, price));
    const payload = { ...form, price, paidAmount, quantity: Number(form.quantity) || 1 };
    if ((form.paymentStatus === "paid" || form.paymentStatus === "partial") && !payload.paidDate) payload.paidDate = new Date().toISOString();
    if (isHire) payload.rounds = form.rounds;
    onSave(payload);
  }

  if (data.customers.length === 0) {
    return (
      <Modal title="เพิ่มออเดอร์" onClose={onClose}>
        <EmptyState text="กรุณาเพิ่มลูกค้าก่อนสร้างออเดอร์" />
      </Modal>
    );
  }

  return (
    <Modal title={mode === "add" ? "เพิ่มออเดอร์" : `แก้ไขออเดอร์ ${form.code || ""}`} onClose={onClose}>
      {form.cancelled && (
        <div className="pgs-cancelbanner"><Ban size={13} /> ออเดอร์นี้ถูกยกเลิกแล้ว {form.cancelledAt ? `(${fmtDate(form.cancelledAt)})` : ""}</div>
      )}
      <div className="pgs-field">
        <label className="pgs-label">ประเภทบริการ</label>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(ORDER_TYPES).map(([k, v]) => (
            <button key={k} className={"pgs-chip" + (form.type === k ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => set("type", k)}>{v.emoji} {v.short}</button>
          ))}
        </div>
      </div>
      <div className="pgs-field">
        <label className="pgs-label">ลูกค้า</label>
        <select className="pgs-select" value={form.customerId} onChange={e => pickCustomer(e.target.value)}>
          {data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {selectedCustomer && (selectedCustomer.gameIds || []).length > 0 && (
        <div className="pgs-field">
          <label className="pgs-label">ไอดีของลูกค้าที่ใช้ในออเดอร์นี้</label>
          <select className="pgs-select" value={form.customerGameId} onChange={e => set("customerGameId", e.target.value)}>
            {selectedCustomer.gameIds.map(g => <option key={g.id} value={g.value}>{g.value || "(ไม่มีชื่อ)"}</option>)}
            <option value="">- ไม่ระบุ -</option>
          </select>
        </div>
      )}
      {isSell && (
        <>
          <div className="pgs-field">
            <label className="pgs-label">ไอดีต้นทาง</label>
            <select className="pgs-select" value={form.sourceAccountId} onChange={e => { set("sourceAccountId", e.target.value); set("stockItemId", null); }}>
              <option value="">- ไม่ระบุ -</option>
              {data.gameAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {stockOptions.length > 0 && (
            <div className="pgs-field">
              <label className="pgs-label">เลือกจากสต๊อก (ตัดสต๊อกอัตโนมัติ)</label>
              <select className="pgs-select" value={form.stockItemId || ""} onChange={e => pickStock(e.target.value)}>
                <option value="">- กรอกเอง (ไม่ตัดสต๊อก) -</option>
                {stockOptions.map(s => <option key={s.id} value={s.id}>{s.name} · เหลือ {s.quantity}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <div className="pgs-field" style={{ flex: 2 }}>
              <label className="pgs-label">ชื่อ Pokémon</label>
              <input className="pgs-input" value={form.pokemonName} onChange={e => set("pokemonName", e.target.value)} placeholder="เช่น Rayquaza" />
            </div>
            <div className="pgs-field" style={{ flex: 1 }}>
              <label className="pgs-label">จำนวน</label>
              <input className="pgs-input" type="number" min="1" value={form.quantity} onChange={e => set("quantity", e.target.value)} />
            </div>
          </div>
          <div className="pgs-field">
            <label className="pgs-label">ประเภท Pokémon</label>
            <VariantChips value={form.pokemonVariants} onChange={(v) => set("pokemonVariants", v)} />
          </div>
        </>
      )}
      {isHire && (
        <>
          <div className="pgs-field">
            <label className="pgs-label">โหมดนัดตี</label>
            <div style={{ display: "flex", gap: 6 }}>
              {Object.entries(HIRE_MODES).map(([k, v]) => (
                <button key={k} className={"pgs-chip" + (form.hireMode === k ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => set("hireMode", k)}>{v.label}</button>
              ))}
            </div>
          </div>
          <RoundsEditor mode={form.hireMode} rounds={form.rounds} onChange={(r) => set("rounds", r)} />
        </>
      )}
      <div className="pgs-field">
        <label className="pgs-label">ราคารวม (บาท)</label>
        <input className="pgs-input pgs-mono" type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">สถานะชำระ</label>
        <select className="pgs-select" value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {form.paymentStatus === "partial" && (
        <div className="pgs-field">
          <label className="pgs-label">จำนวนที่ชำระแล้ว (บาท)</label>
          <input className="pgs-input pgs-mono" type="number" value={form.paidAmount} onChange={e => set("paidAmount", e.target.value)} />
          <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>คงค้าง ฿{fmtMoney(clamp0((Number(form.price) || 0) - (Number(form.paidAmount) || 0)))}</div>
        </div>
      )}
      {isSell && (
        <div className="pgs-field">
          <label className="pgs-label">สถานะเทรด</label>
          <select className="pgs-select" value={form.tradeStatus} onChange={e => set("tradeStatus", e.target.value)}>
            {Object.entries(TRADE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )}
      <div className="pgs-field">
        <label className="pgs-label">วันนัด (ทั่วไป)</label>
        <input className="pgs-input" type="date" value={form.appointmentDate} onChange={e => set("appointmentDate", e.target.value)} />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">หมายเหตุ</label>
        <textarea className="pgs-textarea" rows={2} value={form.note} onChange={e => set("note", e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button className="pgs-btn pgs-btn-primary" style={{ flex: 1 }} onClick={submit}>บันทึก</button>
        {mode === "edit" && (
          <button className="pgs-btn pgs-btn-outline" onClick={() => onReceipt(form)}><Receipt size={14} /></button>
        )}
      </div>
      {mode === "edit" && (
        <div style={{ display: "flex", gap: 8 }}>
          {form.cancelled ? (
            <button className="pgs-btn pgs-btn-outline" style={{ flex: 1 }} onClick={() => onRestore(form.id)}><RotateCcw size={14} /> กู้คืนออเดอร์</button>
          ) : (
            <button className="pgs-btn pgs-btn-outline" style={{ flex: 1 }} onClick={() => onCancel(form.id)}><Ban size={14} /> ยกเลิกออเดอร์</button>
          )}
          {!confirmDelete ? (
            <button className="pgs-btn pgs-btn-danger" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> ลบถาวร</button>
          ) : (
            <button className="pgs-btn pgs-btn-danger" style={{ flex: 1 }} onClick={() => onDelete(form.id)}>ยืนยันลบถาวร?</button>
          )}
        </div>
      )}
    </Modal>
  );
}

// =================== RECEIPT ===================
function buildReceiptLines(order, data, custName, accName) {
  const lines = [];
  lines.push(`🧾 ${data.settings.shopName}`);
  lines.push(`เลขที่: ${order.code || "-"}`);
  lines.push(`วันที่: ${fmtDate(order.createdAt)}`);
  lines.push(`--------------------------------`);
  lines.push(`ลูกค้า: ${custName(order.customerId)}`);
  if (order.customerGameId) lines.push(`ไอดีเกม: ${order.customerGameId}`);
  lines.push(`บริการ: ${ORDER_TYPES[order.type]?.label || "-"}`);
  if (order.type === "sell_pokemon") {
    const variants = (order.pokemonVariants || []).filter(v => v !== "normal").map(v => POKEMON_VARIANTS[v]?.label).filter(Boolean).join(", ");
    lines.push(`Pokémon: ${order.pokemonName || "-"}${variants ? " (" + variants + ")" : ""} x${order.quantity || 1}`);
    if (order.sourceAccountId) lines.push(`ไอดีต้นทาง: ${accName(order.sourceAccountId)}`);
  } else {
    lines.push(`โหมด: ${HIRE_MODES[order.hireMode]?.label || "-"}`);
    (order.rounds || []).forEach((r, i) => {
      lines.push(`  รอบ ${i + 1}: ${r.date ? fmtDate(r.date) : "ไม่ระบุวัน"} x${r.count} ${r.done ? "(เสร็จแล้ว)" : ""}`);
    });
  }
  lines.push(`--------------------------------`);
  lines.push(`ราคารวม: ฿${fmtMoney(order.price)}`);
  if (order.paymentStatus === "partial") {
    lines.push(`ชำระแล้ว: ฿${fmtMoney(order.paidAmount)}`);
    lines.push(`คงเหลือ: ฿${fmtMoney(orderBalance(order))}`);
  }
  lines.push(`สถานะชำระ: ${PAYMENT_STATUS[order.paymentStatus]?.label || "-"}`);
  if (order.type === "sell_pokemon") lines.push(`สถานะเทรด: ${TRADE_STATUS[order.tradeStatus]?.label || "-"}`);
  if (order.note) lines.push(`หมายเหตุ: ${order.note}`);
  if (order.cancelled) lines.push(`⚠️ ออเดอร์นี้ถูกยกเลิก`);
  return lines;
}

function downloadReceiptImage(order, data, custName, accName) {
  const lines = buildReceiptLines(order, data, custName, accName);
  const width = 520;
  const lineHeight = 26;
  const padding = 26;
  const height = padding * 2 + lines.length * lineHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12131c";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2c2f42";
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.fillStyle = "#f2f3f8";
  ctx.font = "16px monospace";
  lines.forEach((line, i) => {
    if (line.startsWith("--")) {
      ctx.strokeStyle = "#2c2f42";
      ctx.beginPath();
      const y = padding + i * lineHeight + lineHeight / 2;
      ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
      return;
    }
    ctx.fillStyle = line.startsWith("🧾") ? "#ffcb05" : (line.startsWith("⚠️") ? "#ff5470" : "#f2f3f8");
    ctx.fillText(line, padding, padding + (i + 1) * lineHeight - 8);
  });
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `receipt-${order.code || "order"}.png`; a.click();
    URL.revokeObjectURL(url);
  });
}

function ReceiptModal({ order, data, custName, accName, onClose, onToast }) {
  const lines = buildReceiptLines(order, data, custName, accName);
  const text = lines.join("\n");
  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      onToast("คัดลอกใบเสร็จแล้ว");
    } catch {
      onToast("คัดลอกไม่สำเร็จ");
    }
  }
  return (
    <Modal title="ใบเสร็จ / สรุปออเดอร์" onClose={onClose}>
      <div className="pgs-receiptbox pgs-mono">{text}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="pgs-btn pgs-btn-outline" style={{ flex: 1 }} onClick={copyText}><Copy size={14} /> คัดลอกข้อความ</button>
        <button className="pgs-btn pgs-btn-primary" style={{ flex: 1 }} onClick={() => downloadReceiptImage(order, data, custName, accName)}><Download size={14} /> ดาวน์โหลดรูป</button>
      </div>
    </Modal>
  );
}

// =================== CUSTOMERS ===================
function CustomersTab({ data, openNew, openEdit, openDetail }) {
  const [q, setQ] = useState("");
  const list = data.customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const spentOf = (id) => data.orders.filter(o => o.customerId === id && !o.cancelled).reduce((s, o) => {
    if (o.paymentStatus === "paid") return s + (Number(o.price) || 0);
    if (o.paymentStatus === "partial") return s + (Number(o.paidAmount) || 0);
    return s;
  }, 0);
  return (
    <div>
      <div className="pgs-row" style={{ marginBottom: 12 }}>
        <h2 className="pgs-display" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>ลูกค้า</h2>
        <button className="pgs-btn pgs-btn-primary" onClick={openNew}><Plus size={15} /> เพิ่ม</button>
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={14} color="var(--muted)" style={{ position: "absolute", left: 12, top: 12 }} />
        <input className="pgs-input" style={{ paddingLeft: 32 }} placeholder="ค้นหาลูกค้า..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <EmptyState text="ยังไม่มีลูกค้า" /> : list.map(c => (
        <div key={c.id} className="pgs-card" style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => openDetail(c)}>
          <div className="pgs-row">
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.facebook || "ไม่มี Facebook"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="pgs-mono" style={{ fontWeight: 700, fontSize: 13, color: "var(--green)" }}>฿{fmtMoney(spentOf(c.id))}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>ยอดซื้อสะสม</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerModal({ mode, item, onClose, onSave }) {
  const [form, setForm] = useState(item || {
    id: genId(), name: "", facebook: "", note: "",
    gameIds: [{ id: genId(), value: "" }],
    createdAt: new Date().toISOString(), _isNew: true,
  });
  const updateGameId = (id, value) => setForm(f => ({ ...f, gameIds: f.gameIds.map(g => g.id === id ? { ...g, value } : g) }));
  const addGameId = () => setForm(f => ({ ...f, gameIds: [...f.gameIds, { id: genId(), value: "" }] }));
  const removeGameId = (id) => setForm(f => ({ ...f, gameIds: f.gameIds.length > 1 ? f.gameIds.filter(g => g.id !== id) : f.gameIds }));
  return (
    <Modal title={mode === "add" ? "เพิ่มลูกค้า" : "แก้ไขลูกค้า"} onClose={onClose}>
      <div className="pgs-field">
        <label className="pgs-label">ชื่อลูกค้า</label>
        <input className="pgs-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น Ash_Ketchum99" />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">ไอดีในเกม (เพิ่มได้หลายไอดี)</label>
        {form.gameIds.map((g, i) => (
          <div key={g.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input className="pgs-input" value={g.value} onChange={e => updateGameId(g.id, e.target.value)} placeholder={`ไอดี #${i + 1}`} />
            {form.gameIds.length > 1 && (
              <button type="button" className="pgs-iconbtn" onClick={() => removeGameId(g.id)}><X size={14} /></button>
            )}
          </div>
        ))}
        <button type="button" className="pgs-btn pgs-btn-outline" style={{ width: "100%" }} onClick={addGameId}><Plus size={14} /> เพิ่มไอดี</button>
      </div>
      <div className="pgs-field">
        <label className="pgs-label">Facebook</label>
        <input className="pgs-input" value={form.facebook} onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))} placeholder="ชื่อ / ลิงก์โปรไฟล์" />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">หมายเหตุ</label>
        <textarea className="pgs-textarea" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </div>
      <button className="pgs-btn pgs-btn-primary" style={{ width: "100%" }} disabled={!form.name} onClick={() => form.name && onSave(form)}>บันทึก</button>
    </Modal>
  );
}

function CustomerDetail({ item, data, onClose, onEdit, onDelete }) {
  const [period, setPeriod] = useState("all");
  const orders = data.orders.filter(o => o.customerId === item.id && !o.cancelled);
  const today = todayStr();
  const inPeriod = (o) => {
    if (period === "all") return true;
    const d = (o.createdAt || "").slice(0, period === "month" ? 7 : 4);
    const t = today.slice(0, period === "month" ? 7 : 4);
    return d === t;
  };
  const relevant = orders.filter(inPeriod);
  const paidAmountOf = (o) => o.paymentStatus === "paid" ? Number(o.price || 0) : (o.paymentStatus === "partial" ? Number(o.paidAmount || 0) : 0);
  const byType = (t) => relevant.filter(o => o.type === t);
  const sumType = (t) => byType(t).reduce((s, o) => s + paidAmountOf(o), 0);
  const total = ["sell_pokemon", "hire_boss", "hire_invite"].reduce((s, t) => s + sumType(t), 0);
  return (
    <Modal title={item.name} onClose={onClose}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{item.facebook || "ไม่มี Facebook"}{item.note ? " · " + item.note : ""}</div>
      {(item.gameIds || []).some(g => g.value) && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          ไอดีในเกม: {item.gameIds.filter(g => g.value).map(g => g.value).join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={"pgs-chip" + (period === "month" ? " active" : "")} onClick={() => setPeriod("month")}>รายเดือน</button>
        <button className={"pgs-chip" + (period === "year" ? " active" : "")} onClick={() => setPeriod("year")}>รายปี</button>
        <button className={"pgs-chip" + (period === "all" ? " active" : "")} onClick={() => setPeriod("all")}>ทั้งหมด</button>
      </div>
      <div className="pgs-card" style={{ marginBottom: 10 }}>
        <div className="pgs-row" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>ยอดรวม</span>
          <span className="pgs-mono" style={{ fontWeight: 700, fontSize: 18, color: "var(--green)" }}>฿{fmtMoney(total)}</span>
        </div>
        {Object.entries(ORDER_TYPES).map(([k, v]) => (
          <div key={k} className="pgs-row" style={{ fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--muted)" }}>{v.emoji} {v.label} ({byType(k).length})</span>
            <span className="pgs-mono">฿{fmtMoney(sumType(k))}</span>
          </div>
        ))}
      </div>
      <div className="pgs-sectiontitle">ประวัติออเดอร์</div>
      {relevant.length === 0 ? <EmptyState text="ไม่มีข้อมูล" /> : relevant.slice(0, 8).map(o => (
        <div key={o.id} className="pgs-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <span>{ORDER_TYPES[o.type].emoji} {o.type === "sell_pokemon" ? o.pokemonName : ORDER_TYPES[o.type].label}</span>
          <span className="pgs-mono">฿{fmtMoney(o.price)}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="pgs-btn pgs-btn-outline" style={{ flex: 1 }} onClick={onEdit}><Edit2 size={14} /> แก้ไข</button>
        <button className="pgs-btn pgs-btn-danger" style={{ flex: 1 }} onClick={onDelete}><Trash2 size={14} /> ลบ</button>
      </div>
    </Modal>
  );
}

// =================== ACCOUNTS ===================
function AccountsTab({ data, stats, openNew, openDetail, back }) {
  return (
    <div>
      <SubHeader title="ไอดีเกม" back={back} />
      <button className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={openNew}><Plus size={15} /> เพิ่มไอดีใหม่</button>
      {data.gameAccounts.length === 0 ? <EmptyState text="ยังไม่มีไอดีเกม" /> : data.gameAccounts.map(a => {
        const invested = stats.investByAccount[a.id] || 0;
        const income = data.orders.filter(o => o.sourceAccountId === a.id && !o.cancelled && o.paymentStatus === "paid").reduce((s, o) => s + Number(o.price || 0), 0);
        const profit = income - invested;
        const pokemonCount = data.orders.filter(o => o.sourceAccountId === a.id && o.type === "sell_pokemon" && !o.cancelled).length;
        const lowStock = (a.stock || []).filter(s => clamp0(s.quantity) <= (s.lowStockThreshold ?? 2));
        return (
          <div key={a.id} className="pgs-card" style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => openDetail(a)}>
            <div className="pgs-row" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Gamepad2 size={16} color="var(--yellow)" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
              </div>
              <span className="pgs-mono" style={{ fontWeight: 700, fontSize: 13, color: profit >= 0 ? "var(--green)" : "var(--red)" }}>฿{fmtMoney(profit)}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 10, color: "var(--muted)" }}>
              <div>ลงทุน<br /><span className="pgs-mono" style={{ color: "var(--text)", fontSize: 12 }}>฿{fmtMoney(invested)}</span></div>
              <div>รายรับ<br /><span className="pgs-mono" style={{ color: "var(--text)", fontSize: 12 }}>฿{fmtMoney(income)}</span></div>
              <div>Pokémon<br /><span className="pgs-mono" style={{ color: "var(--text)", fontSize: 12 }}>{pokemonCount}</span></div>
            </div>
            {lowStock.length > 0 && (
              <div className="pgs-badge" style={{ marginTop: 8, background: "rgba(255,84,112,0.15)", color: "var(--red)" }}>
                <AlertTriangle size={10} /> สต๊อกใกล้หมด {lowStock.length} รายการ
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AccountModal({ mode, item, onClose, onSave }) {
  const [form, setForm] = useState(item || { id: genId(), name: "", note: "", createdAt: new Date().toISOString() });
  return (
    <Modal title={mode === "add" ? "เพิ่มไอดีเกม" : "แก้ไขไอดีเกม"} onClose={onClose}>
      <div className="pgs-field">
        <label className="pgs-label">ชื่อไอดี</label>
        <input className="pgs-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น ID-Trainer01" />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">หมายเหตุ</label>
        <textarea className="pgs-textarea" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </div>
      <button className="pgs-btn pgs-btn-primary" style={{ width: "100%" }} disabled={!form.name} onClick={() => form.name && onSave(form)}>บันทึก</button>
    </Modal>
  );
}

function AccountDetail({ item, data, stats, onClose, onEdit, onDelete, onAddInvestment, onDeleteInvestment, onAddStock, onEditStock }) {
  const invested = stats.investByAccount[item.id] || 0;
  const income = data.orders.filter(o => o.sourceAccountId === item.id && !o.cancelled && o.paymentStatus === "paid").reduce((s, o) => s + Number(o.price || 0), 0);
  const history = data.investmentHistory.filter(h => h.accountId === item.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const waitingTrade = data.orders.filter(o => o.sourceAccountId === item.id && !o.cancelled && o.tradeStatus === "waiting").length;
  const threeHearts = data.orders.filter(o => o.sourceAccountId === item.id && !o.cancelled && o.tradeStatus === "three_hearts").length;
  const stock = item.stock || [];
  return (
    <Modal title={item.name} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <StatCard icon={Coins} label="ลงทุนสะสม" value={"฿" + fmtMoney(invested)} color="var(--yellow)" />
        <StatCard icon={TrendingUp} label="กำไร" value={"฿" + fmtMoney(income - invested)} color={income - invested >= 0 ? "var(--green)" : "var(--red)"} />
        <StatCard icon={Clock} label="ลูกค้ารอเทรด" value={waitingTrade} />
        <StatCard icon={Heart} label="ทำ 3 ใจ" value={threeHearts} color="var(--yellow)" />
      </div>
      <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 12 }} onClick={onAddInvestment}><Plus size={14} /> บันทึกเติม Coin / ซื้อ Pokémon</button>

      <div className="pgs-row" style={{ marginBottom: 8 }}>
        <div className="pgs-sectiontitle" style={{ margin: 0 }}>สต๊อก Pokémon</div>
        <button className="pgs-iconbtn" onClick={onAddStock}><Plus size={14} /></button>
      </div>
      {stock.length === 0 ? <EmptyState text="ยังไม่มีสต๊อก" /> : stock.map(s => {
        const low = clamp0(s.quantity) <= (s.lowStockThreshold ?? 2);
        return (
          <div key={s.id} className="pgs-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12, cursor: "pointer" }} onClick={() => onEditStock(s)}>
            <div>
              <div style={{ fontWeight: 600 }}>{s.name} {(s.variants || []).filter(v => v !== "normal").map(v => POKEMON_VARIANTS[v]?.emoji).join("")}</div>
              <div style={{ color: "var(--muted)", fontSize: 10 }}>{(s.variants || []).map(v => POKEMON_VARIANTS[v]?.label).join(", ")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {low && <AlertTriangle size={13} color="var(--red)" />}
              <span className="pgs-mono" style={{ fontWeight: 700, color: low ? "var(--red)" : "var(--text)" }}>{s.quantity}</span>
            </div>
          </div>
        );
      })}

      <div className="pgs-sectiontitle">ประวัติการลงทุน</div>
      {history.length === 0 ? <EmptyState text="ยังไม่มีประวัติ" /> : history.map(h => (
        <div key={h.id} className="pgs-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{INVEST_TYPES[h.type].label}</div>
            <div style={{ color: "var(--muted)", fontSize: 10 }}>{fmtDate(h.date)}{h.note ? " · " + h.note : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pgs-mono" style={{ color: "var(--red)" }}>-฿{fmtMoney(h.amount)}</span>
            <button onClick={() => onDeleteInvestment(h.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={13} color="var(--muted)" /></button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="pgs-btn pgs-btn-outline" style={{ flex: 1 }} onClick={onEdit}><Edit2 size={14} /> แก้ไข</button>
        <button className="pgs-btn pgs-btn-danger" style={{ flex: 1 }} onClick={onDelete}><Trash2 size={14} /> ลบไอดี</button>
      </div>
    </Modal>
  );
}

function StockModal({ mode, item, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(item || { id: genId(), name: "", variants: ["normal"], quantity: 1, lowStockThreshold: 2 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Modal title={mode === "add" ? "เพิ่มสต๊อก Pokémon" : "แก้ไขสต๊อก"} onClose={onClose}>
      <div className="pgs-field">
        <label className="pgs-label">ชื่อ Pokémon</label>
        <input className="pgs-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="เช่น Rayquaza" />
      </div>
      <div className="pgs-field">
        <label className="pgs-label">ประเภท</label>
        <VariantChips value={form.variants} onChange={(v) => set("variants", v)} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="pgs-field" style={{ flex: 1 }}>
          <label className="pgs-label">จำนวนคงเหลือ</label>
          <input className="pgs-input pgs-mono" type="number" min="0" value={form.quantity} onChange={e => set("quantity", e.target.value)} />
        </div>
        <div className="pgs-field" style={{ flex: 1 }}>
          <label className="pgs-label">แจ้งเตือนเมื่อเหลือ ≤</label>
          <input className="pgs-input pgs-mono" type="number" min="0" value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)} />
        </div>
      </div>
      <button
        className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: onDelete ? 8 : 0 }}
        disabled={!form.name}
        onClick={() => form.name && onSave({ ...form, quantity: clamp0(form.quantity), lowStockThreshold: clamp0(form.lowStockThreshold) })}
      >บันทึก</button>
      {onDelete && (
        !confirmDelete ? (
          <button className="pgs-btn pgs-btn-danger" style={{ width: "100%" }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> ลบสต๊อกนี้</button>
        ) : (
          <button className="pgs-btn pgs-btn-danger" style={{ width: "100%" }} onClick={onDelete}>ยืนยันลบ?</button>
        )
      )}
    </Modal>
  );
}

// =================== TRADE ===================
function TradeTab({ data, custName, accName, openEdit }) {
  const [filter, setFilter] = useState("waiting");
  const orders = data.orders.filter(o => o.type === "sell_pokemon" && !o.cancelled && o.tradeStatus === filter);
  return (
    <div>
      <h2 className="pgs-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px 0" }}>ระบบเทรด</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={"pgs-chip" + (filter === "waiting" ? " active" : "")} onClick={() => setFilter("waiting")}>รอเทรด</button>
        <button className={"pgs-chip" + (filter === "three_hearts" ? " active" : "")} onClick={() => setFilter("three_hearts")}>ทำ 3 ใจ</button>
        <button className={"pgs-chip" + (filter === "traded" ? " active" : "")} onClick={() => setFilter("traded")}>เทรดแล้ว</button>
      </div>
      {orders.length === 0 ? <EmptyState text="ไม่มีรายการในสถานะนี้" /> : orders.map(o => {
        const remain = o.appointmentDate ? daysBetween(todayStr(), o.appointmentDate) : null;
        return (
          <div key={o.id} className="pgs-card" style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => openEdit(o)}>
            <div className="pgs-row" style={{ marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{custName(o.customerId)}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{o.pokemonName} x{o.quantity} · {accName(o.sourceAccountId)}</div>
              </div>
              <StatusDot trade={o.tradeStatus} />
            </div>
            {o.appointmentDate && (
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={11} /> นัด {fmtDate(o.appointmentDate)}
                {remain !== null && remain >= 0 && ` · เหลืออีก ${remain} วัน`}
                {remain !== null && remain < 0 && ` · เลยกำหนด ${Math.abs(remain)} วัน`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =================== FINANCE ===================
function FinanceTab({ data, stats, custName, accName, openNew, back, onDeleteManual }) {
  const [filter, setFilter] = useState("all");
  const ledger = useMemo(() => {
    const rows = [
      ...data.orders.filter(o => !o.cancelled && o.paymentStatus === "paid").map(o => ({
        id: "o_" + o.id, type: "income", label: `${ORDER_TYPES[o.type].label} - ${custName(o.customerId)}`,
        amount: Number(o.price) || 0, date: (o.paidDate || o.createdAt).slice(0, 10), source: "order",
      })),
      ...data.orders.filter(o => !o.cancelled && o.paymentStatus === "partial").map(o => ({
        id: "op_" + o.id, type: "income", label: `${ORDER_TYPES[o.type].label} - ${custName(o.customerId)} (ชำระบางส่วน)`,
        amount: Number(o.paidAmount) || 0, date: (o.paidDate || o.createdAt).slice(0, 10), source: "order",
      })),
      ...data.investmentHistory.map(h => ({
        id: "i_" + h.id, type: "expense", label: INVEST_TYPES[h.type].label, amount: Number(h.amount) || 0, date: h.date, source: "investment", accountId: h.accountId,
      })),
      ...data.manualTx.map(t => ({
        id: "m_" + t.id, type: t.type, label: t.category || "อื่นๆ", amount: Number(t.amount) || 0, date: t.date, source: "manual", rawId: t.id, accountId: t.accountId,
      })),
    ];
    return rows.filter(r => filter === "all" || r.type === filter).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [data, filter, custName]);

  return (
    <div>
      <SubHeader title="การเงิน" back={back} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <StatCard icon={TrendingUp} label="รายรับเดือนนี้" value={"฿" + fmtMoney(stats.incomeMonth)} color="var(--green)" />
        <StatCard icon={TrendingDown} label="รายจ่ายเดือนนี้" value={"฿" + fmtMoney(stats.expenseMonth)} color="var(--red)" />
      </div>
      {stats.totalDue > 0 && (
        <div className="pgs-card" style={{ marginBottom: 12, borderColor: "rgba(255,84,112,0.4)" }}>
          <div className="pgs-row">
            <span style={{ fontSize: 12, color: "var(--muted)" }}>ยอดค้างชำระรวมทั้งร้าน</span>
            <span className="pgs-mono" style={{ fontWeight: 700, fontSize: 16, color: "var(--red)" }}>฿{fmtMoney(stats.totalDue)}</span>
          </div>
        </div>
      )}
      <button className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={openNew}><Plus size={15} /> เพิ่มรายการ (เติม Coin / ซื้อ Pokémon / อื่นๆ)</button>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={"pgs-chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>ทั้งหมด</button>
        <button className={"pgs-chip" + (filter === "income" ? " active" : "")} onClick={() => setFilter("income")}>รายรับ</button>
        <button className={"pgs-chip" + (filter === "expense" ? " active" : "")} onClick={() => setFilter("expense")}>รายจ่าย</button>
      </div>
      {ledger.length === 0 ? <EmptyState text="ยังไม่มีรายการ" /> : ledger.map(r => (
        <div key={r.id} className="pgs-row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{fmtDate(r.date)}{r.accountId ? ` · ${accName(r.accountId)}` : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pgs-mono" style={{ fontWeight: 700, color: r.type === "income" ? "var(--green)" : "var(--red)" }}>{r.type === "income" ? "+" : "-"}฿{fmtMoney(r.amount)}</span>
            {r.source === "manual" && <button onClick={() => onDeleteManual(r.rawId)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={13} color="var(--muted)" /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TxModal({ data, onClose, onSaveInvestment, onSaveManual, presetAccount }) {
  const [mode, setMode] = useState("investment");
  const [invForm, setInvForm] = useState({ id: genId(), accountId: presetAccount || data.gameAccounts[0]?.id || "", type: "topup", amount: "", date: todayStr(), note: "" });
  const [manForm, setManForm] = useState({ id: genId(), type: "expense", category: "อื่นๆ", amount: "", date: todayStr(), note: "", accountId: presetAccount || "" });

  return (
    <Modal title="เพิ่มรายการการเงิน" onClose={onClose}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button className={"pgs-chip" + (mode === "investment" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setMode("investment")}>เติม Coin / ซื้อ Pokémon</button>
        <button className={"pgs-chip" + (mode === "manual" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setMode("manual")}>รายการอื่นๆ</button>
      </div>

      {mode === "investment" ? (
        <>
          {data.gameAccounts.length === 0 ? <EmptyState text="กรุณาเพิ่มไอดีเกมก่อน" /> : (
            <>
              <div className="pgs-field">
                <label className="pgs-label">ไอดีเกม</label>
                <select className="pgs-select" value={invForm.accountId} onChange={e => setInvForm(f => ({ ...f, accountId: e.target.value }))}>
                  {data.gameAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="pgs-field">
                <label className="pgs-label">ประเภท</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(INVEST_TYPES).map(([k, v]) => (
                    <button key={k} className={"pgs-chip" + (invForm.type === k ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setInvForm(f => ({ ...f, type: k }))}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div className="pgs-field">
                <label className="pgs-label">จำนวนเงิน (บาท)</label>
                <input className="pgs-input pgs-mono" type="number" value={invForm.amount} onChange={e => setInvForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="pgs-field">
                <label className="pgs-label">วันที่</label>
                <input className="pgs-input" type="date" value={invForm.date} onChange={e => setInvForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="pgs-field">
                <label className="pgs-label">หมายเหตุ</label>
                <input className="pgs-input" value={invForm.note} onChange={e => setInvForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button className="pgs-btn pgs-btn-primary" style={{ width: "100%" }} disabled={!invForm.amount || !invForm.accountId} onClick={() => onSaveInvestment({ ...invForm, amount: Number(invForm.amount) })}>บันทึก</button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="pgs-field">
            <label className="pgs-label">ประเภท</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={"pgs-chip" + (manForm.type === "income" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setManForm(f => ({ ...f, type: "income" }))}>รายรับ</button>
              <button className={"pgs-chip" + (manForm.type === "expense" ? " active" : "")} style={{ flex: 1, textAlign: "center" }} onClick={() => setManForm(f => ({ ...f, type: "expense" }))}>รายจ่าย</button>
            </div>
          </div>
          <div className="pgs-field">
            <label className="pgs-label">รายการ</label>
            <input className="pgs-input" value={manForm.category} onChange={e => setManForm(f => ({ ...f, category: e.target.value }))} placeholder="เช่น ค่าธรรมเนียมโอน" />
          </div>
          <div className="pgs-field">
            <label className="pgs-label">จำนวนเงิน (บาท)</label>
            <input className="pgs-input pgs-mono" type="number" value={manForm.amount} onChange={e => setManForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="pgs-field">
            <label className="pgs-label">วันที่</label>
            <input className="pgs-input" type="date" value={manForm.date} onChange={e => setManForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="pgs-field">
            <label className="pgs-label">เกี่ยวข้องกับไอดีเกม (ถ้ามี)</label>
            <select className="pgs-select" value={manForm.accountId} onChange={e => setManForm(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">ไม่เกี่ยวกับไอดีใด</option>
              {data.gameAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button className="pgs-btn pgs-btn-primary" style={{ width: "100%" }} disabled={!manForm.amount} onClick={() => onSaveManual({ ...manForm, amount: Number(manForm.amount) })}>บันทึก</button>
        </>
      )}
    </Modal>
  );
}

// =================== REPORTS ===================
const PIE_COLORS = ["#ffcb05", "#4d68e0", "#33c481", "#ff5470", "#8b8da6"];

function ReportsTab({ data, custName, accName, back }) {
  const monthly = useMemo(() => {
    const map = {};
    const push = (date, key, amt) => {
      const m = (date || "").slice(0, 7);
      if (!m) return;
      map[m] = map[m] || { month: m, income: 0, expense: 0 };
      map[m][key] += amt;
    };
    data.orders.filter(o => !o.cancelled && o.paymentStatus === "paid").forEach(o => push((o.paidDate || o.createdAt), "income", Number(o.price) || 0));
    data.orders.filter(o => !o.cancelled && o.paymentStatus === "partial").forEach(o => push((o.paidDate || o.createdAt), "income", Number(o.paidAmount) || 0));
    data.manualTx.forEach(t => push(t.date, t.type, Number(t.amount) || 0));
    data.investmentHistory.forEach(h => push(h.date, "expense", Number(h.amount) || 0));
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-6).map(m => ({ ...m, label: m.month.slice(5) + "/" + m.month.slice(2, 4) }));
  }, [data]);

  const paidAmountOf = (o) => o.paymentStatus === "paid" ? Number(o.price || 0) : (o.paymentStatus === "partial" ? Number(o.paidAmount || 0) : 0);

  const incomeByAccount = useMemo(() => {
    const map = {};
    data.orders.filter(o => !o.cancelled && o.sourceAccountId && paidAmountOf(o) > 0).forEach(o => {
      const name = accName(o.sourceAccountId);
      map[name] = (map[name] || 0) + paidAmountOf(o);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [data]);

  const incomeByType = useMemo(() => {
    const map = {};
    data.orders.filter(o => !o.cancelled && paidAmountOf(o) > 0).forEach(o => {
      const label = ORDER_TYPES[o.type].short;
      map[label] = (map[label] || 0) + paidAmountOf(o);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [data]);

  const topCustomers = useMemo(() => {
    const map = {};
    data.orders.filter(o => !o.cancelled && paidAmountOf(o) > 0).forEach(o => {
      map[o.customerId] = (map[o.customerId] || 0) + paidAmountOf(o);
    });
    return Object.entries(map).map(([id, amount]) => ({ name: custName(id), amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [data]);

  return (
    <div>
      <SubHeader title="รายงาน" back={back} />
      <div className="pgs-sectiontitle">รายรับ-รายจ่าย 6 เดือนล่าสุด</div>
      <div className="pgs-card" style={{ marginBottom: 16, height: 190 }}>
        {monthly.length === 0 ? <EmptyState text="ยังไม่มีข้อมูล" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2f42" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#8b8da6", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8b8da6", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: "#1b1d2a", border: "1px solid #2c2f42", borderRadius: 8, fontSize: 12 }} formatter={(v) => "฿" + fmtMoney(v)} />
              <Bar dataKey="income" fill="#33c481" radius={[4, 4, 0, 0]} name="รายรับ" />
              <Bar dataKey="expense" fill="#ff5470" radius={[4, 4, 0, 0]} name="รายจ่าย" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="pgs-sectiontitle">รายได้แยกตามไอดี</div>
      <div className="pgs-card" style={{ marginBottom: 16 }}>
        {incomeByAccount.length === 0 ? <EmptyState text="ยังไม่มีข้อมูล" /> : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={incomeByAccount} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {incomeByAccount.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1b1d2a", border: "1px solid #2c2f42", borderRadius: 8, fontSize: 12 }} formatter={(v) => "฿" + fmtMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="pgs-sectiontitle">รายได้แยกตามประเภทบริการ</div>
      <div className="pgs-card" style={{ marginBottom: 16 }}>
        {incomeByType.map((t, i) => (
          <div key={t.name} className="pgs-row" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], display: "inline-block" }} />{t.name}</span>
            <span className="pgs-mono" style={{ fontSize: 12, fontWeight: 700 }}>฿{fmtMoney(t.value)}</span>
          </div>
        ))}
        {incomeByType.length === 0 && <EmptyState text="ยังไม่มีข้อมูล" />}
      </div>

      <div className="pgs-sectiontitle">ลูกค้าใช้จ่ายสูงสุด</div>
      <div className="pgs-card">
        {topCustomers.length === 0 ? <EmptyState text="ยังไม่มีข้อมูล" /> : topCustomers.map((c, i) => (
          <div key={c.name} className="pgs-row" style={{ padding: "6px 0" }}>
            <span style={{ fontSize: 12 }}>#{i + 1} {c.name}</span>
            <span className="pgs-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>฿{fmtMoney(c.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================== SETTINGS ===================
function SettingsTab({ data, setData, onBackup, onRestore, onExportExcel, onExportPDF, back }) {
  const fileRef = useRef(null);
  return (
    <div>
      <SubHeader title="ตั้งค่า" back={back} />
      <div className="pgs-field">
        <label className="pgs-label">ชื่อร้าน</label>
        <input className="pgs-input" value={data.settings.shopName} onChange={e => setData(d => ({ ...d, settings: { ...d.settings, shopName: e.target.value } }))} />
      </div>

      <div className="pgs-sectiontitle">ข้อมูล & สำรองข้อมูล</div>
      <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8, justifyContent: "flex-start" }} onClick={onBackup}><Download size={15} /> Backup ข้อมูล (.json)</button>
      <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8, justifyContent: "flex-start" }} onClick={() => fileRef.current?.click()}><Upload size={15} /> Restore ข้อมูลจากไฟล์</button>
      <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onRestore} />

      <div className="pgs-sectiontitle">ส่งออกรายงาน</div>
      <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8, justifyContent: "flex-start" }} onClick={onExportExcel}><FileDown size={15} /> Export Excel (.xlsx)</button>
      <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8, justifyContent: "flex-start" }} onClick={onExportPDF}><Printer size={15} /> Export PDF (พิมพ์ / บันทึกเป็น PDF)</button>

      <div className="pgs-sectiontitle">สรุปฐานข้อมูล</div>
      <div className="pgs-card" style={{ fontSize: 12 }}>
        <div className="pgs-row" style={{ marginBottom: 6 }}><span style={{ color: "var(--muted)" }}>ลูกค้า</span><span className="pgs-mono">{data.customers.length}</span></div>
        <div className="pgs-row" style={{ marginBottom: 6 }}><span style={{ color: "var(--muted)" }}>ออเดอร์</span><span className="pgs-mono">{data.orders.length}</span></div>
        <div className="pgs-row" style={{ marginBottom: 6 }}><span style={{ color: "var(--muted)" }}>ไอดีเกม</span><span className="pgs-mono">{data.gameAccounts.length}</span></div>
        <div className="pgs-row" style={{ marginBottom: 6 }}><span style={{ color: "var(--muted)" }}>รายการสต๊อก Pokémon</span><span className="pgs-mono">{data.gameAccounts.reduce((s, a) => s + (a.stock || []).length, 0)}</span></div>
        <div className="pgs-row" style={{ marginBottom: 6 }}><span style={{ color: "var(--muted)" }}>ออเดอร์ที่ยกเลิก</span><span className="pgs-mono">{data.orders.filter(o => o.cancelled).length}</span></div>
        <div className="pgs-row"><span style={{ color: "var(--muted)" }}>ประวัติการลงทุน</span><span className="pgs-mono">{data.investmentHistory.length}</span></div>
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", marginTop: 20 }}>ข้อมูลถูกบันทึกอัตโนมัติในเครื่องนี้ทุกครั้งที่มีการแก้ไข</div>
    </div>
  );
}
