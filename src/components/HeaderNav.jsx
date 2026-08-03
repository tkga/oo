import { MoreHorizontal, Home, Package, Repeat, Target, ArrowLeft } from "lucide-react";
import { ShopLogo } from "./UIComponents";

export function Header({ data, onMore }) {
  return (
    <div className="pgs-header">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShopLogo logoDataUrl={data.settings.logoDataUrl} />
        <div>
          <div className="pgs-display" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{data.settings.shopName}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>ระบบจัดการร้าน</div>
        </div>
      </div>
      <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={onMore}><MoreHorizontal size={16} /></button>
    </div>
  );
}

export function BottomNav({ tab, setTab, onMore }) {
  const items = [
    { id: "dashboard", label: "หน้าแรก", icon: Home },
    { id: "orders", label: "ออเดอร์", icon: Package },
    { id: "trade", label: "เทรด", icon: Repeat },
    { id: "hire", label: "ตีบอส/เชิญตี", icon: Target },
  ];
  return (
    <div className="pgs-bottomnav">
      {items.map(it => (
        <button key={it.id} className={"pgs-navitem" + (tab === it.id ? " active" : "")} onClick={() => setTab(it.id)}>
          <it.icon size={19} />
          {it.label}
        </button>
      ))}
      <button className={"pgs-navitem" + (["accounts", "finance", "reports", "settings", "customers"].includes(tab) ? " active" : "")} onClick={onMore}>
        <MoreHorizontal size={19} />
        เพิ่มเติม
      </button>
    </div>
  );
}

export function MoreSheet({ onClose, go }) {
  const items = [
    { id: "customers", label: "ลูกค้า", icon: Users, desc: "รายชื่อ & ยอดใช้จ่ายสะสม" },
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
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{it.desc}</div>
            </div>
            <ChevronRight size={16} color="var(--muted)" />
          </button>
        ))}
      </div>
    </div>
  );
}
