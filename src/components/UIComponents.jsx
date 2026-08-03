import { Circle, Ban, Heart, Move, Minus, Plus, X } from "lucide-react";
import { PAYMENT_STATUS, TRADE_STATUS } from "../constants";

export function StatusDot({ payment, trade, cancelled }) {
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

export function StatCard({ icon: Icon, label, value, color, sub }) {
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

export function Modal({ title, onClose, children, footer }) {
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

export function EmptyState({ text }) {
  return (
    <div className="pgs-empty">
      <div style={{ fontSize: 30, marginBottom: 6 }}>🎾</div>
      {text}
    </div>
  );
}

export function ShopLogo({ logoDataUrl, size = 30 }) {
  if (logoDataUrl) {
    return <img src={logoDataUrl} alt="โลโก้ร้าน" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #14151f" }} />;
  }
  return <div className="pgs-ball" style={{ width: size, height: size }} />;
}

export function SubHeader({ title, back }) {
  return (
    <div className="pgs-row" style={{ marginBottom: 14 }}>
      <button className="pgs-btn pgs-btn-outline" style={{ padding: 8 }} onClick={back}><ArrowLeft size={16} /></button>
      <h2 className="pgs-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
      <div style={{ width: 34 }} />
    </div>
  );
}
