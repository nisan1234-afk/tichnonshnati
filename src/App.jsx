import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const CATEGORIES = {
  chag:    { label: "חג / צום",       color: "#e74c3c", bg: "#fdecea" },
  social:  { label: "פעילות חברתית",  color: "#8e44ad", bg: "#f3e5f5" },
  trip:    { label: "טיול / סיור",    color: "#27ae60", bg: "#e8f5e9" },
  parents: { label: "הורים / תעודות", color: "#2980b9", bg: "#e3f2fd" },
  staff:   { label: "צוות / מנהלים", color: "#d35400", bg: "#fff3e0" },
  sports:  { label: "ספורט",         color: "#16a085", bg: "#e0f2f1" },
  vol:     { label: "התנדבות",        color: "#7f8c8d", bg: "#f5f5f5" },
  bg:      { label: "בגרויות",        color: "#6c3483", bg: "#f3e5f5" },
  ruach:   { label: "רוח הגולן",      color: "#1a6b3a", bg: "#e8f5e9" },
  gen:     { label: "כללי",           color: "#34495e", bg: "#ecf0f1" },
};

// יומני Google Calendar שהאירועים מסונכרנים אליהם אוטומטית (ראה CALENDAR_IDS ב-Code.gs)
const CALENDAR_LINKS = [
  { key: "main",         label: "יומן ראשי" },
  { key: "staff",        label: "יומן צוות" },
  { key: "parents",      label: "יומן הורים" },
  { key: "transport",    label: "יומן הסעות" },
  { key: "food",         label: "יומן אוכל" },
  { key: "tripApproval", label: "יומן אישורי טיולים" },
];
const CALENDAR_IDS = {
  main:         "aaace518400d94ae71ee916674de285dd5d02cf91ad0ac710c6d13b4276f32f8@group.calendar.google.com",
  staff:        "e898cee8224987a291f2b48e43c40d205e1642fe12779504dc12bc0180af7a94@group.calendar.google.com",
  parents:      "dfea5fe2f9eb41c51ee7ad5eac53376fa70e908d169900cd8c4e214449f2e094@group.calendar.google.com",
  transport:    "1d9630d30833e8756f6049faa6075ea91a2d7a4f6810dcf14570dba2703d1ad9@group.calendar.google.com",
  food:         "1df8477260b043241f4c1dfe91cca1e4c9aa27ffb1f5809f9ef8825aac703ca7@group.calendar.google.com",
  tripApproval: "0e48c3a13df1256eb3df83b604d27710fd4ee7662d62c5b88a035307a211ee98@group.calendar.google.com",
};
function calendarSubscribeLink(calId) {
  return "https://calendar.google.com/calendar/u/0/r?cid=" + encodeURIComponent(calId);
}

const TARGET_OPTIONS = [
  "ט1","ט2","י1","י2","יא1","יא2","יב1","יב2",
  "צוות","מנהלים","מחנכים","כלל","חילוץ","ספורט",
];

const ROLE_OPTIONS = ["מחנך", "מנהל", "אחראי הסעות", "אחראי אוכל", "אחראי טיולים"];
const PERMISSION_OPTIONS = ["אדמין", "מורה", "צפייה"];

const TRIP_APPROVAL_OPTIONS = [
  { value: "", label: "לא נדרש" },
  { value: "ממתין", label: "⏳ ממתין לאישור" },
  { value: "אושר", label: "✅ אושר" },
  { value: "נדחה", label: "❌ נדחה" },
];

const TRANSPORT_OPTIONS = [
  { value: "", label: "לא נדרש" },
  { value: "נדרש", label: "נדרש" },
  { value: "פרטי", label: "רכב פרטי" },
];

const FOOD_OPTIONS = [
  { value: "", label: "לא נדרש" },
  { value: "כריכים", label: "כריכים" },
  { value: "ארוחה חמה", label: "ארוחה חמה" },
  { value: "הזמנה חיצונית", label: "הזמנה חיצונית" },
];

const MONTH_COLORS = {
  "09-2026": "#2c3e50", "10-2026": "#1a5276", "11-2026": "#1b4f72",
  "12-2026": "#1a3a4a", "01-2027": "#154360", "02-2027": "#4a235a",
  "03-2027": "#1d3a22", "04-2027": "#7b241c", "05-2027": "#1e6b40",
  "06-2027": "#1a5276",
};

const HEB_MONTHS = {
  7:"תשרי",8:"חשון",9:"כסלו",10:"טבת",11:"שבט",
  12:"אדר א׳",13:"אדר ב׳",1:"ניסן",2:"אייר",3:"סיון",
  4:"תמוז",5:"אב",6:"אלול"
};

const HEB_NUMS = ["","א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ז׳","ח׳","ט׳","י׳",
  "י״א","י״ב","י״ג","י״ד","ט״ו","ט״ז","י״ז","י״ח","י״ט","כ׳",
  "כ״א","כ״ב","כ״ג","כ״ד","כ״ה","כ״ו","כ״ז","כ״ח","כ״ט","ל׳"];

const MONTH_NAMES_GRE = {
  "09-2026":"ספטמבר 2026","10-2026":"אוקטובר 2026","11-2026":"נובמבר 2026",
  "12-2026":"דצמבר 2026","01-2027":"ינואר 2027","02-2027":"פברואר 2027",
  "03-2027":"מרץ 2027","04-2027":"אפריל 2027","05-2027":"מאי 2027",
  "06-2027":"יוני 2027",
};

// Hebrew calendar dates for 5787 (pre-computed anchor: Sep 12 2026 = 1 Tishri 5787)
// We'll compute on-the-fly with a JS implementation
function jewishDate(year, month, day) {
  // Zeller/Meeus algorithm simplified - using lookup table for 5787
  // Anchor: 1 Tishri 5787 = Sep 12 2026 = JD 2461301
  const JD_ANCHOR = 2461301; // Sep 12 2026
  const TISHRI1_5787 = JD_ANCHOR;

  // Month lengths for 5787 (שנה מעוברת שלמה = 385 days)
  const MONTH_LENGTHS_5787 = [0,30,29,29,30,29,30,30,29,30,29,30,29,29];
  // months: 1=Nisan..6=Elul, 7=Tishri..13=AdarII (leap)

  function jdFromGreg(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y/100);
    const B = 2 - A + Math.floor(A/4);
    return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524;
  }

  const jd = jdFromGreg(year, month, day);
  const daysSinceTishri = jd - TISHRI1_5787;

  if (daysSinceTishri < 0 || daysSinceTishri >= 385) {
    // ימים לפני תשרי תשפ"ז = אלול תשפ"ו
    // 1 תשרי תשפ"ו = 22 ספטמבר 2025 = JD 2460941
    const TISHRI1_5786 = 2460941;
    const d2 = jd - TISHRI1_5786;
    // אורכי חודשים לתשפ"ו (שנה כסדרה)
    const ml5786 = {7:30,8:29,9:30,10:29,11:30,12:29,1:30,2:29,3:30,4:29,5:30,6:29};
    const order5786 = [7,8,9,10,11,12,1,2,3,4,5,6];
    let rem = d2;
    for (const mn of order5786) {
      const ml = ml5786[mn];
      if (rem < ml) return { y: 5786, m: mn, d: rem+1, mn: HEB_MONTHS[mn] || "" };
      rem -= ml;
    }
    return { y: 5786, m: 6, d: 29, mn: "אלול" };
  }

  // Walk through 5787 months starting from Tishri (month 7)
  const ORDER = [7,8,9,10,11,12,13,1,2,3,4,5,6];
  let rem = daysSinceTishri;
  for (const mn of ORDER) {
    const len = MONTH_LENGTHS_5787[mn];
    if (rem < len) return { y: 5787, m: mn, d: rem+1, mn: HEB_MONTHS[mn] };
    rem -= len;
  }
  return { y: 5787, m: 6, d: rem+1, mn: "אלול" };
}


const MONTHS_ORDER = [
  "09-2026","10-2026","11-2026","12-2026",
  "01-2027","02-2027","03-2027","04-2027","05-2027","06-2027",
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getMonthKey(dateStr) {
  const [y,,m] = dateStr.split("-");
  // dateStr is YYYY-MM-DD
  const parts = dateStr.split("-");
  return `${parts[1]}-${parts[0]}`;
}

function getDaysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function getFirstWeekday(y, m) {
  // Returns 0=Sun,1=Mon,...,6=Sat
  const d = new Date(y, m - 1, 1);
  return d.getDay();
}

function padTwo(n) { return String(n).padStart(2,"0"); }

function formatDateKey(y, m, d) {
  return `${y}-${padTwo(m)}-${padTwo(d)}`;
}

function parseMonthKey(mk) {
  const [m, y] = mk.split("-");
  return { y: parseInt(y), m: parseInt(m) };
}

function generateUniqueId() {
  return "u" + Date.now() + Math.random().toString(36).slice(2, 7);
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────

// ── API Configuration ──────────────────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbzfMzOr5Ks2WCcdSLrtlTSfUREq8ZrHWRnyOlO2k9SMTq6ASnVpz0slzOkZR7fxTfBT/exec";
const SITE_URL = "https://nisan1234-afk.github.io/tichnonshnati/";
const GOOGLE_CLIENT_ID = "1019791950162-hv5jhr1omsjsstmbnenf9mdr6kdila54.apps.googleusercontent.com";

// ── API Functions ───────────────────────────────────────────────
async function loadEvents() {
  try {
    const res = await fetch(API_URL + "?action=getEvents");
    const data = await res.json();
    if (data.success) {
      // המר מפורמט Sheets לפורמט האתר
      return data.events.map(ev => ({
        id: String(ev["id"]),
        date: ev["תאריך"],
        title: ev["כותרת"],
        cat: ev["קטגוריה"] || "gen",
        target: ev["קהל יעד"] || "",
        note: ev["הערה פנימית"] || "",
        parentNote: ev["הערה להורים"] || "",
        leader: ev["מוביל"] || "",
        status: ev["סטטוס"] || "פעיל",
        timeStart: ev["שעת התחלה"] || "",
        timeEnd: ev["שעת סיום"] || "",
        participants: ev["מספר משתתפים"] || "",
        transport: ev["הסעות"] || "",
        transportNote: ev["פרטי הסעה"] || "",
        food: ev["אוכל"] || "",
        foodNote: ev["פרטי אוכל"] || "",
        specialRequests: ev["בקשות מיוחדות"] || "",
        tripApproval: ev["אישור טיול"] || "",
        driveLink: ev["קישור דרייב"] || "",
      }));
    }
  } catch(e) {
    console.error("שגיאה בטעינת אירועים:", e);
  }
  return null;
}

async function loadParentsView() {
  try {
    const res = await fetch(API_URL + "?action=getParentsView");
    const data = await res.json();
    if (data.success) return data.events;
  } catch(e) {
    console.error("שגיאה בטעינת לוח הורים:", e);
  }
  return [];
}

// רשימת אנשי קשר לצוות עם טלפון — לתצוגת הורים בלבד (בלי מייל/טוקן אישי)
async function loadStaffDirectory() {
  try {
    const res = await fetch(API_URL + "?action=getStaffDirectory");
    const data = await res.json();
    if (data.success) return data.team;
  } catch(e) {
    console.error("שגיאה בטעינת אנשי קשר:", e);
  }
  return [];
}

// גרסה בטוחה (שם/תפקיד/מקצועות בלבד) — פתוחה לכולם, לתפריט "מוביל" בטופס האירוע
async function loadTeam() {
  try {
    const res = await fetch(API_URL + "?action=getTeam");
    const data = await res.json();
    if (data.success) return data.team;
  } catch(e) {
    console.error("שגיאה בטעינת צוות:", e);
  }
  return [];
}

// גרסה מלאה (טלפון/מייל/טוקן אישי) — מוגנת בהתחברות גוגל של אדמין, לפאנל ניהול צוות
async function loadTeamFull(credential) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getTeamFull", credential }),
    });
    const data = await res.json();
    if (data.success) return data.team;
  } catch(e) {
    console.error("שגיאה בטעינת צוות:", e);
  }
  return [];
}

// כניסה לאתר הראשי — מזהה את המשתמש לפי חשבון הגוגל שלו מול לשונית "צוות"
async function apiVerifyLogin(credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "verifyLogin", credential }),
  });
  return await res.json();
}

async function saveEvents() {
  // לא שומרים מקומית — הכל ב-Sheets
}

function eventPayload(data) {
  return {
    "תאריך": data.date,
    "כותרת": data.title,
    "קטגוריה": data.cat,
    "קהל יעד": data.target || "",
    "מוביל": data.leader || "",
    "הערה פנימית": data.note || "",
    "הערה להורים": data.parentNote || "",
    "שעת התחלה": data.timeStart || "",
    "שעת סיום": data.timeEnd || "",
    "מספר משתתפים": data.participants || "",
    "הסעות": data.transport || "",
    "פרטי הסעה": data.transportNote || "",
    "אוכל": data.food || "",
    "פרטי אוכל": data.foodNote || "",
    "בקשות מיוחדות": data.specialRequests || "",
    "אישור טיול": data.tripApproval || "",
  };
}

async function apiAddEvent(data, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "addEvent",
      credential,
      data: { ...eventPayload(data), "סטטוס": "פעיל" },
    })
  });
  return await res.json();
}

async function apiUpdateEvent(id, data, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updateEvent",
      credential,
      id: id,
      data: eventPayload(data),
    })
  });
  return await res.json();
}

async function apiDeleteEvent(id, reason, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "requestDelete",
      credential,
      id: id,
      reason: reason || "",
    })
  });
  return await res.json();
}

async function loadAlerts() {
  try {
    const res = await fetch(API_URL + "?action=getAlerts");
    const data = await res.json();
    if (data.success) return data.alerts;
  } catch(e) {
    console.error("שגיאה בטעינת בקשות ממתינות:", e);
  }
  return [];
}

async function apiApproveDelete(id, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "approveDelete", credential, id }),
  });
  return await res.json();
}

async function apiRejectDelete(id, reason, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "rejectDelete", credential, id, reason: reason || "" }),
  });
  return await res.json();
}

// עדכון סטטוס משימה אישית (מאומת מול הטוקן האישי, לא מול ההתחברות עם גוגל)
async function apiReportTaskStatus(token, id, status, notes) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "reportTaskStatus", token, id, status, notes }),
  });
  return await res.json();
}

function teamMemberPayload(data) {
  return {
    "שם מלא": data.name || "",
    "תפקיד": data.role || "",
    "מקצועות": data.subjects || "",
    "טלפון": data.phone || "",
    "מייל": data.email || "",
    "הרשאה": data.permission || "מורה",
    "סטטוס": data.status || "פעיל",
  };
}

async function apiAddTeamMember(data, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "addTeamMember",
      credential,
      data: teamMemberPayload(data),
    })
  });
  return await res.json();
}

async function apiUpdateTeamMember(originalName, data, credential) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updateTeamMember",
      credential,
      originalName: originalName,
      data: teamMemberPayload(data),
    })
  });
  return await res.json();
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Tag({ cat, small }) {
  const c = CATEGORIES[cat];
  if (!c) return null;
  return (
    <span style={{
      display:"inline-block", padding: small ? "1px 6px" : "2px 8px",
      borderRadius: 12, background: c.color, color:"#fff",
      fontSize: small ? 10 : 11, fontWeight: 600, whiteSpace:"nowrap",
      lineHeight: 1.4,
    }}>{c.label}</span>
  );
}

function EventDot({ cat }) {
  const c = CATEGORIES[cat];
  return (
    <div style={{
      width: 7, height: 7, borderRadius:"50%",
      background: c?.color || "#999", flexShrink: 0, marginTop: 2,
    }} />
  );
}

// שדה קישור לקריאה בלבד + כפתור העתקה — בכוונה בלי onClick שמפעיל select() על ה-input,
// כי זה גורם לזום אוטומטי/תפריט בחירה מובנה בחלק מהדפדפנים הניידים.
function CopyLinkField({ value, style }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{display:"flex", gap:8, alignItems:"center", ...style}}>
      <input readOnly value={value} tabIndex={-1}
        style={{...inputStyle, direction:"ltr", fontSize:16, flex:1}} />
      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); } catch (e) {}
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        style={{
          padding:"7px 14px", borderRadius:8, border:"1.5px solid #e5e7eb",
          background: copied ? "#27ae60" : "#fff", color: copied ? "#fff" : "#333",
          fontWeight:700, fontSize:12, cursor:"pointer", whiteSpace:"nowrap",
          fontFamily:"inherit", flexShrink:0,
        }}>
        {copied ? "✓ הועתק" : "📋 העתק"}
      </button>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, padding:16,
    }} onClick={onClose}>
      <div style={{
        background:"#fff", borderRadius:16, padding:28, maxWidth:480,
        width:"100%", maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",
      }} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── helpers for form ──
function Field({ label, children, required }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{display:"block", fontSize:12, fontWeight:600, color:"#555", marginBottom:4}}>
        {label}{required && <span style={{color:"#e74c3c"}}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width:"100%", padding:"7px 10px", border:"1.5px solid #e0e0e0",
  borderRadius:7, fontSize:13, direction:"rtl", outline:"none",
  boxSizing:"border-box", fontFamily:"inherit", background:"#fff",
};

const selectStyle = {
  ...inputStyle, cursor:"pointer",
};

function Section({ title, color, children }) {
  return (
    <div style={{marginBottom:16}}>
      <div style={{
        fontSize:11, fontWeight:700, color: color||"#555",
        textTransform:"uppercase", letterSpacing:1,
        borderBottom:`2px solid ${color||"#eee"}`,
        paddingBottom:4, marginBottom:10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function parseTargetList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return raw.split(",").map(s=>s.trim()).filter(Boolean);
}

function EventForm({ initial, onSave, onCancel, onDelete, staffList }) {
  const [form, setForm] = useState(() => {
    const base = initial || {
      title:"", date:"", cat:"gen", target:"", targetCustom:"",
      leader:"", participants:"", timeStart:"", timeEnd:"",
      transport:"", transportNote:"", food:"", foodNote:"",
      specialRequests:"", tripApproval:"", note:"", parentNote:"",
    };
    const targetList = parseTargetList(base.target);
    const known = targetList.filter(t => TARGET_OPTIONS.includes(t));
    const custom = targetList.filter(t => !TARGET_OPTIONS.includes(t));
    return { ...base, target: known, targetCustom: base.targetCustom || custom.join(", ") };
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleTarget = (opt) => {
    setForm(f => ({
      ...f,
      target: f.target.includes(opt) ? f.target.filter(t=>t!==opt) : [...f.target, opt],
    }));
  };
  const buildTargetString = () => {
    const customParts = (form.targetCustom||"").split(",").map(s=>s.trim()).filter(Boolean);
    return [...form.target, ...customParts].join(", ");
  };
  const valid = form.title.trim() && form.date;

  const isPendingDelete = initial?.status === "ממתין למחיקה";

  return (
    <div style={{direction:"rtl", fontFamily:"inherit", maxHeight:"80vh", overflowY:"auto"}}>
      <div style={{fontWeight:800, fontSize:15, marginBottom:16, color:"#1a1a2e",
        position:"sticky", top:0, background:"#fff", paddingBottom:8,
        borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span>{initial?.id ? "עריכת אירוע" : "הוספת אירוע חדש"}</span>
        {isPendingDelete && (
          <span style={{fontSize:11, background:"#fff3e0", color:"#e65100",
            padding:"2px 8px", borderRadius:10, fontWeight:600}}>⏳ ממתין למחיקה</span>
        )}
      </div>

      {/* ── בסיסי ── */}
      <Section title="פרטי האירוע" color="#1a1a2e">
        <Field label="שם האירוע" required>
          <input value={form.title} onChange={e=>set("title",e.target.value)}
            style={inputStyle} placeholder="שם האירוע..." />
        </Field>
        <Field label="תאריך" required>
          <input type="date" value={form.date} onChange={e=>set("date",e.target.value)}
            min="2026-09-01" max="2027-06-30"
            style={{...inputStyle, direction:"ltr"}} />
        </Field>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          <Field label="שעת התחלה">
            <input type="time" value={form.timeStart||""} onChange={e=>set("timeStart",e.target.value)}
              style={{...inputStyle, direction:"ltr"}} />
          </Field>
          <Field label="שעת סיום">
            <input type="time" value={form.timeEnd||""} onChange={e=>set("timeEnd",e.target.value)}
              style={{...inputStyle, direction:"ltr"}} />
          </Field>
        </div>
        <Field label="קטגוריה">
          <select value={form.cat} onChange={e=>set("cat",e.target.value)} style={selectStyle}>
            {Object.entries(CATEGORIES).map(([k,v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        {initial && (
          <Field label="תיקיית דרייב">
            {initial.driveLink ? (
              <a href={initial.driveLink} target="_blank" rel="noopener noreferrer"
                style={{fontSize:13, color:"#2980b9", fontWeight:600}}>
                📁 פתח תיקייה בדרייב
              </a>
            ) : (
              <span style={{fontSize:12, color:"#999"}}>התיקייה תיווצר אוטומטית בשמירה הבאה</span>
            )}
          </Field>
        )}
      </Section>

      {/* ── קהל יעד ומוביל ── */}
      <Section title="קהל ואחריות" color="#2980b9">
        <Field label="קהל יעד">
          <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
            {TARGET_OPTIONS.map(opt => {
              const active = form.target.includes(opt);
              return (
                <button type="button" key={opt} onClick={()=>toggleTarget(opt)} style={{
                  padding:"4px 10px", borderRadius:20,
                  border:`1.5px solid ${active ? "#2980b9" : "#e5e7eb"}`,
                  background: active ? "#2980b9" : "#fff",
                  color: active ? "#fff" : "#555",
                  fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                }}>{opt}</button>
              );
            })}
          </div>
          <input value={form.targetCustom||""} onChange={e=>set("targetCustom",e.target.value)}
            style={{...inputStyle, marginTop:6}} placeholder="קהל יעד נוסף (חופשי, אפשר כמה מופרדים בפסיק)..." />
        </Field>
        <Field label="מספר משתתפים">
          <input type="number" value={form.participants||""} onChange={e=>set("participants",e.target.value)}
            style={inputStyle} placeholder="0" min="0" />
        </Field>
        <Field label="מוביל / אחראי">
          <select value={form.leader||""} onChange={e=>set("leader",e.target.value)} style={selectStyle}>
            <option value="">-- בחר --</option>
            {(staffList||[]).map(s => <option key={s} value={s}>{s}</option>)}
            <option value="__custom__">אחר</option>
          </select>
          {form.leader === "__custom__" && (
            <input value={form.leaderCustom||""} onChange={e=>set("leaderCustom",e.target.value)}
              style={{...inputStyle, marginTop:6}} placeholder="שם המוביל..." />
          )}
        </Field>
      </Section>

      {/* ── לוגיסטיקה ── */}
      <Section title="לוגיסטיקה" color="#d35400">
        <Field label="הסעות">
          <select value={form.transport||""} onChange={e=>set("transport",e.target.value)} style={selectStyle}>
            {TRANSPORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={form.transportNote||""} onChange={e=>set("transportNote",e.target.value)}
            style={{...inputStyle, marginTop:6}} placeholder="פרטי הסעה (חופשי)..." />
        </Field>
        <Field label="אוכל">
          <select value={form.food||""} onChange={e=>set("food",e.target.value)} style={selectStyle}>
            {FOOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={form.foodNote||""} onChange={e=>set("foodNote",e.target.value)}
            style={{...inputStyle, marginTop:6}} placeholder="פרטי אוכל (חופשי)..." />
        </Field>
        <Field label="בקשות מיוחדות">
          <textarea value={form.specialRequests||""} onChange={e=>set("specialRequests",e.target.value)}
            rows={2} style={{...inputStyle, resize:"vertical"}} placeholder="ציוד מיוחד, נגישות, אחר..." />
        </Field>
      </Section>

      {/* ── אישורים ── */}
      <Section title="אישורים" color="#27ae60">
        <Field label="אישור טיול">
          <select value={form.tripApproval||""} onChange={e=>set("tripApproval",e.target.value)} style={selectStyle}>
            {TRIP_APPROVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </Section>

      {/* ── הערות ── */}
      <Section title="הערות" color="#7f8c8d">
        <Field label="הערה פנימית">
          <textarea value={form.note||""} onChange={e=>set("note",e.target.value)}
            rows={2} style={{...inputStyle, resize:"vertical"}} />
        </Field>
        <Field label="הערה להורים (מוצגת בלוח ההורים הציבורי)">
          <textarea value={form.parentNote||""} onChange={e=>set("parentNote",e.target.value)}
            rows={2} style={{...inputStyle, resize:"vertical"}}
            placeholder="טקסט שההורים יראו על האירוע הזה (רשות)..." />
        </Field>
      </Section>

      {/* ── כפתורים ── */}
      <div style={{display:"flex", gap:8, justifyContent:"flex-end",
        marginTop:8, flexWrap:"wrap", position:"sticky", bottom:0,
        background:"#fff", paddingTop:8, borderTop:"1px solid #eee"}}>
        {initial && onDelete && (
          <button onClick={()=>onDelete(initial.id)}
            style={{padding:"8px 16px", borderRadius:8, border:"none",
              background:"#fdecea", color:"#c0392b", fontWeight:600, cursor:"pointer", fontSize:13}}>
            {isPendingDelete ? "בטל בקשת מחיקה" : "בקש מחיקה"}
          </button>
        )}
        <button onClick={onCancel}
          style={{padding:"8px 16px", borderRadius:8, border:"1.5px solid #ddd",
            background:"#fff", color:"#555", fontWeight:600, cursor:"pointer", fontSize:13}}>
          ביטול
        </button>
        <button onClick={()=>valid && onSave({...form, target: buildTargetString()})} disabled={!valid}
          style={{padding:"8px 20px", borderRadius:8, border:"none",
            background: valid ? "#2c3e50" : "#ccc", color:"#fff",
            fontWeight:700, cursor: valid ? "pointer":"default", fontSize:13}}>
          שמור
        </button>
      </div>
    </div>
  );
}

// ─── לוח בקרה — בקשות מחיקה ממתינות ──────────────────────────────────────────

function ControlPanel({ alerts, onApprove, onReject, onClose }) {
  return (
    <div style={{direction:"rtl", fontFamily:"inherit", maxHeight:"80vh", overflowY:"auto"}}>
      <div style={{fontWeight:800, fontSize:15, marginBottom:16, color:"#1a1a2e",
        position:"sticky", top:0, background:"#fff", paddingBottom:8,
        borderBottom:"1px solid #eee"}}>
        🔔 בקשות מחיקה ממתינות לאישור
      </div>

      {alerts.length === 0 ? (
        <div style={{textAlign:"center", padding:"30px 10px", color:"#aaa", fontSize:13}}>
          אין בקשות ממתינות כרגע ✅
        </div>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              border:"1.5px solid #f0f0f0", borderRadius:10, padding:"10px 12px",
              background:"#fafafa",
            }}>
              <div style={{fontWeight:700, fontSize:13, color:"#1a1a2e", marginBottom:4}}>
                {a["כותרת אירוע"]}
              </div>
              <div style={{fontSize:11, color:"#888", marginBottom:8}}>
                מבקש: {a["מבקש"]} · {a["תאריך"]}
                {a["סיבה"] && <> · סיבה: {a["סיבה"]}</>}
              </div>
              <div style={{display:"flex", gap:8}}>
                <button onClick={()=>onApprove(a["מזהה אירוע"])}
                  style={{flex:1, padding:"6px 10px", borderRadius:8, border:"none",
                    background:"#27ae60", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12}}>
                  ✅ אשר מחיקה
                </button>
                <button onClick={()=>onReject(a["מזהה אירוע"])}
                  style={{flex:1, padding:"6px 10px", borderRadius:8, border:"none",
                    background:"#fdecea", color:"#c0392b", fontWeight:700, cursor:"pointer", fontSize:12}}>
                  ❌ דחה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex", justifyContent:"flex-end", marginTop:16,
        position:"sticky", bottom:0, background:"#fff", paddingTop:8, borderTop:"1px solid #eee"}}>
        <button onClick={onClose}
          style={{padding:"8px 16px", borderRadius:8, border:"1.5px solid #ddd",
            background:"#fff", color:"#555", fontWeight:600, cursor:"pointer", fontSize:13}}>
          סגור
        </button>
      </div>
    </div>
  );
}

// ─── רשימת צוות חיה ──────────────────────────────────────────────────────────

function TeamPanel({ team, onClose, onAdd, onEdit }) {
  const active = team.filter(t => String(t["סטטוס"] || "").trim() !== "לא פעיל");

  return (
    <div style={{direction:"rtl", fontFamily:"inherit", maxHeight:"80vh", overflowY:"auto"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center",
        fontWeight:800, fontSize:15, marginBottom:16, color:"#1a1a2e",
        position:"sticky", top:0, background:"#fff", paddingBottom:8,
        borderBottom:"1px solid #eee"}}>
        <span>👥 צוות ({active.length})</span>
        <button onClick={onAdd}
          style={{padding:"5px 12px", borderRadius:16, border:"none",
            background:"#2c3e50", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12}}>
          ＋ הוסף איש צוות
        </button>
      </div>

      {active.length === 0 ? (
        <div style={{textAlign:"center", padding:"30px 10px", color:"#aaa", fontSize:13}}>
          עדיין אין אנשי צוות רשומים
        </div>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {active.map((t, i) => (
            <div key={i} onClick={()=>onEdit(t)} style={{
              border:"1.5px solid #f0f0f0", borderRadius:10, padding:"8px 12px",
              background:"#fafafa", display:"flex", justifyContent:"space-between",
              alignItems:"center", gap:8, flexWrap:"wrap", cursor:"pointer",
            }}>
              <div>
                <div style={{fontWeight:700, fontSize:13, color:"#1a1a2e"}}>
                  {t["שם מלא"]}
                  {t["הרשאה"] === "אדמין" && (
                    <span style={{marginRight:6, fontSize:10, background:"#2c3e50", color:"#fff",
                      padding:"1px 6px", borderRadius:10, fontWeight:600}}>אדמין</span>
                  )}
                </div>
                <div style={{fontSize:11, color:"#888", marginTop:2}}>
                  {t["תפקיד"] && <>{t["תפקיד"]} · </>}
                  {t["טלפון"] && <>{t["טלפון"]} · </>}
                  {t["מייל"]}
                </div>
              </div>
              <span style={{fontSize:11, color:"#2980b9", fontWeight:600}}>עריכה ✎</span>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex", justifyContent:"flex-end", marginTop:16,
        position:"sticky", bottom:0, background:"#fff", paddingTop:8, borderTop:"1px solid #eee"}}>
        <button onClick={onClose}
          style={{padding:"8px 16px", borderRadius:8, border:"1.5px solid #ddd",
            background:"#fff", color:"#555", fontWeight:600, cursor:"pointer", fontSize:13}}>
          סגור
        </button>
      </div>
    </div>
  );
}

// ─── הוספת איש צוות ──────────────────────────────────────────────────────────

function TeamMemberForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    if (!initial) {
      return { name:"", roles:[], rolesCustom:"", subjects:"", phone:"", email:"", permission:"מורה", status:"פעיל" };
    }
    const roleList = String(initial["תפקיד"]||"").split(",").map(s=>s.trim()).filter(Boolean);
    const known = roleList.filter(r => ROLE_OPTIONS.includes(r));
    const custom = roleList.filter(r => !ROLE_OPTIONS.includes(r));
    return {
      name: initial["שם מלא"] || "",
      roles: known,
      rolesCustom: custom.join(", "),
      subjects: initial["מקצועות"] || "",
      phone: String(initial["טלפון"] ?? ""),
      email: initial["מייל"] || "",
      permission: initial["הרשאה"] || "מורה",
      status: initial["סטטוס"] || "פעיל",
    };
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleRole = (opt) => {
    setForm(f => ({...f, roles: f.roles.includes(opt) ? f.roles.filter(r=>r!==opt) : [...f.roles, opt]}));
  };
  const buildRolesString = () => {
    const customParts = (form.rolesCustom||"").split(",").map(s=>s.trim()).filter(Boolean);
    return [...form.roles, ...customParts].join(", ");
  };
  const valid = form.name.trim();

  return (
    <div style={{direction:"rtl", fontFamily:"inherit", maxHeight:"80vh", overflowY:"auto"}}>
      <div style={{fontWeight:800, fontSize:15, marginBottom:16, color:"#1a1a2e",
        position:"sticky", top:0, background:"#fff", paddingBottom:8, borderBottom:"1px solid #eee"}}>
        {initial ? "עריכת איש צוות" : "הוספת איש צוות"}
      </div>

      {initial && initial["טוקן אישי"] && (
        <div style={{marginBottom:14, padding:"8px 10px", background:"#f0f6ff", borderRadius:8, fontSize:11}}>
          <div style={{fontWeight:600, color:"#555", marginBottom:3}}>קישור אישי לדשבורד (לשליחה ל{form.name}):</div>
          <CopyLinkField value={SITE_URL + "?staff=" + initial["טוקן אישי"]} />
        </div>
      )}

      <Field label="שם מלא" required>
        <input value={form.name} onChange={e=>set("name",e.target.value)}
          style={inputStyle} placeholder="שם מלא..." />
      </Field>

      <Field label="תפקיד">
        <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
          {ROLE_OPTIONS.map(opt => {
            const active = form.roles.includes(opt);
            return (
              <button type="button" key={opt} onClick={()=>toggleRole(opt)} style={{
                padding:"4px 10px", borderRadius:20,
                border:`1.5px solid ${active ? "#2980b9" : "#e5e7eb"}`,
                background: active ? "#2980b9" : "#fff",
                color: active ? "#fff" : "#555",
                fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
              }}>{opt}</button>
            );
          })}
        </div>
        <input value={form.rolesCustom} onChange={e=>set("rolesCustom",e.target.value)}
          style={{...inputStyle, marginTop:6}} placeholder="תפקיד נוסף (חופשי, אפשר כמה מופרדים בפסיק)..." />
      </Field>

      <Field label="מקצועות">
        <input value={form.subjects} onChange={e=>set("subjects",e.target.value)}
          style={inputStyle} placeholder="למשל: גמרא, תנ״ך (מופרד בפסיק אם כמה)" />
      </Field>

      <Field label="טלפון">
        <input value={form.phone} onChange={e=>set("phone",e.target.value)}
          style={{...inputStyle, direction:"ltr"}} placeholder="050-1234567" />
      </Field>

      <Field label="מייל">
        <input type="email" value={form.email} onChange={e=>set("email",e.target.value)}
          style={{...inputStyle, direction:"ltr"}} placeholder="name@example.com" />
      </Field>

      <Field label="הרשאה">
        <select value={form.permission} onChange={e=>set("permission",e.target.value)} style={selectStyle}>
          {PERMISSION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>

      <Field label="סטטוס">
        <select value={form.status} onChange={e=>set("status",e.target.value)} style={selectStyle}>
          <option value="פעיל">פעיל</option>
          <option value="לא פעיל">לא פעיל</option>
        </select>
      </Field>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:8,
        position:"sticky", bottom:0, background:"#fff", paddingTop:8, borderTop:"1px solid #eee"}}>
        <button onClick={onCancel}
          style={{padding:"8px 16px", borderRadius:8, border:"1.5px solid #ddd",
            background:"#fff", color:"#555", fontWeight:600, cursor:"pointer", fontSize:13}}>
          ביטול
        </button>
        <button onClick={()=>valid && onSave({
          name: form.name,
          role: buildRolesString(),
          subjects: form.subjects,
          phone: form.phone,
          email: form.email,
          permission: form.permission,
          status: form.status,
        }, initial ? initial["שם מלא"] : null)} disabled={!valid}
          style={{padding:"8px 20px", borderRadius:8, border:"none",
            background: valid ? "#2c3e50" : "#ccc", color:"#fff",
            fontWeight:700, cursor: valid ? "pointer":"default", fontSize:13}}>
          שמור
        </button>
      </div>
    </div>
  );
}

// ─── CALENDAR MONTH VIEW ─────────────────────────────────────────────────────

function CalendarMonth({ mk, events, onDayClick, onEventClick, selectedCats }) {
  const { y, m } = parseMonthKey(mk);
  const totalDays = getDaysInMonth(y, m);
  const firstWd = getFirstWeekday(y, m); // 0=Sun
  const color = MONTH_HEADER_COLORS_JS[mk] || "#2c3e50";
  const monthName = MONTH_NAMES_GRE[mk] || mk;

  // Build grid cells
  const cells = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Index events by day
  const byDay = {};
  events.forEach(ev => {
    const parts = ev.date.split("-");
    const emk = `${parts[1]}-${parts[0]}`;
    if (emk !== mk) return;
    const d = parseInt(parts[2]);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ev);
  });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const headerDays = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];

  return (
    <div style={{
      borderRadius:12, overflow:"hidden",
      border:"1px solid #e5e7eb", marginBottom:20,
      boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
    }}>
      {/* Month header */}
      <div style={{
        background: color, color:"#fff", padding:"10px 16px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
      }}>
        <span style={{fontSize:15, fontWeight:800}}>{monthName}</span>
        <span style={{fontSize:11, opacity:0.75}}>
          {(() => {
            const heb1 = jewishDate(y, m, 1);
            const hebLast = jewishDate(y, m, totalDays);
            if (heb1.mn === hebLast.mn) return `${heb1.mn} תשפ"ז`;
            return `${heb1.mn} – ${hebLast.mn} תשפ"ז`;
          })()}
        </span>
      </div>

      {/* Day headers */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#f8f9fa"}}>
        {headerDays.map((d,i) => (
          <div key={i} style={{
            textAlign:"center", padding:"5px 2px", fontSize:11, fontWeight:700,
            color: i===6 ? "#c0392b" : i===5 ? "#b7770d" : "#555",
            borderLeft: i>0 ? "1px solid #e5e7eb" : "none",
            borderBottom:"2px solid #e5e7eb",
          }}>{d}</div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)"}}>
          {week.map((day, di) => {
            if (!day) return (
              <div key={di} style={{
                minHeight:70, background:"#fafafa",
                borderLeft: di>0 ? "1px solid #f0f0f0":"none",
                borderBottom:"1px solid #f0f0f0",
              }} />
            );
            const hd = jewishDate(y, m, day);
            const evs = (byDay[day] || []).filter(e =>
              selectedCats.length === 0 || selectedCats.includes(e.cat)
            );
            const isSat = di === 6;
            const isFri = di === 5;
            return (
              <div key={di}
                onClick={() => onDayClick(formatDateKey(y,m,day))}
                style={{
                  minHeight:70, padding:"3px 4px", cursor:"pointer",
                  borderLeft: di>0 ? "1px solid #f0f0f0":"none",
                  borderBottom:"1px solid #f0f0f0",
                  background: isSat ? "#fdf5f5" : isFri ? "#fffdf0" : "#fff",
                  transition:"background 0.15s",
                }}>
                {/* Date header */}
                <div style={{display:"flex", alignItems:"baseline", gap:3, marginBottom:2}}>
                  <span style={{
                    fontSize:10, fontWeight:700, color:"#1a1a2e", lineHeight:1,
                  }}>{HEB_NUMS[hd.d] || hd.d}</span>
                  {(hd.d === 1) && (
                    <span style={{fontSize:8, color:"#aaa", fontWeight:400}}>{hd.mn}</span>
                  )}
                  <span style={{
                    fontSize:9, color: isSat?"#c0392b": isFri?"#b7770d":"#bbb",
                    marginRight:"auto", direction:"ltr",
                  }}>{day}</span>
                </div>
                {/* Events */}
                <div style={{display:"flex", flexDirection:"column", gap:1}}>
                  {evs.slice(0,3).map(ev => (
                    <div key={ev.id}
                      onClick={e=>{e.stopPropagation(); onEventClick(ev);}}
                      style={{
                        display:"flex", alignItems:"flex-start", gap:3,
                        background: ev.status === "ממתין למחיקה" ? "#f5f5f5" : (CATEGORIES[ev.cat]?.bg || "#f0f0f0"),
                        borderRadius:4, padding:"1px 4px",
                        cursor:"pointer", border:`1px solid ${ev.status === "ממתין למחיקה" ? "#ccc" : (CATEGORIES[ev.cat]?.color+"22")}`,
                        opacity: ev.status === "ממתין למחיקה" ? 0.6 : 1,
                      }}>
                      <div style={{
                        width:5, height:5, borderRadius:"50%",
                        background: ev.status === "ממתין למחיקה" ? "#aaa" : (CATEGORIES[ev.cat]?.color||"#999"),
                        flexShrink:0, marginTop:3,
                      }}/>
                      <span style={{fontSize:9, lineHeight:1.4, color: ev.status === "ממתין למחיקה" ? "#aaa" : "#222", fontWeight:500,
                        textDecoration: ev.status === "ממתין למחיקה" ? "line-through" : "none"}}>
                        {ev.title}
                      </span>
                    </div>
                  ))}
                  {evs.length > 3 && (
                    <span style={{fontSize:8.5, color:"#888", paddingRight:2}}>
                      +{evs.length-3} עוד...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const MONTH_HEADER_COLORS_JS = MONTH_COLORS;

// ─── תצוגה שנתית — כל החודשים בגריד קומפקטי ─────────────────────────────────

function MiniMonth({ mk, events, onDayClick, onMonthClick }) {
  const { y, m } = parseMonthKey(mk);
  const totalDays = getDaysInMonth(y, m);
  const firstWd = getFirstWeekday(y, m);
  const color = MONTH_HEADER_COLORS_JS[mk] || "#2c3e50";
  const monthName = MONTH_NAMES_GRE[mk] || mk;

  const cells = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = {};
  events.forEach(ev => {
    const parts = ev.date.split("-");
    const emk = `${parts[1]}-${parts[0]}`;
    if (emk !== mk) return;
    const d = parseInt(parts[2]);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ev);
  });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const headerDays = ["א","ב","ג","ד","ה","ו","ש"];

  return (
    <div style={{borderRadius:10, overflow:"hidden", border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
      <div onClick={()=>onMonthClick(mk)} style={{
        background:color, color:"#fff", padding:"6px 8px", fontSize:12,
        fontWeight:800, cursor:"pointer", textAlign:"center",
      }}>
        {monthName}
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#f8f9fa"}}>
        {headerDays.map((d,i) => (
          <div key={i} style={{textAlign:"center", fontSize:8, color:"#999", padding:"2px 0"}}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)"}}>
          {week.map((day, di) => {
            if (!day) return <div key={di} style={{minHeight:24, background:"#fafafa"}} />;
            const evs = byDay[day] || [];
            const isSat = di === 6, isFri = di === 5;
            return (
              <div key={di} onClick={()=>onDayClick(formatDateKey(y,m,day))}
                style={{
                  minHeight:24, padding:"1px", cursor:"pointer", textAlign:"center",
                  background: isSat ? "#fdf5f5" : isFri ? "#fffdf0" : "#fff",
                  border:"0.5px solid #f5f5f5",
                }}>
                <div style={{fontSize:9, color: isSat?"#c0392b":isFri?"#b7770d":"#333", lineHeight:1.4}}>{day}</div>
                {evs.length > 0 && (
                  <div style={{display:"flex", justifyContent:"center", gap:1, flexWrap:"wrap"}}>
                    {evs.slice(0,3).map(ev => (
                      <div key={ev.id} style={{
                        width:4, height:4, borderRadius:"50%",
                        background: CATEGORIES[ev.cat]?.color || "#999",
                      }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── LIST VIEW ───────────────────────────────────────────────────────────────

function EventListItem({ ev, onClick }) {
  const c = CATEGORIES[ev.cat];
  const parts = ev.date.split("-");
  const dateObj = new Date(ev.date);
  const dayNames = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  const dayName = dayNames[dateObj.getDay()];
  const hd = jewishDate(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));

  return (
    <div onClick={()=>onClick(ev)} style={{
      display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px",
      borderBottom:"1px solid #f0f0f0", cursor:"pointer",
      transition:"background 0.15s",
    }}
    onMouseEnter={e=>e.currentTarget.style.background="#f8f9fa"}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{
        width:44, textAlign:"center", flexShrink:0,
        borderRadius:8, background: c?.bg || "#f0f0f0",
        padding:"4px 0", border:`1px solid ${c?.color}33`,
      }}>
        <div style={{fontSize:15, fontWeight:800, color: c?.color || "#333", lineHeight:1}}>
          {parts[2]}
        </div>
        <div style={{fontSize:9, color:"#888"}}>{parts[1]}/{parts[0].slice(2)}</div>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
          <span style={{fontWeight:700, fontSize:13, color:"#1a1a2e"}}>{ev.title}</span>
          <Tag cat={ev.cat} small />
        </div>
        <div style={{fontSize:11, color:"#888", marginTop:2, display:"flex", gap:8, flexWrap:"wrap"}}>
          <span>יום {dayName} · {HEB_NUMS[hd.d]} {hd.mn}</span>
          {ev.target && <span>· {ev.target}</span>}
          {ev.note && <span style={{fontStyle:"italic", color:"#aaa"}}>· {ev.note}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── דשבורד אישי לאחראים ─────────────────────────────────────────────────────

function TaskCard({ task, onSave }) {
  const [status, setStatus] = useState(task.status || "");
  const [notes, setNotes] = useState(task.notes || "");
  const [saved, setSaved] = useState(false);
  const dirty = status !== (task.status||"") || notes !== (task.notes||"");

  return (
    <div style={{border:"1.5px solid #eee", borderRadius:12, padding:16, marginBottom:12, background:"#fff"}}>
      <div style={{fontWeight:700, fontSize:14, color:"#1a1a2e"}}>{task.title}</div>
      <div style={{fontSize:12, color:"#888", margin:"4px 0 10px", display:"flex", flexDirection:"column", gap:2}}>
        <span>{task.date}{task.timeStart ? ` · שעה ${task.timeStart}${task.timeEnd ? "–"+task.timeEnd : ""}` : ""}</span>
        <span>{task.field}: {task.value}</span>
        {task.target && <span>קהל יעד: {task.target}</span>}
        {task.leader && <span>מוביל/אחראי: {task.leader}</span>}
        {task.participants && <span>מספר משתתפים: {task.participants}</span>}
        {task.specialRequests && <span>בקשות מיוחדות: {task.specialRequests}</span>}
      </div>
      <select value={status} onChange={e=>{setStatus(e.target.value); setSaved(false);}}
        style={{...selectStyle, marginBottom:8}}>
        <option value="">-- סמן סטטוס --</option>
        <option value="✅ בוצע">✅ בוצע</option>
        <option value="⏳ בתהליך">⏳ בתהליך</option>
        <option value="❌ לא בוצע">❌ לא בוצע</option>
      </select>
      <textarea value={notes} onChange={e=>{setNotes(e.target.value); setSaved(false);}}
        placeholder="הערות..." rows={2} style={{...inputStyle, marginBottom:8, resize:"vertical"}} />
      <button
        onClick={async ()=>{ await onSave(task.id, status, notes); setSaved(true); }}
        disabled={!dirty && saved}
        style={{padding:"7px 18px", borderRadius:8, border:"none",
          background: saved && !dirty ? "#27ae60" : "#2c3e50", color:"#fff",
          fontWeight:700, cursor:"pointer", fontSize:13}}>
        {saved && !dirty ? "✓ נשמר" : "שמור"}
      </button>
    </div>
  );
}

function MyTasksView({ token }) {
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(API_URL + "?action=getMyTasks&token=" + encodeURIComponent(token))
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setName(data.name);
          setTasks(data.tasks);
          setUpcoming(data.upcoming || []);
          setError("");
        } else {
          setError(data.error || "שגיאה");
        }
        setLoading(false);
      })
      .catch(() => { setError("שגיאה בטעינה"); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const updateTask = async (id, status, notes) => {
    await apiReportTaskStatus(token, id, status, notes);
    load();
  };

  const notDone = tasks.filter(t => t.status !== "✅ בוצע").length;

  return (
    <div style={{
      fontFamily: '"Heebo", "Noto Sans Hebrew", Arial, sans-serif',
      direction:"rtl", minHeight:"100vh", background:"#f4f6f9", color:"#1a1a2e",
    }}>
      <div style={{maxWidth:600, margin:"0 auto", padding:"24px 16px"}}>
        {loading ? (
          <div style={{textAlign:"center", padding:60, color:"#888"}}>טוען...</div>
        ) : error ? (
          <div style={{textAlign:"center", padding:60, color:"#c0392b", fontWeight:600}}>{error}</div>
        ) : (
          <>
            <div style={{fontSize:20, fontWeight:800, marginBottom:4}}>שלום {name} 👋</div>
            <div style={{fontSize:13, marginBottom:20, color: notDone > 0 ? "#c0392b" : "#27ae60", fontWeight:600}}>
              {notDone > 0
                ? `יש לך ${notDone} משימות שעדיין לא סומנו כבוצעו`
                : "כל המשימות שלך מטופלות! ✅"}
            </div>
            {tasks.length === 0 ? (
              <div style={{textAlign:"center", padding:"16px 0 32px", color:"#aaa"}}>אין לך משימות אחריות כרגע</div>
            ) : (
              tasks.map(t => <TaskCard key={t.id + "_" + t.field} task={t} onSave={updateTask} />)
            )}

            <div style={{fontSize:15, fontWeight:800, margin:"24px 0 10px"}}>
              📅 כל האירועים עד סוף השנה
            </div>
            {upcoming.length === 0 ? (
              <div style={{textAlign:"center", padding:24, color:"#aaa"}}>אין אירועים להצגה</div>
            ) : (
              <div style={{border:"1.5px solid #eee", borderRadius:12, overflow:"hidden", background:"#fff"}}>
                {upcoming.map((ev, i) => (
                  <div key={ev.id} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                  }}>
                    <EventDot cat={ev.cat} />
                    <span style={{fontSize:12, color:"#888", minWidth:70}}>{ev.date}</span>
                    <span style={{fontSize:13, fontWeight:600, flex:1}}>{ev.title}</span>
                    <Tag cat={ev.cat} small />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── תצוגת הורים — אותו לוח שנה שיש לצוות (בלי קטגוריית צוות), + אנשי קשר ────────
function ParentsView() {
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("calendar"); // "calendar" | "list" | "yearly"
  const [selectedCats, setSelectedCats] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showStaff, setShowStaff] = useState(false);
  const noop = useCallback(() => {}, []);

  useEffect(() => {
    Promise.all([loadParentsView(), loadStaffDirectory()]).then(([evs, team]) => {
      setEvents(evs);
      setStaff(team);
      setLoading(false);
    });
  }, []);

  const toggleCat = (cat) => {
    setSelectedCats(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat]);
  };

  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (selectedCats.length > 0 && !selectedCats.includes(ev.cat)) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (!ev.title.toLowerCase().includes(q) &&
            !(ev.target||"").toLowerCase().includes(q) &&
            !(ev.note||"").toLowerCase().includes(q)) return false;
      }
      if (selectedMonth !== "all") {
        const parts = ev.date.split("-");
        if (`${parts[1]}-${parts[0]}` !== selectedMonth) return false;
      }
      return true;
    }).sort((a,b) => a.date.localeCompare(b.date));
  }, [events, selectedCats, searchQ, selectedMonth]);

  const monthsToShow = selectedMonth === "all" ? MONTHS_ORDER : [selectedMonth];

  return (
    <div style={{
      fontFamily: '"Heebo", "Noto Sans Hebrew", Arial, sans-serif',
      direction:"rtl", minHeight:"100vh", background:"#f4f6f9", color:"#1a1a2e",
    }}>
      <div style={{
        background:"linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
        color:"#fff", padding:"20px 24px 16px", boxShadow:"0 4px 20px rgba(0,0,0,0.2)",
      }}>
        <div style={{maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10}}>
          <div style={{fontSize:20, fontWeight:800}}>
            📅 לוח שנה להורים — ישיבת אלוני הבשן
          </div>
          <button
            onClick={() => setShowStaff(s => !s)}
            style={{
              background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)",
              color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
              fontWeight:700, fontSize:13, fontFamily:"inherit",
            }}>
            👥 אנשי קשר בצוות
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100, margin:"0 auto", padding:"16px 16px"}}>

        {/* ── רשימת אנשי צוות ── */}
        {showStaff && (
          <div style={{
            background:"#fff", borderRadius:12, padding:16, marginBottom:16,
            boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
          }}>
            <div style={{fontSize:15, fontWeight:800, marginBottom:10}}>👥 אנשי קשר בצוות</div>
            {staff.length === 0 ? (
              <div style={{color:"#aaa", textAlign:"center", padding:16}}>אין נתונים להצגה</div>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10}}>
                {staff.map((p, i) => (
                  <div key={i} style={{border:"1px solid #eee", borderRadius:10, padding:"10px 12px"}}>
                    <div style={{fontWeight:700, fontSize:13}}>{p["שם מלא"]}</div>
                    <div style={{fontSize:12, color:"#888", marginTop:2}}>
                      {[p["תפקיד"], p["מקצועות"]].filter(Boolean).join(" · ")}
                    </div>
                    {p["טלפון"] && (
                      <div style={{fontSize:12, color:"#0f3460", marginTop:4, fontWeight:600}} dir="ltr">
                        {p["טלפון"]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{textAlign:"center", padding:60, color:"#888", background:"#fff", borderRadius:12}}>טוען...</div>
        ) : (
          <>
            {/* ── CONTROLS ── */}
            <div style={{
              background:"#fff", borderRadius:12, padding:"14px 16px",
              marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
              display:"flex", flexDirection:"column", gap:12,
            }}>
              <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
                <input
                  placeholder="🔍 חיפוש אירוע..."
                  value={searchQ}
                  onChange={e=>setSearchQ(e.target.value)}
                  style={{
                    flex:1, minWidth:160, padding:"7px 12px",
                    border:"1.5px solid #e5e7eb", borderRadius:8,
                    fontSize:13, outline:"none", direction:"rtl", fontFamily:"inherit",
                  }}
                />
                <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
                  style={{
                    padding:"7px 10px", border:"1.5px solid #e5e7eb",
                    borderRadius:8, fontSize:13, direction:"rtl", fontFamily:"inherit",
                    background:"#fff",
                  }}>
                  <option value="all">כל החודשים</option>
                  {MONTHS_ORDER.map(mk => (
                    <option key={mk} value={mk}>{MONTH_NAMES_GRE[mk]}</option>
                  ))}
                </select>
                <div style={{display:"flex", gap:0, border:"1.5px solid #e5e7eb", borderRadius:8, overflow:"hidden"}}>
                  {[["calendar","📅 לוח"],["list","📋 רשימה"],["yearly","🗓️ שנתי"]].map(([v,l]) => (
                    <button key={v} onClick={()=>setView(v)} style={{
                      padding:"7px 14px", border:"none", cursor:"pointer",
                      background: view===v ? "#1a1a2e" : "#fff",
                      color: view===v ? "#fff" : "#555",
                      fontSize:12, fontWeight:600, fontFamily:"inherit",
                    }}>{l}</button>
                  ))}
                </div>
                {(selectedCats.length > 0 || searchQ || selectedMonth !== "all") && (
                  <button onClick={()=>{setSelectedCats([]); setSearchQ(""); setSelectedMonth("all");}}
                    style={{
                      padding:"7px 12px", borderRadius:8, border:"1.5px solid #e5e7eb",
                      background:"#fdecea", color:"#c0392b", fontSize:12, fontWeight:600,
                      cursor:"pointer", fontFamily:"inherit",
                    }}>✕ נקה סינונים</button>
                )}
              </div>

              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {Object.entries(CATEGORIES).filter(([k]) => k !== "staff").map(([k,v]) => {
                  const active = selectedCats.includes(k);
                  return (
                    <button key={k} onClick={()=>toggleCat(k)} style={{
                      padding:"4px 10px", borderRadius:20,
                      border:`1.5px solid ${active ? v.color : "#e5e7eb"}`,
                      background: active ? v.color : "#fff",
                      color: active ? "#fff" : "#555",
                      fontSize:11, fontWeight:600, cursor:"pointer",
                      fontFamily:"inherit", display:"flex", alignItems:"center", gap:4,
                      transition:"all 0.15s",
                    }}>
                      {!active && <span style={{
                        width:8, height:8, borderRadius:"50%",
                        background:v.color, display:"inline-block",
                      }}/>}
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {(selectedCats.length > 0 || searchQ || selectedMonth !== "all") && (
              <div style={{fontSize:12, color:"#888", marginBottom:10, paddingRight:4}}>
                מציג {filtered.length} מתוך {events.length} אירועים
              </div>
            )}

            {/* ── CALENDAR VIEW ── */}
            {view === "calendar" && (
              <div>
                {monthsToShow.map(mk => (
                  <CalendarMonth
                    key={mk} mk={mk} events={filtered} selectedCats={selectedCats}
                    onDayClick={noop} onEventClick={noop}
                  />
                ))}
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {view === "list" && (
              <div style={{
                background:"#fff", borderRadius:12,
                boxShadow:"0 1px 4px rgba(0,0,0,0.07)", overflow:"hidden",
              }}>
                {filtered.length === 0 ? (
                  <div style={{padding:40, textAlign:"center", color:"#aaa"}}>
                    לא נמצאו אירועים
                  </div>
                ) : (() => {
                  const groups = {};
                  filtered.forEach(ev => {
                    const parts = ev.date.split("-");
                    const mk = `${parts[1]}-${parts[0]}`;
                    if (!groups[mk]) groups[mk] = [];
                    groups[mk].push(ev);
                  });
                  return MONTHS_ORDER.filter(mk => groups[mk]).map(mk => (
                    <div key={mk}>
                      <div style={{
                        background: MONTH_COLORS[mk] || "#2c3e50",
                        color:"#fff", padding:"8px 16px",
                        fontSize:13, fontWeight:700,
                      }}>{MONTH_NAMES_GRE[mk]}</div>
                      {groups[mk].map(ev => (
                        <EventListItem key={ev.id} ev={ev} onClick={noop} />
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* ── YEARLY VIEW ── */}
            {view === "yearly" && (
              <div style={{
                display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:12,
              }}>
                {MONTHS_ORDER.map(mk => (
                  <MiniMonth
                    key={mk} mk={mk} events={filtered}
                    onDayClick={noop}
                    onMonthClick={(mk) => { setSelectedMonth(mk); setView("calendar"); }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function MainApp({ session, onLogout }) {
  const { credential, name, permission, token } = session;
  const isAdmin = permission === "אדמין";
  const [myTasks, setMyTasks] = useState(session.tasks || []);
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [view, setView] = useState("calendar"); // "calendar" | "list"
  const [selectedCats, setSelectedCats] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [modal, setModal] = useState(null); // null | {type:"new"|"edit"|"day", ...}
  const [toast, setToast] = useState(null); // null | {type:"saving"|"success"|"error", message, retry?}
  const [newEventDate, setNewEventDate] = useState("");
  const [team, setTeam] = useState([]);
  const [teamFull, setTeamFull] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const staffList = useMemo(() => team.map(t => t["שם מלא"]).filter(Boolean), [team]);

  // כפתור "חזרה" בטלפון/דפדפן — סוגר רק את החלון הפתוח, לא יוצא מהאתר.
  // כשנפתח חלון דוחפים רשומת היסטוריה מדומה; לחיצת "חזרה" צורכת אותה וסוגרת את החלון
  // במקום לצאת מהאתר. אם החלון נסגר בדרך רגילה (X/ביטול/שמירה) — חוזרים צעד אחד בהיסטוריה
  // כדי לא להשאיר רשומה מיותרת.
  const modalOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = !!modal;
    if (isOpen && !modalOpenRef.current) {
      window.history.pushState({ calendarModalOpen: true }, "");
      modalOpenRef.current = true;
    } else if (!isOpen && modalOpenRef.current) {
      modalOpenRef.current = false;
      if (window.history.state && window.history.state.calendarModalOpen) {
        window.history.back();
      }
    }
  }, [modal]);

  useEffect(() => {
    const handlePopState = () => {
      if (modalOpenRef.current) {
        modalOpenRef.current = false;
        setModal(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const refreshAlerts = useCallback(() => {
    loadAlerts().then(setAlerts);
  }, []);

  // Load from API on mount
  useEffect(() => {
    setLoading(true);
    loadEvents().then(data => {
      if (data && data.length > 0) {
        setEvents(data);
        setApiError(false);
      } else {
        setApiError(true);
      }
      setLoaded(true);
      setLoading(false);
    }).catch(() => {
      setApiError(true);
      setLoaded(true);
      setLoading(false);
    });
    loadTeam().then(setTeam);
    if (isAdmin) loadTeamFull(credential).then(setTeamFull);
    refreshAlerts();
  }, [refreshAlerts, isAdmin, credential]);

  const handleSave = useCallback((form) => {
    const isEdit = modal?.type === "edit" && modal.event;
    const eventId = isEdit ? modal.event.id : null;
    const eventDate = modal?.date;

    // סוגרים את החלון מיד ולא מחכים לתשובת השרת — השמירה ממשיכה ברקע
    setModal(null);
    setToast({ type: "saving", message: "שומר ברקע…" });

    (async () => {
      try {
        const result = isEdit
          ? await apiUpdateEvent(eventId, form, credential)
          : await apiAddEvent(form, credential);
        if (!result || result.success === false) {
          throw new Error((result && result.error) || "השמירה נכשלה");
        }
        const data = await loadEvents();
        if (data) setEvents(data);
        setToast({ type: "success", message: "✓ נשמר בהצלחה" });
        setTimeout(() => setToast(t => (t && t.type === "success" ? null : t)), 2500);
      } catch (err) {
        setToast({
          type: "error",
          message: (err && err.message) || "השמירה נכשלה",
          retry: () => {
            setModal(isEdit
              ? { type: "edit", event: { ...modal.event, ...form } }
              : { type: "new", date: eventDate, presetForm: form });
            setToast(null);
          },
        });
      }
    })();
  }, [modal, credential]);

  // מפעיל פעולת רקע (שליחה לשרת + רענון), עם התראה שנשארת בזמן ההמתנה
  // ומאפשרת "פתח שוב" (שחוזר על אותה פעולה, בלי לבקש שוב פרטים) אם היא נכשלת.
  const runBackgroundAction = useCallback((savingMsg, successMsg, action) => {
    setToast({ type: "saving", message: savingMsg });
    (async () => {
      try {
        const result = await action();
        if (!result || result.success === false) {
          throw new Error((result && result.error) || "הפעולה נכשלה");
        }
        const data = await loadEvents();
        if (data) setEvents(data);
        refreshAlerts();
        setToast({ type: "success", message: successMsg });
        setTimeout(() => setToast(t => (t && t.type === "success" ? null : t)), 2500);
      } catch (err) {
        setToast({
          type: "error",
          message: (err && err.message) || "הפעולה נכשלה",
          retry: () => { setToast(null); runBackgroundAction(savingMsg, successMsg, action); },
        });
      }
    })();
  }, [refreshAlerts]);

  const handleDelete = useCallback((id) => {
    const reason = prompt("סיבת המחיקה (רשות):") || "";
    setModal(null);
    runBackgroundAction("שולח בקשת מחיקה ברקע…", "✓ בקשת המחיקה נשלחה", () => apiDeleteEvent(id, reason, credential));
  }, [runBackgroundAction, credential]);

  const handleApprove = useCallback((eventId) => {
    setModal(null);
    runBackgroundAction("מאשר מחיקה ברקע…", "✓ האירוע נמחק", () => apiApproveDelete(eventId, credential));
  }, [runBackgroundAction, credential]);

  const handleReject = useCallback((eventId) => {
    const reason = prompt("סיבת הדחייה (רשות):") || "";
    setModal(null);
    runBackgroundAction("דוחה בקשה ברקע…", "✓ הבקשה נדחתה", () => apiRejectDelete(eventId, reason, credential));
  }, [runBackgroundAction, credential]);

  const handleSaveTeamMember = useCallback(async (form, originalName) => {
    if (originalName) {
      await apiUpdateTeamMember(originalName, form, credential);
    } else {
      await apiAddTeamMember(form, credential);
    }
    const data = await loadTeamFull(credential);
    setTeamFull(data);
    setModal({type:"team"});
  }, [credential]);

  const handleUpdateMyTask = useCallback(async (id, status, notes) => {
    await apiReportTaskStatus(token, id, status, notes);
    setMyTasks(prev => prev.map(t => t.id === id ? { ...t, status, notes } : t));
  }, [token]);

  // שומרים את מצב המשימות המעודכן גם ב-sessionStorage, כדי שרענון הדף לא יחזיר סטטוס ישן
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("rakazSession");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.tasks = myTasks;
        sessionStorage.setItem("rakazSession", JSON.stringify(parsed));
      }
    } catch (e) {}
  }, [myTasks]);

  const toggleCat = (cat) => {
    setSelectedCats(prev =>
      prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat]
    );
  };

  // Filtered events
  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (selectedCats.length > 0 && !selectedCats.includes(ev.cat)) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (!ev.title.toLowerCase().includes(q) &&
            !ev.target.toLowerCase().includes(q) &&
            !(ev.note||"").toLowerCase().includes(q)) return false;
      }
      if (selectedMonth !== "all") {
        const parts = ev.date.split("-");
        if (`${parts[1]}-${parts[0]}` !== selectedMonth) return false;
      }
      return true;
    }).sort((a,b) => a.date.localeCompare(b.date));
  }, [events, selectedCats, searchQ, selectedMonth]);

  // Stats
  const stats = useMemo(() => {
    const total = events.length;
    const perCat = {};
    events.forEach(e => { perCat[e.cat] = (perCat[e.cat]||0)+1; });
    return { total, perCat };
  }, [events]);

  const monthsToShow = selectedMonth === "all" ? MONTHS_ORDER : [selectedMonth];

  return (
    <div style={{
      fontFamily: '"Heebo", "Noto Sans Hebrew", Arial, sans-serif',
      direction:"rtl", minHeight:"100vh", background:"#f4f6f9",
      color:"#1a1a2e",
    }}>
      {/* ── HEADER ── */}
      <div style={{
        background:"linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
        color:"#fff", padding:"20px 24px 16px",
        boxShadow:"0 4px 20px rgba(0,0,0,0.2)",
      }}>
        <div style={{maxWidth:1100, margin:"0 auto"}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10}}>
            <div>
              <div style={{fontSize:22, fontWeight:800, letterSpacing:0.5}}>
                📅 תוכנית שנתית תשפ"ז
              </div>
              <div style={{fontSize:12, opacity:0.7, marginTop:2}}>
                ישיבת אלוני הבשן · {stats.total} אירועים · שלום {name}
                {" · "}
                <span onClick={onLogout} style={{textDecoration:"underline", cursor:"pointer"}}>התנתקות</span>
              </div>
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              <button
                onClick={() => setModal({type:"parentsLink"})}
                style={{
                  background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)",
                  color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                  fontWeight:700, fontSize:13, fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                🔗 קישורים לשיתוף
              </button>
              {isAdmin && (
                <button
                  onClick={() => setModal({type:"team"})}
                  style={{
                    background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)",
                    color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                    fontWeight:700, fontSize:13, fontFamily:"inherit",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                  👥 צוות
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setModal({type:"control"})}
                  style={{
                    background: alerts.length > 0 ? "#e67e22" : "rgba(255,255,255,0.15)",
                    border:"1.5px solid rgba(255,255,255,0.3)",
                    color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                    fontWeight:700, fontSize:13, fontFamily:"inherit",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                  🔔 בקשות ממתינות{alerts.length > 0 ? ` (${alerts.length})` : ""}
                </button>
              )}
              {myTasks.length > 0 && (
                <button
                  onClick={() => setModal({type:"myTasks"})}
                  style={{
                    background: myTasks.some(t=>t.status!=="✅ בוצע") ? "#e67e22" : "rgba(255,255,255,0.15)",
                    border:"1.5px solid rgba(255,255,255,0.3)",
                    color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                    fontWeight:700, fontSize:13, fontFamily:"inherit",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                  📌 המשימות שלי{myTasks.some(t=>t.status!=="✅ בוצע") ? ` (${myTasks.filter(t=>t.status!=="✅ בוצע").length})` : ""}
                </button>
              )}
              <button
                onClick={() => { setNewEventDate(""); setModal({type:"new"}); }}
                style={{
                  background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)",
                  color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                  fontWeight:700, fontSize:13, fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                ＋ אירוע חדש
              </button>
              <button
                onClick={() => window.open(SITE_URL + "guide.pdf", "_blank")}
                style={{
                  background:"rgba(255,255,255,0.15)", border:"1.5px solid rgba(255,255,255,0.3)",
                  color:"#fff", padding:"8px 18px", borderRadius:20, cursor:"pointer",
                  fontWeight:700, fontSize:13, fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                📖 מדריך למערכת
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{display:"flex", gap:8, marginTop:14, flexWrap:"wrap"}}>
            {Object.entries(stats.perCat).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([cat,n]) => (
              <div key={cat} style={{
                background:"rgba(255,255,255,0.1)", borderRadius:20,
                padding:"3px 10px", fontSize:11, display:"flex", gap:5, alignItems:"center",
              }}>
                <div style={{width:8,height:8,borderRadius:"50%",background:CATEGORIES[cat]?.color}}/>
                <span style={{opacity:0.85}}>{CATEGORIES[cat]?.label}</span>
                <span style={{fontWeight:700}}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100, margin:"0 auto", padding:"16px 16px"}}>

        {/* ── Loading / Error ── */}
        {loading && (
          <div style={{
            textAlign:"center", padding:"40px", color:"#888",
            background:"#fff", borderRadius:12, marginBottom:16,
          }}>
            <div style={{fontSize:13}}>⏳ טוען אירועים מ-Google Sheets...</div>
          </div>
        )}
        {apiError && !loading && (
          <div style={{
            background:"#fdecea", border:"1px solid #e74c3c",
            borderRadius:12, padding:"14px 18px", marginBottom:16,
            fontSize:13, color:"#c0392b",
          }}>
            ⚠️ לא ניתן לטעון נתונים מה-API. בודק חיבור...
          </div>
        )}

        {/* ── CONTROLS ── */}
        <div style={{
          background:"#fff", borderRadius:12, padding:"14px 16px",
          marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
          display:"flex", flexDirection:"column", gap:12,
        }}>
          {/* Row 1: search + view toggle + month */}
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
            <input
              placeholder="🔍 חיפוש אירוע..."
              value={searchQ}
              onChange={e=>setSearchQ(e.target.value)}
              style={{
                flex:1, minWidth:160, padding:"7px 12px",
                border:"1.5px solid #e5e7eb", borderRadius:8,
                fontSize:13, outline:"none", direction:"rtl", fontFamily:"inherit",
              }}
            />
            <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
              style={{
                padding:"7px 10px", border:"1.5px solid #e5e7eb",
                borderRadius:8, fontSize:13, direction:"rtl", fontFamily:"inherit",
                background:"#fff",
              }}>
              <option value="all">כל החודשים</option>
              {MONTHS_ORDER.map(mk => (
                <option key={mk} value={mk}>{MONTH_NAMES_GRE[mk]}</option>
              ))}
            </select>
            <div style={{display:"flex", gap:0, border:"1.5px solid #e5e7eb", borderRadius:8, overflow:"hidden"}}>
              {[["calendar","📅 לוח"],["list","📋 רשימה"],["yearly","🗓️ שנתי"]].map(([v,l]) => (
                <button key={v} onClick={()=>setView(v)} style={{
                  padding:"7px 14px", border:"none", cursor:"pointer",
                  background: view===v ? "#1a1a2e" : "#fff",
                  color: view===v ? "#fff" : "#555",
                  fontSize:12, fontWeight:600, fontFamily:"inherit",
                }}>{l}</button>
              ))}
            </div>
            {(selectedCats.length > 0 || searchQ || selectedMonth !== "all") && (
              <button onClick={()=>{setSelectedCats([]); setSearchQ(""); setSelectedMonth("all");}}
                style={{
                  padding:"7px 12px", borderRadius:8, border:"1.5px solid #e5e7eb",
                  background:"#fdecea", color:"#c0392b", fontSize:12, fontWeight:600,
                  cursor:"pointer", fontFamily:"inherit",
                }}>✕ נקה סינונים</button>
            )}
          </div>

          {/* Row 2: category filters */}
          <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
            {Object.entries(CATEGORIES).map(([k,v]) => {
              const active = selectedCats.includes(k);
              return (
                <button key={k} onClick={()=>toggleCat(k)} style={{
                  padding:"4px 10px", borderRadius:20,
                  border:`1.5px solid ${active ? v.color : "#e5e7eb"}`,
                  background: active ? v.color : "#fff",
                  color: active ? "#fff" : "#555",
                  fontSize:11, fontWeight:600, cursor:"pointer",
                  fontFamily:"inherit", display:"flex", alignItems:"center", gap:4,
                  transition:"all 0.15s",
                }}>
                  {!active && <span style={{
                    width:8, height:8, borderRadius:"50%",
                    background:v.color, display:"inline-block",
                  }}/>}
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RESULTS COUNT ── */}
        {(selectedCats.length > 0 || searchQ || selectedMonth !== "all") && (
          <div style={{fontSize:12, color:"#888", marginBottom:10, paddingRight:4}}>
            מציג {filtered.length} מתוך {events.length} אירועים
          </div>
        )}

        {/* ── CALENDAR VIEW ── */}
        {view === "calendar" && (
          <div>
            {monthsToShow.map(mk => (
              <CalendarMonth
                key={mk}
                mk={mk}
                events={filtered}
                selectedCats={selectedCats}
                onDayClick={(dateStr) => {
                  setNewEventDate(dateStr);
                  setModal({type:"new", date: dateStr});
                }}
                onEventClick={(ev) => setModal({type:"edit", event:ev})}
              />
            ))}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <div style={{
            background:"#fff", borderRadius:12,
            boxShadow:"0 1px 4px rgba(0,0,0,0.07)", overflow:"hidden",
          }}>
            {filtered.length === 0 ? (
              <div style={{padding:40, textAlign:"center", color:"#aaa"}}>
                לא נמצאו אירועים
              </div>
            ) : (() => {
              // Group by month
              const groups = {};
              filtered.forEach(ev => {
                const parts = ev.date.split("-");
                const mk = `${parts[1]}-${parts[0]}`;
                if (!groups[mk]) groups[mk] = [];
                groups[mk].push(ev);
              });
              return MONTHS_ORDER.filter(mk => groups[mk]).map(mk => (
                <div key={mk}>
                  <div style={{
                    background: MONTH_COLORS[mk] || "#2c3e50",
                    color:"#fff", padding:"8px 16px",
                    fontSize:13, fontWeight:700,
                  }}>{MONTH_NAMES_GRE[mk]}</div>
                  {groups[mk].map(ev => (
                    <EventListItem key={ev.id} ev={ev}
                      onClick={(ev)=>setModal({type:"edit",event:ev})} />
                  ))}
                </div>
              ));
            })()}
          </div>
        )}

        {/* ── YEARLY VIEW ── */}
        {view === "yearly" && (
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:12,
          }}>
            {MONTHS_ORDER.map(mk => (
              <MiniMonth
                key={mk}
                mk={mk}
                events={filtered}
                onDayClick={(dateStr) => {
                  setNewEventDate(dateStr);
                  setModal({type:"new", date: dateStr});
                }}
                onMonthClick={(mk) => { setSelectedMonth(mk); setView("calendar"); }}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── MODALS ── */}
      {modal && modal.type === "new" && (
        <Modal onClose={()=>setModal(null)}>
          <EventForm
            initial={modal.presetForm || { title:"", date: modal.date||"", cat:"gen", target:"", targetCustom:"", leader:"", participants:"", timeStart:"", timeEnd:"", transport:"", transportNote:"", food:"", foodNote:"", specialRequests:"", tripApproval:"", note:"", parentNote:"" }}
            onSave={handleSave}
            onCancel={()=>setModal(null)}
            staffList={staffList}
          />
        </Modal>
      )}

      {modal && modal.type === "edit" && modal.event && (
        <Modal onClose={()=>setModal(null)}>
          <EventForm
            initial={modal.event}
            onSave={handleSave}
            onCancel={()=>setModal(null)}
            onDelete={handleDelete}
            staffList={staffList}
          />
        </Modal>
      )}

      {modal && modal.type === "control" && (
        <Modal onClose={()=>setModal(null)}>
          <ControlPanel
            alerts={alerts}
            onApprove={handleApprove}
            onReject={handleReject}
            onClose={()=>setModal(null)}
          />
        </Modal>
      )}

      {modal && modal.type === "myTasks" && (
        <Modal onClose={()=>setModal(null)}>
          <div style={{direction:"rtl", fontFamily:"inherit"}}>
            <div style={{fontSize:15, fontWeight:800, marginBottom:10, color:"#1a1a2e"}}>
              📌 המשימות האישיות שלך
              {" "}
              <span style={{fontSize:12, fontWeight:600, color: myTasks.some(t=>t.status!=="✅ בוצע") ? "#c0392b" : "#27ae60"}}>
                ({myTasks.filter(t=>t.status!=="✅ בוצע").length} עוד לא סומנו כבוצעו)
              </span>
            </div>
            {myTasks.map(t => (
              <TaskCard key={t.id + "_" + t.field} task={t} onSave={handleUpdateMyTask} />
            ))}
          </div>
        </Modal>
      )}

      {modal && modal.type === "team" && (
        <Modal onClose={()=>setModal(null)}>
          <TeamPanel team={teamFull} onClose={()=>setModal(null)}
            onAdd={()=>setModal({type:"staffForm"})}
            onEdit={(member)=>setModal({type:"staffForm", member})} />
        </Modal>
      )}

      {modal && modal.type === "staffForm" && (
        <Modal onClose={()=>setModal({type:"team"})}>
          <TeamMemberForm initial={modal.member} onSave={handleSaveTeamMember} onCancel={()=>setModal({type:"team"})} />
        </Modal>
      )}

      {modal && modal.type === "parentsLink" && (
        <Modal onClose={()=>setModal(null)}>
          <div style={{direction:"rtl", fontFamily:"inherit"}}>
            <div style={{fontWeight:800, fontSize:15, marginBottom:12, color:"#1a1a2e"}}>
              🔗 קישור לוח שנה להורים
            </div>
            <div style={{fontSize:12, color:"#555", marginBottom:8}}>
              קישור לתצוגת צפייה בלבד (בלי עריכה) עם רק מה שרלוונטי להורים. אפשר לשלוח אותו לכל ההורים — אותו קישור לכולם.
            </div>
            <CopyLinkField value={SITE_URL + "?parents=1"} style={{marginBottom:20}} />

            <div style={{fontWeight:800, fontSize:15, marginBottom:12, color:"#1a1a2e"}}>
              🔑 קישור כניסה לצוות
            </div>
            <div style={{fontSize:12, color:"#555", marginBottom:8}}>
              קישור האתר הרגיל — כל איש צוות נכנס אליו עם חשבון הגוגל האישי שלו, ורואה את הלוח + המשימות האישיות שלו (זיהוי לפי כתובת המייל בלשונית "צוות").
            </div>
            <CopyLinkField value={SITE_URL} style={{marginBottom:14}} />

            <div style={{fontWeight:800, fontSize:15, marginBottom:12, color:"#1a1a2e"}}>
              📖 מדריך למערכת
            </div>
            <div style={{fontSize:12, color:"#555", marginBottom:8}}>
              מדריך מקיף (PDF) שמסביר את כל היכולות של המערכת — אפשר גם לפתוח אותו ישירות מכפתור "📖 מדריך למערכת" בראש הדף.
            </div>
            <CopyLinkField value={SITE_URL + "guide.pdf"} style={{marginBottom:20}} />

            <div style={{fontWeight:800, fontSize:15, marginBottom:12, color:"#1a1a2e"}}>
              🗓️ יומני Google Calendar
            </div>
            <div style={{fontSize:12, color:"#555", marginBottom:8}}>
              קישור למי שרוצה להוסיף יומן ספציפי ליומן הגוגל האישי שלו. חשוב: כדי שהקישור באמת יעבוד למי שאין לו כבר גישה, צריך פעם אחת לפתוח את היומן ב-Google Calendar ולוודא ב"הגדרות ושיתוף" ← "הרשאות גישה" שהוא מוגדר כ"זמין לכולם" או משותף עם האנשים הרלוונטיים.
            </div>
            {CALENDAR_LINKS.map(c => (
              <div key={c.key} style={{marginBottom:10}}>
                <div style={{fontSize:12, fontWeight:600, color:"#555", marginBottom:3}}>{c.label}</div>
                <CopyLinkField value={calendarSubscribeLink(CALENDAR_IDS[c.key])} />
              </div>
            ))}

            <div style={{display:"flex", justifyContent:"flex-end", marginTop:8}}>
              <button onClick={()=>setModal(null)} style={{
                padding:"7px 18px", borderRadius:8, border:"none",
                background:"#2c3e50", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13,
              }}>סגור</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bottom hint */}
      <div style={{
        textAlign:"center", padding:"16px 16px 24px",
        fontSize:11, color:"#bbb",
      }}>
        לחץ על יום בלוח להוספת אירוע · לחץ על אירוע לעריכה · האירועים נשמרים אוטומטית
      </div>

      {/* ── התראת שמירה ברקע ── */}
      {toast && (
        <div style={{
          position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)",
          zIndex:2000, maxWidth:"92vw",
          background: toast.type==="error" ? "#fdecea" : toast.type==="success" ? "#eafaf1" : "#2c3e50",
          color: toast.type==="error" ? "#c0392b" : toast.type==="success" ? "#1e8449" : "#fff",
          border: `1.5px solid ${toast.type==="error" ? "#e74c3c" : toast.type==="success" ? "#27ae60" : "#2c3e50"}`,
          borderRadius:30, padding:"10px 18px", display:"flex", alignItems:"center", gap:12,
          boxShadow:"0 6px 24px rgba(0,0,0,0.2)", fontSize:13, fontWeight:600, fontFamily:"inherit",
        }}>
          <span>
            {toast.type==="saving" ? "⏳" : toast.type==="success" ? "✓" : "⚠️"} {toast.message}
          </span>
          {toast.retry && (
            <button onClick={toast.retry} style={{
              padding:"5px 14px", borderRadius:16, border:"none",
              background:"#c0392b", color:"#fff", fontWeight:700, cursor:"pointer",
              fontSize:12, fontFamily:"inherit", whiteSpace:"nowrap",
            }}>
              פתח שוב
            </button>
          )}
          {toast.type !== "saving" && (
            <span onClick={()=>setToast(null)} style={{cursor:"pointer", opacity:0.6, fontWeight:800}}>✕</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── שער כניסה לאתר הראשי — התחברות גוגל, מזוהה מול לשונית "צוות" ─────────────
// פתוח לכל איש צוות ("מורה"/"אדמין"); רק אחרי כניסה מוצג האתר עצמו.
function SiteLoginGate() {
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem("rakazSession");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  });
  const [status, setStatus] = useState("ready"); // ready | checking | error
  const [error, setError] = useState("");
  const btnRef = useRef(null);

  useEffect(() => {
    if (session) return;
    let cancelled = false;

    const handleCredential = async (response) => {
      setStatus("checking");
      setError("");
      try {
        const data = await apiVerifyLogin(response.credential);
        if (cancelled) return;
        if (data.success) {
          const newSession = {
            credential: response.credential, name: data.name, permission: data.permission,
            token: data.token, tasks: data.tasks || [],
          };
          setSession(newSession);
          try { sessionStorage.setItem("rakazSession", JSON.stringify(newSession)); } catch (e) {}
        } else {
          setError(data.error || "ההתחברות נכשלה");
          setStatus("error");
        }
      } catch (e) {
        if (!cancelled) { setError("שגיאה בתקשורת עם השרת"); setStatus("error"); }
      }
    };

    const tryInit = () => {
      if (cancelled) return;
      if (!window.google || !window.google.accounts) { setTimeout(tryInit, 300); return; }
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "outline", size: "large", text: "signin_with", locale: "iw", shape: "pill",
        });
      }
    };
    tryInit();

    return () => { cancelled = true; };
  }, [session]);

  const handleLogout = () => {
    setSession(null);
    try { sessionStorage.removeItem("rakazSession"); } catch (e) {}
  };

  if (session) {
    return <MainApp session={session} onLogout={handleLogout} />;
  }

  return (
    <div style={{
      fontFamily: '"Heebo", "Noto Sans Hebrew", Arial, sans-serif',
      direction:"rtl", minHeight:"100vh", background:"#f4f6f9", color:"#1a1a2e",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    }}>
      <div style={{
        background:"#fff", borderRadius:16, padding:32, maxWidth:380, width:"100%",
        textAlign:"center", boxShadow:"0 10px 40px rgba(0,0,0,0.08)",
      }}>
        <div style={{fontSize:20, fontWeight:800, marginBottom:6}}>🔑 כניסת צוות</div>
        <div style={{fontSize:13, color:"#666", marginBottom:22}}>
          התחבר עם חשבון הגוגל שלך כדי להיכנס למערכת ריכוז חברתי
        </div>
        <div ref={btnRef} style={{display:"flex", justifyContent:"center", minHeight:44}} />
        {status === "checking" && (
          <div style={{marginTop:16, color:"#888", fontSize:13}}>מתחבר...</div>
        )}
        {status === "error" && (
          <div style={{marginTop:16, color:"#c0392b", fontWeight:600, fontSize:13}}>{error}</div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT — מנתב בין הדשבורד האישי לאתר הראשי ────────────────────────────────

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const staffToken = params.get("staff");
  if (staffToken) return <MyTasksView token={staffToken} />;
  if (params.get("parents")) return <ParentsView />;
  return <SiteLoginGate />;
}
