// ═══════════════════════════════════════════════════════════════
// מערכת ריכוז חברתי — ישיבת אלוני הבשן
// Apps Script API — חיבור בין האתר ל-Google Sheets
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME = "אירועים";
const SETTINGS_SHEET = "הגדרות";

// ── מפתח סודי — שנה את הערך הזה למשהו ייחודי שלך ─────────────
// חשוב: לאחר שינוי — עדכן גם באתר (קובץ App.jsx)
const SECRET_KEY = "REPLACE_WITH_YOUR_SECRET_KEY";

// ── בדיקת הרשאה לפעולות כתיבה ────────────────────────────────
function isAuthorized(key) {
  return key === SECRET_KEY;
}

// ── נקודת כניסה ראשית ─────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || "getEvents";
  
  try {
    let result;
    switch (action) {
      case "getEvents":   result = getEvents(e.parameter);   break;
      case "getSettings": result = getSettings();            break;
      default:            result = { error: "פעולה לא מוכרת: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    // בדיקת מפתח סודי לכל פעולת כתיבה
    if (!isAuthorized(body.secretKey)) {
      return jsonResponse({ success: false, error: "⛔ גישה נדחתה — מפתח לא תקין" });
    }

    let result;

    switch (action) {
      case "addEvent":       result = addEvent(body.data);                    break;
      case "updateEvent":    result = updateEvent(body.id, body.data);        break;
      case "requestDelete":  result = requestDelete(body.id, body.requestedBy, body.reason); break;
      case "approveDelete":  result = approveDelete(body.id);                 break;
      case "rejectDelete":   result = rejectDelete(body.id, body.reason);     break;
      default:               result = { error: "פעולה לא מוכרת: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── עזרים ─────────────────────────────────────────────────────

// תיקון תאריכים — ממיר Date object ל-YYYY-MM-DD
function formatDate(val) {
  if (!val) return "";
  // תאריך מוזר של 1899 = שגיאת המרה של שעה — מחזיר ריק
  if (String(val).includes("1899")) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    // אם זו שעה בלבד (1899) — החזר ריק
    if (d.getFullYear() === 1899) return "";
    // המר ל-YYYY-MM-DD לפי שעון ישראל (UTC+3)
    const israel = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const y = israel.getUTCFullYear();
    const m = String(israel.getUTCMonth() + 1).padStart(2, "0");
    const day = String(israel.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  } catch(e) {
    return String(val);
  }
}

// תיקון שדה טקסט — אם נראה כתאריך מוזר (שעה שגוגל המיר לתאריך), מחזיר ריק
function formatText(val) {
  if (!val) return "";
  // אם זה Date object של שנת 1899 — זו שעה שגוגל המיר לתאריך
  if (val instanceof Date) {
    if (val.getFullYear() === 1899) return "";
  }
  const s = String(val);
  // בדיקה לפורמטים שונים של 1899
  if (s.includes("1899-12-30")) return "";
  if (s.includes("Dec 30 1899")) return "";
  if (s.includes("1899")) return "";
  return s;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function getAllRows() {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const DATE_FIELDS = ["תאריך", "תאריך עדכון"];
  const TEXT_FIELDS = ["כותרת", "קטגוריה", "קהל יעד", "מוביל", "סטטוס", "הערה פנימית", "הערה להורים", "קישור דרייב"];

  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (DATE_FIELDS.includes(h)) {
        obj[h] = formatDate(row[i]);
      } else if (TEXT_FIELDS.includes(h)) {
        obj[h] = formatText(row[i]);
      } else {
        obj[h] = row[i];
      }
    });
    return obj;
  });
}

function findRowById(id) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // 1-based row
  }
  return -1;
}

function nextId() {
  const rows = getAllRows();
  if (!rows.length) return 1;
  const ids = rows.map(r => parseInt(r["id"]) || 0);
  return Math.max(...ids) + 1;
}

function now() {
  return new Date().toISOString().split("T")[0];
}

// ── קריאת אירועים ─────────────────────────────────────────────
function getEvents(params) {
  let rows = getAllRows();

  // סינון: לא להחזיר אירועים שנמחקו סופית
  rows = rows.filter(r => String(r["נמחק"]).toLowerCase() !== "true");

  // סינון לפי קטגוריה
  if (params && params.cat) {
    rows = rows.filter(r => r["קטגוריה"] === params.cat);
  }

  // סינון לפי חודש (YYYY-MM)
  if (params && params.month) {
    rows = rows.filter(r => String(r["תאריך"]).startsWith(params.month));
  }

  // סינון לפי קהל יעד
  if (params && params.target) {
    rows = rows.filter(r => r["קהל יעד"].includes(params.target));
  }

  return { success: true, count: rows.length, events: rows };
}

// ── הוספת אירוע ───────────────────────────────────────────────
function addEvent(data) {
  const sheet = getSheet();
  const id    = nextId();
  
  const row = [
    id,
    data["תאריך"]         || "",
    data["כותרת"]         || "",
    data["קטגוריה"]       || "gen",
    data["קהל יעד"]       || "",
    data["מוביל"]         || "",
    data["סטטוס"]         || "פעיל",
    data["הערה פנימית"]   || "",
    data["הערה להורים"]   || "",
    data["קישור דרייב"]   || "",
    now(),
    false
  ];

  sheet.appendRow(row);
  return { success: true, id: id, message: "אירוע נוסף בהצלחה" };
}

// ── עדכון אירוע ───────────────────────────────────────────────
function updateEvent(id, data) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);
  
  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  // עדכן רק שדות שנשלחו
  const updatable = ["תאריך","כותרת","קטגוריה","קהל יעד","מוביל","סטטוס","הערה פנימית","הערה להורים","קישור דרייב"];
  updatable.forEach(field => {
    const col = headers.indexOf(field);
    if (col !== -1 && data[field] !== undefined) {
      rowData[col] = data[field];
    }
  });

  // עדכן תאריך עדכון
  const updCol = headers.indexOf("תאריך עדכון");
  if (updCol !== -1) rowData[updCol] = now();

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  return { success: true, id: id, message: "אירוע עודכן בהצלחה" };
}

// ── בקשת מחיקה (רכה) ─────────────────────────────────────────
function requestDelete(id, requestedBy, reason) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);
  
  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  // שנה סטטוס ל"ממתין למחיקה" + שמור פרטי הבקשה בהערה הפנימית
  const statusCol  = headers.indexOf("סטטוס");
  const noteCol    = headers.indexOf("הערה פנימית");
  const updCol     = headers.indexOf("תאריך עדכון");

  if (statusCol !== -1) rowData[statusCol] = "ממתין למחיקה";
  if (noteCol   !== -1) rowData[noteCol]   = `⏳ בקשת מחיקה מ-${requestedBy} (${now()}): ${reason || "ללא סיבה"}`;
  if (updCol    !== -1) rowData[updCol]    = now();

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);

  // שמור בלשונית תור התראות
  logAlert({
    type:        "בקשת מחיקה",
    eventId:     id,
    eventTitle:  rowData[headers.indexOf("כותרת")],
    requestedBy: requestedBy,
    reason:      reason || "",
    date:        now(),
    status:      "ממתין"
  });

  return { success: true, message: "בקשת המחיקה נשלחה לאישור הרכז" };
}

// ── אישור מחיקה ───────────────────────────────────────────────
function approveDelete(id) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);
  
  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const statusCol = headers.indexOf("סטטוס");
  const deletedCol = headers.indexOf("נמחק");
  const updCol    = headers.indexOf("תאריך עדכון");

  if (statusCol  !== -1) rowData[statusCol]  = "בוטל";
  if (deletedCol !== -1) rowData[deletedCol] = true;
  if (updCol     !== -1) rowData[updCol]     = now();

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  updateAlertStatus(id, "אושר");

  return { success: true, message: "האירוע נמחק סופית" };
}

// ── דחיית מחיקה ───────────────────────────────────────────────
function rejectDelete(id, reason) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);

  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const statusCol = headers.indexOf("סטטוס");
  const noteCol   = headers.indexOf("הערה פנימית");
  const updCol    = headers.indexOf("תאריך עדכון");

  if (statusCol !== -1) rowData[statusCol] = "פעיל";
  if (noteCol   !== -1) rowData[noteCol]   = `❌ בקשת מחיקה נדחתה (${now()}): ${reason || ""}`;
  if (updCol    !== -1) rowData[updCol]    = now();

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  updateAlertStatus(id, "נדחה");

  return { success: true, message: "בקשת המחיקה נדחתה, האירוע חזר לפעיל" };
}

// ── קריאת הגדרות ──────────────────────────────────────────────
function getSettings() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) return { success: false, error: "לשונית הגדרות לא נמצאה" };

  const data = sheet.getDataRange().getValues().slice(1);
  const settings = {};
  data.forEach(row => { if (row[0]) settings[row[0]] = row[1]; });
  return { success: true, settings };
}

// ── תור התראות ────────────────────────────────────────────────
function logAlert(alert) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("תור התראות");
  
  if (!sheet) {
    sheet = ss.insertSheet("תור התראות");
    sheet.setRightToLeft(true);
    const headers = ["סוג","מזהה אירוע","כותרת אירוע","מבקש","סיבה","תאריך","סטטוס"];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length).setBackground("#1a1a2e").setFontColor("#fff").setFontWeight("bold");
  }

  sheet.appendRow([
    alert.type, alert.eventId, alert.eventTitle,
    alert.requestedBy, alert.reason, alert.date, alert.status
  ]);
}

function updateAlertStatus(eventId, status) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("תור התראות");
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(eventId) && data[i][6] === "ממתין") {
      sheet.getRange(i + 1, 7).setValue(status);
    }
  }
}

// ── פונקציית בדיקה ────────────────────────────────────────────
function testApi() {
  const events = getEvents({});
  Logger.log("סך אירועים: " + events.count);
  Logger.log("אירוע ראשון: " + JSON.stringify(events.events[0]));
}
