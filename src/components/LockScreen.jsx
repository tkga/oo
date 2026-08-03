import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { ShopLogo } from "./UIComponents";

export function LockScreen({ pin, pinQuestion, pinAnswer, shopName, logoDataUrl, onUnlock, onRecover, onResetPin }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState(false);
  const [recover, setRecover] = useState(false);
  const [answerValue, setAnswerValue] = useState("");
  const [answerErr, setAnswerErr] = useState("");
  const [recoveredData, setRecoveredData] = useState(null);
  const [recoverErr, setRecoverErr] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const fileRef = useRef(null);

  function submit(e) {
    e.preventDefault();
    if (value === pin) { onUnlock(); }
    else { setErr(true); setValue(""); setTimeout(() => setErr(false), 900); }
  }

  function submitAnswer(e) {
    e.preventDefault();
    if (answerValue.trim().toLowerCase() === (pinAnswer || "").trim().toLowerCase() && pinAnswer) {
      setAnswerErr("");
      setRecover("resetpin");
    } else {
      setAnswerErr("คำตอบไม่ถูกต้อง");
    }
  }

  function submitResetPin(e) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(newPin)) { setAnswerErr("PIN ต้องเป็นตัวเลข 4-8 หลัก"); return; }
    if (newPin !== confirmPin) { setAnswerErr("ยืนยัน PIN ไม่ตรงกัน"); return; }
    onResetPin(newPin);
  }

  function pickFile() {
    setRecoverErr("");
    fileRef.current?.click();
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !parsed.settings || !Array.isArray(parsed.customers)) {
          throw new Error("bad shape");
        }
        setRecoveredData(parsed);
        setRecover("setpin");
        setRecoverErr("");
      } catch {
        setRecoverErr("ไฟล์นี้ไม่ใช่ไฟล์ Backup ของแอปนี้ (.json) กรุณาเลือกไฟล์ที่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function finishRecover(skipPin) {
    if (!skipPin) {
      if (!/^\d{4,8}$/.test(newPin)) { setRecoverErr("PIN ต้องเป็นตัวเลข 4-8 หลัก"); return; }
      if (newPin !== confirmPin) { setRecoverErr("ยืนยัน PIN ไม่ตรงกัน"); return; }
    }
    onRecover(recoveredData, skipPin ? "" : newPin);
  }

  if (recover === "question") {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 300 }}>
          <div className="pgs-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>คำถามกู้คืน PIN</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, textAlign: "center" }}>{pinQuestion}</div>
          <form onSubmit={submitAnswer}>
            <label className="pgs-label">คำตอบ</label>
            <input className="pgs-input" type="password" style={{ marginBottom: 10 }} autoFocus value={answerValue} onChange={e => setAnswerValue(e.target.value)} />
            {answerErr && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 10 }}>{answerErr}</div>}
            <button type="submit" className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 8 }}>ยืนยันคำตอบ</button>
          </form>
          <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8 }} onClick={() => { setAnswerErr(""); setRecover("intro"); }}>ตอบไม่ได้ — กู้คืนด้วยไฟล์ Backup แทน</button>
          <button className="pgs-btn pgs-btn-outline" style={{ width: "100%" }} onClick={() => { setAnswerErr(""); setAnswerValue(""); setRecover(false); }}>ย้อนกลับ</button>
        </div>
      </div>
    );
  }

  if (recover === "resetpin") {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 300 }}>
          <div className="pgs-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>ตอบถูกแล้ว!</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, textAlign: "center" }}>ตั้งรหัส PIN ใหม่ — ข้อมูลร้านทั้งหมดยังอยู่ครบ ไม่ต้องอัปโหลดไฟล์ใดๆ</div>
          <form onSubmit={submitResetPin}>
            <label className="pgs-label">PIN ใหม่ (ตัวเลข 4-8 หลัก)</label>
            <input className="pgs-input pgs-mono" style={{ marginBottom: 10 }} type="password" inputMode="numeric" autoFocus value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="••••" />
            <label className="pgs-label">ยืนยัน PIN ใหม่</label>
            <input className="pgs-input pgs-mono" style={{ marginBottom: 10 }} type="password" inputMode="numeric" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="••••" />
            {answerErr && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 10 }}>{answerErr}</div>}
            <button type="submit" className="pgs-btn pgs-btn-primary" style={{ width: "100%" }}>ตั้ง PIN ใหม่</button>
          </form>
        </div>
      </div>
    );
  }

  if (recover === "intro") {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 300 }}>
          <div className="pgs-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>กู้คืน PIN</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, textAlign: "center" }}>
            เลือกไฟล์ Backup (.json) ที่เคยดาวน์โหลดไว้ ระบบจะกู้คืนข้อมูลทั้งหมดและให้ตั้ง PIN ใหม่ โดยไม่ล้างข้อมูลในเครื่อง
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={handleFile} />
          {recoverErr && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 10 }}>{recoverErr}</div>}
          <button className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={pickFile}>
            <Upload size={15} /> เลือกไฟล์ Backup
          </button>
          {pinQuestion && (
            <button className="pgs-btn pgs-btn-outline" style={{ width: "100%", marginBottom: 8 }} onClick={() => { setRecoverErr(""); setRecover("question"); }}>ตอบคำถามกู้คืนแทน</button>
          )}
          <button className="pgs-btn pgs-btn-outline" style={{ width: "100%" }} onClick={() => { setRecover(false); setRecoverErr(""); }}>ย้อนกลับ</button>
        </div>
      </div>
    );
  }

  if (recover === "setpin") {
    return (
      <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 300 }}>
          <div className="pgs-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>อ่านไฟล์ Backup สำเร็จ</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, textAlign: "center" }}>ตั้งรหัส PIN ใหม่เพื่อเข้าใช้งานต่อ (หรือปิดการล็อกไปเลยก็ได้)</div>
          <label className="pgs-label">PIN ใหม่ (ตัวเลข 4-8 หลัก)</label>
          <input className="pgs-input pgs-mono" style={{ marginBottom: 10 }} type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="••••" />
          <label className="pgs-label">ยืนยัน PIN ใหม่</label>
          <input className="pgs-input pgs-mono" style={{ marginBottom: 10 }} type="password" inputMode="numeric" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="••••" />
          {recoverErr && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 10 }}>{recoverErr}</div>}
          <button className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={() => finishRecover(false)}>ตั้ง PIN ใหม่ &amp; กู้คืนข้อมูล</button>
          <button className="pgs-btn pgs-btn-outline" style={{ width: "100%" }} onClick={() => finishRecover(true)}>ไม่ตั้ง PIN (ปิดการล็อก)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pgs-root" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <ShopLogo logoDataUrl={logoDataUrl} size={54} />
        </div>
        <div className="pgs-display" style={{ fontSize: 18, fontWeight: 700 }}>{shopName}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>ใส่รหัส PIN เพื่อเข้าใช้งาน</div>
      </div>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 280 }}>
        <input
          className="pgs-input pgs-mono" style={{ textAlign: "center", fontSize: 20, letterSpacing: 6, marginBottom: 10, borderColor: err ? "var(--red)" : undefined }}
          type="password" inputMode="numeric" autoFocus value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="••••"
        />
        {err && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 10 }}>รหัส PIN ไม่ถูกต้อง</div>}
        <button type="submit" className="pgs-btn pgs-btn-primary" style={{ width: "100%", marginBottom: 10 }}>ปลดล็อก</button>
        <button type="button" className="pgs-btn pgs-btn-outline" style={{ width: "100%" }} onClick={() => setRecover(pinQuestion ? "question" : "intro")}>ลืม PIN?</button>
      </form>
    </div>
  );
}
