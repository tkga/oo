export const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    .pgs-root {
      --bg: #0c0d15;
      --surface: #161826;
      --surface2: #1e2033;
      --border: #2c2f46;
      --yellow: #ffcb05;
      --blue: #4d68e0;
      --green: #33c481;
      --red: #ff5470;
      --text: #f2f3f8;
      --muted: #8b8da6;
      --radius: 16px;
      font-family: 'Inter', system-ui, sans-serif;
      background:
        radial-gradient(circle at 15% 0%, rgba(77,104,224,0.16) 0%, transparent 45%),
        radial-gradient(circle at 100% 20%, rgba(255,203,5,0.09) 0%, transparent 40%),
        var(--bg);
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
    .pgs-root button { color: inherit; font-family: inherit; }
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
      box-shadow: 0 0 0 1px rgba(255,203,5,0.25), 0 4px 14px rgba(0,0,0,0.5);
    }
    .pgs-ball::after {
      content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 9px; height: 9px; border-radius: 50%; background: #fff; border: 2px solid #14151f;
    }
    .pgs-card {
      background: linear-gradient(165deg, var(--surface) 0%, rgba(30,32,51,0.7) 100%);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 20px -12px rgba(0,0,0,0.6);
      transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
    }
    button.pgs-card { text-decoration: none; }
    button.pgs-card:active { transform: scale(0.985); }
    .pgs-statcard {
      background: linear-gradient(165deg, var(--surface) 0%, rgba(30,32,51,0.7) 100%);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 20px -12px rgba(0,0,0,0.6);
    }
    .pgs-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 12px; padding: 10px 16px; font-weight: 600; font-size: 14px;
      border: none; cursor: pointer; transition: transform .1s ease, box-shadow .15s ease, filter .15s ease;
    }
    .pgs-btn:active { transform: scale(0.96); }
    .pgs-btn-primary {
      background: linear-gradient(135deg, #ffe066 0%, var(--yellow) 55%, #ffb700 100%);
      color: #14151f;
      box-shadow: 0 6px 18px -6px rgba(255,203,5,0.55);
    }
    .pgs-btn-primary:hover { filter: brightness(1.04); }
    .pgs-btn-outline { background: rgba(255,255,255,0.02); color: var(--text); border: 1px solid var(--border); }
    .pgs-btn-outline:hover { border-color: rgba(255,203,5,0.4); background: rgba(255,203,5,0.05); }
    .pgs-btn-danger { background: rgba(255,84,112,0.15); color: var(--red); }
    .pgs-input, .pgs-select, .pgs-textarea {
      width: 100%; background: var(--surface2); border: 1px solid var(--border);
      color: var(--text); border-radius: 10px; padding: 10px 12px; font-size: 14px;
      outline: none; font-family: inherit; transition: border-color .15s ease, box-shadow .15s ease;
    }
    .pgs-input:focus, .pgs-select:focus, .pgs-textarea:focus { border-color: var(--yellow); box-shadow: 0 0 0 3px rgba(255,203,5,0.14); }
    .pgs-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; display: block; font-weight: 500; }
    .pgs-field { margin-bottom: 14px; }
    .pgs-badge {
      display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;
      padding: 3px 9px; border-radius: 999px;
    }
    .pgs-bottomnav {
      position: sticky; bottom: 0; z-index: 30;
      background: rgba(18,19,30,0.85); backdrop-filter: blur(16px) saturate(160%);
      border-top: 1px solid var(--border);
      box-shadow: 0 -8px 30px -12px rgba(0,0,0,0.7);
      display: flex; justify-content: space-around; padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      max-width: 430px; margin: 0 auto; width: 100%;
    }
    .pgs-navitem {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      color: var(--muted); font-size: 10px; font-weight: 600; background: none; border: none;
      padding: 6px 10px; border-radius: 10px; cursor: pointer; transition: color .15s ease;
    }
    .pgs-navitem.active { color: var(--yellow); text-shadow: 0 0 14px rgba(255,203,5,0.5); }
    .pgs-overlay {
      position: fixed; inset: 0; background: rgba(6,7,11,0.72); backdrop-filter: blur(2px); z-index: 50;
      display: flex; align-items: flex-end; justify-content: center;
    }
    .pgs-sheet {
      background: linear-gradient(180deg, #14151f 0%, var(--bg) 100%); width: 100%; max-width: 430px; border-radius: 22px 22px 0 0;
      max-height: 88vh; overflow-y: auto; padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
      border: 1px solid var(--border); border-bottom: none;
      box-shadow: 0 -20px 60px -20px rgba(0,0,0,0.8);
      animation: pgs-up .22s ease;
    }
    @keyframes pgs-up { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .pgs-sectiontitle {
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);
      font-weight: 700; margin: 18px 0 8px 2px;
    }
    .pgs-empty {
      text-align: center; padding: 36px 12px; color: var(--muted); font-size: 13px;
    }
    .pgs-row { display: flex; align-items: center; justify-content: space-between; }
    .pgs-chip {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 999px;
      padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer;
      transition: all .15s ease;
    }
    .pgs-chip:hover { border-color: rgba(255,203,5,0.35); }
    .pgs-chip.active {
      background: linear-gradient(135deg, #ffe066, var(--yellow));
      color: #14151f; border-color: var(--yellow);
      box-shadow: 0 4px 14px -4px rgba(255,203,5,0.6);
    }
    .pgs-toast {
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: rgba(30,32,51,0.95); backdrop-filter: blur(8px); border: 1px solid var(--border); color: var(--text);
      padding: 10px 18px; border-radius: 999px; font-size: 13px; z-index: 80; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .pgs-strike { text-decoration: line-through; opacity: 0.55; }
    .pgs-iconbtn {
      background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
      padding: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: border-color .15s ease;
    }
    .pgs-iconbtn:hover { border-color: rgba(255,203,5,0.4); }
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
