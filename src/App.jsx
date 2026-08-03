import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { GlobalStyle } from "./components/GlobalStyle";
import { Header, BottomNav, MoreSheet } from "./components/HeaderNav";
import { LockScreen } from "./components/LockScreen";
import { Dashboard } from "./components/tabs/Dashboard";
import { emptyData, migrateData, orderBalance, adjustStock, pushTrash, pushStockMovement, daysBetween, todayStr } from "./utils";
import { idbStorage, migrateFromLocalStorage } from "./idb.js";
import { requestAccessToken, disconnectGoogle, fetchGoogleProfile, ensureSpreadsheet, ensureDriveFolder, syncAll } from "./googleSync.js";

const STORAGE_KEY = "pgs-shop-data-v1";
const storage = idbStorage;

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleStatus, setGoogleStatus] = useState("");
  const saveTimer = useRef(null);
  const backupPromptedRef = useRef(false);
  const notifAskedRef = useRef(false);
  const autoSyncTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        await migrateFromLocalStorage(STORAGE_KEY);
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData(migrateData(parsed));
        }
      } catch (e) {
        // no data
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

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
    const pendingPayment = orders.filter(o => o.paymentStatus === "pending" || o.paymentStatus === "partial").length;
    const totalDue = orders.reduce((s, o) => s + orderBalance(o), 0);
    const pendingTrade = orders.filter(o => o.type === "sell_pokemon" && o.tradeStatus === "waiting").length;
    const threeHearts = orders.filter(o => o.type === "sell_pokemon" && o.tradeStatus === "three_hearts").length;

    return {
      incomeToday, incomeMonth, incomeYear, expenseToday, expenseMonth, expenseYear,
      profitToday: incomeToday - expenseToday, profitMonth: incomeMonth - expenseMonth, profitYear: incomeYear - expenseYear,
      totalInvestment, pendingPayment, totalDue, pendingTrade, threeHearts,
      totalOrders: orders.length, incomeEntries, expenseEntries,
    };
  }, [data]);

  const custName = (id) => data.customers.find(c => c.id === id)?.name || "-";
  const accName = (id) => data.gameAccounts.find(a => a.id === id)?.name || "-";

  if (!loaded) {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <div className="pgs-ball" style={{ animation: "pgs-up 1s infinite alternate" }} />
      </div>
    );
  }

  if (data.settings.pin && !unlocked) {
    return (
      <LockScreen
        pin={data.settings.pin}
        pinQuestion={data.settings.pinQuestion}
        pinAnswer={data.settings.pinAnswer}
        shopName={data.settings.shopName}
        logoDataUrl={data.settings.logoDataUrl}
        onUnlock={() => setUnlocked(true)}
        onRecover={(parsed, pin) => { setData(migrateData(parsed)); if (pin) setData(d => ({ ...d, settings: { ...d.settings, pin } })); setUnlocked(true); }}
        onResetPin={(newPin) => { setData(d => ({ ...d, settings: { ...d.settings, pin: newPin } })); setUnlocked(true); }}
      />
    );
  }

  return (
    <div className="pgs-root">
      <GlobalStyle />
      <Header data={data} onMore={() => setMoreOpen(true)} />
      <div className="pgs-scroll">
        {tab === "dashboard" && <Dashboard data={data} stats={stats} custName={custName} accName={accName} goTab={setTab} openDetail={(d) => setDetail(d)} />}
      </div>
      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          go={(t) => { setTab(t); setMoreOpen(false); }}
        />
      )}
      <BottomNav tab={tab} setTab={setTab} onMore={() => setMoreOpen(true)} />
      {toast && <div className="pgs-toast">{toast}</div>}
    </div>
  );
}
