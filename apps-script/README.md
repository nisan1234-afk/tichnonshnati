# קוד השרת (Google Apps Script) — תוכנית שנתית תשפ"ז, ישיבת אלוני הבשן

תיקייה זו מכילה את קוד ה-Apps Script שנמצא במחשב המקומי והועתק למאגר **ללא שינוי**.
האתר (`src/App.jsx`) פונה לפריסה (deployment) של הסקריפט דרך המשתנה `API_URL`.

**תאריך ההעתקה:** 2026-09-08

## קבצים שהועתקו

| קובץ במאגר | נתיב מקורי במחשב | תאריך שינוי אחרון | גודל |
|---|---|---|---|
| `apps-script/api.gs` | `C:\Users\LENOVO\Downloads\api.gs` | 2026-07-02 14:37 | 14,576 בתים |

זו הגרסה היחידה של קובץ זה שנמצאה במחשב (לא נמצאו עותקים נוספים בשם אחר או במיקום אחר),
ולכן היא גם העדכנית ביותר מבין מה שקיים מקומית.

### הערה חשובה על מידת העדכניות

`api.gs` הוא **גרסה ישנה** של השרת. הוא מטפל רק בפעולות:
`getEvents`, `getSettings`, `addEvent`, `updateEvent`, `requestDelete`, `approveDelete`, `rejectDelete`.

האתר הנוכחי (`src/App.jsx`) קורא גם לפעולות שלא קיימות בקובץ זה:
`getParentsView`, `getStaffDirectory`, `getTeam`, `getTeamFull`, `verifyLogin`, `approveEvent`,
`rejectEvent`, `getAlerts`, `reportTaskStatus`, `addTeamMember`, `updateTeamMember`, `getMyTasks`.

מכאן שהגרסה שפרוסה בפועל בכתובת ה-`API_URL` חדשה יותר, וקיימת כנראה רק בעורך Apps Script
המקוון (ולא כקובץ במחשב). כדי לשמור אותה במאגר יש לפתוח את פרויקט הסקריפט בדפדפן
ולהעתיק משם את הקוד המעודכן לתיקייה זו.

### סודות

- בקובץ `api.gs` המשתנה `SECRET_KEY` מכיל את מחרוזת ה-placeholder `REPLACE_WITH_YOUR_SECRET_KEY`
  ולא מפתח אמיתי. לא נמצא בו (ולא באף קובץ אחר שנבדק) סיסמה או מפתח פרטי.
- לא נמצאו עבור פרויקט זה קבצי `appsscript.json` או `.clasp.json`, ולכן מזהה פרויקט הסקריפט
  (scriptId) אינו ידוע מהקבצים המקומיים. מזהה הפריסה מופיע רק בתוך `API_URL` ב-`src/App.jsx`.

## קבצי Apps Script שנמצאו במחשב ולא הועתקו (שייכים לפרויקטים אחרים)

קבצים אלה נמצאו בחיפוש, אך על פי תוכנם הם שייכים לפרויקטים אחרים ("כיתה פלוס" / "תיירות דיגיטלית")
ולא ללוח השנה, ולכן לא הועתקו:

| נתיב מקורי | תאריך שינוי אחרון | הערה |
|---|---|---|
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\code.gs` | 2026-07-21 | API של "כיתה פלוס" |
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\tourism_api_v2.gs` | 2026-07-20 | תיירות דיגיטלית |
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\seed_lessons.gs` | 2026-07-19 | כיתה פלוס |
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\seed_lesson_blocks.gs` | 2026-07-20 | כיתה פלוס |
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\setup_groups_structure.gs` | 2026-07-18 | כיתה פלוס |
| `C:\Users\LENOVO\Downloads\calendar-app\TICHER\apps_script\clasp_project\` (`.clasp.json`, `appsscript.json`, `code.js`, `seed_*.js`, `setup_groups_structure.js`) | 2026-08-13 (code.js) | פרויקט clasp של כיתה פלוס; ה-scriptId שבו שייך לאותו פרויקט |
| `C:\Users\LENOVO\Downloads\tourism_api.gs` | 2026-06-25 | תיירות דיגיטלית |
| `C:\Users\LENOVO\Downloads\setup_tourism_sheet.gs` | 2026-06-25 | תיירות דיגיטלית |
| `C:\Users\LENOVO\Downloads\אתר_תיירות_דיגיטלית_*` (שלוש תיקיות עם `Code.gs`, `CourseData.gs`, `appsscript.json`) | 2026-07-21 | תיירות דיגיטלית |
| `C:\Users\LENOVO\Downloads\deploy_instructions.md` | 2026-08-18 | הוראות פריסה לכיתה פלוס (לא ללוח השנה) |

בקבצים אלה לא נמצאו סיסמאות או מפתחות פרטיים בתוך הקוד (מפתחות נקראים מ-Script Properties).
