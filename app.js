/**
 * 常規優缺點管理系統 - Core Application Logic
 * 導師常規管理與學生家長查詢系統
 */

// LocalStorage 鍵名 (支援無縫升級遷移)
const STORAGE_KEY = "ROUTINE_APP_DATA_V2";
const OLD_STORAGE_KEY = "PEIYING_ROUTINE_APP_DATA_V1";

// 狀態管理物件
const AppState = {
  currentRole: "landing", // 'landing' | 'teacher' | 'student' | 'admin'
  activeTeacherTab: "record", // 'record' | 'overview' | 'warnings' | 'students' | 'routine-items' | 'periods'
  activeAdminTab: "classes", // 'classes' | 'students' | 'routine-items' | 'periods' | 'security'
  adminSelectedClassId: null,
  isAdminLoggedIn: false,
  isImpersonating: false, // 是否正在以管理員身分代管某班導師工作台
  loggedInTeacherClassId: null, // 透過專屬密碼登入的導師班級 ID
  data: null,
  selectedStudentIds: new Set(),
  currentRecordingType: "demerit", // 'demerit' | 'merit'
  selectedItemId: null,
  activeStudentPortalData: null, // 登入的學生資料
  authTeacherPin: null // 導師安全鎖定
};

// 取得班級號碼前綴 (例如: "8年1班" -> "801", "7年5班" -> "705", "801班" -> "801")
function getClassNumberPrefix(clsOrName) {
  const name = (typeof clsOrName === "string" ? clsOrName : (clsOrName?.name || "")).trim();
  // 匹配 年/級 與 班，例如 8年1班、8年01班、8-1班
  const matchGradClass = name.match(/(\d+)\s*[年級\-_]\s*(\d+)/);
  if (matchGradClass) {
    const grade = matchGradClass[1];
    const classNum = String(matchGradClass[2]).padStart(2, "0");
    return `${grade}${classNum}`;
  }
  // 純數字班級，例如 801、705
  const matchDigits = name.match(/\d+/);
  if (matchDigits) {
    return matchDigits[0];
  }
  // 英文或文字備用
  const clean = name.replace(/[^\w]/g, "");
  return clean || "CLS";
}

// 取得班級自訂警告門檻 (預設 15 次)
function getClassThreshold(cls) {
  if (!cls) return 15;
  const t = parseInt(cls.warningThreshold, 10);
  return (!isNaN(t) && t > 0) ? t : 15;
}

// 取得班級接近警告的警戒門檻 (黃色警示，距門檻 2~3 次以內)
function getClassCautionThreshold(cls) {
  const threshold = getClassThreshold(cls);
  return Math.max(1, threshold - 3);
}

// 工具函式：生成隨機專屬代碼 (前半部為班級號碼組成，後半部為 4 碼英數完全亂數)
function generateStudentCode(clsOrName, existingCodes = new Set()) {
  const prefix = getClassNumberPrefix(clsOrName);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字元如 I, O, 1, 0
  let code = "";
  let attempts = 0;
  do {
    let randomTail = "";
    for (let i = 0; i < 4; i++) {
      randomTail += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `${prefix}-${randomTail}`;
    attempts++;
  } while (existingCodes.has(code) && attempts < 100);
  return code;
}

// 產生唯一 ID
function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

// 初始化儲存庫資料
function initStorage() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // 檢查舊版資料並無縫升級遷移
    raw = localStorage.getItem(OLD_STORAGE_KEY);
  }

  if (raw) {
    try {
      AppState.data = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse local storage data, resetting to preset.", e);
      AppState.data = JSON.parse(JSON.stringify(PRESET_SAMPLE_DATA));
      saveStorage();
    }
  } else {
    // 預設載入範例資料庫
    AppState.data = JSON.parse(JSON.stringify(PRESET_SAMPLE_DATA));
    saveStorage();
  }

  // 確保管理者專屬密碼存在（若無則預設 admin888）
  if (!AppState.data.adminPassword) {
    AppState.data.adminPassword = "admin888";
  }

  // 補齊與驗證各班級的導師專屬密碼、警告門檻、移除舊學校名稱、升級學生亂數代碼
  if (AppState.data && AppState.data.classes) {
    const allExistingCodes = new Set();
    AppState.data.classes.forEach(c => {
      if (c.students) {
        c.students.forEach(s => {
          if (s.code) allExistingCodes.add(s.code);
        });
      }
    });

    AppState.data.classes.forEach((c, idx) => {
      // 1. 確保導師專屬密碼存在
      if (!c.teacherPassword) {
        const classDigits = getClassNumberPrefix(c);
        c.teacherPassword = `tea${classDigits || (idx + 1)}`;
      }
      // 2. 確保警告門檻存在
      if (typeof c.warningThreshold === "undefined" || c.warningThreshold === null) {
        c.warningThreshold = (c.id === "class-705") ? 10 : 15;
      }
      // 3. 移除舊的硬編碼學校名
      if (c.school === "培英國中") {
        c.school = "";
      }
      // 4. 升級學生代碼：若帶有舊的 PY 前綴或順序編號，升級為 班級號碼-4碼亂數
      if (c.students && Array.isArray(c.students)) {
        c.students.forEach(s => {
          if (!s.code || s.code.startsWith("PY") || !s.code.includes("-")) {
            allExistingCodes.delete(s.code);
            const newCode = generateStudentCode(c, allExistingCodes);
            s.code = newCode;
            allExistingCodes.add(newCode);
          }
        });
      }
    });
    saveStorage();
  }

  // 檢查 session 中的管理者登入狀態
  if (sessionStorage.getItem("ADMIN_AUTH") === "true" || sessionStorage.getItem("PEIYING_ADMIN_AUTH") === "true") {
    AppState.isAdminLoggedIn = true;
  }

  // 初始化 Google 試算表雲端同步狀態
  initCloudSyncStatus();
}

// 儲存資料庫到 LocalStorage
function saveStorage(skipCloudSync = false) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.data));
    if (!skipCloudSync) {
      triggerAutoCloudSave();
    }
  } catch (e) {
    showToast("儲存空間錯誤或配額超出！", "danger");
  }
}

// 取得當前班級
function getCurrentClass() {
  if (!AppState.data || !AppState.data.classes) return null;
  let cls = AppState.data.classes.find(c => c.id === AppState.data.currentClassId);
  if (!cls && AppState.data.classes.length > 0) {
    cls = AppState.data.classes[0];
    AppState.data.currentClassId = cls.id;
  }
  return cls;
}

// 取得當前進行中段考區間
function getCurrentExamPeriod(cls) {
  if (!cls || !cls.examPeriods || cls.examPeriods.length === 0) return null;
  let p = cls.examPeriods.find(ep => ep.id === cls.currentExamPeriodId);
  if (!p) {
    p = cls.examPeriods.find(ep => ep.isCurrent) || cls.examPeriods[0];
    cls.currentExamPeriodId = p.id;
  }
  return p;
}

// 統計學生在特定段考的優缺點數量
function getStudentStats(cls, studentId, examPeriodId = null) {
  const targetPeriodId = examPeriodId || cls.currentExamPeriodId;
  const records = cls.records.filter(r => 
    r.studentId === studentId && 
    (targetPeriodId === "all" || r.examPeriodId === targetPeriodId)
  );

  let demerits = 0;
  let merits = 0;

  records.forEach(r => {
    const count = Number(r.count) || 1;
    if (r.type === "demerit") {
      demerits += count;
    } else if (r.type === "merit") {
      merits += count;
    }
  });

  return { demerits, merits, totalRecords: records.length, records };
}

// 吐司提示訊息
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "✓";
  if (type === "danger") icon = "✕";
  if (type === "warning") icon = "⚠";

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ==========================================================================
// 畫面渲染：主要進入點
// ==========================================================================
function renderApp() {
  const cls = getCurrentClass();
  const examPeriod = getCurrentExamPeriod(cls);

  // 1. 導覽列與角色狀態
  renderNavbar(cls);

  // 2. 視圖元素
  const landingView = document.getElementById("landingView");
  const teacherView = document.getElementById("teacherView");
  const studentView = document.getElementById("studentView");
  const adminView = document.getElementById("adminView");
  const impersonationBanner = document.getElementById("impersonationBanner");

  if (landingView) landingView.style.display = "none";
  if (teacherView) teacherView.style.display = "none";
  if (studentView) studentView.style.display = "none";
  if (adminView) adminView.style.display = "none";
  if (impersonationBanner) impersonationBanner.style.display = "none";

  if (AppState.currentRole === "landing") {
    if (landingView) landingView.style.display = "block";
    renderLandingView();
  } else if (AppState.currentRole === "teacher") {
    if (teacherView) teacherView.style.display = "block";
    if (AppState.isImpersonating && impersonationBanner && cls) {
      impersonationBanner.style.display = "block";
      const nameEl = document.getElementById("impersonateClassName");
      const teacherEl = document.getElementById("impersonateTeacherName");
      if (nameEl) nameEl.textContent = cls.name;
      if (teacherEl) teacherEl.textContent = cls.teacherName || '導師';
    }
    renderTeacherView(cls, examPeriod);
  } else if (AppState.currentRole === "student") {
    if (studentView) studentView.style.display = "block";
    renderStudentView();
  } else if (AppState.currentRole === "admin") {
    if (adminView) adminView.style.display = "block";
    renderAdminView();
  }
}

// 導覽列渲染
function renderNavbar(cls) {
  const classSelectContainer = document.getElementById("classSelectContainer");
  const classSelector = document.getElementById("classSelectDropdown");
  const navButtons = document.getElementById("navRoleButtons");
  const btnClassMgr = document.getElementById("btnClassManagerInNav");

  // 1. 班級選擇器：只在導師工作台顯示
  if (classSelectContainer) {
    if (AppState.currentRole === "teacher") {
      classSelectContainer.style.display = "flex";
      let badgeEl = document.getElementById("teacherNavClassBadge");

      if (AppState.isImpersonating) {
        // 管理員代管模式：顯示班級切換下拉選單與管理按鈕
        if (classSelector && cls && AppState.data && AppState.data.classes) {
          classSelector.style.display = "inline-block";
          classSelector.innerHTML = AppState.data.classes.map(c => 
            `<option value="${c.id}" ${c.id === cls.id ? "selected" : ""}>${c.name} (${c.teacherName || '導師'})</option>`
          ).join("");
        }
        if (btnClassMgr) btnClassMgr.style.display = "inline-block";
        if (badgeEl) badgeEl.style.display = "none";
      } else {
        // 導師個人專屬登入：隱藏切換其他班級選單，只顯示自身班級徽章
        if (classSelector) classSelector.style.display = "none";
        if (btnClassMgr) btnClassMgr.style.display = "none";

        if (!badgeEl) {
          badgeEl = document.createElement("div");
          badgeEl.id = "teacherNavClassBadge";
          badgeEl.className = "teacher-current-class-badge";
          classSelectContainer.appendChild(badgeEl);
        }
        badgeEl.style.display = "flex";
        badgeEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
          </svg>
          <span>${cls ? cls.name : ''} • ${cls ? (cls.teacherName || '導師') : ''}</span>
        `;
      }
    } else {
      classSelectContainer.style.display = "none";
      const badgeEl = document.getElementById("teacherNavClassBadge");
      if (badgeEl) badgeEl.style.display = "none";
    }
  }

  // 2. 導航功能按鈕組
  if (navButtons) {
    if (AppState.currentRole === "landing") {
      navButtons.innerHTML = `
        <button type="button" class="btn btn-outline btn-sm" onclick="openAdminLoginModal()" style="font-weight: 700;">
          🔐 校務管理者登入
        </button>
      `;
    } else if (AppState.currentRole === "teacher") {
      navButtons.innerHTML = `
        ${AppState.isImpersonating ? `
          <button type="button" class="btn btn-warning btn-sm" onclick="exitImpersonation()">
            ⚙️ 返回管理中心
          </button>
        ` : `
          <button type="button" class="btn btn-outline btn-sm" onclick="logoutTeacher()" style="font-weight: 700;">
            🚪 導師登出
          </button>
        `}
        <button type="button" class="btn btn-outline btn-sm" onclick="switchRole('landing')">
          🏠 返回身分分流
        </button>
      `;
    } else if (AppState.currentRole === "student") {
      navButtons.innerHTML = `
        <button type="button" class="btn btn-outline btn-sm" onclick="switchRole('landing')">
          🏠 返回身分分流
        </button>
      `;
    } else if (AppState.currentRole === "admin") {
      navButtons.innerHTML = `
        <span class="badge-admin">⚙️ 系統管理員模式</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="switchRole('landing')">
          🏠 回首頁
        </button>
        <button type="button" class="btn btn-danger btn-sm" onclick="logoutAdmin()">
          🚪 登出
        </button>
      `;
    }
  }

  // 3. 計算達警告門檻名額標籤
  const warningBadge = document.getElementById("tabWarningBadge");
  if (warningBadge && cls) {
    const threshold = getClassThreshold(cls);
    const warnStudents = cls.students.filter(s => {
      const stats = getStudentStats(cls, s.id);
      return stats.demerits >= threshold;
    });
    if (warnStudents.length > 0) {
      warningBadge.textContent = warnStudents.length;
      warningBadge.style.display = "inline-flex";
    } else {
      warningBadge.style.display = "none";
    }
  }
}

// 導師介面渲染
function renderTeacherView(cls, examPeriod) {
  const threshold = getClassThreshold(cls);

  // 動態更新警告名單分頁按鈕文字
  const tabWarningsTitleText = document.getElementById("tabWarningsTitleText");
  if (tabWarningsTitleText) {
    tabWarningsTitleText.textContent = `🚨 警告名單 (${threshold}次)`;
  }

  // 渲染目前段考橫幅
  const periodBanner = document.getElementById("periodBannerContainer");
  if (periodBanner && examPeriod) {
    const warnCount = cls.students.filter(s => getStudentStats(cls, s.id).demerits >= threshold).length;
    periodBanner.innerHTML = `
      <div class="period-info">
        <span class="period-badge-tag">目前計算週期</span>
        <div>
          <div class="period-title">${cls.name} • ${examPeriod.name}</div>
          <div class="period-dates">區間：${examPeriod.startDate || '未設定'} ~ ${examPeriod.endDate || '未設定'} (段考重新累積，不功過相抵)</div>
        </div>
      </div>
      <div class="period-actions">
        ${warnCount > 0 ? `
          <button class="btn btn-danger btn-sm" onclick="switchTeacherTab('warnings')">
            🚨 滿${threshold}次警戒名單 (${warnCount}人)
          </button>
        ` : ''}
        <button class="btn btn-outline btn-sm" onclick="switchTeacherTab('periods')" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">
          ⚙️ 切換/管理段考
        </button>
      </div>
    `;
  }

  // 導師子分頁切換
  document.querySelectorAll(".sub-nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.tab === AppState.activeTeacherTab);
  });

  // 隱藏所有分頁容器
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.style.display = "none";
  });

  // 顯示當前啟用分頁
  const activePane = document.getElementById(`tabPane-${AppState.activeTeacherTab}`);
  if (activePane) {
    activePane.style.display = "block";
  }

  // 依照啟用分頁渲染內容
  switch (AppState.activeTeacherTab) {
    case "record":
      renderRecordTab(cls, examPeriod);
      break;
    case "overview":
      renderOverviewTab(cls, examPeriod);
      break;
    case "warnings":
      renderWarningsTab(cls, examPeriod);
      break;
    case "students":
      renderStudentsManagementTab(cls);
      break;
    case "routine-items":
      renderRoutineItemsTab(cls);
      break;
    case "periods":
      renderPeriodsTab(cls);
      break;
  }
}

// ==========================================================================
// 分頁 1：快速登記常規 (Daily Record)
// ==========================================================================
function renderRecordTab(cls, examPeriod) {
  // 1. 座號盤 (1 ~ 35)
  const seatGrid = document.getElementById("seatGrid");
  if (!seatGrid) return;

  // 整理 1 ~ 35 號的學生
  let html = "";
  for (let num = 1; num <= 35; num++) {
    const student = cls.students.find(s => Number(s.seatNumber) === num);
    const isSelected = student && AppState.selectedStudentIds.has(student.id);
    
    if (student) {
      const stats = getStudentStats(cls, student.id);
      const threshold = getClassThreshold(cls);
      const cautionThreshold = getClassCautionThreshold(cls);
      const isWarn = stats.demerits >= threshold;
      const isCaution = stats.demerits >= cautionThreshold && stats.demerits < threshold;

      html += `
        <div class="seat-btn ${isSelected ? 'selected' : ''} ${isWarn ? 'danger-warn' : ''}" 
             onclick="toggleStudentSelection('${student.id}')"
             title="座號 ${student.seatNumber} ${student.name} | 缺點: ${stats.demerits}, 優點: ${stats.merits}">
          ${isWarn ? `<div class="seat-warning-tag" title="已達警告門檻(${threshold}次)">!</div>` : ''}
          <div class="seat-num">${student.seatNumber}</div>
          <div class="seat-name">${student.name || '未設'}</div>
          <div class="seat-points">
            <span class="point-demerit" title="缺點">-${stats.demerits}</span>
            <span class="point-merit" title="優點">+${stats.merits}</span>
          </div>
        </div>
      `;
    } else {
      // 空座號
      html += `
        <div class="seat-btn disabled" style="opacity: 0.35; cursor: not-allowed;" title="座號 ${num} 尚未建立">
          <div class="seat-num">${num}</div>
          <div class="seat-name">空位</div>
        </div>
      `;
    }
  }
  seatGrid.innerHTML = html;

  // 更新選取數量文字
  const selectedCountText = document.getElementById("selectedCountText");
  if (selectedCountText) {
    selectedCountText.textContent = `已選取 ${AppState.selectedStudentIds.size} 位同學`;
  }

  // 2. 登記類別按鈕 (缺點 / 優點)
  const btnTypeDemerit = document.getElementById("btnTypeDemerit");
  const btnTypeMerit = document.getElementById("btnTypeMerit");
  if (btnTypeDemerit && btnTypeMerit) {
    btnTypeDemerit.classList.toggle("active", AppState.currentRecordingType === "demerit");
    btnTypeMerit.classList.toggle("active", AppState.currentRecordingType === "merit");
  }

  // 3. 常規項目清單
  const itemTagGrid = document.getElementById("itemTagGrid");
  if (itemTagGrid) {
    const items = AppState.currentRecordingType === "demerit" 
      ? cls.routineItems.demerits 
      : cls.routineItems.merits;

    if (items.length === 0) {
      itemTagGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--slate-400); padding: 1rem;">尚未建立項目，請前往「常規項目設定」新增</div>`;
    } else {
      itemTagGrid.innerHTML = items.map(item => {
        const isSelected = AppState.selectedItemId === item.id;
        const activeClass = isSelected ? (AppState.currentRecordingType === "demerit" ? "selected-demerit" : "selected-merit") : "";
        return `
          <button type="button" class="item-tag-btn ${activeClass}" onclick="selectRoutineItem('${item.id}')">
            <span>${item.name}</span>
            <span style="font-size: 0.7rem; color: var(--slate-400);">(${item.category || '常規'})</span>
          </button>
        `;
      }).join("");
    }
  }

  // 4. 最近登記紀錄流水帳 (最近 8 筆)
  const recentRecordsList = document.getElementById("recentRecordsList");
  if (recentRecordsList) {
    const recent = [...cls.records].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 8);
    if (recent.length === 0) {
      recentRecordsList.innerHTML = `<p style="color: var(--slate-400); font-size: 0.85rem; text-align: center; padding: 1rem;">尚無登記紀錄</p>`;
    } else {
      recentRecordsList.innerHTML = recent.map(r => {
        const student = cls.students.find(s => s.id === r.studentId);
        const isDemerit = r.type === "demerit";
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); font-size: 0.85rem; margin-bottom: 0.4rem;">
            <div>
              <span style="font-weight: 700; color: var(--slate-900);">[座號 ${student ? student.seatNumber : '?'}] ${student ? student.name : '未知'}</span>
              <span class="badge-${isDemerit ? 'warning-danger' : 'safe'}" style="margin-left: 6px;">
                ${isDemerit ? '缺點 -' : '優點 +'}${r.count || 1}
              </span>
              <strong style="margin-left: 6px;">${r.itemName}</strong>
              ${r.note ? `<span style="color: var(--slate-500); margin-left: 6px;">(${r.note})</span>` : ''}
              <div style="font-size: 0.72rem; color: var(--slate-400); margin-top: 2px;">日期: ${r.date}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="deleteRecord('${r.id}')" title="撤銷這筆登記" style="color: var(--danger-600); border-color: var(--danger-200); padding: 2px 8px; font-size: 0.75rem;">
              撤銷
            </button>
          </div>
        `;
      }).join("");
    }
  }
}

// 座號選取切換
function toggleStudentSelection(studentId) {
  if (AppState.selectedStudentIds.has(studentId)) {
    AppState.selectedStudentIds.delete(studentId);
  } else {
    AppState.selectedStudentIds.add(studentId);
  }
  renderRecordTab(getCurrentClass(), getCurrentExamPeriod(getCurrentClass()));
}

// 快速全選
function selectAllStudents() {
  const cls = getCurrentClass();
  cls.students.forEach(s => AppState.selectedStudentIds.add(s.id));
  renderRecordTab(cls, getCurrentExamPeriod(cls));
}

// 清除選取
function clearStudentSelection() {
  AppState.selectedStudentIds.clear();
  renderRecordTab(getCurrentClass(), getCurrentExamPeriod(getCurrentClass()));
}

// 依照座號快速選取 (字串如 "1, 2, 5-8")
function quickSelectBySeatNumbersPrompt() {
  const input = prompt("請輸入要選取的座號（例如：1, 3, 5 或 10-15）：");
  if (!input) return;

  const cls = getCurrentClass();
  const parts = input.split(/[,，\s]+/);
  parts.forEach(part => {
    part = part.trim();
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(n => parseInt(n, 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          const s = cls.students.find(stu => stu.seatNumber === i);
          if (s) AppState.selectedStudentIds.add(s.id);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        const s = cls.students.find(stu => stu.seatNumber === num);
        if (s) AppState.selectedStudentIds.add(s.id);
      }
    }
  });

  renderRecordTab(cls, getCurrentExamPeriod(cls));
  showToast(`已選取 ${AppState.selectedStudentIds.size} 位同學`, "success");
}

// 切換登記類別 (缺點 vs 優點)
function setRecordingType(type) {
  AppState.currentRecordingType = type;
  AppState.selectedItemId = null;
  renderRecordTab(getCurrentClass(), getCurrentExamPeriod(getCurrentClass()));
}

// 選取常規項目
function selectRoutineItem(itemId) {
  AppState.selectedItemId = itemId;
  renderRecordTab(getCurrentClass(), getCurrentExamPeriod(getCurrentClass()));
}

// 送出登記表單
function submitRoutineRecord(event) {
  if (event) event.preventDefault();
  const cls = getCurrentClass();
  const examPeriod = getCurrentExamPeriod(cls);

  if (AppState.selectedStudentIds.size === 0) {
    showToast("請至少選取一位同學！", "warning");
    return;
  }

  if (!AppState.selectedItemId) {
    showToast("請點選要登記的常規項目！", "warning");
    return;
  }

  const items = AppState.currentRecordingType === "demerit" 
    ? cls.routineItems.demerits 
    : cls.routineItems.merits;
  const itemObj = items.find(i => i.id === AppState.selectedItemId);
  if (!itemObj) {
    showToast("無效的常規項目", "danger");
    return;
  }

  const recordDate = document.getElementById("recordDateInput").value || new Date().toISOString().split("T")[0];
  const recordCount = parseInt(document.getElementById("recordCountInput").value, 10) || 1;
  const recordNote = document.getElementById("recordNoteInput").value.trim();

  let newlyTriggeredWarnings = [];

  // 對選取的每位同學新增一筆紀錄
  AppState.selectedStudentIds.forEach(studentId => {
    const student = cls.students.find(s => s.id === studentId);
    const beforeStats = getStudentStats(cls, studentId, examPeriod.id);

    const newRecord = {
      id: uid("rec"),
      studentId: studentId,
      type: AppState.currentRecordingType,
      itemId: itemObj.id,
      itemName: itemObj.name,
      count: recordCount,
      date: recordDate,
      examPeriodId: examPeriod.id,
      note: recordNote,
      timestamp: Date.now()
    };

    cls.records.push(newRecord);

    // 檢查缺點是否在此次登記後剛好跨過警告門檻
    if (AppState.currentRecordingType === "demerit") {
      const threshold = getClassThreshold(cls);
      const afterCount = beforeStats.demerits + recordCount;
      if (beforeStats.demerits < threshold && afterCount >= threshold) {
        newlyTriggeredWarnings.push(`[${student.seatNumber}號 ${student.name}] 缺點已達 ${afterCount} 次（已達本班警告門檻 ${threshold} 次）！需送交處分`);
      }
    }
  });

  saveStorage();

  // 清除備註與選取項目
  document.getElementById("recordNoteInput").value = "";
  AppState.selectedStudentIds.clear();
  AppState.selectedItemId = null;

  showToast(`成功登記 ${AppState.currentRecordingType === 'demerit' ? '缺點' : '優點'}！`, "success");

  // 若有學生剛好滿警告門檻，跳出顯著警告提醒！
  if (newlyTriggeredWarnings.length > 0) {
    setTimeout(() => {
      alert(`🚨【重要常規警告提醒】\n\n${newlyTriggeredWarnings.join("\n")}\n\n請導師準備開立警告單送交生教組處置！`);
    }, 200);
  }

  renderApp();
}

// 刪除 / 撤銷紀錄
function deleteRecord(recordId) {
  if (!confirm("確定要撤銷這筆登記嗎？")) return;
  const cls = getCurrentClass();
  cls.records = cls.records.filter(r => r.id !== recordId);
  saveStorage();
  showToast("已撤銷登記紀錄", "success");
  renderApp();
}

// ==========================================================================
// 分頁 2：全班常規總表 (Class Overview)
// ==========================================================================
function renderOverviewTab(cls, examPeriod) {
  const tableBody = document.getElementById("overviewTableBody");
  const periodFilter = document.getElementById("overviewPeriodFilter");
  const statusFilter = document.getElementById("overviewStatusFilter");
  const searchInput = document.getElementById("overviewSearchInput");

  if (!tableBody) return;

  // 填入段考篩選器 (若選項尚未建立或已變更時才重新生成)
  if (periodFilter && periodFilter.options.length === 0) {
    periodFilter.innerHTML = `
      <option value="${examPeriod.id}">📌 現行段考 (${examPeriod.name})</option>
      <option value="all">📚 全學期所有累積</option>
      ${cls.examPeriods.filter(ep => ep.id !== examPeriod.id).map(ep => 
        `<option value="${ep.id}">歷史：${ep.name}</option>`
      ).join("")}
    `;
    periodFilter.value = examPeriod.id;
  }

  const selectedPeriodId = periodFilter ? periodFilter.value : examPeriod.id;
  const selectedStatus = statusFilter ? statusFilter.value : "all";
  const searchKey = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const threshold = getClassThreshold(cls);
  const cautionThreshold = getClassCautionThreshold(cls);

  // 動態更新表頭欄位名稱
  const warningHeader = document.getElementById("overviewWarningHeader");
  if (warningHeader) warningHeader.textContent = `門檻進度 (滿${threshold}次)`;

  // 動態更新下拉選單文字
  if (statusFilter && statusFilter.options.length >= 4) {
    statusFilter.options[1].textContent = `🚨 達警告門檻 (滿 ${threshold} 次)`;
    statusFilter.options[2].textContent = `⚠️ 接近警告 (${cautionThreshold} ~ ${threshold - 1} 次)`;
    statusFilter.options[3].textContent = `✅ 常規正常 (< ${cautionThreshold} 次)`;
  }

  // 依座號排序學生
  let studentRows = cls.students.slice().sort((a, b) => a.seatNumber - b.seatNumber);

  // 篩選
  studentRows = studentRows.filter(s => {
    if (searchKey) {
      const matchName = (s.name || "").toLowerCase().includes(searchKey);
      const matchSeat = String(s.seatNumber).includes(searchKey);
      const matchCode = (s.code || "").toLowerCase().includes(searchKey);
      if (!matchName && !matchSeat && !matchCode) return false;
    }

    const stats = getStudentStats(cls, s.id, selectedPeriodId);
    if (selectedStatus === "warning" && stats.demerits < threshold) return false;
    if (selectedStatus === "caution" && (stats.demerits < cautionThreshold || stats.demerits >= threshold)) return false;
    if (selectedStatus === "safe" && stats.demerits >= cautionThreshold) return false;

    return true;
  });

  if (studentRows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--slate-400); padding: 2rem;">查無符合條件的學生資料</td></tr>`;
    return;
  }

  tableBody.innerHTML = studentRows.map(student => {
    const stats = getStudentStats(cls, student.id, selectedPeriodId);
    const isWarning = stats.demerits >= threshold;
    const isCaution = stats.demerits >= cautionThreshold && stats.demerits < threshold;

    // 進度條比例 (以自訂 threshold 為 100%)
    const percent = Math.min(100, Math.round((stats.demerits / threshold) * 100));
    const fillClass = isWarning ? "fill-danger" : (isCaution ? "fill-caution" : "fill-safe");

    return `
      <tr class="${isWarning ? 'highlight-warning' : ''}">
        <td style="font-weight: 800; font-size: 1rem;">${student.seatNumber}</td>
        <td style="font-weight: 700;">${student.name || '未設定'}</td>
        <td>
          <code style="background: var(--slate-100); padding: 2px 6px; border-radius: 4px; font-weight: 600; color: var(--primary-700);">${student.code}</code>
        </td>
        <td style="font-weight: 800; color: ${isWarning ? 'var(--danger-600)' : (isCaution ? 'var(--warning-600)' : 'var(--slate-800)')};">
          ${stats.demerits} 次
        </td>
        <td style="font-weight: 800; color: var(--success-600);">
          ${stats.merits} 次
        </td>
        <td>
          <div class="warning-progress-bar" title="累積 ${stats.demerits} / ${threshold} 次">
            <div class="warning-progress-fill ${fillClass}" style="width: ${percent}%;"></div>
          </div>
          <span style="font-size: 0.78rem; font-weight: 600;">${stats.demerits}/${threshold}</span>
        </td>
        <td>
          ${isWarning ? `
            <span class="badge-warning-danger">🚨 滿${threshold}次 (記警告)</span>
          ` : (isCaution ? `
            <span class="badge-warning-caution">⚠️ 接近警告 (${stats.demerits})</span>
          ` : `
            <span class="badge-safe">常規正常</span>
          `)}
        </td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewStudentDetailModal('${student.id}')" title="查看詳細明細">
            📋 明細
          </button>
          ${isWarning ? `
            <button class="btn btn-danger btn-sm" onclick="openDisciplinaryNoticeModal('${student.id}')" title="生成警告單" style="margin-left: 4px;">
              ⚠️ 警告單
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join("");
}

// 匯出常規總表為 CSV (支援 Excel 開啟)
function exportOverviewToCSV() {
  const cls = getCurrentClass();
  const examPeriod = getCurrentExamPeriod(cls);
  const periodFilter = document.getElementById("overviewPeriodFilter");
  const periodId = periodFilter ? periodFilter.value : examPeriod.id;
  const periodName = periodId === "all" ? "全學期" : (cls.examPeriods.find(p => p.id === periodId)?.name || examPeriod.name);
  const threshold = getClassThreshold(cls);
  const cautionThreshold = getClassCautionThreshold(cls);

  let csvContent = "\uFEFF座號,姓名,專屬查詢代碼,缺點次數,優點次數,警告狀態,統計週期\n";

  cls.students.slice().sort((a, b) => a.seatNumber - b.seatNumber).forEach(s => {
    const stats = getStudentStats(cls, s.id, periodId);
    let statusText = "常規正常";
    if (stats.demerits >= threshold) statusText = `達警告門檻(${threshold}次)`;
    else if (stats.demerits >= cautionThreshold) statusText = `接近警告警戒(${cautionThreshold}~${threshold - 1}次)`;

    csvContent += `"${s.seatNumber}","${s.name}","${s.code}","${stats.demerits}","${stats.merits}","${statusText}","${periodName}"\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${cls.name}_常規統計總表_${periodName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("常規總表已匯出為 CSV！", "success");
}

// ==========================================================================
// 分頁 3：警告提醒與門檻自訂專區 (Warnings Management & Custom Threshold)
// ==========================================================================
function renderWarningsTab(cls, examPeriod) {
  const warningsList = document.getElementById("warningsListContainer");
  if (!warningsList) return;

  const threshold = getClassThreshold(cls);
  const cautionThreshold = getClassCautionThreshold(cls);

  // 同步導師警告門檻輸入框數值
  const thresholdInput = document.getElementById("classWarningThresholdInput");
  if (thresholdInput) {
    thresholdInput.value = threshold;
  }

  const warnStudents = cls.students.filter(s => {
    const stats = getStudentStats(cls, s.id, examPeriod.id);
    return stats.demerits >= threshold;
  });

  const cautionStudents = cls.students.filter(s => {
    const stats = getStudentStats(cls, s.id, examPeriod.id);
    return stats.demerits >= cautionThreshold && stats.demerits < threshold;
  });

  if (warnStudents.length === 0 && cautionStudents.length === 0) {
    warningsList.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--slate-500);">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--slate-800);">目前班上無任何同學達到 ${threshold} 次警告標準！</h3>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">全班常規表現良好，請繼續保持。</p>
      </div>
    `;
    return;
  }

  let html = "";

  // 1. 已達警告標準區塊
  if (warnStudents.length > 0) {
    html += `
      <div style="margin-bottom: 2rem;">
        <h3 style="color: var(--danger-700); font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
          🚨 已累積滿 ${threshold} 次缺點名單（已達本班警告處分標準）：共 ${warnStudents.length} 位
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
    `;

    warnStudents.forEach(student => {
      const stats = getStudentStats(cls, student.id, examPeriod.id);

      html += `
        <div class="panel-card" style="border-left: 5px solid var(--danger-600); margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <div>
              <span style="font-size: 1.2rem; font-weight: 800; color: var(--slate-900);">座號 ${student.seatNumber} ${student.name}</span>
              <div style="font-size: 0.8rem; color: var(--slate-500); margin-top: 2px;">專屬代碼: ${student.code}</div>
            </div>
            <span class="badge-count danger" style="font-size: 0.9rem; padding: 4px 10px;">
              ${stats.demerits} 次缺點
            </span>
          </div>
          
          <div style="background: var(--danger-50); border: 1px solid var(--danger-200); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 1rem; font-size: 0.82rem; color: var(--danger-700);">
            ⚠️ 已達到或超過本班設定之警告門檻 (${threshold} 次)！請導師儘速列印/開立警告懲處通知單，並聯繫家長。
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-danger btn-sm" onclick="openDisciplinaryNoticeModal('${student.id}')" style="flex: 1;">
              📄 開立警告單
            </button>
            <button class="btn btn-outline btn-sm" onclick="viewStudentDetailModal('${student.id}')">
              檢視流水帳
            </button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  // 2. 接近警告門檻區塊
  if (cautionStudents.length > 0) {
    html += `
      <div>
        <h3 style="color: var(--warning-600); font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
          ⚠️ 缺點接近警告警戒名單 (${cautionThreshold} ~ ${threshold - 1} 次，需加強輔導與提醒)：共 ${cautionStudents.length} 位
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
    `;

    cautionStudents.forEach(student => {
      const stats = getStudentStats(cls, student.id, examPeriod.id);
      const remaining = threshold - stats.demerits;

      html += `
        <div class="panel-card" style="border-left: 5px solid var(--warning-500); margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <div>
              <span style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900);">座號 ${student.seatNumber} ${student.name}</span>
              <div style="font-size: 0.8rem; color: var(--slate-500); margin-top: 2px;">專屬代碼: ${student.code}</div>
            </div>
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--warning-600); background: var(--warning-100); padding: 3px 8px; border-radius: var(--radius-full);">
              已達 ${stats.demerits} 次 (差 ${remaining} 次)
            </span>
          </div>
          <div style="font-size: 0.85rem; color: var(--slate-600); margin-bottom: 0.75rem;">
            建議導師可於聯絡簿提醒家長或進行個別晤談，防止再犯達 ${threshold} 次警告。
          </div>
          <button class="btn btn-outline btn-sm btn-block" onclick="viewStudentDetailModal('${student.id}')">
            檢視常規項目
          </button>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  warningsList.innerHTML = html;
}

// 導師儲存自訂警告門檻
function saveClassWarningThresholdBtn() {
  const input = document.getElementById("classWarningThresholdInput");
  if (!input) return;
  const newVal = parseInt(input.value, 10);
  if (isNaN(newVal) || newVal < 1 || newVal > 99) {
    showToast("請輸入有效的警告次數上限 (1 ~ 99)！", "warning");
    return;
  }
  const cls = getCurrentClass();
  cls.warningThreshold = newVal;
  saveStorage();
  showToast(`已成功將本班警告上限門檻設定為 ${newVal} 次！`, "success");
  renderApp();
}

// ==========================================================================
// 分頁 4：學生名冊與專屬代碼管理 (Students & Codes)
// ==========================================================================
function renderStudentsManagementTab(cls) {
  const tableBody = document.getElementById("studentRosterTableBody");
  if (!tableBody) return;

  // 1 ~ 35 號座位
  let html = "";
  for (let num = 1; num <= 35; num++) {
    const student = cls.students.find(s => Number(s.seatNumber) === num);

    html += `
      <tr>
        <td style="font-weight: 800; width: 80px;">${num}</td>
        <td>
          <input type="text" class="input-text" style="max-width: 180px; padding: 4px 8px;" 
                 id="inputNameSeat-${num}" 
                 value="${student ? (student.name || '') : ''}" 
                 placeholder="輸入姓名"
                 onchange="saveSingleStudentName(${num}, this.value)">
        </td>
        <td>
          ${student ? `
            <code style="font-weight: 700; color: var(--primary-700); background: var(--primary-50); padding: 4px 8px; border-radius: 4px;">
              ${student.code}
            </code>
            <button class="btn btn-outline btn-sm" onclick="regenerateSingleCode('${student.id}')" style="margin-left: 6px; padding: 2px 6px; font-size: 0.75rem;" title="重新產生隨機代碼">
              🔄 重設
            </button>
          ` : `
            <span style="color: var(--slate-400); font-size: 0.8rem;">儲存姓名後自動生成</span>
          `}
        </td>
        <td>
          ${student ? `
            <span style="font-size: 0.85rem; color: var(--slate-600);">正常在籍</span>
          ` : `
            <span style="font-size: 0.8rem; color: var(--slate-400);">空座號</span>
          `}
        </td>
      </tr>
    `;
  }
  tableBody.innerHTML = html;
}

// 儲存單一學生姓名 (座號 1 ~ 35)
function saveSingleStudentName(seatNumber, newName) {
  const cls = getCurrentClass();
  newName = newName.trim();
  let student = cls.students.find(s => Number(s.seatNumber) === seatNumber);

  if (!newName) {
    // 若清空姓名，移除該學生
    if (student) {
      cls.students = cls.students.filter(s => s.id !== student.id);
      saveStorage();
      renderApp();
      showToast(`已清空座號 ${seatNumber} 的學生資料`, "info");
    }
    return;
  }

  if (student) {
    student.name = newName;
  } else {
    // 新增學生（前半部班級號碼，後半部4碼完全亂數）
    const existingCodes = new Set(cls.students.map(s => s.code));
    student = {
      id: uid("stu"),
      seatNumber: seatNumber,
      name: newName,
      code: generateStudentCode(cls, existingCodes)
    };
    cls.students.push(student);
  }

  saveStorage();
  renderApp();
  showToast(`已儲存座號 ${seatNumber}：${newName}`, "success");
}

// 重新產生單一學生代碼
function regenerateSingleCode(studentId) {
  const cls = getCurrentClass();
  const student = cls.students.find(s => s.id === studentId);
  if (!student) return;

  const existingCodes = new Set(cls.students.filter(s => s.id !== studentId).map(s => s.code));
  student.code = generateStudentCode(cls, existingCodes);
  saveStorage();
  renderApp();
  showToast(`已為座號 ${student.seatNumber} 重新生成代碼：${student.code}`, "success");
}

// 全部重新產生代碼
function regenerateAllCodes() {
  if (!confirm("確定要為全班所有學生重新隨機生成專屬查詢代碼嗎？舊代碼將會失效！")) return;
  const cls = getCurrentClass();
  const existingCodes = new Set();

  cls.students.forEach(s => {
    s.code = generateStudentCode(cls, existingCodes);
    existingCodes.add(s.code);
  });

  saveStorage();
  renderApp();
  showToast("已成功更新全班每位同學的專屬代碼！", "success");
}

// 批次貼上學生姓名對話框
function openBatchPasteStudentsModal() {
  document.getElementById("batchPasteModal").classList.add("open");
}

function submitBatchPasteStudents() {
  const rawText = document.getElementById("batchPasteInput").value.trim();
  if (!rawText) {
    showToast("請輸入名單內容！", "warning");
    return;
  }

  const cls = getCurrentClass();
  const lines = rawText.split("\n");
  const existingCodes = new Set(cls.students.map(s => s.code));

  let updatedCount = 0;

  lines.forEach((line, index) => {
    line = line.trim();
    if (!line) return;

    // 格式可能有兩種：
    // 1. "1 王小明" 或 "1\t王小明" (帶座號)
    // 2. "王小明" (依行數當作座號)
    const match = line.match(/^(\d+)[,.\s\t]+(.+)$/);
    let seat = index + 1;
    let name = line;

    if (match) {
      seat = parseInt(match[1], 10);
      name = match[2].trim();
    }

    if (seat >= 1 && seat <= 35 && name) {
      let stu = cls.students.find(s => s.seatNumber === seat);
      if (stu) {
        stu.name = name;
      } else {
        const newCode = generateStudentCode(cls, existingCodes);
        existingCodes.add(newCode);
        stu = {
          id: uid("stu"),
          seatNumber: seat,
          name: name,
          code: newCode
        };
        cls.students.push(stu);
      }
      updatedCount++;
    }
  });

  saveStorage();
  closeAllModals();
  renderApp();
  showToast(`批次匯入完成！共更新 ${updatedCount} 位同學`, "success");
}

// 開啟列印學生專屬代碼家長通知單
function openPrintSlipsModal() {
  const cls = getCurrentClass();
  const container = document.getElementById("printSlipsContainer");
  if (!container) return;

  const currentUrl = window.location.href.split("#")[0];

  const slipsHtml = cls.students.slice().sort((a, b) => a.seatNumber - b.seatNumber).map(s => {
    return `
      <div class="student-card-slip">
        <div class="slip-header">
          <span>${cls.school || '國中'} • ${cls.name}</span>
          <span>座號：<strong>${s.seatNumber}</strong> 號</span>
        </div>
        <div style="font-size: 0.9rem; font-weight: 700; margin-bottom: 2px;">
          學生姓名：${s.name}
        </div>
        <div>
          <span style="font-size: 0.75rem; color: #475569;">線上查詢專屬代碼：</span>
          <div class="slip-code">${s.code}</div>
        </div>
        <div class="slip-desc">
          ※ 請家長妥善保管此代碼。登入班級常規網頁輸入代碼，即可隨時查看學生段考優缺點記錄，防範個資外洩。
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = slipsHtml;
  document.getElementById("printSlipsModal").classList.add("open");
}

// ==========================================================================
// 分頁 5：常規項目自訂 (Custom Routine Items)
// ==========================================================================
function renderRoutineItemsTab(cls) {
  const demeritList = document.getElementById("routineDemeritsList");
  const meritList = document.getElementById("routineMeritsList");

  if (demeritList) {
    if (cls.routineItems.demerits.length === 0) {
      demeritList.innerHTML = `<div style="text-align: center; color: var(--slate-400); padding: 1rem;">尚未建立缺點項目</div>`;
    } else {
      demeritList.innerHTML = cls.routineItems.demerits.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
          <div>
            <span style="font-weight: 700; color: var(--danger-700);">${item.name}</span>
            <span style="font-size: 0.75rem; background: var(--slate-200); padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${item.category || '常規'}</span>
            <span style="font-size: 0.8rem; color: var(--slate-500); margin-left: 6px;">預設每次登記 ${item.defaultCount || 1} 次</span>
          </div>
          <div>
            <button class="btn btn-outline btn-sm" onclick="openEditItemModal('demerit', '${item.id}')">編輯</button>
            <button class="btn btn-outline btn-sm" onclick="deleteRoutineItem('demerit', '${item.id}')" style="color: var(--danger-600); margin-left: 4px;">刪除</button>
          </div>
        </div>
      `).join("");
    }
  }

  if (meritList) {
    if (cls.routineItems.merits.length === 0) {
      meritList.innerHTML = `<div style="text-align: center; color: var(--slate-400); padding: 1rem;">尚未建立優點項目</div>`;
    } else {
      meritList.innerHTML = cls.routineItems.merits.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
          <div>
            <span style="font-weight: 700; color: var(--success-700);">${item.name}</span>
            <span style="font-size: 0.75rem; background: var(--slate-200); padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${item.category || '優良'}</span>
            <span style="font-size: 0.8rem; color: var(--slate-500); margin-left: 6px;">預設每次登記 ${item.defaultCount || 1} 次</span>
          </div>
          <div>
            <button class="btn btn-outline btn-sm" onclick="openEditItemModal('merit', '${item.id}')">編輯</button>
            <button class="btn btn-outline btn-sm" onclick="deleteRoutineItem('merit', '${item.id}')" style="color: var(--danger-600); margin-left: 4px;">刪除</button>
          </div>
        </div>
      `).join("");
    }
  }
}

// 新增常規項目
function openAddItemModal(type) {
  document.getElementById("itemFormType").value = type;
  document.getElementById("itemFormId").value = "";
  document.getElementById("itemFormName").value = "";
  document.getElementById("itemFormCategory").value = "生活常規";
  document.getElementById("itemFormDefaultCount").value = "1";
  document.getElementById("itemModalTitle").textContent = type === "demerit" ? "新增缺點項目" : "新增優點項目";
  document.getElementById("routineItemModal").classList.add("open");
}

// 編輯常規項目
function openEditItemModal(type, itemId) {
  const cls = getCurrentClass();
  const list = type === "demerit" ? cls.routineItems.demerits : cls.routineItems.merits;
  const item = list.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById("itemFormType").value = type;
  document.getElementById("itemFormId").value = item.id;
  document.getElementById("itemFormName").value = item.name;
  document.getElementById("itemFormCategory").value = item.category || "生活常規";
  document.getElementById("itemFormDefaultCount").value = item.defaultCount || 1;
  document.getElementById("itemModalTitle").textContent = type === "demerit" ? "編輯缺點項目" : "編輯優點項目";
  document.getElementById("routineItemModal").classList.add("open");
}

// 儲存常規項目
function saveRoutineItemForm() {
  const cls = getCurrentClass();
  const type = document.getElementById("itemFormType").value;
  const id = document.getElementById("itemFormId").value;
  const name = document.getElementById("itemFormName").value.trim();
  const category = document.getElementById("itemFormCategory").value.trim() || "常規";
  const defaultCount = parseInt(document.getElementById("itemFormDefaultCount").value, 10) || 1;

  if (!name) {
    showToast("請輸入項目名稱！", "warning");
    return;
  }

  const list = type === "demerit" ? cls.routineItems.demerits : cls.routineItems.merits;

  if (id) {
    const existing = list.find(i => i.id === id);
    if (existing) {
      existing.name = name;
      existing.category = category;
      existing.defaultCount = defaultCount;
    }
  } else {
    list.push({
      id: uid(type === "demerit" ? "d" : "m"),
      name: name,
      category: category,
      defaultCount: defaultCount
    });
  }

  saveStorage();
  closeAllModals();
  renderApp();
  showToast("常規項目已儲存", "success");
}

// 刪除常規項目
function deleteRoutineItem(type, itemId) {
  if (!confirm("確定要刪除此常規項目嗎？")) return;
  const cls = getCurrentClass();
  if (type === "demerit") {
    cls.routineItems.demerits = cls.routineItems.demerits.filter(i => i.id !== itemId);
  } else {
    cls.routineItems.merits = cls.routineItems.merits.filter(i => i.id !== itemId);
  }
  saveStorage();
  renderApp();
  showToast("常規項目已刪除", "success");
}

// ==========================================================================
// 分頁 6：段考週期管理 (Exam Periods)
// ==========================================================================
function renderPeriodsTab(cls) {
  const periodsList = document.getElementById("periodsListContainer");
  if (!periodsList) return;

  periodsList.innerHTML = cls.examPeriods.map(p => {
    const isCurrent = p.id === cls.currentExamPeriodId;
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: ${isCurrent ? 'var(--primary-50)' : 'white'}; border: 1.5px solid ${isCurrent ? 'var(--primary-500)' : 'var(--slate-200)'}; border-radius: var(--radius-lg); margin-bottom: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 1.05rem; color: var(--slate-900);">${p.name}</strong>
            ${isCurrent ? `<span style="background: var(--primary-600); color: white; padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700;">進行中 (當前累積)</span>` : ''}
          </div>
          <div style="font-size: 0.85rem; color: var(--slate-600); margin-top: 4px;">
            日期區間：${p.startDate || '未設定'} ~ ${p.endDate || '未設定'}
            ${p.note ? `<span style="color: var(--slate-400); margin-left: 8px;">(${p.note})</span>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          ${!isCurrent ? `
            <button class="btn btn-primary btn-sm" onclick="setActiveExamPeriod('${p.id}')">
              切換為現行段考
            </button>
          ` : ''}
          <button class="btn btn-outline btn-sm" onclick="openEditPeriodModal('${p.id}')">
            編輯區間
          </button>
          ${cls.examPeriods.length > 1 && !isCurrent ? `
            <button class="btn btn-outline btn-sm" onclick="deleteExamPeriod('${p.id}')" style="color: var(--danger-600);">
              刪除
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join("");
}

// 切換現行段考
function setActiveExamPeriod(periodId) {
  const cls = getCurrentClass();
  cls.currentExamPeriodId = periodId;
  cls.examPeriods.forEach(p => p.isCurrent = (p.id === periodId));
  const periodFilter = document.getElementById("overviewPeriodFilter");
  if (periodFilter) periodFilter.innerHTML = "";
  saveStorage();
  renderApp();
  showToast("已切換為現行段考！優缺點即時歸零並重新以此段考累計", "success");
}

// 新增段考對話框
function openAddPeriodModal() {
  document.getElementById("periodFormId").value = "";
  document.getElementById("periodFormName").value = "";
  document.getElementById("periodFormStart").value = new Date().toISOString().split("T")[0];
  document.getElementById("periodFormEnd").value = "";
  document.getElementById("periodFormNote").value = "";
  document.getElementById("periodModal").classList.add("open");
}

// 編輯段考對話框
function openEditPeriodModal(periodId) {
  const cls = getCurrentClass();
  const p = cls.examPeriods.find(ep => ep.id === periodId);
  if (!p) return;

  document.getElementById("periodFormId").value = p.id;
  document.getElementById("periodFormName").value = p.name;
  document.getElementById("periodFormStart").value = p.startDate || "";
  document.getElementById("periodFormEnd").value = p.endDate || "";
  document.getElementById("periodFormNote").value = p.note || "";
  document.getElementById("periodModal").classList.add("open");
}

// 儲存段考表單
function savePeriodForm() {
  const cls = getCurrentClass();
  const id = document.getElementById("periodFormId").value;
  const name = document.getElementById("periodFormName").value.trim();
  const start = document.getElementById("periodFormStart").value;
  const end = document.getElementById("periodFormEnd").value;
  const note = document.getElementById("periodFormNote").value.trim();

  if (!name) {
    showToast("請輸入段考名稱！", "warning");
    return;
  }

  if (id) {
    const p = cls.examPeriods.find(ep => ep.id === id);
    if (p) {
      p.name = name;
      p.startDate = start;
      p.endDate = end;
      p.note = note;
    }
  } else {
    const newPeriod = {
      id: uid("period"),
      name: name,
      startDate: start,
      endDate: end,
      isCurrent: false,
      note: note
    };
    cls.examPeriods.push(newPeriod);
  }

  saveStorage();
  closeAllModals();
  renderApp();
  showToast("段考區間已儲存！", "success");
}

// 刪除段考
function deleteExamPeriod(periodId) {
  if (!confirm("確定要刪除此段考區間嗎？該段考所屬的紀錄將一併被移除！")) return;
  const cls = getCurrentClass();
  cls.examPeriods = cls.examPeriods.filter(p => p.id !== periodId);
  cls.records = cls.records.filter(r => r.examPeriodId !== periodId);
  saveStorage();
  renderApp();
  showToast("段考區間已刪除", "success");
}

// ==========================================================================
// 學生/家長查詢專區 (Student / Parent Portal)
// ==========================================================================
function renderStudentView() {
  const resultCard = document.getElementById("studentPortalResult");
  const loginCard = document.getElementById("studentPortalLogin");

  if (!AppState.activeStudentPortalData) {
    loginCard.style.display = "block";
    resultCard.style.display = "none";
    return;
  }

  loginCard.style.display = "none";
  resultCard.style.display = "block";

  const { student, cls, currentPeriod } = AppState.activeStudentPortalData;
  const stats = getStudentStats(cls, student.id, currentPeriod.id);
  const isWarning = stats.demerits >= 15;
  const isCaution = stats.demerits >= 12 && stats.demerits < 15;
  const remaining = Math.max(0, 15 - stats.demerits);

  // 學生資訊
  document.getElementById("portalStudentHeaderInfo").innerHTML = `
    <div style="font-size: 0.85rem; color: #93c5fd; letter-spacing: 0.05em; font-weight: 600;">
      ${cls.school || '國中'} • ${cls.name}
    </div>
    <h2 style="font-size: 1.8rem; font-weight: 800; margin: 4px 0;">
      座號 ${student.seatNumber} 號 同學
    </h2>
    <div style="font-size: 0.85rem; color: #cbd5e1;">
      專屬查詢代碼：<code>${student.code}</code> | 學生姓名：${student.name.charAt(0)}○${student.name.length > 2 ? student.name.slice(-1) : ''} (個資安全保護)
    </div>
  `;

  // 統計數據
  document.getElementById("portalDemeritCount").textContent = stats.demerits;
  document.getElementById("portalMeritCount").textContent = stats.merits;
  document.getElementById("portalRemainingCount").textContent = remaining;

  // 警告提示狀態
  const statusBanner = document.getElementById("portalWarningAlertBanner");
  if (isWarning) {
    statusBanner.style.display = "block";
    statusBanner.className = "warning-alert-card";
    statusBanner.innerHTML = `
      <div class="warning-alert-left">
        <div class="warning-alert-icon">🚨</div>
        <div>
          <div class="warning-alert-title">本段考缺點已累積滿 15 次！已達警告處分標準</div>
          <div class="warning-alert-desc">請同學與家長主動向導師了解違規原因，積極改正以維護求學常規與操行表現。</div>
        </div>
      </div>
    `;
  } else if (isCaution) {
    statusBanner.style.display = "block";
    statusBanner.className = "warning-alert-card";
    statusBanner.style.borderColor = "var(--warning-500)";
    statusBanner.style.background = "var(--warning-50)";
    statusBanner.innerHTML = `
      <div class="warning-alert-left">
        <div class="warning-alert-icon" style="background: var(--warning-500);">⚠️</div>
        <div>
          <div class="warning-alert-title" style="color: var(--warning-600);">缺點已累積 ${stats.demerits} 次，再 ${remaining} 次將記警告！</div>
          <div class="warning-alert-desc">請特別留意課堂紀律、作業繳交與出缺席，避免再次違規達到警告門檻。</div>
        </div>
      </div>
    `;
  } else {
    statusBanner.style.display = "none";
  }

  // 歷史常規流水帳清單
  const historyList = document.getElementById("portalHistoryList");
  const records = stats.records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (records.length === 0) {
    historyList.innerHTML = `<div style="text-align: center; color: var(--slate-400); padding: 2rem;">此段考週期尚無任何優缺點登記紀錄，表現優異！</div>`;
  } else {
    historyList.innerHTML = records.map(r => {
      const isDemerit = r.type === "demerit";
      return `
        <div class="timeline-item">
          <div class="timeline-icon ${isDemerit ? 'demerit' : 'merit'}">
            ${isDemerit ? '✕' : '✓'}
          </div>
          <div class="timeline-content">
            <div class="timeline-title-row">
              <span class="timeline-title">${r.itemName}</span>
              <span class="timeline-date">${r.date}</span>
            </div>
            <div style="font-size: 0.8rem; font-weight: 700; color: ${isDemerit ? 'var(--danger-600)' : 'var(--success-600)'}; margin-top: 2px;">
              ${isDemerit ? '缺點' : '優點'} ${r.count || 1} 次
            </div>
            ${r.note ? `<div class="timeline-note">說明備註：${r.note}</div>` : ''}
          </div>
        </div>
      `;
    }).join("");
  }
}

// 學生/家長登入查詢
function queryStudentByCode(event) {
  if (event) event.preventDefault();
  const inputCode = document.getElementById("studentCodeInput").value.trim().toUpperCase();

  if (!inputCode) {
    showToast("請輸入專屬查詢代碼！", "warning");
    return;
  }

  // 在所有班級中尋找擁有此 code 的學生
  let foundStudent = null;
  let foundClass = null;

  for (const cls of AppState.data.classes) {
    const s = cls.students.find(stu => stu.code.toUpperCase() === inputCode);
    if (s) {
      foundStudent = s;
      foundClass = cls;
      break;
    }
  }

  if (!foundStudent) {
    showToast("找不到此專屬代碼，請確認是否輸入正確！", "danger");
    return;
  }

  const currentPeriod = getCurrentExamPeriod(foundClass);
  AppState.activeStudentPortalData = {
    student: foundStudent,
    cls: foundClass,
    currentPeriod: currentPeriod
  };

  showToast(`查詢成功！歡迎座號 ${foundStudent.seatNumber} 號同學`, "success");
  renderStudentView();
}

// 登出學生查詢視圖
function logoutStudentPortal() {
  AppState.activeStudentPortalData = null;
  document.getElementById("studentCodeInput").value = "";
  renderStudentView();
}

// ==========================================================================
// 班級管理與多資料庫支援 (Multi-Class & Multi-Teacher Database)
// ==========================================================================
function openClassManagerModal() {
  const listContainer = document.getElementById("classListContainer");
  if (!listContainer) return;

  listContainer.innerHTML = AppState.data.classes.map(c => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
      <div>
        <strong style="color: var(--slate-900); font-size: 1rem;">${c.name}</strong>
        <span style="font-size: 0.8rem; color: var(--slate-500); margin-left: 6px;">導師: ${c.teacherName || '未設'} | 學生: ${c.students.length} / 35 人</span>
      </div>
      <div style="display: flex; gap: 4px;">
        ${c.id !== AppState.data.currentClassId ? `
          <button class="btn btn-primary btn-sm" onclick="switchClass('${c.id}')">切換</button>
        ` : `
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary-700); padding: 4px 8px;">當前班級</span>
        `}
        ${AppState.data.classes.length > 1 ? `
          <button class="btn btn-outline btn-sm" onclick="deleteClass('${c.id}')" style="color: var(--danger-600);">刪除</button>
        ` : ''}
      </div>
    </div>
  `).join("");

  document.getElementById("classManagerModal").classList.add("open");
}

// 切換班級
function switchClass(classId) {
  AppState.data.currentClassId = classId;
  AppState.selectedStudentIds.clear();
  AppState.selectedItemId = null;
  const periodFilter = document.getElementById("overviewPeriodFilter");
  if (periodFilter) periodFilter.innerHTML = "";
  saveStorage();
  closeAllModals();
  renderApp();
  showToast(`已切換為：${getCurrentClass().name}`, "success");
}

// 新增班級
function createNewClassPrompt() {
  const className = prompt("請輸入新班級名稱（例如：8年2班、703班）：");
  if (!className || !className.trim()) return;

  const teacherName = prompt("請輸入導師姓名（例如：王老師）：") || "導師";
  const classDigits = getClassNumberPrefix(className.trim());
  const teacherPassword = prompt("請設定此班導師專屬登入密碼：", `tea${classDigits || '123'}`) || `tea${Date.now()}`;
  const thresholdPrompt = prompt("請設定此班警告門檻上限次數（預設 15 次）：", "15");
  const threshold = parseInt(thresholdPrompt, 10) || 15;
  const school = prompt("請輸入學校名稱（若不顯示可直接留空）：", "") || "";

  const newClassId = uid("class");

  const newClass = {
    id: newClassId,
    name: className.trim(),
    school: school.trim(),
    teacherName: teacherName.trim(),
    teacherPassword: teacherPassword.trim(),
    warningThreshold: threshold,
    maxCapacity: 35,
    createdAt: new Date().toISOString().split("T")[0],
    currentExamPeriodId: "p1",
    examPeriods: [
      { id: "p1", name: "115-1 第1次段考", startDate: new Date().toISOString().split("T")[0], endDate: "", isCurrent: true, note: "初次段考" },
      { id: "p2", name: "115-1 第2次段考", startDate: "", endDate: "", isCurrent: false, note: "第2次段考" }
    ],
    routineItems: {
      demerits: [
        { id: uid("d"), name: "遲到進教室", category: "出缺席", defaultCount: 1 },
        { id: uid("d"), name: "未交作業 / 遲交", category: "學業常規", defaultCount: 1 },
        { id: uid("d"), name: "上課擅自說話喧嘩", category: "課堂秩序", defaultCount: 1 },
        { id: uid("d"), name: "打掃工作未到 / 偷懶", category: "衛生環境", defaultCount: 1 }
      ],
      merits: [
        { id: uid("m"), name: "熱心助人 / 協助公務", category: "品德實踐", defaultCount: 1 },
        { id: uid("m"), name: "打掃認真負責 / 獲表揚", category: "衛生環境", defaultCount: 1 },
        { id: uid("m"), name: "作業整潔優良獲甲上", category: "學業常規", defaultCount: 1 }
      ]
    },
    students: [],
    records: []
  };

  AppState.data.classes.push(newClass);
  AppState.data.currentClassId = newClassId;
  saveStorage();
  closeAllModals();
  renderApp();
  showToast(`已建立新班級：${className.trim()}，導師密碼為【${teacherPassword.trim()}】！`, "success");
}

// 刪除班級
function deleteClass(classId) {
  if (!confirm("確定要刪除此班級資料庫嗎？所有學生資料與紀錄將被永久清除！")) return;
  AppState.data.classes = AppState.data.classes.filter(c => c.id !== classId);
  if (AppState.data.currentClassId === classId) {
    AppState.data.currentClassId = AppState.data.classes[0].id;
  }
  saveStorage();
  renderApp();
  showToast("班級已刪除", "success");
}

// 備份資料庫為 JSON 檔案
function exportAllDataBackup() {
  const jsonStr = JSON.stringify(AppState.data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `常規系統備份_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("全系統資料備份已成功下載！", "success");
}

// 匯入備份資料庫
function importDataBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.classes && Array.isArray(parsed.classes)) {
        AppState.data = parsed;
        saveStorage();
        closeAllModals();
        renderApp();
        showToast("資料庫還原成功！", "success");
      } else {
        showToast("檔案格式不正確，非有效備份檔", "danger");
      }
    } catch (err) {
      showToast("解析備份檔案失敗", "danger");
    }
  };
  reader.readAsText(file);
}

// 重設回預設範例資料庫
function resetToPresetSampleData() {
  if (!confirm("確定要重設回系統預設的範例資料嗎？您目前的資料將被覆蓋！")) return;
  AppState.data = JSON.parse(JSON.stringify(PRESET_SAMPLE_DATA));
  saveStorage();
  closeAllModals();
  renderApp();
  showToast("已成功載入預設展示資料！", "success");
}

// ==========================================================================
// 彈跳視窗：警告單處置與生教組格式化輸出
// ==========================================================================
function openDisciplinaryNoticeModal(studentId) {
  const cls = getCurrentClass();
  const examPeriod = getCurrentExamPeriod(cls);
  const student = cls.students.find(s => s.id === studentId);
  if (!student) return;

  const threshold = getClassThreshold(cls);
  const stats = getStudentStats(cls, studentId, examPeriod.id);
  const demeritRecords = stats.records.filter(r => r.type === "demerit").sort((a, b) => a.date.localeCompare(b.date));

  const content = document.getElementById("noticeModalBody");
  if (!content) return;

  const schoolTitle = cls.school ? `${cls.school} ` : "";

  content.innerHTML = `
    <div style="border: 2px solid var(--danger-600); border-radius: var(--radius-lg); padding: 1.5rem; background: #fff;">
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 0.75rem; margin-bottom: 1rem;">
        <h2 style="font-size: 1.3rem; font-weight: 800; color: #000;">${schoolTitle}學生生活常規警告處分陳報表</h2>
        <div style="font-size: 0.85rem; color: #475569; margin-top: 4px;">（本表由常規管理系統自動生成，缺點累積滿 ${threshold} 次送生教組覆核記警告乙次）</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.95rem; font-weight: 700;">
        <div>班級：${cls.name}</div>
        <div>座號：${student.seatNumber} 號</div>
        <div>姓名：${student.name}</div>
      </div>

      <div style="margin-bottom: 1rem; font-size: 0.9rem;">
        <strong>統計週期：</strong>${examPeriod.name} (${examPeriod.startDate} ~ ${examPeriod.endDate})<br>
        <strong>累計缺點次數：</strong><span style="color: var(--danger-600); font-weight: 800; font-size: 1.1rem;">${stats.demerits} 次</span>（已達本班門檻 ${threshold} 次處分標準）
      </div>

      <div style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.9rem;">違規紀錄流水帳明細（供生教組查驗）：</div>
      <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--slate-300); border-radius: var(--radius-sm); padding: 0.5rem; font-size: 0.82rem; background: var(--slate-50);">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--slate-300); text-align: left;">
              <th style="padding: 4px;">#</th>
              <th style="padding: 4px;">日期</th>
              <th style="padding: 4px;">項目</th>
              <th style="padding: 4px;">次數</th>
              <th style="padding: 4px;">備註說明</th>
            </tr>
          </thead>
          <tbody>
            ${demeritRecords.map((r, i) => `
              <tr style="border-bottom: 1px solid var(--slate-200);">
                <td style="padding: 4px; font-weight: 700;">${i + 1}</td>
                <td style="padding: 4px;">${r.date}</td>
                <td style="padding: 4px; font-weight: 600; color: var(--danger-700);">${r.itemName}</td>
                <td style="padding: 4px;">1</td>
                <td style="padding: 4px; color: var(--slate-600);">${r.note || '-'}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 700; padding-top: 1rem; border-top: 1px solid #cbd5e1;">
        <div>導師簽章：__________________</div>
        <div>生教組覆核：__________________</div>
        <div>學務主任：__________________</div>
      </div>
    </div>
  `;

  document.getElementById("disciplinaryNoticeModal").classList.add("open");
}

// 列印警告通知單
function printDisciplinaryNotice() {
  window.print();
}

// 檢視單一學生完整紀錄流水帳 Modal
function viewStudentDetailModal(studentId) {
  const cls = getCurrentClass();
  const student = cls.students.find(s => s.id === studentId);
  if (!student) return;

  const currentPeriod = getCurrentExamPeriod(cls);
  const stats = getStudentStats(cls, studentId, "all"); // 顯示所有段考

  document.getElementById("studentDetailModalTitle").textContent = `座號 ${student.seatNumber} 號 ${student.name} - 常規記錄總覽`;
  
  const content = document.getElementById("studentDetailModalBody");
  content.innerHTML = `
    <div style="display: flex; gap: 1rem; margin-bottom: 1rem; background: var(--slate-50); padding: 1rem; border-radius: var(--radius-md);">
      <div><strong>專屬代碼：</strong><code>${student.code}</code></div>
      <div><strong>目前段考缺點：</strong><span style="color: var(--danger-600); font-weight: 800;">${getStudentStats(cls, studentId, currentPeriod.id).demerits} 次</span></div>
      <div><strong>目前段考優點：</strong><span style="color: var(--success-600); font-weight: 800;">${getStudentStats(cls, studentId, currentPeriod.id).merits} 次</span></div>
      <div><strong>全學期累計缺點：</strong>${stats.demerits} 次</div>
    </div>

    <div style="font-weight: 700; margin-bottom: 0.5rem;">歷史記錄列表 (依時間倒序)：</div>
    <div style="max-height: 350px; overflow-y: auto;">
      ${stats.records.length === 0 ? `<div style="text-align: center; color: var(--slate-400); padding: 2rem;">尚無任何紀錄</div>` : 
        stats.records.sort((a,b) => (b.timestamp||0) - (a.timestamp||0)).map(r => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: white; border: 1px solid var(--slate-200); border-radius: var(--radius-sm); margin-bottom: 0.4rem; font-size: 0.85rem;">
            <div>
              <span class="badge-${r.type === 'demerit' ? 'warning-danger' : 'safe'}">${r.type === 'demerit' ? '缺點 -' : '優點 +'}${r.count || 1}</span>
              <strong style="margin-left: 6px;">${r.itemName}</strong>
              ${r.note ? `<span style="color: var(--slate-600); margin-left: 6px;">(${r.note})</span>` : ''}
              <div style="font-size: 0.72rem; color: var(--slate-400); margin-top: 2px;">日期: ${r.date} | 段考: ${cls.examPeriods.find(p => p.id === r.examPeriodId)?.name || '未知'}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="deleteRecord('${r.id}'); viewStudentDetailModal('${student.id}');" style="color: var(--danger-600); padding: 2px 6px; font-size: 0.75rem;">撤銷</button>
          </div>
        `).join("")
      }
    </div>
  `;

  document.getElementById("studentDetailModal").classList.add("open");
}

// 關閉所有 Modals
function closeAllModals() {
  document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
}

// 切換導師視圖子分頁
function switchTeacherTab(tabName) {
  AppState.activeTeacherTab = tabName;
  renderApp();
}

// 切換角色 (landing | teacher | student | admin)
function switchRole(role) {
  AppState.currentRole = role;
  AppState.selectedStudentIds.clear();
  renderApp();
}

// ==========================================================================
// 身分分流入口大廳 (Landing Portal)
// ==========================================================================
function renderLandingView() {
  const pwInput = document.getElementById("landingTeacherPasswordInput");
  if (pwInput) pwInput.value = "";
}

// 導師透過專屬密碼登入所屬班級
function loginTeacherWithPassword(event) {
  if (event) event.preventDefault();
  const pwInput = document.getElementById("landingTeacherPasswordInput");
  const enteredPw = pwInput ? pwInput.value.trim() : "";

  if (!enteredPw) {
    showToast("請輸入導師專屬密碼！", "warning");
    return;
  }

  if (!AppState.data || !AppState.data.classes) {
    showToast("系統資料異常，請聯繫校務管理者！", "danger");
    return;
  }

  // 尋找符合此專屬密碼的班級 (比對 teacherPassword)
  const matchedClass = AppState.data.classes.find(c => c.teacherPassword && c.teacherPassword.trim().toLowerCase() === enteredPw.toLowerCase());

  if (!matchedClass) {
    showToast("密碼錯誤或查無對應班級！請向校務管理者洽詢您的導師專屬密碼。", "danger");
    if (pwInput) {
      pwInput.value = "";
      pwInput.focus();
    }
    return;
  }

  // 成功登入導師班級
  AppState.data.currentClassId = matchedClass.id;
  AppState.loggedInTeacherClassId = matchedClass.id;
  AppState.isImpersonating = false;
  saveStorage();

  if (pwInput) pwInput.value = "";
  switchRole("teacher");
  showToast(`登入成功！歡迎 ${matchedClass.name} 導師進入常規管理工作台`, "success");
}

// 導師登出
function logoutTeacher() {
  AppState.loggedInTeacherClassId = null;
  switchRole("landing");
  showToast("已成功登出導師工作台", "info");
}

function queryStudentDirectlyFromLanding(event) {
  if (event) event.preventDefault();
  const inputEl = document.getElementById("landingStudentCodeInput");
  const code = inputEl ? inputEl.value.trim().toUpperCase() : "";

  if (!code) {
    showToast("請輸入專屬查詢代碼！", "warning");
    return;
  }

  let foundStudent = null;
  let foundClass = null;

  for (const cls of AppState.data.classes) {
    const s = cls.students.find(stu => stu.code.toUpperCase() === code);
    if (s) {
      foundStudent = s;
      foundClass = cls;
      break;
    }
  }

  if (!foundStudent) {
    showToast("找不到此專屬代碼，請確認是否輸入正確！", "danger");
    return;
  }

  const currentPeriod = getCurrentExamPeriod(foundClass);
  AppState.activeStudentPortalData = {
    student: foundStudent,
    cls: foundClass,
    currentPeriod: currentPeriod
  };

  switchRole("student");
  showToast(`查詢成功！歡迎座號 ${foundStudent.seatNumber} 號同學`, "success");
}

function goToLandingPortal() {
  if (AppState.isImpersonating) {
    if (!confirm("您目前正在代管模式，確定要返回身分分流入口嗎？")) {
      return;
    }
    AppState.isImpersonating = false;
  }
  AppState.loggedInTeacherClassId = null;
  switchRole("landing");
}

// ==========================================================================
// 校務管理者身分認證與代管模式 (Admin Authentication & Impersonation)
// ==========================================================================
function openAdminLoginModal() {
  const pwInput = document.getElementById("adminPasswordInput");
  if (pwInput) pwInput.value = "";
  const modal = document.getElementById("adminLoginModal");
  if (modal) modal.classList.add("open");
  if (pwInput) setTimeout(() => pwInput.focus(), 200);
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
  }
}

function submitAdminLogin(event) {
  if (event) event.preventDefault();
  const pwInput = document.getElementById("adminPasswordInput");
  const val = pwInput ? pwInput.value.trim() : "";
  const expectedPw = (AppState.data && AppState.data.adminPassword) ? AppState.data.adminPassword : "admin";

  if (val === expectedPw) {
    AppState.isAdminLoggedIn = true;
    sessionStorage.setItem("ROUTINE_ADMIN_AUTH", "true");
    closeAllModals();
    switchRole("admin");
    showToast("校務管理者認證成功，歡迎進入管理中心！", "success");
  } else {
    showToast("管理者密碼錯誤，請確認後重新輸入！", "danger");
    if (pwInput) {
      pwInput.value = "";
      pwInput.focus();
    }
  }
}

function logoutAdmin() {
  AppState.isAdminLoggedIn = false;
  AppState.isImpersonating = false;
  sessionStorage.removeItem("ROUTINE_ADMIN_AUTH");
  switchRole("landing");
  showToast("已安全登出校務管理者身分", "info");
}

function impersonateClass(classId) {
  AppState.data.currentClassId = classId;
  AppState.isImpersonating = true;
  saveStorage();
  switchRole("teacher");
  const cls = getCurrentClass();
  showToast(`已進入【${cls ? cls.name : ''}】代管模式，您可隨時點選頂部「返回管理中心」`, "success");
}

function exitImpersonation() {
  AppState.isImpersonating = false;
  switchRole("admin");
  showToast("已結束代管，回到校務系統管理中心", "info");
}

// ==========================================================================
// 系統管理中心 (Admin Console Views & Management)
// ==========================================================================
function switchAdminTab(tabName) {
  AppState.activeAdminTab = tabName;
  renderAdminView();
}

function renderAdminView() {
  if (!AppState.isAdminLoggedIn) {
    switchRole("landing");
    openAdminLoginModal();
    return;
  }

  const classes = AppState.data.classes || [];
  if (!AppState.adminSelectedClassId || !classes.some(c => c.id === AppState.adminSelectedClassId)) {
    AppState.adminSelectedClassId = AppState.data.currentClassId || (classes[0] ? classes[0].id : null);
  }

  renderAdminStats();

  // Tab buttons
  document.querySelectorAll(".admin-sub-nav .sub-nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-admintab") === AppState.activeAdminTab);
  });

  // Tab panes
  const panes = ["classes", "students", "routine-items", "periods", "security"];
  panes.forEach(p => {
    const pane = document.getElementById(`adminTabPane-${p}`);
    if (pane) {
      pane.style.display = (p === AppState.activeAdminTab) ? "block" : "none";
    }
  });

  if (AppState.activeAdminTab === "classes") renderAdminClasses();
  else if (AppState.activeAdminTab === "students") renderAdminStudents();
  else if (AppState.activeAdminTab === "routine-items") renderAdminRoutineItems();
  else if (AppState.activeAdminTab === "periods") renderAdminPeriods();
  else if (AppState.activeAdminTab === "security") renderAdminSecurity();
}

function renderAdminStats() {
  const container = document.getElementById("adminStatsGridContainer");
  if (!container) return;

  const classes = AppState.data.classes || [];
  const totalClasses = classes.length;
  const totalStudents = classes.reduce((sum, c) => sum + (c.students ? c.students.length : 0), 0);
  let totalWarnings = 0;
  let totalRecords = 0;

  classes.forEach(c => {
    const p = getCurrentExamPeriod(c);
    const threshold = getClassThreshold(c);
    if (c.students) {
      c.students.forEach(s => {
        const stats = getStudentStats(c, s.id, p?.id);
        if (stats.demerits >= threshold) totalWarnings++;
      });
    }
    if (c.records) totalRecords += c.records.length;
  });

  container.innerHTML = `
    <div class="admin-stat-card">
      <div class="admin-stat-icon" style="background: #eff6ff; color: #2563eb;">🏫</div>
      <div>
        <div class="admin-stat-number">${totalClasses}</div>
        <div class="admin-stat-label">全校班級總數</div>
      </div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-icon" style="background: #f0fdf4; color: #16a34a;">👥</div>
      <div>
        <div class="admin-stat-number">${totalStudents}</div>
        <div class="admin-stat-label">全校學生總數</div>
      </div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-icon" style="background: ${totalWarnings > 0 ? '#fef2f2' : '#f8fafc'}; color: ${totalWarnings > 0 ? '#dc2626' : '#64748b'};">🚨</div>
      <div>
        <div class="admin-stat-number" style="color: ${totalWarnings > 0 ? '#dc2626' : 'inherit'};">${totalWarnings}</div>
        <div class="admin-stat-label">達警告門檻學生</div>
      </div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-icon" style="background: #fdf4ff; color: #9333ea;">📝</div>
      <div>
        <div class="admin-stat-number">${totalRecords}</div>
        <div class="admin-stat-label">累積登記流水帳</div>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// Admin Tab 1: 班級與導師密碼總管
// --------------------------------------------------------------------------
function renderAdminClasses() {
  const container = document.getElementById("adminTabPane-classes");
  if (!container) return;

  const classes = AppState.data.classes || [];

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
      <div>
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--slate-900);">班級、導師專屬密碼與門檻清單</h3>
        <p style="font-size: 0.85rem; color: var(--slate-500);">管理者可在此查看與修改各班導師專屬登入密碼與警告門檻，亦可代管進入任一老師工作台。</p>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" onclick="adminCreateNewClassPrompt()">
          ➕ 新增老師與班級
        </button>
        <button class="btn btn-outline btn-sm" onclick="adminSyncRoutineItemsToAllClasses()">
          📢 同步常規項目至所有班級
        </button>
      </div>
    </div>

    <div class="admin-class-grid">
      ${classes.map(c => {
        const period = getCurrentExamPeriod(c);
        const threshold = getClassThreshold(c);
        const warnCount = c.students.filter(s => getStudentStats(c, s.id, period?.id).demerits >= threshold).length;
        const capacity = c.maxCapacity || 35;
        const schoolBadge = c.school ? `<span style="font-size: 0.75rem; color: var(--slate-400); font-weight: 700;">${c.school}</span>` : '';
        return `
          <div class="admin-class-card">
            <div class="admin-class-header">
              <div>
                ${schoolBadge}
                <div class="admin-class-title">${c.name}</div>
                <div class="admin-class-teacher">導師：<strong>${c.teacherName || '未設定'}</strong></div>
              </div>
              ${warnCount > 0 ? `
                <span class="badge-count danger" title="${warnCount} 位同學滿${threshold}次缺點警告">
                  🚨 ${warnCount} 人達門檻
                </span>
              ` : `
                <span class="badge-safe" style="font-size: 0.72rem;">常規正常</span>
              `}
            </div>

            <!-- 導師專屬密碼與警告門檻直接呈現於卡片中 -->
            <div style="margin: 0.75rem 0; padding: 0.6rem 0.75rem; background: var(--slate-50); border: 1px dashed var(--slate-300); border-radius: var(--radius-md); font-size: 0.83rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="color: var(--slate-600); font-weight: 600;">🔑 導師專屬密碼：</span>
                <span style="display: flex; align-items: center; gap: 4px;">
                  <code style="font-weight: 800; color: var(--primary-700); background: var(--primary-50); padding: 2px 6px; border-radius: 4px; font-size: 0.9rem;">${c.teacherPassword || '未設定'}</code>
                  <button class="btn btn-outline btn-sm" style="padding: 1px 6px; font-size: 0.72rem;" onclick="adminQuickCopyPassword('${c.teacherPassword || ''}', '${c.name}')" title="複製密碼提供給導師">複製</button>
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; color: var(--slate-600);">
                <span>🚨 自訂警告門檻：</span>
                <strong style="color: var(--danger-600);">${threshold} 次缺點</strong>
              </div>
            </div>

            <div class="admin-class-stats-row">
              <div>
                <div style="font-size: 0.75rem; color: var(--slate-500);">學生人數</div>
                <div style="font-weight: 800; font-size: 1rem; color: var(--slate-800);">${c.students.length} / ${capacity}</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--slate-500);">目前段考</div>
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--primary-700);">${period ? period.name : '未設'}</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--slate-500);">登記次數</div>
                <div style="font-weight: 800; font-size: 1rem; color: var(--slate-800);">${c.records ? c.records.length : 0}</div>
              </div>
            </div>

            <div class="admin-class-actions">
              <button class="btn btn-primary btn-sm" onclick="impersonateClass('${c.id}')" style="flex: 1; min-width: 120px;" title="以該導師身分進入工作台代管">
                👨‍💻 進入工作台代管
              </button>
              <button class="btn btn-outline btn-sm" onclick="openAdminEditClassModal('${c.id}')" title="設定導師專屬密碼與班級資料">
                ✏️ 設定與密碼
              </button>
              <button class="btn btn-outline btn-sm" onclick="goToAdminStudents('${c.id}')" title="管理此班學生名冊與代碼">
                👥 名冊
              </button>
              ${classes.length > 1 ? `
                <button class="btn btn-outline btn-sm" onclick="adminDeleteClass('${c.id}')" style="color: var(--danger-600);" title="刪除班級">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function goToAdminStudents(classId) {
  AppState.adminSelectedClassId = classId;
  switchAdminTab("students");
}

function openAdminEditClassModal(classId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  document.getElementById("adminEditClassId").value = cls.id;
  document.getElementById("adminEditClassSchool").value = cls.school || "";
  document.getElementById("adminEditClassName").value = cls.name || "";
  document.getElementById("adminEditClassTeacher").value = cls.teacherName || "";
  document.getElementById("adminEditClassTeacherPassword").value = cls.teacherPassword || "";
  document.getElementById("adminEditClassWarningThreshold").value = cls.warningThreshold || 15;
  document.getElementById("adminEditClassCapacity").value = cls.maxCapacity || 35;

  document.getElementById("adminClassEditModalTitle").textContent = `✏️ 設定【${cls.name}】導師密碼與班級資料`;
  document.getElementById("adminClassEditModal").classList.add("open");
}

function saveAdminClassEdit(event) {
  if (event) event.preventDefault();
  const classId = document.getElementById("adminEditClassId").value;
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  const school = document.getElementById("adminEditClassSchool").value.trim();
  const name = document.getElementById("adminEditClassName").value.trim();
  const teacher = document.getElementById("adminEditClassTeacher").value.trim();
  const teacherPassword = document.getElementById("adminEditClassTeacherPassword").value.trim();
  const warningThreshold = parseInt(document.getElementById("adminEditClassWarningThreshold").value, 10) || 15;
  const cap = parseInt(document.getElementById("adminEditClassCapacity").value, 10) || 35;

  if (!name || !teacher || !teacherPassword) {
    showToast("班級名稱、導師姓名與導師專屬密碼皆為必填！", "warning");
    return;
  }

  // 檢查導師密碼是否與其他班級衝突
  const conflict = AppState.data.classes.find(c => c.id !== classId && c.teacherPassword && c.teacherPassword.trim().toLowerCase() === teacherPassword.toLowerCase());
  if (conflict) {
    showToast(`此導師密碼已由【${conflict.name}】使用，請設定不同密碼！`, "warning");
    return;
  }

  cls.school = school;
  cls.name = name;
  cls.teacherName = teacher;
  cls.teacherPassword = teacherPassword;
  cls.warningThreshold = warningThreshold;
  cls.maxCapacity = cap;

  saveStorage();
  closeAllModals();
  renderApp();
  showToast(`【${cls.name}】導師密碼與班級資料已成功儲存！`, "success");
}

function adminGenerateRandomTeacherPasswordForEdit() {
  const name = document.getElementById("adminEditClassName")?.value || "";
  const prefix = getClassNumberPrefix(name) || "tea";
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById("adminEditClassTeacherPassword");
  if (input) input.value = `tea${prefix}_${rand}`;
}

function adminQuickCopyPassword(pw, className) {
  if (!pw) return;
  navigator.clipboard.writeText(pw).then(() => {
    showToast(`已複製【${className}】導師密碼：${pw}`, "success");
  }).catch(() => {
    prompt(`請手動複製【${className}】導師密碼：`, pw);
  });
}

function adminCreateNewClassPrompt() {
  const className = prompt("請輸入新班級名稱（例如：8年3班、706班）：");
  if (!className || !className.trim()) return;

  const teacherName = prompt("請輸入導師姓名（例如：陳導師）：") || "導師";
  const classDigits = getClassNumberPrefix(className.trim());
  const teacherPassword = prompt("請設定此班導師專屬登入密碼：", `tea${classDigits || '123'}`) || `tea${Date.now()}`;
  const thresholdPrompt = prompt("請設定此班警告門檻上限次數（預設 15 次）：", "15");
  const threshold = parseInt(thresholdPrompt, 10) || 15;
  const school = prompt("請輸入學校名稱（若不顯示可直接留空）：", "") || "";

  const newClassId = uid("class");

  const newClass = {
    id: newClassId,
    name: className.trim(),
    school: school.trim(),
    teacherName: teacherName.trim(),
    teacherPassword: teacherPassword.trim(),
    warningThreshold: threshold,
    maxCapacity: 35,
    createdAt: new Date().toISOString().split("T")[0],
    currentExamPeriodId: "p1",
    examPeriods: [
      { id: "p1", name: "115-1 第1次段考", startDate: new Date().toISOString().split("T")[0], endDate: "", isCurrent: true, note: "初次段考" },
      { id: "p2", name: "115-1 第2次段考", startDate: "", endDate: "", isCurrent: false, note: "第2次段考" }
    ],
    routineItems: {
      demerits: [
        { id: uid("d"), name: "遲到進教室", category: "出缺席", defaultCount: 1, icon: "alarm" },
        { id: uid("d"), name: "未交作業 / 遲交", category: "學業常規", defaultCount: 1, icon: "book-x" },
        { id: uid("d"), name: "上課擅自說話喧嘩", category: "課堂秩序", defaultCount: 1, icon: "volume-2" },
        { id: uid("d"), name: "打掃工作未到 / 偷懶", category: "衛生環境", defaultCount: 1, icon: "brush" }
      ],
      merits: [
        { id: uid("m"), name: "熱心助人 / 協助公務", category: "品德實踐", defaultCount: 1, icon: "heart-handshake" },
        { id: uid("m"), name: "打掃認真負責 / 獲表揚", category: "衛生環境", defaultCount: 1, icon: "sparkles" },
        { id: uid("m"), name: "作業整潔優良獲甲上", category: "學業常規", defaultCount: 1, icon: "award" }
      ]
    },
    students: [],
    records: []
  };

  AppState.data.classes.push(newClass);
  AppState.adminSelectedClassId = newClassId;
  saveStorage();
  renderApp();
  showToast(`已建立新班級【${className.trim()}】，導師密碼為【${teacherPassword.trim()}】！`, "success");
}

function adminDeleteClass(classId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  if (!confirm(`確定要刪除【${cls.name}】嗎？該班所有學生、常規與代碼資料將被永久移除！`)) return;

  AppState.data.classes = AppState.data.classes.filter(c => c.id !== classId);
  if (AppState.data.currentClassId === classId) {
    AppState.data.currentClassId = AppState.data.classes[0].id;
  }
  if (AppState.adminSelectedClassId === classId) {
    AppState.adminSelectedClassId = AppState.data.classes[0].id;
  }
  saveStorage();
  renderApp();
  showToast("班級已刪除", "success");
}

// --------------------------------------------------------------------------
// Admin Tab 2: 各班學生名冊與代碼管理
// --------------------------------------------------------------------------
function renderAdminStudents() {
  const container = document.getElementById("adminTabPane-students");
  if (!container) return;

  const classes = AppState.data.classes || [];
  const targetClass = classes.find(c => c.id === AppState.adminSelectedClassId) || classes[0];
  if (!targetClass) return;

  const period = getCurrentExamPeriod(targetClass);

  container.innerHTML = `
    <div style="background: white; border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <label style="font-weight: 700; color: var(--slate-800); font-size: 0.95rem;">選擇欲管理之班級：</label>
          <select class="input-select" style="width: auto; min-width: 220px;" onchange="onAdminSelectClassForStudents(this.value)">
            ${classes.map(c => `
              <option value="${c.id}" ${c.id === targetClass.id ? 'selected' : ''}>${c.name} (${c.teacherName || '導師'})</option>
            `).join("")}
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-outline btn-sm" onclick="adminOpenBatchPaste('${targetClass.id}')">
            📋 批次貼上名冊
          </button>
          <button class="btn btn-outline btn-sm" onclick="adminRegenerateClassCodes('${targetClass.id}')">
            🎲 重新產生全班隨機代碼
          </button>
          <button class="btn btn-outline btn-sm" onclick="adminPrintClassCards('${targetClass.id}')">
            🖨️ 列印家長代碼通知小卡
          </button>
          <button class="btn btn-primary btn-sm" onclick="adminAddSingleStudent('${targetClass.id}')">
            ➕ 新增座號學生
          </button>
        </div>
      </div>
    </div>

    <div class="panel-card" style="padding: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--slate-900);">
          【${targetClass.name}】學生名冊與專屬代碼 (目前 ${targetClass.students.length} / ${targetClass.maxCapacity || 35} 人)
        </h4>
        <span style="font-size: 0.8rem; color: var(--slate-500);">※ 點選「修改姓名」可直接為老師更新學籍名單</span>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 70px;">座號</th>
              <th style="width: 140px;">姓名</th>
              <th style="width: 180px;">家長學生專屬代碼</th>
              <th>目前段考缺點</th>
              <th>目前段考優點</th>
              <th>狀態預警</th>
              <th style="text-align: right; width: 170px;">管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${targetClass.students.length === 0 ? `
              <tr><td colspan="7" style="text-align: center; color: var(--slate-400); padding: 2.5rem;">此班級尚無學生名冊，請點擊「批次貼上名冊」或「新增座號學生」快速建檔！</td></tr>
            ` : targetClass.students.sort((a,b) => a.seatNumber - b.seatNumber).map(s => {
              const threshold = getClassThreshold(targetClass);
              const cautionThreshold = getClassCautionThreshold(targetClass);
              const stats = getStudentStats(targetClass, s.id, period?.id);
              const isDanger = stats.demerits >= threshold;
              const isCaution = stats.demerits >= cautionThreshold && stats.demerits < threshold;
              return `
                <tr class="${isDanger ? 'highlight-warning' : ''}">
                  <td style="font-weight: 800; font-size: 1rem;">${s.seatNumber}</td>
                  <td style="font-weight: 700; color: var(--slate-900);">
                    ${s.name}
                  </td>
                  <td>
                    <code style="font-weight: 800; letter-spacing: 1px; color: var(--primary-700); background: var(--primary-50); padding: 3px 6px; border-radius: 4px;">${s.code}</code>
                  </td>
                  <td style="font-weight: 800; color: ${stats.demerits > 0 ? 'var(--danger-600)' : 'var(--slate-500)'};">${stats.demerits} 次</td>
                  <td style="font-weight: 800; color: ${stats.merits > 0 ? 'var(--success-600)' : 'var(--slate-500)'};">${stats.merits} 次</td>
                  <td>
                    ${isDanger ? `<span class="badge-warning-danger">🚨 達 ${threshold} 次</span>` :
                      isCaution ? `<span class="badge-warning-caution">⚠️ 接近 (${stats.demerits})</span>` :
                      `<span class="badge-safe">正常</span>`
                    }
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-outline btn-sm" onclick="adminEditStudentName('${targetClass.id}', '${s.id}')" style="padding: 2px 6px; font-size: 0.75rem;">修改姓名</button>
                    <button class="btn btn-outline btn-sm" onclick="adminRegenerateSingleCode('${targetClass.id}', '${s.id}')" style="padding: 2px 6px; font-size: 0.75rem;" title="單獨重設代碼">🎲</button>
                    <button class="btn btn-outline btn-sm" onclick="adminDeleteStudent('${targetClass.id}', '${s.id}')" style="padding: 2px 6px; font-size: 0.75rem; color: var(--danger-600);">✕</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function onAdminSelectClassForStudents(classId) {
  AppState.adminSelectedClassId = classId;
  renderAdminStudents();
}

function adminEditStudentName(classId, studentId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;
  const s = cls.students.find(stu => stu.id === studentId);
  if (!s) return;

  const newName = prompt(`請輸入座號 ${s.seatNumber} 號學生的新姓名：`, s.name);
  if (newName !== null && newName.trim()) {
    s.name = newName.trim();
    saveStorage();
    renderAdminStudents();
    showToast(`座號 ${s.seatNumber} 號姓名已修改為【${s.name}】`, "success");
  }
}

function adminRegenerateSingleCode(classId, studentId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;
  const s = cls.students.find(stu => stu.id === studentId);
  if (!s) return;

  const existingCodes = new Set(cls.students.filter(stu => stu.id !== studentId).map(stu => stu.code));
  s.code = generateStudentCode(cls, existingCodes);
  saveStorage();
  renderAdminStudents();
  showToast(`座號 ${s.seatNumber} 號已重新生成專屬代碼：${s.code}`, "success");
}

function adminDeleteStudent(classId, studentId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;
  const s = cls.students.find(stu => stu.id === studentId);
  if (!s) return;

  if (!confirm(`確定要刪除座號 ${s.seatNumber} 號 ${s.name} 嗎？該生的紀錄將一併移除。`)) return;

  cls.students = cls.students.filter(stu => stu.id !== studentId);
  cls.records = cls.records.filter(r => r.studentId !== studentId);
  saveStorage();
  renderAdminStudents();
  showToast("學生已成功移除", "info");
}

function adminAddSingleStudent(classId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  const maxCap = cls.maxCapacity || 35;
  if (cls.students.length >= maxCap) {
    showToast(`此班級已達人數上限 (${maxCap} 人)！可至基本資料調整上限`, "warning");
    return;
  }

  const usedSeats = new Set(cls.students.map(s => s.seatNumber));
  let nextSeat = 1;
  while (usedSeats.has(nextSeat)) nextSeat++;

  const name = prompt(`請輸入座號 ${nextSeat} 號學生姓名：`);
  if (!name || !name.trim()) return;

  const existingCodes = new Set(cls.students.map(s => s.code));
  const newCode = generateStudentCode(cls, existingCodes);
  cls.students.push({
    id: uid("s"),
    seatNumber: nextSeat,
    name: name.trim(),
    code: newCode
  });

  saveStorage();
  renderAdminStudents();
  showToast(`已新增座號 ${nextSeat} 號 ${name.trim()}！`, "success");
}

function adminOpenBatchPaste(classId) {
  AppState.data.currentClassId = classId;
  saveStorage();
  openBatchPasteModal();
}

function adminRegenerateClassCodes(classId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;
  if (!confirm(`確定要為【${cls.name}】全班重新生成專屬隨機代碼嗎？舊代碼將會失效。`)) return;

  const existingCodes = new Set();
  cls.students.forEach(s => {
    s.code = generateStudentCode(cls, existingCodes);
    existingCodes.add(s.code);
  });

  saveStorage();
  renderAdminStudents();
  showToast(`【${cls.name}】全班代碼已重新生成完畢！`, "success");
}

function adminPrintClassCards(classId) {
  AppState.data.currentClassId = classId;
  saveStorage();
  printStudentCards();
}

// --------------------------------------------------------------------------
// Admin Tab 3: 常規項目與全域同步
// --------------------------------------------------------------------------
function renderAdminRoutineItems() {
  const container = document.getElementById("adminTabPane-routine-items");
  if (!container) return;

  const classes = AppState.data.classes || [];
  const targetClass = classes.find(c => c.id === AppState.adminSelectedClassId) || classes[0];
  if (!targetClass) return;

  const routineItems = targetClass.routineItems || { demerits: [], merits: [] };

  container.innerHTML = `
    <div style="background: white; border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <label style="font-weight: 700; color: var(--slate-800); font-size: 0.95rem;">目前選取設定之班級：</label>
          <select class="input-select" style="width: auto; min-width: 220px;" onchange="onAdminSelectClassForRoutineItems(this.value)">
            ${classes.map(c => `
              <option value="${c.id}" ${c.id === targetClass.id ? 'selected' : ''}>${c.name} (${c.teacherName || '導師'})</option>
            `).join("")}
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-warning btn-sm" onclick="adminSyncRoutineItemsToAllClasses('${targetClass.id}')">
            📢 將此班常規標準同步套用至全校所有班級
          </button>
        </div>
      </div>
    </div>

    <div class="grid-2col">
      <!-- 缺點項目清單 -->
      <div class="panel-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--danger-600);">
            ⚠️ 缺點登記項目 (${routineItems.demerits.length})
          </h4>
          <button class="btn btn-danger btn-sm" onclick="adminAddRoutineItemPrompt('${targetClass.id}', 'demerit')">
            + 新增缺點
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${routineItems.demerits.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-sm);">
              <div>
                <span class="badge-warning-danger" style="margin-right: 6px;">${item.category || '常規'}</span>
                <strong style="color: var(--slate-900); font-size: 0.9rem;">${item.name}</strong>
              </div>
              <button class="btn btn-outline btn-sm" onclick="adminDeleteRoutineItem('${targetClass.id}', 'demerit', '${item.id}')" style="padding: 2px 6px; font-size: 0.75rem; color: var(--danger-600);">
                ✕
              </button>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- 優點項目清單 -->
      <div class="panel-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--success-600);">
            ✨ 優點表揚項目 (${routineItems.merits.length})
          </h4>
          <button class="btn btn-success btn-sm" onclick="adminAddRoutineItemPrompt('${targetClass.id}', 'merit')">
            + 新增優點
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${routineItems.merits.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-sm);">
              <div>
                <span class="badge-safe" style="margin-right: 6px; background: var(--success-100); color: var(--success-700);">${item.category || '品德'}</span>
                <strong style="color: var(--slate-900); font-size: 0.9rem;">${item.name}</strong>
              </div>
              <button class="btn btn-outline btn-sm" onclick="adminDeleteRoutineItem('${targetClass.id}', 'merit', '${item.id}')" style="padding: 2px 6px; font-size: 0.75rem; color: var(--danger-600);">
                ✕
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function onAdminSelectClassForRoutineItems(classId) {
  AppState.adminSelectedClassId = classId;
  renderAdminRoutineItems();
}

function adminAddRoutineItemPrompt(classId, type) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  const typeZh = type === "demerit" ? "缺點" : "優點";
  const name = prompt(`請輸入新${typeZh}項目名稱（例：晨讀未專注、擔任幹部盡職）：`);
  if (!name || !name.trim()) return;

  const category = prompt(`請輸入分類標籤（例：課堂秩序、生活常規、品德實踐）：`) || "常規";

  const list = type === "demerit" ? cls.routineItems.demerits : cls.routineItems.merits;
  list.push({
    id: uid(type === "demerit" ? "d" : "m"),
    name: name.trim(),
    category: category.trim(),
    defaultCount: 1,
    icon: type === "demerit" ? "alert-circle" : "sparkles"
  });

  saveStorage();
  renderAdminRoutineItems();
  showToast(`已新增${typeZh}項目：${name.trim()}`, "success");
}

function adminDeleteRoutineItem(classId, type, itemId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  if (type === "demerit") {
    cls.routineItems.demerits = cls.routineItems.demerits.filter(i => i.id !== itemId);
  } else {
    cls.routineItems.merits = cls.routineItems.merits.filter(i => i.id !== itemId);
  }

  saveStorage();
  renderAdminRoutineItems();
  showToast("常規項目已刪除", "info");
}

function adminSyncRoutineItemsToAllClasses(sourceClassId) {
  const classes = AppState.data.classes || [];
  const srcId = sourceClassId || AppState.adminSelectedClassId || classes[0]?.id;
  const srcClass = classes.find(c => c.id === srcId);
  if (!srcClass) return;

  if (!confirm(`確定要將【${srcClass.name}】的常規項目（${srcClass.routineItems.demerits.length} 個缺點、${srcClass.routineItems.merits.length} 個優點），一鍵同步覆蓋套用到全校所有班級嗎？`)) {
    return;
  }

  classes.forEach(c => {
    if (c.id !== srcClass.id) {
      c.routineItems = JSON.parse(JSON.stringify(srcClass.routineItems));
    }
  });

  saveStorage();
  renderApp();
  showToast(`常規項目已成功同步覆蓋至全校所有 ${classes.length} 個班級！`, "success");
}

// --------------------------------------------------------------------------
// Admin Tab 4: 各班段考週期設定
// --------------------------------------------------------------------------
function renderAdminPeriods() {
  const container = document.getElementById("adminTabPane-periods");
  if (!container) return;

  const classes = AppState.data.classes || [];
  const targetClass = classes.find(c => c.id === AppState.adminSelectedClassId) || classes[0];
  if (!targetClass) return;

  const periods = targetClass.examPeriods || [];

  container.innerHTML = `
    <div style="background: white; border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <label style="font-weight: 700; color: var(--slate-800); font-size: 0.95rem;">選擇班級：</label>
          <select class="input-select" style="width: auto; min-width: 220px;" onchange="onAdminSelectClassForPeriods(this.value)">
            ${classes.map(c => `
              <option value="${c.id}" ${c.id === targetClass.id ? 'selected' : ''}>${c.name} (${c.teacherName || '導師'})</option>
            `).join("")}
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="adminAddPeriodPrompt('${targetClass.id}')">
            ➕ 為此班新增段考
          </button>
          <button class="btn btn-warning btn-sm" onclick="adminBatchCreatePeriodForAllClasses()">
            📢 全校統一開啟新段考並歸零
          </button>
        </div>
      </div>
    </div>

    <div class="panel-card">
      <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--slate-900); margin-bottom: 1rem;">
        【${targetClass.name}】段考週期清單
      </h4>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${periods.map(p => {
          const isCurrent = p.id === targetClass.currentExamPeriodId || p.isCurrent;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: ${isCurrent ? 'var(--primary-50)' : 'var(--slate-50)'}; border: 1.5px solid ${isCurrent ? 'var(--primary-300)' : 'var(--slate-200)'}; border-radius: var(--radius-md); flex-wrap: wrap; gap: 0.75rem;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="font-size: 1.05rem; color: var(--slate-900);">${p.name}</strong>
                  ${isCurrent ? `<span class="badge-safe" style="background: var(--primary-600); color: white; font-weight: 700;">目前進行中 (計分歸零基準)</span>` : ''}
                </div>
                <div style="font-size: 0.82rem; color: var(--slate-500); margin-top: 4px;">
                  區間：${p.startDate || '未設'} ~ ${p.endDate || '未設'} ${p.note ? `| 備註：${p.note}` : ''}
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem;">
                ${!isCurrent ? `
                  <button class="btn btn-primary btn-sm" onclick="adminSwitchClassPeriod('${targetClass.id}', '${p.id}')">
                    切換為進行中 (歸零重新計算)
                  </button>
                ` : ''}
                ${periods.length > 1 && !isCurrent ? `
                  <button class="btn btn-outline btn-sm" onclick="adminDeletePeriod('${targetClass.id}', '${p.id}')" style="color: var(--danger-600);">
                    刪除
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function onAdminSelectClassForPeriods(classId) {
  AppState.adminSelectedClassId = classId;
  renderAdminPeriods();
}

function adminSwitchClassPeriod(classId, periodId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  cls.currentExamPeriodId = periodId;
  cls.examPeriods.forEach(p => p.isCurrent = (p.id === periodId));

  saveStorage();
  renderApp();
  showToast(`已將【${cls.name}】切換至新段考，該班常規累計歸零重新統計！`, "success");
}

function adminAddPeriodPrompt(classId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  const name = prompt("請輸入新段考名稱（例：115-1 第2次段考）：");
  if (!name || !name.trim()) return;

  const start = prompt("請輸入開始日期 (YYYY-MM-DD)：", new Date().toISOString().split("T")[0]);
  const newP = {
    id: uid("p"),
    name: name.trim(),
    startDate: start || "",
    endDate: "",
    isCurrent: false,
    note: "新段考常規歸零重新計算"
  };

  cls.examPeriods.push(newP);
  saveStorage();
  renderAdminPeriods();
  showToast(`已新增段考【${name.trim()}】！`, "success");
}

function adminDeletePeriod(classId, periodId) {
  const cls = AppState.data.classes.find(c => c.id === classId);
  if (!cls) return;

  if (!confirm("確定要刪除此段考區間嗎？所屬紀錄將一併被移除！")) return;

  cls.examPeriods = cls.examPeriods.filter(p => p.id !== periodId);
  cls.records = cls.records.filter(r => r.examPeriodId !== periodId);
  saveStorage();
  renderAdminPeriods();
  showToast("段考區間已刪除", "info");
}

function adminBatchCreatePeriodForAllClasses() {
  const periodName = prompt("請輸入全校統一開啟的新段考名稱（例：115-1 第2次段考）：");
  if (!periodName || !periodName.trim()) return;

  const startDate = prompt("請輸入開始日期 (YYYY-MM-DD)：", new Date().toISOString().split("T")[0]);

  if (!confirm(`確定要為全校所有班級統一開啟【${periodName.trim()}】並將常規歸零重計嗎？過去歷史紀錄仍會保留。`)) {
    return;
  }

  const classes = AppState.data.classes || [];
  classes.forEach(c => {
    const newPId = uid("p");
    c.examPeriods.forEach(p => p.isCurrent = false);
    c.examPeriods.push({
      id: newPId,
      name: periodName.trim(),
      startDate: startDate || "",
      endDate: "",
      isCurrent: true,
      note: "全校統一開啟段考週期（常規歸零重計）"
    });
    c.currentExamPeriodId = newPId;
  });

  saveStorage();
  renderApp();
  showToast(`全校已統一開啟【${periodName.trim()}】，所有班級常規即日起歸零重新累積！`, "success");
}

// --------------------------------------------------------------------------
// Admin Tab 5: 管理員安全密碼與維護
// --------------------------------------------------------------------------
function renderAdminSecurity() {
  const container = document.getElementById("adminTabPane-security");
  if (!container) return;

  const cfg = getCloudSyncConfig();
  const currentGasUrl = cfg.gasUrl;
  const isEnvConfigured = Boolean(cfg.envGasUrl && currentGasUrl === cfg.envGasUrl);

  container.innerHTML = `
    <div class="grid-2col">
      <!-- 變更管理員密碼卡片 -->
      <div class="panel-card">
        <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900); margin-bottom: 0.5rem;">
          🔐 變更校務管理者專屬密碼
        </h4>
        <p style="font-size: 0.85rem; color: var(--slate-500); margin-bottom: 1.25rem;">
          此密碼為系統管理者專屬，請妥善保管。若更換密碼，下次登入管理後台需使用新密碼。
        </p>

        <form onsubmit="changeAdminPassword(event)">
          <div class="form-group">
            <label class="form-label">目前管理者密碼 *</label>
            <input type="password" id="currentAdminPasswordInput" class="input-text" placeholder="請輸入目前密碼" required>
          </div>
          <div class="form-group">
            <label class="form-label">設定新密碼 * (至少 4 碼)</label>
            <input type="password" id="newAdminPasswordInput" class="input-text" placeholder="請輸入新管理者密碼" required>
          </div>
          <div class="form-group">
            <label class="form-label">確認新密碼 *</label>
            <input type="password" id="confirmAdminPasswordInput" class="input-text" placeholder="請再次輸入新管理者密碼" required>
          </div>

          <div style="font-size: 0.8rem; color: var(--slate-400); margin-bottom: 1rem;">
            ※ 變更後將立即生效，請務必妥善記住新密碼。
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">
            確認儲存新密碼
          </button>
        </form>
      </div>

      <!-- Google 試算表雲端資料庫卡片 -->
      <div class="panel-card" style="border-top: 3px solid var(--primary-600);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900);">
            ☁️ Google 試算表雲端同步
          </h4>
          <span style="background: var(--primary-50); color: var(--primary-700); font-weight: 700; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--primary-200);">
            Apps Script
          </span>
        </div>
        <p style="font-size: 0.85rem; color: var(--slate-500); margin-bottom: 1rem;">
          串接 Google Sheets，自動將全校名冊、代碼與登記紀錄流水帳同步保存至試算表，支援跨電腦線上同步。
        </p>

        <div style="background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 1rem;">
          <div style="font-size: 0.82rem; color: var(--slate-700); margin-bottom: 4px;">
            <strong>雲端連線狀態：</strong>
            <span>${currentGasUrl ? ('🟢 已綁定 Google Apps Script' + (isEnvConfigured ? ' <span style="font-size: 0.72rem; color: var(--primary-700); background: var(--primary-50); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--primary-200); font-weight: 600;">.env 環境變數</span>' : '')) : '⚪ 尚未設定 (本機離線模式)'}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--slate-500); word-break: break-all;">
            <strong>目前 API 網址：</strong>
            <code>${currentGasUrl || '尚未設定網址'}</code>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-sm" onclick="openCloudSyncModal()">
            ⚙️ 雲端同步設定與連線測試
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="uploadToCloud()" style="color: var(--primary-700);">
            ⬆️ 立即備份至試算表
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="downloadFromCloud()" style="color: var(--success-700);">
            ⬇️ 從試算表下載
          </button>
        </div>
      </div>

      <!-- 系統資料庫備份與重設 -->
      <div class="panel-card" style="grid-column: 1 / -1;">
        <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900); margin-bottom: 0.5rem;">
          💾 全校本機資料庫檔案備份與重設 (JSON)
        </h4>
        <p style="font-size: 0.85rem; color: var(--slate-500); margin-bottom: 1.25rem;">
          建議定期下載全校備份檔 (JSON)，以利更換電腦或學期結束時轉移存查。
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <div style="background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); padding: 1rem;">
            <div style="font-weight: 700; color: var(--slate-800); margin-bottom: 4px;">📥 匯出全校資料庫備份</div>
            <p style="font-size: 0.8rem; color: var(--slate-500); margin-bottom: 0.75rem;">包含全校所有班級、導師密碼、學生名冊、代碼、自訂項目與紀錄歷程完整備份。</p>
            <button class="btn btn-outline btn-sm" onclick="exportAllDataBackup()">下載全系統備份 (JSON)</button>
          </div>

          <div style="background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); padding: 1rem;">
            <div style="font-weight: 700; color: var(--slate-800); margin-bottom: 4px;">📤 匯入還原資料庫</div>
            <p style="font-size: 0.8rem; color: var(--slate-500); margin-bottom: 0.75rem;">選取過去匯出的 JSON 備份檔，完整還原全校系統設定。</p>
            <label class="btn btn-outline btn-sm" style="cursor: pointer; display: inline-block;">
              選取備份檔案匯入
              <input type="file" accept=".json" onchange="importDataBackup(event)" style="display: none;">
            </label>
          </div>

          <div style="background: #fff5f5; border: 1px solid var(--danger-200); border-radius: var(--radius-md); padding: 1rem;">
            <div style="font-weight: 700; color: var(--danger-700); margin-bottom: 4px;">🔄 重設為初始預設示範資料</div>
            <p style="font-size: 0.8rem; color: var(--slate-600); margin-bottom: 0.75rem;">回復至系統初始預設各班級示範名冊與資料。</p>
            <button class="btn btn-outline btn-sm" onclick="resetToPresetSampleData()" style="color: var(--danger-600); border-color: var(--danger-300);">重設示範資料</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function changeAdminPassword(event) {
  if (event) event.preventDefault();

  const currentPw = document.getElementById("currentAdminPasswordInput").value.trim();
  const newPw = document.getElementById("newAdminPasswordInput").value.trim();
  const confirmPw = document.getElementById("confirmAdminPasswordInput").value.trim();

  const currentExpected = (AppState.data && AppState.data.adminPassword) ? AppState.data.adminPassword : "admin";

  if (currentPw !== currentExpected) {
    showToast("目前密碼輸入不正確！", "danger");
    return;
  }

  if (newPw.length < 4) {
    showToast("新密碼長度至少需要 4 碼！", "warning");
    return;
  }

  if (newPw !== confirmPw) {
    showToast("兩次輸入的新密碼不相符！", "warning");
    return;
  }

  AppState.data.adminPassword = newPw;
  saveStorage();

  document.getElementById("currentAdminPasswordInput").value = "";
  document.getElementById("newAdminPasswordInput").value = "";
  document.getElementById("confirmAdminPasswordInput").value = "";

  showToast("管理者專屬密碼變更成功！請妥善記住新密碼", "success");
}

// ==========================================================================
// 環境變數解析與管理模組 (.env / env.js)
// ==========================================================================
function getEnv(key) {
  if (typeof window !== "undefined") {
    if (window.ENV && window.ENV[key] !== undefined && String(window.ENV[key]).trim() !== "") {
      return String(window.ENV[key]).trim();
    }
    if (window.__ENV__ && window.__ENV__[key] !== undefined && String(window.__ENV__[key]).trim() !== "") {
      return String(window.__ENV__[key]).trim();
    }
  }
  if (typeof process !== "undefined" && process.env && process.env[key] !== undefined && String(process.env[key]).trim() !== "") {
    return String(process.env[key]).trim();
  }
  return "";
}

function parseEnvString(text) {
  const result = {};
  if (!text || typeof text !== "string") return result;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

async function initEnvConfig() {
  window.ENV = window.ENV || {};
  window.__ENV__ = window.__ENV__ || {};

  // 嘗試讀取根目錄 .env 檔案（在 http/https 本機或伺服器環境中生效）
  if (typeof fetch === "function") {
    try {
      const res = await fetch(".env", { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseEnvString(text);
        for (const [k, v] of Object.entries(parsed)) {
          if (v) {
            window.ENV[k] = v;
            window.__ENV__[k] = v;
          }
        }
      }
    } catch (e) {
      // 本地 file:// 或無 .env 時靜默略過
    }
  }

  // 若環境變數包含 GOOGLE_APP_SCRIPT_URL
  const envGasUrl = getEnv("GOOGLE_APP_SCRIPT_URL");
  if (envGasUrl) {
    const localSaved = localStorage.getItem("ROUTINE_GAS_URL");
    if (!localSaved) {
      localStorage.setItem("ROUTINE_GAS_URL", envGasUrl);
    }
    initCloudSyncStatus();
  }
}

// ==========================================================================
// Google 試算表 (Google Sheets & Apps Script) 雲端資料庫同步模組
// ==========================================================================
let autoSaveCloudTimer = null;

function getCloudSyncConfig() {
  const envGasUrl = getEnv("GOOGLE_APP_SCRIPT_URL");
  let gasUrl = localStorage.getItem("ROUTINE_GAS_URL") || "";

  // 若本機尚未手動設定過，且有環境變數配置，優先以環境變數為預設值
  if (!gasUrl && envGasUrl) {
    gasUrl = envGasUrl;
  }

  let autoSync = localStorage.getItem("ROUTINE_GAS_AUTOSYNC") !== "false";
  let lastSyncedAt = localStorage.getItem("ROUTINE_GAS_LASTSYNC") || "";

  if (!gasUrl && AppState.data && AppState.data.cloudSyncConfig && AppState.data.cloudSyncConfig.gasUrl) {
    gasUrl = AppState.data.cloudSyncConfig.gasUrl;
    autoSync = AppState.data.cloudSyncConfig.autoSync !== false;
    lastSyncedAt = AppState.data.cloudSyncConfig.lastSyncedAt || "";
    localStorage.setItem("ROUTINE_GAS_URL", gasUrl);
    localStorage.setItem("ROUTINE_GAS_AUTOSYNC", autoSync ? "true" : "false");
  }

  return { gasUrl, autoSync, lastSyncedAt, envGasUrl };
}

function updateCloudSyncBadge(status = "offline", text = "離線模式") {
  const dot = document.getElementById("navCloudStatusDot");
  const label = document.getElementById("navCloudStatusText");
  const modalLabel = document.getElementById("cloudStatusLabel");
  const modalLastTime = document.getElementById("cloudLastSyncTime");

  if (dot) {
    dot.className = `cloud-status-dot ${status}`;
  }
  if (label) {
    label.textContent = text;
  }
  if (modalLabel) {
    if (status === "online") modalLabel.innerHTML = `<span style="color: var(--success-600); font-weight:700;">🟢 雲端已連線 (${text})</span>`;
    else if (status === "syncing") modalLabel.innerHTML = `<span style="color: var(--warning-600); font-weight:700;">🟡 ${text}</span>`;
    else if (status === "error") modalLabel.innerHTML = `<span style="color: var(--danger-600); font-weight:700;">🔴 連線失敗 (${text})</span>`;
    else modalLabel.innerHTML = `<span style="color: var(--slate-500);">⚪ 尚未設定 (離線模式)</span>`;
  }
  if (modalLastTime) {
    const lastSync = localStorage.getItem("ROUTINE_GAS_LASTSYNC");
    modalLastTime.textContent = lastSync ? new Date(lastSync).toLocaleString("zh-TW") : "無";
  }
}

function initCloudSyncStatus() {
  const cfg = getCloudSyncConfig();
  if (!cfg.gasUrl) {
    updateCloudSyncBadge("offline", "離線模式");
    return;
  }
  updateCloudSyncBadge("online", "雲端已連線");
}

function openCloudSyncModal() {
  const cfg = getCloudSyncConfig();
  const input = document.getElementById("gasApiUrlInput");
  const checkbox = document.getElementById("autoCloudSyncCheckbox");
  const envNotice = document.getElementById("gasEnvNotice");

  if (input) input.value = cfg.gasUrl;
  if (checkbox) checkbox.checked = cfg.autoSync;

  if (envNotice) {
    if (cfg.envGasUrl) {
      envNotice.style.display = "block";
      envNotice.innerHTML = `⚡ 已載入環境變數設定 (<code>GOOGLE_APP_SCRIPT_URL</code>)`;
    } else {
      envNotice.style.display = "none";
    }
  }

  const modal = document.getElementById("cloudSyncModal");
  if (modal) {
    modal.classList.add("open");
  }

  if (cfg.gasUrl) {
    testCloudConnection(true);
  } else {
    updateCloudSyncBadge("offline", "尚未設定");
  }
}

function saveCloudSettings() {
  const input = document.getElementById("gasApiUrlInput");
  const checkbox = document.getElementById("autoCloudSyncCheckbox");

  const gasUrl = input ? input.value.trim() : "";
  const autoSync = checkbox ? checkbox.checked : true;

  localStorage.setItem("ROUTINE_GAS_URL", gasUrl);
  localStorage.setItem("ROUTINE_GAS_AUTOSYNC", autoSync ? "true" : "false");

  if (!AppState.data.cloudSyncConfig) AppState.data.cloudSyncConfig = {};
  AppState.data.cloudSyncConfig.gasUrl = gasUrl;
  AppState.data.cloudSyncConfig.autoSync = autoSync;
  saveStorage(true);

  if (!gasUrl) {
    updateCloudSyncBadge("offline", "離線模式");
    showToast("已清除 Google 試算表網址，切換為本機離線模式", "info");
    return;
  }

  showToast("網址設定已儲存，正在測試連線...", "info");
  testCloudConnection(false, () => {
    if (confirm("Google Apps Script 雲端試算表連線成功！是否立即將目前本機班級資料庫同步備份至試算表？")) {
      uploadToCloud();
    }
  });
}

function testCloudConnection(isSilent = false, onSuccess = null) {
  const cfg = getCloudSyncConfig();
  const gasUrl = (document.getElementById("gasApiUrlInput")?.value || cfg.gasUrl).trim();

  if (!gasUrl) {
    if (!isSilent) showToast("請先輸入 Google Apps Script 網頁應用程式網址！", "warning");
    updateCloudSyncBadge("offline", "尚未設定");
    return;
  }

  updateCloudSyncBadge("syncing", "測試連線中...");

  const pingUrl = gasUrl + (gasUrl.includes("?") ? "&" : "?") + "action=ping&_t=" + Date.now();

  fetch(pingUrl, { method: "GET", mode: "cors", redirect: "follow" })
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      if (data && data.status === "success") {
        updateCloudSyncBadge("online", "連線正常");
        if (!isSilent) {
          showToast(`連線成功！試算表：${data.spreadsheetName || '已連線'}`, "success");
        }
        if (typeof onSuccess === "function") onSuccess();
      } else {
        throw new Error(data.message || "回傳狀態異常");
      }
    })
    .catch(err => {
      console.warn("GAS Ping failed:", err);
      updateCloudSyncBadge("error", "連線錯誤");
      if (!isSilent) {
        showToast("無法連線至 Google 試算表，請確認 Web App 部署權限是否設為【所有人 (Anyone)】！", "danger");
      }
    });
}

function uploadToCloud(isSilent = false) {
  const cfg = getCloudSyncConfig();
  if (!cfg.gasUrl) {
    if (!isSilent) showToast("尚未設定 Google Apps Script 網址，請先進行設定", "warning");
    return;
  }

  const btn = document.getElementById("btnUploadCloud");
  if (btn) btn.disabled = true;

  updateCloudSyncBadge("syncing", "上傳同步中...");

  const payload = {
    action: "save",
    data: AppState.data
  };

  fetch(cfg.gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload),
    redirect: "follow"
  })
    .then(res => res.json())
    .then(result => {
      if (result.status === "success") {
        const nowIso = new Date().toISOString();
        localStorage.setItem("ROUTINE_GAS_LASTSYNC", nowIso);
        if (!AppState.data.cloudSyncConfig) AppState.data.cloudSyncConfig = {};
        AppState.data.cloudSyncConfig.lastSyncedAt = nowIso;

        updateCloudSyncBadge("online", "已同步最新");
        if (!isSilent) {
          showToast(`已成功同步至 Google 試算表！（共 ${result.recordsCount || 0} 筆常規紀錄）`, "success");
        }
      } else {
        throw new Error(result.message || "雲端儲存失敗");
      }
    })
    .catch(err => {
      console.error("Upload to GAS failed:", err);
      updateCloudSyncBadge("error", "上傳失敗");
      if (!isSilent) {
        showToast("同步上傳至 Google 試算表失敗，已保存在本機中：" + err.message, "danger");
      }
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function downloadFromCloud() {
  const cfg = getCloudSyncConfig();
  if (!cfg.gasUrl) {
    showToast("尚未設定 Google Apps Script 網址，請先進行設定", "warning");
    return;
  }

  if (!confirm("⚠️ 注意：從 Google 試算表下載將以雲端資料【覆蓋】本機目前所有紀錄與班級設定。確定要同步下載嗎？")) {
    return;
  }

  const btn = document.getElementById("btnDownloadCloud");
  if (btn) btn.disabled = true;

  updateCloudSyncBadge("syncing", "下載同步中...");

  const loadUrl = cfg.gasUrl + (cfg.gasUrl.includes("?") ? "&" : "?") + "action=load&_t=" + Date.now();

  fetch(loadUrl, { method: "GET", mode: "cors", redirect: "follow" })
    .then(res => res.json())
    .then(result => {
      if (result.status === "success" && result.data && result.data.classes) {
        AppState.data = result.data;
        const nowIso = new Date().toISOString();
        localStorage.setItem("ROUTINE_GAS_LASTSYNC", nowIso);
        saveStorage(true); // 存入 LocalStorage，略過立即回傳雲端
        renderApp();
        updateCloudSyncBadge("online", "已同步最新");
        showToast("已成功從 Google 試算表同步下載最新資料！", "success");
        closeAllModals();
      } else if (result.status === "empty") {
        showToast(result.message || "雲端試算表尚無資料庫，請先執行上傳備份！", "warning");
        updateCloudSyncBadge("online", "雲端為空");
      } else {
        throw new Error(result.message || "下載資料異常");
      }
    })
    .catch(err => {
      console.error("Download from GAS failed:", err);
      updateCloudSyncBadge("error", "下載失敗");
      showToast("從 Google 試算表下載失敗：" + err.message, "danger");
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function triggerAutoCloudSave() {
  const cfg = getCloudSyncConfig();
  if (!cfg.gasUrl || !cfg.autoSync) return;

  if (autoSaveCloudTimer) {
    clearTimeout(autoSaveCloudTimer);
  }

  updateCloudSyncBadge("syncing", "等待同步...");

  autoSaveCloudTimer = setTimeout(() => {
    uploadToCloud(true);
  }, 2000); // 2秒防抖延遲
}

// 應用程式初始化事件監聽
document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  initEnvConfig();

  // 預設日期為今天
  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("recordDateInput");
  if (dateInput) dateInput.value = today;

  // 班級下拉選單變更
  const classDropdown = document.getElementById("classSelectDropdown");
  if (classDropdown) {
    classDropdown.addEventListener("change", (e) => {
      switchClass(e.target.value);
    });
  }

  // 點選背景關閉 Modal
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeAllModals();
      }
    });
  });

  renderApp();
});
