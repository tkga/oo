export function emptyData() {
  return {
    settings: {
      shopName: "Pokémon GO Shop", createdAt: Date.now(), lastBackupAt: null, pin: "", pinQuestion: "", pinAnswer: "", logoDataUrl: "", receiptBgDataUrl: "",
      google: { clientId: "", email: "", spreadsheetId: "", folderId: "", autoSync: true, lastSyncAt: null },
    },
    customers: [],
    gameAccounts: [],
    orders: [],
    investmentHistory: [],
    manualTx: [],
    counters: { order: 0 },
    trash: [],
    stockMovements: [],
  };
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function orderCodeFromCounter(n) {
  const letterIndex = Math.floor((n - 1) / 9999);
  const num = ((n - 1) % 9999) + 1;
  const letter = String.fromCharCode(97 + (letterIndex % 26));
  return `${letter}${String(num).padStart(4, "0")}`;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  } catch { return d; }
}

export function daysBetween(a, b) {
  const A = new Date(a); const B = new Date(b);
  return Math.round((B - A) / 86400000);
}

export function clamp0(n) { return Math.max(0, Number(n) || 0); }

export function uniquePokemonNames(data) {
  const seen = new Map();
  (data.gameAccounts || []).forEach(a => (a.stock || []).forEach(s => {
    const n = (s.name || "").trim();
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }));
  (data.orders || []).forEach(o => {
    const n = (o.pokemonName || "").trim();
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "th"));
}

export function existingAccountNames(data) {
  const seen = new Map();
  (data.gameAccounts || []).forEach(a => {
    const n = (a.name || "").trim();
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "th"));
}

export function fileToLogoDataUrl(file, maxDim = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function fileToJpegDataUrl(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function applyAppIcon(logoDataUrl, shopName) {
  try {
    const setLink = (rel, href, extra = {}) => {
      let link = document.querySelector(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      Object.entries(extra).forEach(([k, v]) => link.setAttribute(k, v));
    };
    if (logoDataUrl) {
      setLink("icon", logoDataUrl);
      setLink("apple-touch-icon", logoDataUrl);
      const manifest = {
        name: shopName || "Pokémon GO Shop",
        short_name: (shopName || "PGS Shop").slice(0, 12),
        start_url: "./",
        display: "standalone",
        background_color: "#12131c",
        theme_color: "#12131c",
        icons: [
          { src: logoDataUrl, sizes: "192x192", type: "image/png" },
          { src: logoDataUrl, sizes: "512x512", type: "image/png" },
        ],
      };
      const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
      setLink("manifest", URL.createObjectURL(blob));
    } else {
      setLink("manifest", "./manifest.json");
    }
  } catch (e) {
    console.error("applyAppIcon failed", e);
  }
}

export function orderBalance(o) {
  const price = Number(o.price) || 0;
  if (o.paymentStatus === "paid") return 0;
  if (o.paymentStatus === "partial") return clamp0(price - (Number(o.paidAmount) || 0));
  return price;
}

export function migrateData(parsed) {
  const d = { ...emptyData(), ...parsed };
  d.settings = { ...emptyData().settings, logoDataUrl: "", receiptBgDataUrl: "", ...(parsed.settings || {}) };
  d.settings.google = { ...emptyData().settings.google, ...(parsed.settings?.google || {}) };
  if (!Array.isArray(d.customers)) d.customers = [];
  d.customers = (d.customers || []).map(c => ({
    ...c,
    gameIds: c.gameIds && c.gameIds.length ? c.gameIds : [{ id: genId(), value: c.name || "" }],
  }));
  d.gameAccounts = (d.gameAccounts || []).map(a => ({
    ...a,
    stock: (a.stock || []).map(s => ({ lowStockThreshold: 2, variants: ["normal"], photoDataUrl: "", ...s })),
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
      proofImageDataUrl: o.proofImageDataUrl || "",
      driveFileId: o.driveFileId || null,
      hireMode: o.hireMode || "anytime",
      rounds: o.rounds || [],
      hireTotal: o.hireTotal != null ? clamp0(o.hireTotal) : (o.type !== "sell_pokemon" ? (clamp0(o.quantity) || 1) : 0),
      hireUsed: clamp0(o.hireUsed) || 0,
      hireStatus: o.hireStatus === "done" ? "done" : "ongoing",
      cancelHistory: Array.isArray(o.cancelHistory) ? o.cancelHistory : [],
    };
  });
  if (!Array.isArray(d.trash)) d.trash = [];
  if (!Array.isArray(d.stockMovements)) d.stockMovements = [];
  return d;
}

export function adjustStock(gameAccounts, accountId, stockItemId, delta) {
  if (!accountId || !stockItemId || !delta) return gameAccounts;
  return gameAccounts.map(a => {
    if (a.id !== accountId) return a;
    return {
      ...a,
      stock: (a.stock || []).map(s => s.id === stockItemId ? { ...s, quantity: clamp0((Number(s.quantity) || 0) + delta) } : s),
    };
  });
}

export function pushTrash(trash, type, payload, meta = {}) {
  const entry = { id: genId(), type, deletedAt: new Date().toISOString(), payload, meta };
  return [entry, ...(trash || [])].slice(0, 500);
}

export function pushStockMovement(stockMovements, entry) {
  const row = { id: genId(), date: new Date().toISOString(), ...entry };
  return [row, ...(stockMovements || [])].slice(0, 3000);
}
