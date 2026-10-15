/**
 * ============================================================================
 * 智慧校園 • 學生生活常規優缺點管理系統 - Google Apps Script (GAS) 後端
 * ============================================================================
 * 功能：
 * 1. 提供 RESTful API 供前端 Web App 讀取 (load) 與儲存 (save) 全校常規資料庫。
 * 2. 自動維護人類可讀的 Google 試算表工作表：
 *    - 【⚙️_系統總資料庫】：以 JSON 完整保存系統結構，保證系統還原 100% 不掉資料。
 *    - 【📋_常規登記流水帳】：條列式顯示所有學生登記紀錄，方便學務處與導師篩選、列印、存查。
 *    - 【👥_各班學生名冊與代碼】：各班學生座號、姓名、家長查詢專屬隨機代碼與即時累積優缺點統計。
 *    - 【⚙️_常規項目設定】：各班自訂之加扣分常規項目清單。
 * 
 * 部署指引請參閱本專案 README.md 中的「Google Sheets + Apps Script 雲端同步設定教學」。
 * ============================================================================
 */

// 工作表名稱常數
const SHEET_DB = "⚙️_系統總資料庫";
const SHEET_RECORDS = "📋_常規登記流水帳";
const SHEET_STUDENTS = "👥_各班學生名冊與代碼";
const SHEET_ITEMS = "⚙️_常規項目設定";

/**
 * 處理 GET 請求
 * 支援:
 * - ?action=ping : 測試雲端連線狀態
 * - ?action=load : 讀取最新完整資料庫 JSON
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "ping";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "ping") {
      return createJsonResponse({
        status: "success",
        message: "Google Apps Script 雲端試算表連線正常！",
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === "load") {
      const dbSheet = getOrCreateSheet(ss, SHEET_DB);
      const rawJson = dbSheet.getRange(1, 1).getValue();

      if (!rawJson || rawJson.toString().trim() === "") {
        return createJsonResponse({
          status: "empty",
          message: "雲端試算表目前尚無資料庫備份，請先於前端點擊【上傳備份至 Google 試算表】。",
          data: null
        });
      }

      let parsedData = null;
      try {
        parsedData = JSON.parse(rawJson.toString());
      } catch (err) {
        return createJsonResponse({
          status: "error",
          message: "解析雲端試算表 JSON 失敗：" + err.message
        });
      }

      const lastUpdated = dbSheet.getRange(1, 2).getValue() || "";
      return createJsonResponse({
        status: "success",
        message: "成功從 Google 試算表載入最新資料！",
        data: parsedData,
        lastUpdated: lastUpdated,
        timestamp: new Date().toISOString()
      });
    }

    // 預設說明畫面
    return createJsonResponse({
      status: "info",
      message: "學生生活常規管理系統 GAS API 端點運作中。支援 action=ping 及 action=load。",
      spreadsheetName: ss.getName()
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "GET 處理時發生異常：" + error.toString()
    });
  }
}

/**
 * 處理 POST 請求
 * 支援:
 * - payload { action: 'save', data: AppState.data } : 全量同步儲存全校資料庫並重整人讀工作表
 */
function doPost(e) {
  try {
    let payload = null;

    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = null;
      }
    }

    // 若為表單編碼傳送，檢查 parameter.data
    if (!payload && e && e.parameter && e.parameter.data) {
      try {
        payload = JSON.parse(e.parameter.data);
      } catch (err2) {
        payload = null;
      }
    }

    if (!payload) {
      return createJsonResponse({
        status: "error",
        message: "無效的 POST 請求主體 (Payload 必須為有效的 JSON 字串)。"
      });
    }

    const action = payload.action || "save";
    const appData = payload.data;

    if (action === "save" || action === "force_overwrite") {
      if (!appData || !appData.classes) {
        return createJsonResponse({
          status: "error",
          message: "傳入的資料缺少 classes 陣列結構，無法儲存。"
        });
      }

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const dbSheet = getOrCreateSheet(ss, SHEET_DB);

      let finalData = appData;
      // 若為一般 save 動作，自動與試算表原有資料庫進行非破壞性雙向合併，防止任何裝置舊資料覆寫最新資料！
      if (action !== "force_overwrite") {
        const rawExisting = dbSheet.getRange(1, 1).getValue();
        if (rawExisting && rawExisting.toString().trim() !== "") {
          try {
            const parsedExisting = JSON.parse(rawExisting.toString());
            finalData = mergeDatabaseObjects(parsedExisting, appData);
          } catch (mergeErr) {
            Logger.log("解析試算表既有資料庫進行合併時發生警告：" + mergeErr.message);
          }
        }
      }

      // 1. 保存完整原始 JSON 至 【⚙️_系統總資料庫】
      dbSheet.getRange(1, 1).setValue(JSON.stringify(finalData));
      const nowIso = new Date().toISOString();
      dbSheet.getRange(1, 2).setValue(nowIso);
      dbSheet.getRange(1, 3).setValue("最後同步時間：" + new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));

      // 2. 將資料展開為易讀的試算表
      let totalRecords = 0;
      let totalStudents = 0;

      syncRecordsSheet(ss, finalData);
      syncStudentsSheet(ss, finalData);
      syncItemsSheet(ss, finalData);

      // 計算統計總量
      (finalData.classes || []).forEach(c => {
        totalStudents += (c.students || []).length;
        totalRecords += (c.records || []).length;
      });

      return createJsonResponse({
        status: "success",
        message: "全校常規資料庫已成功儲存並同步至 Google 試算表！",
        data: finalData,
        classesCount: (finalData.classes || []).length,
        studentsCount: totalStudents,
        recordsCount: totalRecords,
        syncedAt: nowIso
      });
    }

    return createJsonResponse({
      status: "error",
      message: "不支援的 POST 動作：" + action
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "POST 儲存時發生異常：" + error.toString()
    });
  }
}

// ============================================================================
// 工作表同步子函式
// ============================================================================

/**
 * 同步【📋_常規登記流水帳】工作表
 */
function syncRecordsSheet(ss, appData) {
  const sheet = getOrCreateSheet(ss, SHEET_RECORDS);
  sheet.clear();

  // 表頭標題列
  const headers = [
    "序號",
    "登記日期",
    "所屬班級",
    "段考週期",
    "座號",
    "學生姓名",
    "專屬代碼",
    "類型",
    "常規項目名稱",
    "分類標籤",
    "次數/點數",
    "備註說明",
    "登記時間戳記",
    "紀錄唯一ID"
  ];

  const rows = [headers];
  let seq = 1;

  // 整理所有班級的所有紀錄（依登記時間倒序排列，最新在最上方）
  const allRecords = [];

  (appData.classes || []).forEach(cls => {
    const studentMap = {};
    (cls.students || []).forEach(s => {
      studentMap[s.id] = s;
    });

    const periodMap = {};
    (cls.examPeriods || []).forEach(p => {
      periodMap[p.id] = p.name;
    });

    (cls.records || []).forEach(r => {
      const student = studentMap[r.studentId] || { seatNumber: "-", name: "未知學生", code: "-" };
      const periodName = periodMap[r.examPeriodId] || "未指定段考";

      allRecords.push({
        date: r.date || "",
        className: cls.name || "",
        periodName: periodName,
        seatNumber: student.seatNumber || "",
        studentName: student.name || "",
        studentCode: student.code || "",
        typeText: r.type === "merit" ? "優點 (+)" : "缺點 (-)",
        itemName: r.itemName || "",
        category: r.category || "",
        count: r.count || 1,
        note: r.note || "",
        timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "",
        id: r.id || "",
        rawTime: r.timestamp || 0
      });
    });
  });

  // 依時間最新排序
  allRecords.sort((a, b) => b.rawTime - a.rawTime);

  allRecords.forEach(r => {
    rows.push([
      seq++,
      r.date,
      r.className,
      r.periodName,
      r.seatNumber,
      r.studentName,
      r.studentCode,
      r.typeText,
      r.itemName,
      r.category,
      r.count,
      r.note,
      r.timestamp,
      r.id
    ]);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  // 美化標題列格式
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#1e40af"); // 科技深藍
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
  autoFitColumns(sheet, headers.length);
}

/**
 * 同步【👥_各班學生名冊與代碼】工作表
 */
function syncStudentsSheet(ss, appData) {
  const sheet = getOrCreateSheet(ss, SHEET_STUDENTS);
  sheet.clear();

  const headers = [
    "班級名稱",
    "導師姓名",
    "座號",
    "學生姓名",
    "家長查詢專屬代碼",
    "當期段考累計缺點",
    "當期段考累計優點",
    "班級警告門檻",
    "警告警戒狀態"
  ];

  const rows = [headers];

  (appData.classes || []).forEach(cls => {
    const threshold = parseInt(cls.warningThreshold, 10) || 15;
    const currentPeriodId = cls.currentExamPeriodId || (cls.examPeriods && cls.examPeriods[0] ? cls.examPeriods[0].id : null);

    (cls.students || []).sort((a, b) => (Number(a.seatNumber) || 0) - (Number(b.seatNumber) || 0)).forEach(s => {
      // 計算當前段考優缺點
      let demerits = 0;
      let merits = 0;

      (cls.records || []).forEach(r => {
        if (r.studentId === s.id && (!currentPeriodId || r.examPeriodId === currentPeriodId)) {
          const cnt = Number(r.count) || 1;
          if (r.type === "demerit") demerits += cnt;
          else if (r.type === "merit") merits += cnt;
        }
      });

      let statusText = "正常";
      if (demerits >= threshold) {
        statusText = `🚨 已達滿${threshold}次警告門檻！`;
      } else if (demerits >= threshold - 3) {
        statusText = `⚠️ 接近警戒 (尚餘 ${threshold - demerits} 次)`;
      }

      rows.push([
        cls.name || "",
        cls.teacherName || "導師",
        s.seatNumber || "",
        s.name || "",
        s.code || "",
        demerits,
        merits,
        threshold,
        statusText
      ]);
    });
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#059669"); // 翠綠色
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
  autoFitColumns(sheet, headers.length);
}

/**
 * 同步【⚙️_常規項目設定】工作表
 */
function syncItemsSheet(ss, appData) {
  const sheet = getOrCreateSheet(ss, SHEET_ITEMS);
  sheet.clear();

  const headers = [
    "所屬班級",
    "項目類型",
    "常規項目名稱",
    "分類標籤",
    "預設次數/點數",
    "項目代碼"
  ];

  const rows = [headers];

  (appData.classes || []).forEach(cls => {
    const rItems = cls.routineItems || {};
    const itemsList = [];
    if (Array.isArray(rItems)) {
      itemsList.push(...rItems);
    } else {
      if (Array.isArray(rItems.demerits)) {
        rItems.demerits.forEach(item => itemsList.push({ ...item, type: "demerit" }));
      }
      if (Array.isArray(rItems.merits)) {
        rItems.merits.forEach(item => itemsList.push({ ...item, type: "merit" }));
      }
    }

    itemsList.forEach(item => {
      rows.push([
        cls.name || "",
        item.type === "merit" ? "優良獎勵 (+)" : "違規扣點 (-)",
        item.name || "",
        item.category || "一般",
        item.defaultCount || 1,
        item.id || ""
      ]);
    });
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#475569"); // 石板灰
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
  autoFitColumns(sheet, headers.length);
}

// ============================================================================
// 輔助函式
// ============================================================================

/**
 * 取得工作表，若不存在則自動新建
 */
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * 自動適應欄寬
 */
function autoFitColumns(sheet, colCount) {
  try {
    for (let c = 1; c <= colCount; c++) {
      sheet.autoResizeColumn(c);
      // 避免欄寬過窄
      if (sheet.getColumnWidth(c) < 80) {
        sheet.setColumnWidth(c, 85);
      }
    }
  } catch (e) {
    // 忽略試算表調整權限邊際問題
  }
}

/**
 * 回傳 JSON 格式輸出並帶標準 Content-Type
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 試算表伺服端非破壞性資料庫合併引擎 (Server-side Non-destructive Merge Engine)
 * 核心目的：即便某個裝置因為網路延遲或快取較舊而上傳資料，絕不覆寫或刪除試算表既有的最新紀錄！
 */
function mergeDatabaseObjects(existingData, incomingData) {
  if (!existingData || !Array.isArray(existingData.classes)) return incomingData;
  if (!incomingData || !Array.isArray(incomingData.classes)) return existingData;

  const result = JSON.parse(JSON.stringify(incomingData));

  // 保留自訂管理者密碼
  if (existingData.adminPassword && (!result.adminPassword || result.adminPassword === "admin888")) {
    result.adminPassword = existingData.adminPassword;
  }

  existingData.classes.forEach(function(exCls) {
    let incCls = null;
    for (let i = 0; i < result.classes.length; i++) {
      if (result.classes[i].id === exCls.id) {
        incCls = result.classes[i];
        break;
      }
    }

    if (!incCls) {
      result.classes.push(exCls);
      return;
    }

    // 1. 合併已註銷/刪除紀錄清單 (deletedRecordIds)
    incCls.deletedRecordIds = incCls.deletedRecordIds || [];
    const deletedMap = {};
    incCls.deletedRecordIds.forEach(function(id) { deletedMap[id] = true; });
    if (Array.isArray(exCls.deletedRecordIds)) {
      exCls.deletedRecordIds.forEach(function(id) {
        if (!deletedMap[id]) {
          incCls.deletedRecordIds.push(id);
          deletedMap[id] = true;
        }
      });
    }

    // 2. 依註銷清單過濾傳入紀錄
    incCls.records = (incCls.records || []).filter(function(r) { return !deletedMap[r.id]; });

    // 3. 雙向保留登記流水紀錄：既存紀錄只要未被註銷且傳入未包含，全數完整保留！
    const recordIdMap = {};
    incCls.records.forEach(function(r) { recordIdMap[r.id] = true; });

    if (Array.isArray(exCls.records)) {
      exCls.records.forEach(function(er) {
        if (!deletedMap[er.id] && !recordIdMap[er.id]) {
          incCls.records.push(er);
          recordIdMap[er.id] = true;
        }
      });
    }

    // 4. 合併學生名冊 (保留既有名冊，補入新增學生)
    if (Array.isArray(exCls.students)) {
      incCls.students = incCls.students || [];
      const stuIdMap = {};
      incCls.students.forEach(function(s) { stuIdMap[s.id] = s; });

      exCls.students.forEach(function(es) {
        const existingStu = stuIdMap[es.id];
        if (existingStu) {
          if (!existingStu.name && es.name) existingStu.name = es.name;
          if (!existingStu.code && es.code) existingStu.code = es.code;
        } else {
          incCls.students.push(es);
          stuIdMap[es.id] = es;
        }
      });
    }

    // 5. 常規自訂項目
    if (!incCls.routineItems && exCls.routineItems) {
      incCls.routineItems = exCls.routineItems;
    }

    // 6. 段考時程
    if (Array.isArray(exCls.examPeriods) && exCls.examPeriods.length > 0) {
      incCls.examPeriods = incCls.examPeriods || [];
      const periodIdMap = {};
      incCls.examPeriods.forEach(function(p) { periodIdMap[p.id] = true; });

      exCls.examPeriods.forEach(function(ep) {
        if (!periodIdMap[ep.id]) {
          incCls.examPeriods.push(ep);
          periodIdMap[ep.id] = true;
        }
      });
    }

    // 7. 班級設定與導師密碼
    if (!incCls.teacherPassword && exCls.teacherPassword) {
      incCls.teacherPassword = exCls.teacherPassword;
    }
    if (!incCls.warningThreshold && exCls.warningThreshold) {
      incCls.warningThreshold = exCls.warningThreshold;
    }
    if (!incCls.resetMode && exCls.resetMode) {
      incCls.resetMode = exCls.resetMode;
    }
    if (!incCls.customResetDate && exCls.customResetDate) {
      incCls.customResetDate = exCls.customResetDate;
    }
  });

  return result;
}

/**
 * 手動測試初始化函式 (可在 Apps Script 編輯器中直接執行除錯)
 */
function testInit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet(ss, SHEET_DB);
  getOrCreateSheet(ss, SHEET_RECORDS);
  getOrCreateSheet(ss, SHEET_STUDENTS);
  getOrCreateSheet(ss, SHEET_ITEMS);
  Logger.log("工作表初始化成功！");
}
