// ═══════════════════════════════════════════════════════════════
// מערכת ריכוז חברתי — ישיבת אלוני הבשן
// Apps Script API — חיבור בין האתר ל-Google Sheets
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME = "אירועים";
const SETTINGS_SHEET = "הגדרות";

// ── כתובת האתר (לקישורים בדשבורד האישי ובמיילים) ──────────────
const SITE_URL = "https://nisan1234-afk.github.io/tichnonshnati/";

// ── מזהה לקוח Google Sign-In (מ-Google Cloud Console) — לאימות כניסת מורים ───
const GOOGLE_CLIENT_ID = "1019791950162-hv5jhr1omsjsstmbnenf9mdr6kdila54.apps.googleusercontent.com";

// ── עמודות נוספות לאירועים — נוצרות אוטומטית אם חסרות ────────
const EVENT_EXTRA_COLUMNS = [
  "שעת התחלה","שעת סיום","מספר משתתפים","הסעות","פרטי הסעה",
  "אוכל","פרטי אוכל","בקשות מיוחדות","אישור טיול","סנכרון יומן",
  "סטטוס ביצוע","הערות ביצוע"
];

// ── מיפוי שדה אירוע ← תפקיד אחראי (לצורך שליחת דיווח "בוצע") ───
const REPORT_FIELDS = [
  { field: "הסעות",      role: "אחראי הסעות",  isRelevant: v => !!v && v !== "לא נדרש" },
  { field: "אוכל",       role: "אחראי אוכל",   isRelevant: v => !!v && v !== "לא נדרש" },
  { field: "אישור טיול", role: "אחראי טיולים", isRelevant: v => !!v },
];

// ── צ'קליסט נדרש לפי קטגוריית אירוע (למובילים) ─────────────────
const CATEGORY_CHECKLIST = {
  trip:   ["קהל יעד", "מוביל", "הסעות", "אוכל", "אישור טיול", "מספר משתתפים"],
  social: ["מוביל", "מספר משתתפים"],
  sports: ["מוביל", "מספר משתתפים"],
  ruach:  ["מוביל", "מספר משתתפים"],
  vol:    ["מוביל"],
  parents:["מוביל"],
  staff:  ["מוביל"],
};

// מחזיר אילו שדות מהצ'קליסט של האירוע עדיין ריקים
function getMissingChecklistItems(ev) {
  const required = CATEGORY_CHECKLIST[ev["קטגוריה"]];
  if (!required) return [];
  return required.filter(field => !ev[field] || String(ev[field]).trim() === "");
}

// ── מזהי יומני Google Calendar לסנכרון אוטומטי ────────────────
const CALENDAR_IDS = {
  main:         "aaace518400d94ae71ee916674de285dd5d02cf91ad0ac710c6d13b4276f32f8@group.calendar.google.com",
  staff:        "e898cee8224987a291f2b48e43c40d205e1642fe12779504dc12bc0180af7a94@group.calendar.google.com",
  parents:      "dfea5fe2f9eb41c51ee7ad5eac53376fa70e908d169900cd8c4e214449f2e094@group.calendar.google.com",
  transport:    "1d9630d30833e8756f6049faa6075ea91a2d7a4f6810dcf14570dba2703d1ad9@group.calendar.google.com",
  food:         "1df8477260b043241f4c1dfe91cca1e4c9aa27ffb1f5809f9ef8825aac703ca7@group.calendar.google.com",
  tripApproval: "0e48c3a13df1256eb3df83b604d27710fd4ee7662d62c5b88a035307a211ee98@group.calendar.google.com",
};

// ── הרשאות — מבוססות Google Sign-In, לא על מפתח קבוע בקוד ──────
// מאמת אישור התחברות גוגל (ID token) מול גוגל עצמה, ומחזיר את שורת
// איש הצוות התואם בלשונית "צוות" (או null אם לא נמצא/לא תקין).
function verifyGoogleCredential(credential) {
  if (!credential) {
    logAction("כשל באימות גוגל", "לא התקבל credential כלל מהדפדפן (ריק/undefined)");
    return null;
  }

  let payload;
  try {
    const res = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
    payload = JSON.parse(res.getContentText());
  } catch (e) {
    logAction("כשל באימות גוגל", "שגיאה בקריאה ל-tokeninfo: " + e.toString());
    return null;
  }

  if (!payload || payload.aud !== GOOGLE_CLIENT_ID) {
    logAction("כשל באימות גוגל", "aud לא תואם: " + JSON.stringify(payload && payload.aud));
    return null;
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    logAction("כשל באימות גוגל", "מייל לא מאומת: " + payload.email);
    return null;
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const teamResult = getTeamRaw();
  if (!teamResult.success) return null;

  const found = teamResult.team.find(t => String(t["מייל"] || "").trim().toLowerCase() === email);
  if (!found) {
    logAction("כשל בזיהוי איש צוות", "המייל מגוגל: '" + email + "' לא נמצא בלשונית צוות");
  }
  return found || null;
}

// כל איש צוות מחובר עם הרשאת "מורה" או "אדמין" (לא "צפייה") —
// להוספה/עריכה/בקשת מחיקה של אירועים.
function requireTeamMember(credential) {
  const person = verifyGoogleCredential(credential);
  if (!person) return { authorized: false, error: "יש להתחבר עם חשבון גוגל רשום במערכת" };
  if (String(person["הרשאה"] || "") === "צפייה") {
    return { authorized: false, error: "אין לך הרשאת עריכה (צפייה בלבד)" };
  }
  return { authorized: true, person: person };
}

// רק הרשאת "אדמין" — למחיקה סופית ולניהול צוות.
function requireAdmin(credential) {
  const person = verifyGoogleCredential(credential);
  if (!person) return { authorized: false, error: "יש להתחבר עם חשבון גוגל רשום במערכת" };
  if (String(person["הרשאה"] || "") !== "אדמין") {
    return { authorized: false, error: "פעולה זו מיועדת לאדמין בלבד" };
  }
  return { authorized: true, person: person };
}

// כניסה לאתר הראשי — מזהה מי מתחבר, ומחזיר יחד עם השם/ההרשאה גם את המשימות
// האישיות שלו (אם יש), כדי שדשבורד אחד יראה את מה שרלוונטי לכל אחד.
function verifyLogin(credential) {
  const person = verifyGoogleCredential(credential);
  if (!person) {
    return { success: false, error: "לא נמצא איש צוות עם החשבון הזה — בקש מהרכז להוסיף אותך למערכת" };
  }
  logAction("כניסה לאתר", person["שם מלא"] + " (" + (person["הרשאה"] || "מורה") + ")");
  const dash = buildPersonalDashboard(person);
  return {
    success: true,
    name: person["שם מלא"],
    permission: person["הרשאה"] || "מורה",
    token: person["טוקן אישי"],
    tasks: dash.tasks,
  };
}

// פעולות כתיבה שפתוחות לכל איש צוות מחובר (לא "צפייה")
const TEAM_ACTIONS = ["addEvent", "updateEvent", "requestDelete"];
// פעולות כתיבה שמיועדות לאדמין בלבד
const ADMIN_ACTIONS = ["approveDelete", "rejectDelete", "approveEvent", "rejectEvent", "addTeamMember", "updateTeamMember", "getTeamFull"];

// ── נקודת כניסה ראשית ─────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || "getEvents";

  try {
    let result;
    switch (action) {
      case "getEvents":   result = getEvents(e.parameter);   break;
      case "getSettings": result = getSettings();            break;
      case "getTeam":     result = getTeam();                break;
      case "getAlerts":   result = getAlerts();              break;
      case "getMyTasks":  result = getMyTasks(e.parameter.token); break;
      case "getParentsView": result = getParentsView();      break;
      case "getStaffDirectory": result = getStaffDirectory(); break;
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

    // דיווח סטטוס ביצוע מאומת מול הטוקן האישי של האחראי (לא קשור לכניסת גוגל)
    if (action === "reportTaskStatus") {
      return jsonResponse(reportTaskStatus(body.token, body.id, body.status, body.notes));
    }

    // כניסת מורים עם גוגל — לדשבורד האישי (לפי טוקן, לא הרשאת כתיבה)
    if (action === "googleLogin") {
      return jsonResponse(googleLogin(body.credential));
    }

    // כניסה לאתר הראשי — זיהוי בלבד, לא ביצוע פעולה
    if (action === "verifyLogin") {
      return jsonResponse(verifyLogin(body.credential));
    }

    // כל שאר הפעולות דורשות הרשאת כתיבה לפי דרגה
    let auth;
    if (TEAM_ACTIONS.indexOf(action) !== -1) {
      auth = requireTeamMember(body.credential);
    } else if (ADMIN_ACTIONS.indexOf(action) !== -1) {
      auth = requireAdmin(body.credential);
    } else {
      return jsonResponse({ error: "פעולה לא מוכרת: " + action });
    }

    if (!auth.authorized) {
      return jsonResponse({ success: false, error: "⛔ " + auth.error });
    }

    let result;

    switch (action) {
      case "addEvent":       result = addEvent(body.data, auth.person["שם מלא"], auth.person["הרשאה"]); break;
      case "updateEvent":    result = updateEvent(body.id, body.data, auth.person["שם מלא"]);        break;
      case "requestDelete":  result = requestDelete(body.id, auth.person["שם מלא"], body.reason); break;
      case "approveDelete":  result = approveDelete(body.id, auth.person["שם מלא"]);                 break;
      case "rejectDelete":   result = rejectDelete(body.id, body.reason, auth.person["שם מלא"]);     break;
      case "approveEvent":   result = approveEvent(body.id, auth.person["שם מלא"]);                  break;
      case "rejectEvent":    result = rejectEvent(body.id, body.reason, auth.person["שם מלא"]);      break;
      case "addTeamMember":  result = addTeamMember(body.data, auth.person["שם מלא"]);               break;
      case "updateTeamMember": result = updateTeamMember(body.originalName, body.data, auth.person["שם מלא"]); break;
      case "getTeamFull":    result = getTeamFull();                    break;
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  ensureEventColumns(sheet);
  return sheet;
}

// מוסיף אוטומטית עמודות חסרות בסוף הגיליון, בלי לגעת בקיימות
function ensureEventColumns(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = EVENT_EXTRA_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
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
// אדמין: האירוע עולה מיד ("פעיל") עם סנכרון יומן ותיקיית דרייב.
// מורה/איש צוות (לא אדמין): האירוע נשמר במצב "ממתין לאישור" — לא מסונכרן ליומן
// ואין לו עדיין תיקיית דרייב, עד שאדמין יאשר אותו (ראה approveEvent).
function addEvent(data, actorName, actorPermission) {
  const sheet = getSheet();
  const id    = nextId();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const isAdmin = actorPermission === "אדמין";

  const fullData = Object.assign({}, data, {
    "id": id,
    "סטטוס": isAdmin ? (data["סטטוס"] || "פעיל") : "ממתין לאישור",
    "קטגוריה": data["קטגוריה"] || "gen",
    "תאריך עדכון": now(),
    "נמחק": false,
  });

  if (isAdmin) {
    fullData["סנכרון יומן"] = syncEventToCalendars(fullData);
    fullData["קישור דרייב"] = ensureEventDriveFolder(fullData);
  } else {
    fullData["סנכרון יומן"] = "{}";
    fullData["קישור דרייב"] = "";
  }

  const row = headers.map(h => fullData[h] !== undefined ? fullData[h] : "");
  sheet.appendRow(row);

  if (!isAdmin) {
    logAlert({
      type:        "בקשת אירוע חדש",
      eventId:     id,
      eventTitle:  fullData["כותרת"] || "",
      requestedBy: actorName,
      reason:      "",
      date:        now(),
      status:      "ממתין"
    });
    logAction("בקשת אירוע חדש", "#" + id + " " + (fullData["כותרת"] || "") + " — ע״י " + (actorName || "?"));
    return { success: true, id: id, pending: true, message: "האירוע נשלח לאישור הרכז" };
  }

  logAction("הוספת אירוע", "#" + id + " " + (fullData["כותרת"] || "") + " — ע״י " + (actorName || "?"));
  return { success: true, id: id, message: "אירוע נוסף בהצלחה" };
}

// ── עדכון אירוע ───────────────────────────────────────────────
function updateEvent(id, data, actorName) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);

  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  // עדכן כל שדה שנשלח (לפי שם עמודה, לא לפי מיקום קבוע)
  headers.forEach((h, i) => {
    if (data[h] !== undefined) rowData[i] = data[h];
  });

  const updCol = headers.indexOf("תאריך עדכון");
  if (updCol !== -1) rowData[updCol] = now();

  // בנה אובייקט מלא מהשורה המעודכנת לצורך סנכרון היומנים
  const fullData = {};
  headers.forEach((h, i) => { fullData[h] = rowData[i]; });

  const syncCol = headers.indexOf("סנכרון יומן");
  if (syncCol !== -1) rowData[syncCol] = syncEventToCalendars(fullData);

  // אם לאירוע הזה עוד אין תיקיית דרייב (אירוע ישן מלפני הפיצ'ר) — ניצור לו עכשיו
  const driveCol = headers.indexOf("קישור דרייב");
  if (driveCol !== -1 && !rowData[driveCol]) {
    rowData[driveCol] = ensureEventDriveFolder(fullData);
  }

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  logAction("עדכון אירוע", "#" + id + " " + (fullData["כותרת"] || "") + " — ע״י " + (actorName || "?"));
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

  logAction("בקשת מחיקה", "#" + id + " מאת " + requestedBy + (reason ? " — " + reason : ""));
  return { success: true, message: "בקשת המחיקה נשלחה לאישור הרכז" };
}

// ── אישור מחיקה ───────────────────────────────────────────────
function approveDelete(id, actorName) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);

  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const fullData = {};
  headers.forEach((h, i) => { fullData[h] = rowData[i]; });
  removeEventFromCalendars(fullData);

  const statusCol = headers.indexOf("סטטוס");
  const deletedCol = headers.indexOf("נמחק");
  const updCol    = headers.indexOf("תאריך עדכון");
  const syncCol   = headers.indexOf("סנכרון יומן");

  if (statusCol  !== -1) rowData[statusCol]  = "בוטל";
  if (deletedCol !== -1) rowData[deletedCol] = true;
  if (updCol     !== -1) rowData[updCol]     = now();
  if (syncCol    !== -1) rowData[syncCol]    = "{}";

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  updateAlertStatus(id, "אושר");

  logAction("אישור מחיקה", "#" + id + " " + (fullData["כותרת"] || "") + " — ע״י " + (actorName || "?"));
  return { success: true, message: "האירוע נמחק סופית" };
}

// ── דחיית מחיקה ───────────────────────────────────────────────
function rejectDelete(id, reason, actorName) {
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

  logAction("דחיית מחיקה", "#" + id + (reason ? " — " + reason : "") + " — ע״י " + (actorName || "?"));
  return { success: true, message: "בקשת המחיקה נדחתה, האירוע חזר לפעיל" };
}

// ── אישור אירוע חדש (שהוקם ע״י מורה, לא אדמין) ──────────────────
function approveEvent(id, actorName) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);

  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const fullData = {};
  headers.forEach((h, i) => { fullData[h] = rowData[i]; });
  fullData["סטטוס"] = "פעיל";

  const statusCol = headers.indexOf("סטטוס");
  const updCol    = headers.indexOf("תאריך עדכון");
  const syncCol   = headers.indexOf("סנכרון יומן");
  const driveCol  = headers.indexOf("קישור דרייב");

  if (statusCol !== -1) rowData[statusCol] = "פעיל";
  if (updCol    !== -1) rowData[updCol]    = now();
  if (syncCol   !== -1) rowData[syncCol]   = syncEventToCalendars(fullData);
  if (driveCol  !== -1) rowData[driveCol]  = ensureEventDriveFolder(fullData);

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  updateAlertStatus(id, "אושר");

  logAction("אישור אירוע חדש", "#" + id + " " + (fullData["כותרת"] || "") + " — ע״י " + (actorName || "?"));
  return { success: true, message: "האירוע אושר ועלה ליומן" };
}

// ── דחיית אירוע חדש (שהוקם ע״י מורה, לא אדמין) ──────────────────
function rejectEvent(id, reason, actorName) {
  const sheet  = getSheet();
  const rowNum = findRowById(id);

  if (rowNum === -1) {
    return { success: false, error: "אירוע לא נמצא: " + id };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const statusCol  = headers.indexOf("סטטוס");
  const deletedCol = headers.indexOf("נמחק");
  const noteCol    = headers.indexOf("הערה פנימית");
  const updCol     = headers.indexOf("תאריך עדכון");

  if (statusCol  !== -1) rowData[statusCol]  = "נדחה";
  if (deletedCol !== -1) rowData[deletedCol] = true;
  if (noteCol    !== -1) rowData[noteCol]    = `❌ בקשת אירוע נדחתה (${now()}): ${reason || ""}`;
  if (updCol     !== -1) rowData[updCol]     = now();

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  updateAlertStatus(id, "נדחה");

  logAction("דחיית אירוע חדש", "#" + id + (reason ? " — " + reason : "") + " — ע״י " + (actorName || "?"));
  return { success: true, message: "בקשת האירוע נדחתה" };
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

// ── תצוגת הורים — אותו לוח שנה שיש לצוות, בלי פרטים פנימיים ────────────
// נגיש בקישור פתוח (בלי טוקן) כי אין בו מידע רגיש — רק מה שרלוונטי להורים.
function getParentsView() {
  const eventsResult = getEvents({});

  const events = eventsResult.events
    .filter(ev => ev["קטגוריה"] !== "staff") // אירועי צוות/מנהלים פנימיים לא מוצגים להורים
    .filter(ev => ev["סטטוס"] !== "ממתין לאישור" && ev["סטטוס"] !== "ממתין למחיקה") // רק אירועים חיים ומאושרים
    .map(ev => ({
      id: ev["id"],
      date: ev["תאריך"],
      title: ev["כותרת"],
      cat: ev["קטגוריה"],
      target: ev["קהל יעד"] || "",
      leader: ev["מוביל"] || "",
      note: ev["הערה להורים"] || "",
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { success: true, events: events };
}

// גרסה ציבורית לתצוגת הורים — שם/תפקיד/מקצועות/טלפון בלבד (בלי מייל/טוקן אישי,
// שהם מידע שמאפשר גישה למערכת). נגישה בכוונה בלי התחברות, כמו getParentsView.
function getStaffDirectory() {
  const full = getTeamRaw();
  if (!full.success) return full;

  const safe = full.team.map(t => ({
    "שם מלא": t["שם מלא"],
    "תפקיד": t["תפקיד"],
    "מקצועות": t["מקצועות"],
    "טלפון": t["טלפון"],
  }));

  return { success: true, team: safe };
}

// ── קריאת רשימת צוות ──────────────────────────────────────────
// גרסה מלאה — כוללת טלפון/מייל/טוקן אישי. לשימוש פנימי בלבד בתוך השרת
// (מייל שבועי, כניסה עם גוגל, דשבורד אישי) ובפעולת getTeamFull המוגנת בהתחברות אדמין.
// אסור לחשוף את הפונקציה הזו ישירות דרך doGet בלי סינון — ראה getTeam() למטה.
function getTeamRaw() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("צוות");

  // אם הלשונית עוד לא קיימת — ניצור אותה עם הכותרות הנכונות
  if (!sheet) {
    sheet = ss.insertSheet("צוות");
    sheet.setRightToLeft(true);
    const headers = ["שם מלא","תפקיד","מקצועות","טלפון","מייל","הרשאה","סטטוס","טוקן אישי"];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length).setBackground("#1a1a2e").setFontColor("#fff").setFontWeight("bold");
    return { success: true, team: [] };
  }

  ensureTeamColumns(sheet);

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const tokenCol = headers.indexOf("טוקן אישי");

  // ודא שלכל שורה יש טוקן אישי קבוע (לקישור הדשבורד האישי)
  const rows = data.slice(1);
  rows.forEach((row, i) => {
    if (tokenCol !== -1 && !row[tokenCol]) {
      const token = generateToken();
      row[tokenCol] = token;
      sheet.getRange(i + 2, tokenCol + 1).setValue(token);
    }
  });

  const mapped = rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    if (obj["טלפון"]) obj["טלפון"] = formatPhone(obj["טלפון"]);
    return obj;
  });

  // רק חברי צוות פעילים
  const active = mapped.filter(r => String(r["סטטוס"] || "").trim() !== "לא פעיל");

  return { success: true, team: active };
}

// גרסה בטוחה לפרסום ציבורי (doGet, בלי מפתח) — למשל תפריט "מוביל" בטופס האירוע.
// מסננת החוצה טלפון/מייל/טוקן אישי, כדי שאף אחד לא יוכל "לגנוב" קישור אישי של מישהו אחר.
function getTeam() {
  const full = getTeamRaw();
  if (!full.success) return full;

  const safe = full.team.map(t => ({
    "שם מלא": t["שם מלא"],
    "תפקיד": t["תפקיד"],
    "מקצועות": t["מקצועות"],
    "סטטוס": t["סטטוס"],
  }));

  return { success: true, team: safe };
}

// גרסה מלאה לאדמין בלבד (doPost, דורשת התחברות גוגל עם הרשאת אדמין) — לפאנל ניהול הצוות באתר.
function getTeamFull() {
  return getTeamRaw();
}

// ── הוספת איש צוות ──────────────────────────────────────────────
function addTeamMember(data, actorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("צוות");

  if (!sheet) {
    sheet = ss.insertSheet("צוות");
    sheet.setRightToLeft(true);
    const headers = ["שם מלא","תפקיד","מקצועות","טלפון","מייל","הרשאה","סטטוס","טוקן אישי"];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length).setBackground("#1a1a2e").setFontColor("#fff").setFontWeight("bold");
  } else {
    ensureTeamColumns(sheet);
  }

  const row = [
    data["שם מלא"] || "",
    data["תפקיד"]  || "",
    data["מקצועות"] || "",
    data["טלפון"]  || "",
    data["מייל"]   || "",
    data["הרשאה"]  || "מורה",
    data["סטטוס"]  || "פעיל",
    generateToken(),
  ];

  sheet.appendRow(row);
  logAction("הוספת איש צוות", (data["שם מלא"] || "") + " — ע״י " + (actorName || "?"));
  return { success: true, message: "איש הצוות נוסף בהצלחה" };
}

// ── עדכון איש צוות קיים ──────────────────────────────────────────
function updateTeamMember(originalName, data, actorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("צוות");
  if (!sheet) return { success: false, error: "לשונית צוות לא נמצאה" };
  ensureTeamColumns(sheet);

  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const nameCol  = headers.indexOf("שם מלא");
  const tokenCol = headers.indexOf("טוקן אישי");

  let rowNum = -1;
  let existingToken = "";
  for (let i = 1; i < values.length; i++) {
    if (values[i][nameCol] === originalName) {
      rowNum = i + 1;
      existingToken = tokenCol !== -1 ? values[i][tokenCol] : "";
      break;
    }
  }
  if (rowNum === -1) return { success: false, error: "איש צוות לא נמצא: " + originalName };
  if (!existingToken) existingToken = generateToken(); // שומרים על אותו טוקן — לא שוברים קישורים קיימים

  const row = [
    data["שם מלא"] || originalName,
    data["תפקיד"]  || "",
    data["מקצועות"] || "",
    data["טלפון"]  || "",
    data["מייל"]   || "",
    data["הרשאה"]  || "מורה",
    data["סטטוס"]  || "פעיל",
    existingToken,
  ];

  sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  logAction("עדכון איש צוות", originalName + " — ע״י " + (actorName || "?"));
  return { success: true, message: "איש הצוות עודכן בהצלחה" };
}

// ── יומן פעולות יומי ─────────────────────────────────────────────
// קובץ Sheets נפרד (לא בגיליון הראשי) שבו נוצרת כל יום כרטיסייה חדשה
// עם רישום של כל פעולה שקרתה במערכת.

function getActionLogSheet() {
  const props = PropertiesService.getScriptProperties();
  let logFileId = props.getProperty("ACTION_LOG_FILE_ID");
  let ss = null;

  if (logFileId) {
    try { ss = SpreadsheetApp.openById(logFileId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create("יומן פעולות - מערכת ריכוז חברתי");
    props.setProperty("ACTION_LOG_FILE_ID", ss.getId());
  }

  const today = now(); // YYYY-MM-DD
  let sheet = ss.getSheetByName(today);
  if (!sheet) {
    sheet = ss.insertSheet(today);
    sheet.setRightToLeft(true);
    const headers = ["שעה", "פעולה", "פרטים"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1a1a2e").setFontColor("#fff").setFontWeight("bold");
    sheet.setColumnWidth(3, 400);

    // מנקים את הגיליון הריק שגוגל יוצר אוטומטית עם כל קובץ חדש
    const junkNames = ["Sheet1", "גיליון1"];
    junkNames.forEach(n => {
      const junk = ss.getSheetByName(n);
      if (junk && ss.getSheets().length > 1) {
        try { ss.deleteSheet(junk); } catch (e) {}
      }
    });
  }
  return sheet;
}

// רישום פעולה ביומן. לעולם לא נכשיל פעולה אמיתית בגלל בעיה ברישום.
function logAction(action, details) {
  try {
    const sheet = getActionLogSheet();
    const time = Utilities.formatDate(new Date(), "GMT+3", "HH:mm:ss");
    sheet.appendRow([time, action, details || ""]);
  } catch (e) {
    // מתעלמים בכוונה
  }
}

// ── קריאת בקשות ממתינות ────────────────────────────────────────
function getAlerts() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("תור התראות");
  if (!sheet) return { success: true, alerts: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, alerts: [] };

  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = h === "תאריך" ? formatDate(row[i]) : row[i];
    });
    return obj;
  });

  const pending = rows.filter(r => r["סטטוס"] === "ממתין");
  return { success: true, alerts: pending };
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

// ── סנכרון אירוע ליומני Google Calendar ────────────────────────

// לפי אילו שדות באירוע — לאילו יומנים הוא צריך להגיע
function getRelevantCalendars(eventData) {
  const cals = ["main", "staff"]; // תמיד
  if (eventData["קטגוריה"] !== "staff") cals.push("parents");
  const transport = eventData["הסעות"];
  if (transport && transport !== "לא נדרש") cals.push("transport");
  const food = eventData["אוכל"];
  if (food && food !== "לא נדרש") cals.push("food");
  if (eventData["אישור טיול"]) cals.push("tripApproval");
  return cals;
}

// המרת ערך שעה (ייתכן ויגיע כ-Date אם גוגל "זיהה" אותו כשעה) לטקסט HH:MM
function formatTimeVal(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, "0");
    const m = String(val.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }
  return String(val);
}

function buildEventDescription(eventData) {
  const lines = [];
  const timeStart = formatTimeVal(eventData["שעת התחלה"]);
  const timeEnd   = formatTimeVal(eventData["שעת סיום"]);
  if (timeStart) lines.push("שעה: " + timeStart + (timeEnd ? "–" + timeEnd : ""));
  if (eventData["קהל יעד"])          lines.push("קהל יעד: " + eventData["קהל יעד"]);
  if (eventData["מוביל"])            lines.push("מוביל: " + eventData["מוביל"]);
  if (eventData["מספר משתתפים"])     lines.push("מספר משתתפים: " + eventData["מספר משתתפים"]);
  if (eventData["הסעות"])            lines.push("הסעות: " + eventData["הסעות"] + (eventData["פרטי הסעה"] ? " - " + eventData["פרטי הסעה"] : ""));
  if (eventData["אוכל"])             lines.push("אוכל: " + eventData["אוכל"] + (eventData["פרטי אוכל"] ? " - " + eventData["פרטי אוכל"] : ""));
  if (eventData["אישור טיול"])       lines.push("אישור טיול: " + eventData["אישור טיול"]);
  if (eventData["בקשות מיוחדות"])    lines.push("בקשות מיוחדות: " + eventData["בקשות מיוחדות"]);
  if (eventData["הערה פנימית"])      lines.push("הערה: " + eventData["הערה פנימית"]);
  if (eventData["סטטוס ביצוע"])      lines.push("סטטוס ביצוע: " + eventData["סטטוס ביצוע"]);
  if (eventData["הערות ביצוע"])      lines.push("הערות ביצוע: " + eventData["הערות ביצוע"]);
  return lines.join("\n");
}

// יוצר/מעדכן/מוחק את האירוע בכל היומנים הרלוונטיים, ומחזיר מחרוזת JSON
// עם מזהי האירועים ביומנים (לשמירה בעמודת "סנכרון יומן")
function syncEventToCalendars(eventData) {
  const dateStr = formatDate(eventData["תאריך"]);
  if (!dateStr) return eventData["סנכרון יומן"] || "{}";

  const parts = dateStr.split("-").map(Number);
  const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);

  const title = eventData["כותרת"] || "(ללא כותרת)";
  const description = buildEventDescription(eventData);
  const relevant = getRelevantCalendars(eventData);

  let syncMap = {};
  try { syncMap = JSON.parse(eventData["סנכרון יומן"] || "{}"); } catch (e) { syncMap = {}; }

  const newSyncMap = {};
  Object.keys(CALENDAR_IDS).forEach(key => {
    let calendar;
    try { calendar = CalendarApp.getCalendarById(CALENDAR_IDS[key]); } catch (e) { calendar = null; }
    if (!calendar) return;

    const shouldHave  = relevant.indexOf(key) !== -1;
    const existingId  = syncMap[key];

    if (shouldHave) {
      let calEvent = null;
      if (existingId) {
        try { calEvent = calendar.getEventById(existingId); } catch (e) { calEvent = null; }
      }
      if (calEvent) {
        calEvent.setTitle(title);
        calEvent.setAllDayDate(eventDate);
        calEvent.setDescription(description);
        newSyncMap[key] = existingId;
      } else {
        const created = calendar.createAllDayEvent(title, eventDate, { description: description });
        newSyncMap[key] = created.getId();
      }
    } else if (existingId) {
      try {
        const calEvent = calendar.getEventById(existingId);
        if (calEvent) calEvent.deleteEvent();
      } catch (e) {}
    }
  });

  return JSON.stringify(newSyncMap);
}

// מוחק אירוע מכל היומנים ששמורים לו (בשימוש כשמאשרים מחיקה סופית)
function removeEventFromCalendars(eventData) {
  let syncMap = {};
  try { syncMap = JSON.parse(eventData["סנכרון יומן"] || "{}"); } catch (e) { syncMap = {}; }

  Object.keys(syncMap).forEach(key => {
    let calendar;
    try { calendar = CalendarApp.getCalendarById(CALENDAR_IDS[key]); } catch (e) { calendar = null; }
    if (!calendar) return;
    try {
      const calEvent = calendar.getEventById(syncMap[key]);
      if (calEvent) calEvent.deleteEvent();
    } catch (e) {}
  });
}

// ── תיקיית דרייב אוטומטית לכל אירוע ────────────────────────────

// תיקיית-אב אחת שבתוכה נוצרות כל תיקיות האירועים. נוצרת פעם אחת ונשמרת ב-Properties.
function getEventsRootFolder() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("EVENTS_DRIVE_FOLDER_ID");

  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) {}
  }

  const folder = DriveApp.createFolder("אירועים - מערכת ריכוז חברתי");
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  props.setProperty("EVENTS_DRIVE_FOLDER_ID", folder.getId());
  return folder;
}

// הרצה חד-פעמית ידנית מהעורך — פותחת לעריכה (למי שיש את הקישור) את תיקיית האירועים
// הראשית בדרייב. תיקיות האירועים הבודדות יורשות הרשאה מהתיקייה הזו אוטומטית,
// כך שגם תיקיות שכבר נוצרו קודם ייפתחו למורים בלי לגעת בכל אחת בנפרד.
function shareEventsRootFolder() {
  const folder = getEventsRootFolder();
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  Logger.log("תיקיית האירועים פתוחה לעריכה למי שיש את הקישור: " + folder.getUrl());
}

// יוצר תיקייה לאירוע אם עוד אין לו אחת, ומחזיר את הקישור אליה.
// אם כבר יש קישור שמור — מחזיר אותו כמו שהוא, ולא יוצר תיקייה כפולה.
function ensureEventDriveFolder(eventData) {
  const existing = eventData["קישור דרייב"];
  if (existing) return existing;

  try {
    const root  = getEventsRootFolder();
    const date  = formatDate(eventData["תאריך"]) || "ללא תאריך";
    const title = eventData["כותרת"] || "אירוע ללא שם";
    const folder = root.createFolder(date + " - " + title);
    return folder.getUrl();
  } catch (e) {
    logAction("שגיאה ביצירת תיקיית דרייב", (eventData["כותרת"] || "") + " — " + e.toString());
    return "";
  }
}

// מריצים פעם אחת ידנית מהעורך — יוצר תיקיית דרייב לכל אירוע קיים שעדיין אין לו אחת.
// אפשר להריץ כמה פעמים ברציפות בלי בעיה — אירוע שכבר יש לו תיקייה פשוט ידולג.
function backfillDriveFolders() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const driveCol = headers.indexOf("קישור דרייב");
  const deletedCol = headers.indexOf("נמחק");

  if (driveCol === -1) {
    Logger.log("לא נמצאה עמודת 'קישור דרייב' בגיליון");
    return;
  }

  let processed = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (deletedCol !== -1 && row[deletedCol] === true) continue;
    if (row[driveCol]) continue; // כבר יש תיקייה — דלג

    const fullData = {};
    headers.forEach((h, idx) => { fullData[h] = row[idx]; });

    const link = ensureEventDriveFolder(fullData);
    if (link) {
      sheet.getRange(i + 1, driveCol + 1).setValue(link);
      processed++;
    }
  }

  Logger.log("נוצרו " + processed + " תיקיות דרייב חדשות לאירועים");
}

// ── דשבורד אישי לאחראים + סיכום שבועי ────────────────────────────

// מוסיף עמודת "טוקן אישי" לטאב צוות אם חסרה
function ensureTeamColumns(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const required = ["טוקן אישי"];
  const missing = required.filter(c => !headers.includes(c));
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

function generateToken() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 16);
}

// גוגל שיטס שומר מספרי טלפון כמספר, כך שה-0 המוביל נחתך (0528348306 -> 528348306).
// משלימים אותו בחזרה לתצוגה, בלי לגעת בערך המקורי בגיליון.
function formatPhone(val) {
  const s = String(val).trim();
  if (/^\d{9}$/.test(s) && !s.startsWith("0")) return "0" + s;
  return s;
}

// ── כניסת מורים עם גוגל ────────────────────────────────────────
// מאמת את אישור ההתחברות (ID token) מול גוגל עצמה, מוצא את כתובת המייל המאומתת,
// ומחפש איש צוות עם אותה כתובת מייל בלשונית "צוות". לא נדרש מפתח סודי —
// האימות מגיע מגוגל, לא מהרכז.
function googleLogin(credential) {
  if (!credential) return { success: false, error: "חסר אישור התחברות" };

  let payload;
  try {
    const res = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
    payload = JSON.parse(res.getContentText());
  } catch (e) {
    return { success: false, error: "שגיאה באימות מול גוגל" };
  }

  if (!payload || payload.aud !== GOOGLE_CLIENT_ID) {
    return { success: false, error: "אימות לא תקין" };
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    return { success: false, error: "כתובת המייל בחשבון הגוגל לא מאומתת" };
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const teamResult = getTeamRaw();
  if (!teamResult.success) return { success: false, error: "שגיאה בטעינת צוות" };

  const person = teamResult.team.find(t => String(t["מייל"] || "").trim().toLowerCase() === email);
  if (!person) {
    return { success: false, error: "לא נמצא איש צוות עם הכתובת " + email + " — בקש מהרכז להוסיף אותך למערכת עם המייל הזה" };
  }

  logAction("התחברות עם גוגל", person["שם מלא"] + " (" + email + ")");
  return { success: true, token: person["טוקן אישי"], name: person["שם מלא"] };
}

// מחזיר את כל שדות "הדיווח" הרלוונטיים לתפקידים של אדם נתון
function getMyReportFields(person) {
  return REPORT_FIELDS.filter(rf => String(person["תפקיד"] || "").indexOf(rf.role) !== -1);
}

// ── דשבורד אישי ───────────────────────────────────────────────
// בונה את המשימות האישיות + הלוח הקרוב של אדם נתון (משותף בין getMyTasks ל-verifyLogin)
function buildPersonalDashboard(person) {
  const eventsResult = getEvents({});

  // ── משימות "אחראי" (רלוונטי רק למי שיש לו תפקיד הסעות/אוכל/אישור טיול) ──
  const myFields = getMyReportFields(person);
  const tasks = [];

  eventsResult.events.forEach(ev => {
    myFields.forEach(rf => {
      const value = ev[rf.field];
      if (!rf.isRelevant(value)) return;
      tasks.push({
        id: ev["id"],
        title: ev["כותרת"],
        date: ev["תאריך"],
        field: rf.field,
        value: value,
        status: ev["סטטוס ביצוע"] || "",
        notes: ev["הערות ביצוע"] || "",
        target: ev["קהל יעד"] || "",
        leader: ev["מוביל"] || "",
        participants: ev["מספר משתתפים"] || "",
        timeStart: ev["שעת התחלה"] || "",
        timeEnd: ev["שעת סיום"] || "",
        specialRequests: ev["בקשות מיוחדות"] || "",
      });
    });
  });

  tasks.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // ── לוח כללי של כל האירועים מהיום ועד סוף השנה — רלוונטי לכל איש צוות, גם למי שאין לו תפקיד דיווח ──
  const todayStr = formatDateObj(new Date());
  const upcoming = eventsResult.events
    .filter(ev => String(ev["תאריך"]) >= todayStr)
    .map(ev => ({
      id: ev["id"],
      date: ev["תאריך"],
      title: ev["כותרת"],
      cat: ev["קטגוריה"],
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { tasks: tasks, upcoming: upcoming };
}

// ── דשבורד אישי — קריאת המשימות של אדם לפי הטוקן שלו (קישור ישן, ?staff=) ────
function getMyTasks(token) {
  const teamResult = getTeamRaw();
  if (!teamResult.success) return { success: false, error: "שגיאה בטעינת צוות" };

  const person = teamResult.team.find(t => t["טוקן אישי"] === token);
  if (!person) return { success: false, error: "קישור לא תקין" };

  const dash = buildPersonalDashboard(person);
  return { success: true, name: person["שם מלא"], tasks: dash.tasks, upcoming: dash.upcoming };
}

// ── דשבורד אישי — עדכון סטטוס משימה (מאומת מול הטוקן, לא מול הסיסמה הראשית) ──
function reportTaskStatus(token, id, status, notes) {
  const teamResult = getTeamRaw();
  if (!teamResult.success) return { success: false, error: "שגיאה בטעינת צוות" };

  const person = teamResult.team.find(t => t["טוקן אישי"] === token);
  if (!person) return { success: false, error: "קישור לא תקין" };

  const sheet  = getSheet();
  const rowNum = findRowById(id);
  if (rowNum === -1) return { success: false, error: "אירוע לא נמצא: " + id };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const statusCol = headers.indexOf("סטטוס ביצוע");
  const notesCol  = headers.indexOf("הערות ביצוע");
  if (statusCol !== -1) rowData[statusCol] = status || "";
  if (notesCol  !== -1) rowData[notesCol]  = notes || "";

  const fullData = {};
  headers.forEach((h, i) => { fullData[h] = rowData[i]; });

  const syncCol = headers.indexOf("סנכרון יומן");
  if (syncCol !== -1) rowData[syncCol] = syncEventToCalendars(fullData);

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([rowData]);
  logAction("עדכון סטטוס ביצוע", person["שם מלא"] + " → #" + id + " — " + (status || "(ריק)"));
  return { success: true, message: "עודכן בהצלחה" };
}

// ── סיכום שבועי ───────────────────────────────────────────────

function formatDateObj(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function getDateRangeStr(startOffsetDays, endOffsetDays) {
  const start = new Date(); start.setDate(start.getDate() + startOffsetDays);
  const end   = new Date(); end.setDate(end.getDate() + endOffsetDays);
  return { start: formatDateObj(start), end: formatDateObj(end) };
}

// שולח לכל אחראי מייל שבועי אחד עם המשימות של השבוע הזה והשבוע הבא.
// מיועד לרוץ אוטומטית כל יום ראשון (ראה setupWeeklyDigestTrigger).
function sendWeeklyDigest() {
  const teamResult = getTeamRaw();
  if (!teamResult.success) return;

  const eventsResult = getEvents({});
  const events = eventsResult.events;

  const thisWeek = getDateRangeStr(0, 7);
  const nextWeek = getDateRangeStr(7, 14);

  teamResult.team.forEach(person => {
    if (!person["מייל"]) return;

    const sections = [];

    // ── חלק 1: משימות "אחראי" (הסעות/אוכל/אישור טיול) ──
    const myFields = getMyReportFields(person);
    if (myFields.length) {
      const thisWeekLines = [];
      const nextWeekLines = [];

      events.forEach(ev => {
        myFields.forEach(rf => {
          const value = ev[rf.field];
          if (!rf.isRelevant(value)) return;
          const d = String(ev["תאריך"]);
          const statusTxt = ev["סטטוס ביצוע"] ? "[" + ev["סטטוס ביצוע"] + "]" : "[⏳ לא סומן]";
          const line = "• " + d + " — " + ev["כותרת"] + " (" + rf.field + ": " + value + ") " + statusTxt;
          if (d >= thisWeek.start && d <= thisWeek.end) thisWeekLines.push(line);
          else if (d >= nextWeek.start && d <= nextWeek.end) nextWeekLines.push(line);
        });
      });

      if (thisWeekLines.length || nextWeekLines.length) {
        sections.push(
          "📌 משימות שהוקצו לך:\n" +
          "השבוע (אמור להיות סגור):\n" + (thisWeekLines.length ? thisWeekLines.join("\n") : "אין") +
          "\n\nשבוע הבא (להתחיל לסגור):\n" + (nextWeekLines.length ? nextWeekLines.join("\n") : "אין")
        );
      }
    }

    // ── חלק 2: אירועים שהוא "מוביל" בקרוב + צ'קליסט מה חסר ──
    const leaderEvents = events.filter(ev => ev["מוביל"] === person["שם מלא"]);
    const upcomingLead = leaderEvents.filter(ev => {
      const d = String(ev["תאריך"]);
      return d >= thisWeek.start && d <= nextWeek.end;
    });

    if (upcomingLead.length) {
      const lines = upcomingLead.map(ev => {
        const missing = getMissingChecklistItems(ev);
        const missingTxt = missing.length ? " ⚠️ עדיין חסר: " + missing.join(", ") : " ✅ הצ'קליסט מלא";
        return "• " + ev["תאריך"] + " — " + ev["כותרת"] + missingTxt;
      });
      sections.push("🎯 אירועים שאתה מוביל בשבועיים הקרובים:\n" + lines.join("\n"));
    }

    if (!sections.length) return;

    const link = SITE_URL + "?staff=" + person["טוקן אישי"];
    const body = [
      "שלום " + person["שם מלא"] + ",",
      "",
      sections.join("\n\n"),
      "",
      "לעדכון סטטוס, היכנס לדשבורד האישי שלך:",
      link,
    ].join("\n");

    try {
      MailApp.sendEmail(person["מייל"], "סיכום שבועי — המשימות שלך", body);
      logAction("מייל סיכום שבועי", person["שם מלא"]);
    } catch (e) {
      logAction("שגיאה במייל סיכום שבועי", person["שם מלא"] + " — " + e.toString());
    }
  });
}

// ── מייל לדוגמה (תוכן דמה) ───────────────────────────────────────
// שולח דוגמה של מייל הסיכום השבועי עם נתונים מומצאים — לא תלוי בשום אירוע אמיתי
// או בתאריך אמיתי בלוח, כדי שאפשר יהיה לראות איך המייל נראה גם עכשיו בקיץ,
// בלי להעלות אירוע דמה אמיתי שצריך תאריך בטווח שנת הלימודים (ספטמבר ואילך).
// הרצה חד-פעמית ידנית מהעורך. אפשר לשנות את TO_EMAIL לפני ההרצה.
function sendSampleDigestEmail() {
  const TO_EMAIL = "REPLACE_WITH_EMAIL@example.com"; // (הכתובת המקורית הושחרה במאגר הציבורי) // <-- אפשר לשנות לכתובת אחרת לפני ההרצה

  const body = [
    "שלום,",
    "",
    "זהו מייל לדוגמה בלבד (תוכן מומצא) — כדי להראות איך נראה מייל הסיכום השבועי האמיתי.",
    "",
    "📌 משימות שהוקצו לך:",
    "השבוע (אמור להיות סגור):",
    "• 2026-09-15 — טיול שנתי כיתה ח' (הסעות: אוטובוס) [⏳ לא סומן]",
    "",
    "שבוע הבא (להתחיל לסגור):",
    "• 2026-09-20 — ערב גיבוש צוות (אוכל: פיצות) [⏳ לא סומן]",
    "",
    "🎯 אירועים שאתה מוביל בשבועיים הקרובים:",
    "• 2026-09-15 — טיול שנתי כיתה ח' ⚠️ עדיין חסר: הסעות, אוכל",
    "",
    "לעדכון סטטוס, היכנס לדשבורד האישי שלך:",
    SITE_URL + "?staff=דוגמה",
  ].join("\n");

  try {
    MailApp.sendEmail(TO_EMAIL, "סיכום שבועי — המשימות שלך (דוגמה)", body);
    Logger.log("נשלח מייל לדוגמה אל " + TO_EMAIL);
  } catch (e) {
    Logger.log("שגיאה בשליחת מייל לדוגמה: " + e.toString());
  }
}

// מריצים פעם אחת ידנית מהעורך כדי להפעיל את השליחה האוטומטית כל יום ראשון
function setupWeeklyDigestTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === "sendWeeklyDigest");
  if (exists) {
    Logger.log("הטריגר השבועי כבר מוגדר, לא נוצר כפול");
    return;
  }

  ScriptApp.newTrigger("sendWeeklyDigest")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(8)
    .create();

  Logger.log("טריגר שבועי הוגדר בהצלחה — ירוץ כל יום ראשון בבוקר");
}

// ── סנכרון היסטורי — מריצים פעם אחת ידנית מהעורך ───────────────
// דוחף לכל היומנים את כל האירועים הקיימים שעדיין לא סונכרנו.
// אפשר להריץ כמה פעמים ברציפות בלי בעיה — אירוע שכבר סונכרן פשוט ידולג.
function backfillCalendarSync() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const syncCol = headers.indexOf("סנכרון יומן");
  const deletedCol = headers.indexOf("נמחק");

  let processed = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (deletedCol !== -1 && row[deletedCol] === true) continue;
    if (syncCol !== -1 && row[syncCol]) continue; // כבר מסונכרן — דלג

    const fullData = {};
    headers.forEach((h, idx) => { fullData[h] = row[idx]; });

    const syncJson = syncEventToCalendars(fullData);
    if (syncCol !== -1) {
      sheet.getRange(i + 1, syncCol + 1).setValue(syncJson);
    }
    processed++;
  }

  Logger.log("סונכרנו " + processed + " אירועים חדשים ליומנים");
}

// ── פונקציית בדיקה ────────────────────────────────────────────
function testApi() {
  const events = getEvents({});
  Logger.log("סך אירועים: " + events.count);
  Logger.log("אירוע ראשון: " + JSON.stringify(events.events[0]));
}

// ── הרצה חד-פעמית ידנית מהעורך — כדי לאשר לסקריפט הרשאה לפנות לאתרים חיצוניים ──
// זו הרשאה שגוגל לא יכולה לבקש אוטומטית כשהאתר קורא לפונקציה מרחוק (כמו כניסה עם גוגל),
// ולכן צריך להריץ פעם אחת ידנית מכאן כדי שיופיע חלון האישור.
function authorizeExternalFetch() {
  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=test", { muteHttpExceptions: true });
  Logger.log(res.getContentText());
}

// ── איפוס מלא של כל האירועים ────────────────────────────────────
// הרצה חד-פעמית ידנית מהעורך — מנקה קודם את כל האירועים מכל יומני הגוגל המסונכרנים
// (כדי שלא יישארו "תקועים" שם), ורק אז מוחקת את כל השורות מהגיליון (הכותרות נשארות).
// תיקיות הדרייב הקיימות לא נמחקות — נשארות כארכיון.
function wipeAllEvents() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  rows.forEach(row => {
    const fullData = {};
    headers.forEach((h, i) => { fullData[h] = row[i]; });
    removeEventFromCalendars(fullData);
  });

  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }

  logAction("מחיקת כל האירועים", rows.length + " אירועים נמחקו מהגיליון ומהיומנים");
  Logger.log("נמחקו " + rows.length + " אירועים מהגיליון ומהיומנים (תיקיות דרייב לא נמחקו)");
}

// ── סיום ייבוא אירועים שהודבקו ידנית לגיליון ─────────────────────
// הרצה חד-פעמית ידנית מהעורך אחרי הדבקת רשימה חדשה ישירות לגיליון (בלי דרך האתר).
// לכל שורה חדשה: נותנת מספר id ייחודי, משלימה סטטוס="פעיל" ונמחק=false אם ריקים,
// ומפעילה סנכרון ליומני גוגל + יצירת תיקיית דרייב.
function finalizeImportedEvents() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idCol      = headers.indexOf("id");
  const statusCol  = headers.indexOf("סטטוס");
  const deletedCol = headers.indexOf("נמחק");
  const updCol     = headers.indexOf("תאריך עדכון");
  const syncCol    = headers.indexOf("סנכרון יומן");
  const driveCol   = headers.indexOf("קישור דרייב");
  const catCol     = headers.indexOf("קטגוריה");

  // מוצאים את המספר הגבוה ביותר הקיים, כדי להמשיך ממנו הלאה
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const n = parseInt(data[i][idCol]) || 0;
    if (n > maxId) maxId = n;
  }

  let processed = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // דילוג על שורה ריקה לגמרי
    if (!row.some(v => v !== "" && v !== null)) continue;

    if (idCol !== -1 && !row[idCol]) { maxId++; row[idCol] = maxId; }
    if (statusCol !== -1 && !row[statusCol]) row[statusCol] = "פעיל";
    if (deletedCol !== -1 && row[deletedCol] === "") row[deletedCol] = false;
    if (updCol !== -1 && !row[updCol]) row[updCol] = now();
    if (catCol !== -1 && !row[catCol]) row[catCol] = "gen";

    const fullData = {};
    headers.forEach((h, idx) => { fullData[h] = row[idx]; });

    if (syncCol !== -1) row[syncCol] = syncEventToCalendars(fullData);
    if (driveCol !== -1 && !row[driveCol]) row[driveCol] = ensureEventDriveFolder(fullData);

    sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
    processed++;
  }

  logAction("ייבוא אירועים חדשים", processed + " אירועים אותחלו וסונכרנו");
  Logger.log("הושלמו " + processed + " אירועים: מספרי id, סטטוס, סנכרון יומן ותיקיות דרייב");
}

// ── סנכרון חד-כיווני: מהאתר ללוח הצבעוני החיצוני ────────────────────────────
// חד-כיווני בכוונה: הפונקציה הזו רק כותבת אל הגיליון הצבעוני, לעולם לא קוראת ממנו.
// כל הרצה דורסת מחדש את כל התוכן שלו לפי הנתונים העדכניים בגיליון "אירועים" —
// אסור לערוך את הגיליון הצבעוני ידנית, כי כל שינוי ידני יימחק בהרצה הבאה.
const VISUAL_CALENDAR_SHEET_ID = "1K1HwUF0-pzz1Q8X9U3SkvmDx_3_ZZo4mvVmL-8vt4SA";
const VISUAL_CALENDAR_TAB = "גיליון1";

const VISUAL_MONTHS = [
  {y:2026,m:9},{y:2026,m:10},{y:2026,m:11},{y:2026,m:12},
  {y:2027,m:1},{y:2027,m:2},{y:2027,m:3},{y:2027,m:4},{y:2027,m:5},{y:2027,m:6},
];
const VISUAL_MONTH_NAMES = {9:"ספטמבר",10:"אוקטובר",11:"נובמבר",12:"דצמבר",1:"ינואר",2:"פברואר",3:"מרץ",4:"אפריל",5:"מאי",6:"יוני"};
const VISUAL_MONTH_COLORS = {
  "2026-9":"#2c3e50","2026-10":"#1a5276","2026-11":"#1b4f72","2026-12":"#1a3a4a",
  "2027-1":"#154360","2027-2":"#4a235a","2027-3":"#1d3a22","2027-4":"#7b241c","2027-5":"#1e6b40","2027-6":"#1a5276",
};
// אותם צבעי רקע רכים שהאתר עצמו משתמש בהם לכל קטגוריה (ראה CATEGORIES ב-App.jsx)
const VISUAL_CAT_COLORS = {
  chag:"#fdecea", social:"#f3e5f5", trip:"#e8f5e9", parents:"#e3f2fd", staff:"#fff3e0",
  sports:"#e0f2f1", vol:"#f5f5f5", bg:"#f3e5f5", ruach:"#e8f5e9", gen:"#ecf0f1",
};
const VISUAL_WEEKDAY_LETTERS = ["א","ב","ג","ד","ה","ו","שבת"];

const HEB_MONTHS_GS = {7:"תשרי",8:"חשון",9:"כסלו",10:"טבת",11:"שבט",12:"אדר א׳",13:"אדר ב׳",1:"ניסן",2:"אייר",3:"סיון",4:"תמוז",5:"אב",6:"אלול"};
const HEB_NUMS_GS = ["","א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ז׳","ח׳","ט׳","י׳","י״א","י״ב","י״ג","י״ד","ט״ו","ט״ז","י״ז","י״ח","י״ט","כ׳","כ״א","כ״ב","כ״ג","כ״ד","כ״ה","כ״ו","כ״ז","כ״ח","כ״ט","ל׳"];

// גרסה ל-Apps Script של אותו חישוב תאריך עברי שמשמש באתר (App.jsx: jewishDate)
function jewishDateGS(year, month, day) {
  const JD_ANCHOR = 2461301; // 1 תשרי תשפ"ז = 12 בספטמבר 2026
  const MONTH_LENGTHS_5787 = [0,30,29,29,30,29,30,30,29,30,29,30,29,29];

  function jdFromGreg(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y/100);
    const B = 2 - A + Math.floor(A/4);
    return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524;
  }

  const jd = jdFromGreg(year, month, day);
  const daysSinceTishri = jd - JD_ANCHOR;

  if (daysSinceTishri < 0 || daysSinceTishri >= 385) {
    const TISHRI1_5786 = 2460941;
    const d2 = jd - TISHRI1_5786;
    const ml5786 = {7:30,8:29,9:30,10:29,11:30,12:29,1:30,2:29,3:30,4:29,5:30,6:29};
    const order5786 = [7,8,9,10,11,12,1,2,3,4,5,6];
    let rem = d2;
    for (const mn of order5786) {
      const ml = ml5786[mn];
      if (rem < ml) return { d: rem+1, mn: HEB_MONTHS_GS[mn] || "" };
      rem -= ml;
    }
    return { d: 29, mn: "אלול" };
  }

  const ORDER = [7,8,9,10,11,12,13,1,2,3,4,5,6];
  let rem = daysSinceTishri;
  for (const mn of ORDER) {
    const len = MONTH_LENGTHS_5787[mn];
    if (rem < len) return { d: rem+1, mn: HEB_MONTHS_GS[mn] };
    rem -= len;
  }
  return { d: rem+1, mn: "אלול" };
}

// מרעננת את הגיליון הצבעוני החיצוני לפי הנתונים העדכניים באתר. אפשר להריץ ידנית
// מהעורך בכל רגע, וגם דרך setupVisualCalendarSyncTrigger להרצה אוטומטית יומית.
function syncEventsToVisualCalendar() {
  const eventsResult = getEvents({});
  const events = eventsResult.events;

  const target = SpreadsheetApp.openById(VISUAL_CALENDAR_SHEET_ID);
  let sheet = target.getSheetByName(VISUAL_CALENDAR_TAB);
  if (!sheet) sheet = target.insertSheet(VISUAL_CALENDAR_TAB);
  sheet.clear();
  sheet.setRightToLeft(true);

  let row = 1;

  VISUAL_MONTHS.forEach(({ y, m }) => {
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthPrefix = y + "-" + String(m).padStart(2, "0");
    const monthEvents = events.filter(ev => String(ev["תאריך"]).startsWith(monthPrefix));
    const width = daysInMonth + 1; // + עמודת כותרת בצד

    // שורת כותרת חודש
    const heb1 = jewishDateGS(y, m, 1);
    const hebLast = jewishDateGS(y, m, daysInMonth);
    const hebRange = heb1.mn === hebLast.mn ? heb1.mn : (heb1.mn + " – " + hebLast.mn);
    const titleRow = [VISUAL_MONTH_NAMES[m] + " " + y + " (" + hebRange + ")"];
    for (let i = 1; i < width; i++) titleRow.push("");
    sheet.getRange(row, 1, 1, width).setValues([titleRow]);
    const headerColor = VISUAL_MONTH_COLORS[y + "-" + m] || "#2c3e50";
    sheet.getRange(row, 1, 1, width).setBackgrounds([new Array(width).fill(headerColor)])
      .setFontColor("#ffffff").setFontWeight("bold");
    row++;

    // שורות ימות שבוע / תאריכים / אירועים
    const weekdayRowVals = [""], dateRowVals = [""], eventRowVals = [""];
    const eventColors = ["#ffffff"];
    for (let d = 1; d <= daysInMonth; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      const hd = jewishDateGS(y, m, d);
      weekdayRowVals.push(VISUAL_WEEKDAY_LETTERS[wd]);
      dateRowVals.push(d + "\n" + (HEB_NUMS_GS[hd.d] || hd.d));

      const dateStr = monthPrefix + "-" + String(d).padStart(2, "0");
      const dayEvents = monthEvents.filter(ev => String(ev["תאריך"]) === dateStr);
      if (dayEvents.length) {
        eventRowVals.push(dayEvents.map(ev => ev["כותרת"]).join("\n"));
        eventColors.push(VISUAL_CAT_COLORS[dayEvents[0]["קטגוריה"]] || "#ffffff");
      } else {
        eventRowVals.push("");
        eventColors.push("#ffffff");
      }
    }
    sheet.getRange(row, 1, 1, width).setValues([weekdayRowVals]);
    sheet.getRange(row + 1, 1, 1, width).setValues([dateRowVals]);
    sheet.getRange(row + 2, 1, 1, width).setValues([eventRowVals]);
    sheet.getRange(row + 2, 1, 1, width).setBackgrounds([eventColors]);

    row += 4; // + שורה ריקה מפרידה לפני החודש הבא
  });

  Logger.log("הלוח הצבעוני עודכן: " + VISUAL_MONTHS.length + " חודשים, " + events.length + " אירועים");
}

// הרצה חד-פעמית ידנית מהעורך — מפעילה רענון אוטומטי של הלוח הצבעוני כל בוקר.
// לא חובה: אפשר גם פשוט להריץ syncEventsToVisualCalendar ידנית מתי שרוצים.
function setupVisualCalendarSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === "syncEventsToVisualCalendar");
  if (exists) {
    Logger.log("הטריגר לסנכרון הלוח הצבעוני כבר מוגדר, לא נוצר כפול");
    return;
  }
  ScriptApp.newTrigger("syncEventsToVisualCalendar")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  Logger.log("טריגר יומי הוגדר — הלוח הצבעוני יתעדכן אוטומטית כל בוקר ב-6:00");
}