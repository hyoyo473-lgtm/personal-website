/**
 * 預設展示資料 (Sample Data)
 * 包含完整 35 位學生範例名單、隨機專屬代碼、自訂常規項目與模擬紀錄
 */

const PRESET_SAMPLE_DATA = {
  adminPassword: "admin888",
  currentClassId: "class-801",
  classes: [
    {
      id: "class-801",
      name: "8年1班",
      school: "",
      teacherName: "林導師",
      teacherPassword: "tea801",
      warningThreshold: 15,
      maxCapacity: 35,
      createdAt: "2026-09-01",
      currentExamPeriodId: "period-1",
      examPeriods: [
        {
          id: "period-1",
          name: "115-1 第1次段考",
          startDate: "2026-09-01",
          endDate: "2026-10-15",
          isCurrent: true,
          note: "學期初至第一次段考常規統計"
        },
        {
          id: "period-2",
          name: "115-1 第2次段考",
          startDate: "2026-10-16",
          endDate: "2026-11-27",
          isCurrent: false,
          note: "第2次段考常規統計 (歸零重新計算)"
        },
        {
          id: "period-3",
          name: "115-1 第3次段考",
          startDate: "2026-11-28",
          endDate: "2027-01-18",
          isCurrent: false,
          note: "學期末至第三次段考常規統計"
        }
      ],
      // 自訂常規項目
      routineItems: {
        demerits: [
          { id: "d-1", name: "遲到進教室", category: "出缺席", defaultCount: 1, icon: "alarm" },
          { id: "d-2", name: "未交作業 / 遲交", category: "學業常規", defaultCount: 1, icon: "book-x" },
          { id: "d-3", name: "聯絡簿未簽 / 未帶", category: "學業常規", defaultCount: 1, icon: "file-x" },
          { id: "d-4", name: "上課擅自說話喧嘩", category: "課堂秩序", defaultCount: 1, icon: "volume-2" },
          { id: "d-5", name: "上課趴睡未聽講", category: "課堂秩序", defaultCount: 1, icon: "moon" },
          { id: "d-6", name: "服裝儀容不整", category: "生活常規", defaultCount: 1, icon: "shirt" },
          { id: "d-7", name: "打掃工作未到 / 偷懶", category: "衛生環境", defaultCount: 1, icon: "brush" },
          { id: "d-8", name: "座位週遭髒亂遺留垃圾", category: "衛生環境", defaultCount: 1, icon: "trash-2" },
          { id: "d-9", name: "下課走廊奔跑追逐", category: "校園安全", defaultCount: 1, icon: "zap" },
          { id: "d-10", name: "對師長同學態度不佳", category: "品德態度", defaultCount: 1, icon: "alert-circle" }
        ],
        merits: [
          { id: "m-1", name: "熱心助人 / 協助公務", category: "品德實踐", defaultCount: 1, icon: "heart-handshake" },
          { id: "m-2", name: "打掃認真負責 / 獲表揚", category: "衛生環境", defaultCount: 1, icon: "sparkles" },
          { id: "m-3", name: "課堂主動發言表現優良", category: "課堂秩序", defaultCount: 1, icon: "star" },
          { id: "m-4", name: "作業整潔優良獲甲上", category: "學業常規", defaultCount: 1, icon: "award" },
          { id: "m-5", name: "拾金不昧", category: "品德實踐", defaultCount: 1, icon: "gift" },
          { id: "m-6", name: "擔任幹部盡忠職守", category: "幹部表現", defaultCount: 1, icon: "shield-check" },
          { id: "m-7", name: "主動維護班級公共秩序", category: "課堂秩序", defaultCount: 1, icon: "thumbs-up" }
        ]
      },
      // 35 位學生名單及預先產生的專屬查詢代碼
      students: [
        { id: "s-1", seatNumber: 1, name: "陳冠宇", code: "801-K8P2" },
        { id: "s-2", seatNumber: 2, name: "林子豪", code: "801-7M4Q" },
        { id: "s-3", seatNumber: 3, name: "張祐誠", code: "801-9W3X" },
        { id: "s-4", seatNumber: 4, name: "黃柏翰", code: "801-F2J8" },
        { id: "s-5", seatNumber: 5, name: "李承恩", code: "801-B5R7" },
        { id: "s-6", seatNumber: 6, name: "王品捷", code: "801-N4V9" },
        { id: "s-7", seatNumber: 7, name: "吳庭瑋", code: "801-H6D3" },
        { id: "s-8", seatNumber: 8, name: "劉秉叡", code: "801-T8C5" },
        { id: "s-9", seatNumber: 9, name: "蔡宗翰", code: "801-Z3L6" },
        { id: "s-10", seatNumber: 10, name: "楊晨熙", code: "801-P9A2" },
        { id: "s-11", seatNumber: 11, name: "許翔宇", code: "801-Y4E7" },
        { id: "s-12", seatNumber: 12, name: "鄭宇恩", code: "801-M2S8" },
        { id: "s-13", seatNumber: 13, name: "謝易辰", code: "801-C7G4" },
        { id: "s-14", seatNumber: 14, name: "郭宇翔", code: "801-R5T9" },
        { id: "s-15", seatNumber: 15, name: "洪梓睿", code: "801-J8K3" },
        { id: "s-16", seatNumber: 16, name: "曾柏凱", code: "801-W2H6" },
        { id: "s-17", seatNumber: 17, name: "廖辰諺", code: "801-E9N5" },
        { id: "s-18", seatNumber: 18, name: "賴俊宏", code: "801-D4B8" },
        { id: "s-19", seatNumber: 19, name: "徐詠竣", code: "801-X6P3" },
        { id: "s-20", seatNumber: 20, name: "周秉澤", code: "801-A3R7" },
        { id: "s-21", seatNumber: 21, name: "葉雨晴", code: "801-L8M4" },
        { id: "s-22", seatNumber: 22, name: "蘇若芸", code: "801-S5F9" },
        { id: "s-23", seatNumber: 23, name: "莊詠涵", code: "801-G2Z8" },
        { id: "s-24", seatNumber: 24, name: "江宜臻", code: "801-V7C3" },
        { id: "s-25", seatNumber: 25, name: "何語喬", code: "801-U4K6" },
        { id: "s-26", seatNumber: 26, name: "羅芯妤", code: "801-Q9J5" },
        { id: "s-27", seatNumber: 27, name: "高若曦", code: "801-K3W8" },
        { id: "s-28", seatNumber: 28, name: "潘亭伃", code: "801-7B2H" },
        { id: "s-29", seatNumber: 29, name: "彭詩涵", code: "801-8T6N" },
        { id: "s-30", seatNumber: 30, name: "蕭芸萱", code: "801-4D9M" },
        { id: "s-31", seatNumber: 31, name: "簡子晴", code: "801-5X7E" },
        { id: "s-32", seatNumber: 32, name: "宋欣穎", code: "801-2R8C" },
        { id: "s-33", seatNumber: 33, name: "游凱婷", code: "801-6L3P" },
        { id: "s-34", seatNumber: 34, name: "邱郁婷", code: "801-9Y4S" },
        { id: "s-35", seatNumber: 35, name: "范予婕", code: "801-3F7V" }
      ],
      // 預載範例紀錄（包含座號 2 達 15 次觸發警告、座號 5 累積 13 次接近警告）
      records: [
        // 座號 2 林子豪 (示範缺點滿 15 次觸發警告提醒)
        { id: "r-01", studentId: "s-2", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-09-02", examPeriodId: "period-1", note: "晨讀已過遲到20分鐘", timestamp: 1725235200000 },
        { id: "r-02", studentId: "s-2", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-04", examPeriodId: "period-1", note: "數學習作缺交", timestamp: 1725408000000 },
        { id: "r-03", studentId: "s-2", type: "demerit", itemId: "d-4", itemName: "上課擅自說話喧嘩", count: 1, date: "2026-09-07", examPeriodId: "period-1", note: "理化課干擾鄰座同學", timestamp: 1725667200000 },
        { id: "r-04", studentId: "s-2", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-09", examPeriodId: "period-1", note: "國文造句作業缺交", timestamp: 1725840000000 },
        { id: "r-05", studentId: "s-2", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-09-11", examPeriodId: "period-1", note: "第一節上課遲到", timestamp: 1726012800000 },
        { id: "r-06", studentId: "s-2", type: "demerit", itemId: "d-7", itemName: "打掃工作未到 / 偷懶", count: 1, date: "2026-09-14", examPeriodId: "period-1", note: "外掃區未攜帶掃具巡查缺席", timestamp: 1726272000000 },
        { id: "r-07", studentId: "s-2", type: "demerit", itemId: "d-3", itemName: "聯絡簿未簽 / 未帶", count: 1, date: "2026-09-16", examPeriodId: "period-1", note: "連兩日未交聯絡簿", timestamp: 1726444800000 },
        { id: "r-08", studentId: "s-2", type: "demerit", itemId: "d-5", itemName: "上課趴睡未聽講", count: 1, date: "2026-09-18", examPeriodId: "period-1", note: "英語課提醒兩次仍趴睡", timestamp: 1726617600000 },
        { id: "r-09", studentId: "s-2", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-21", examPeriodId: "period-1", note: "地理填圖未繳", timestamp: 1726876800000 },
        { id: "r-10", studentId: "s-2", type: "demerit", itemId: "d-8", itemName: "座位週遭髒亂遺留垃圾", count: 1, date: "2026-09-23", examPeriodId: "period-1", note: "抽屜留置飲料空罐", timestamp: 1727049600000 },
        { id: "r-11", studentId: "s-2", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-09-25", examPeriodId: "period-1", note: "遲到15分鐘", timestamp: 1727222400000 },
        { id: "r-12", studentId: "s-2", type: "demerit", itemId: "d-4", itemName: "上課擅自說話喧嘩", count: 1, date: "2026-09-28", examPeriodId: "period-1", note: "數學課大聲嬉鬧", timestamp: 1727481600000 },
        { id: "r-13", studentId: "s-2", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-30", examPeriodId: "period-1", note: "歷史講義缺交", timestamp: 1727654400000 },
        { id: "r-14", studentId: "s-2", type: "demerit", itemId: "d-6", itemName: "服裝儀容不整", count: 1, date: "2026-10-01", examPeriodId: "period-1", note: "未依規定著校服", timestamp: 1727740800000 },
        { id: "r-15", studentId: "s-2", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-10-02", examPeriodId: "period-1", note: "第15次缺點累計達成（觸發記警告門檻）", timestamp: 1727827200000 },
        // 座號 2 雖然有優點，但因不功過相抵，缺點依然是 15 次
        { id: "r-16", studentId: "s-2", type: "merit", itemId: "m-2", itemName: "打掃認真負責 / 獲表揚", count: 1, date: "2026-09-10", examPeriodId: "period-1", note: "星期四主動幫忙倒資源回收桶", timestamp: 1725926400000 },

        // 座號 5 李承恩 (累積 13 次，黃色警戒臨近警告)
        { id: "r-17", studentId: "s-5", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-03", examPeriodId: "period-1", note: "聯絡簿抽查缺繳", timestamp: 1725321600000 },
        { id: "r-18", studentId: "s-5", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-07", examPeriodId: "period-1", note: "英文習作缺繳", timestamp: 1725667200000 },
        { id: "r-19", studentId: "s-5", type: "demerit", itemId: "d-4", itemName: "上課擅自說話喧嘩", count: 1, date: "2026-09-10", examPeriodId: "period-1", note: "影響課堂", timestamp: 1725926400000 },
        { id: "r-20", studentId: "s-5", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-09-14", examPeriodId: "period-1", note: "晨跑集合遲到", timestamp: 1726272000000 },
        { id: "r-21", studentId: "s-5", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-18", examPeriodId: "period-1", note: "生物作業缺交", timestamp: 1726617600000 },
        { id: "r-22", studentId: "s-5", type: "demerit", itemId: "d-7", itemName: "打掃工作未到 / 偷懶", count: 1, date: "2026-09-22", examPeriodId: "period-1", note: "走廊打掃缺席", timestamp: 1726963200000 },
        { id: "r-23", studentId: "s-5", type: "demerit", itemId: "d-5", itemName: "上課趴睡未聽講", count: 1, date: "2026-09-24", examPeriodId: "period-1", note: "健體課趴睡", timestamp: 1727136000000 },
        { id: "r-24", studentId: "s-5", type: "demerit", itemId: "d-3", itemName: "聯絡簿未簽 / 未帶", count: 1, date: "2026-09-25", examPeriodId: "period-1", note: "未帶聯絡簿", timestamp: 1727222400000 },
        { id: "r-25", studentId: "s-5", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-29", examPeriodId: "period-1", note: "數學習作缺交", timestamp: 1727568000000 },
        { id: "r-26", studentId: "s-5", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-10-01", examPeriodId: "period-1", note: "遲到10分鐘", timestamp: 1727740800000 },
        { id: "r-27", studentId: "s-5", type: "demerit", itemId: "d-4", itemName: "上課擅自說話喧嘩", count: 1, date: "2026-10-02", examPeriodId: "period-1", note: "理化課聊天", timestamp: 1727827200000 },
        { id: "r-28", studentId: "s-5", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-10-02", examPeriodId: "period-1", note: "國文生字簿缺繳", timestamp: 1727827200000 },
        { id: "r-29", studentId: "s-5", type: "demerit", itemId: "d-8", itemName: "座位週遭髒亂遺留垃圾", count: 1, date: "2026-10-03", examPeriodId: "period-1", note: "第13次缺點（注意即將滿15次）", timestamp: 1727913600000 },

        // 其他同學正常紀錄 (含優點與零星缺點)
        { id: "r-30", studentId: "s-1", type: "merit", itemId: "m-6", itemName: "擔任幹部盡忠職守", count: 1, date: "2026-09-08", examPeriodId: "period-1", note: "班長帶領早自習秩序優良", timestamp: 1725753600000 },
        { id: "r-31", studentId: "s-1", type: "merit", itemId: "m-4", itemName: "作業整潔優良獲甲上", count: 1, date: "2026-09-18", examPeriodId: "period-1", note: "數學習作全對書寫工整", timestamp: 1726617600000 },
        { id: "r-32", studentId: "s-1", type: "merit", itemId: "m-1", itemName: "熱心助人 / 協助公務", count: 1, date: "2026-09-25", examPeriodId: "period-1", note: "主動協助同學輔導數學題目", timestamp: 1727222400000 },
        { id: "r-33", studentId: "s-3", type: "demerit", itemId: "d-1", itemName: "遲到進教室", count: 1, date: "2026-09-04", examPeriodId: "period-1", note: "遲到5分鐘", timestamp: 1725408000000 },
        { id: "r-34", studentId: "s-3", type: "merit", itemId: "m-2", itemName: "打掃認真負責 / 獲表揚", count: 1, date: "2026-09-15", examPeriodId: "period-1", note: "黑板板溝清理非常乾淨", timestamp: 1726358400000 },
        { id: "r-35", studentId: "s-4", type: "demerit", itemId: "d-3", itemName: "聯絡簿未簽 / 未帶", count: 1, date: "2026-09-11", examPeriodId: "period-1", note: "未帶聯絡簿", timestamp: 1726012800000 },
        { id: "r-36", studentId: "s-6", type: "merit", itemId: "m-5", itemName: "拾金不昧", count: 1, date: "2026-09-22", examPeriodId: "period-1", note: "在操場拾獲手錶送交學務處", timestamp: 1726963200000 },
        { id: "r-37", studentId: "s-10", type: "merit", itemId: "m-1", itemName: "熱心助人 / 協助公務", count: 1, date: "2026-09-14", examPeriodId: "period-1", note: "協助圖書館借還書箱搬運", timestamp: 1726272000000 },
        { id: "r-38", studentId: "s-15", type: "demerit", itemId: "d-2", itemName: "未交作業 / 遲交", count: 1, date: "2026-09-23", examPeriodId: "period-1", note: "英語造句缺交", timestamp: 1727049600000 },
        { id: "r-39", studentId: "s-21", type: "merit", itemId: "m-4", itemName: "作業整潔優良獲甲上", count: 1, date: "2026-09-28", examPeriodId: "period-1", note: "作文獲得班級優良範文", timestamp: 1727481600000 },
        { id: "r-40", studentId: "s-25", type: "merit", itemId: "m-3", itemName: "課堂主動發言表現優良", count: 1, date: "2026-10-01", examPeriodId: "period-1", note: "理化實驗發表流暢且主動解答", timestamp: 1727740800000 }
      ]
    },
    // 第二個示範班級（支援多班級/不同老師資料庫）
    {
      id: "class-705",
      name: "7年5班",
      school: "",
      teacherName: "張老師",
      teacherPassword: "tea705",
      warningThreshold: 10,
      maxCapacity: 35,
      createdAt: "2026-09-01",
      currentExamPeriodId: "p705-1",
      examPeriods: [
        {
          id: "p705-1",
          name: "115-1 第1次段考",
          startDate: "2026-09-01",
          endDate: "2026-10-15",
          isCurrent: true,
          note: "新生第一次段考"
        }
      ],
      routineItems: {
        demerits: [
          { id: "d7-1", name: "遲到進教室", category: "常規", defaultCount: 1, icon: "alarm" },
          { id: "d7-2", name: "缺交作業", category: "學業", defaultCount: 1, icon: "book-x" },
          { id: "d7-3", name: "打掃偷懶", category: "生活", defaultCount: 1, icon: "brush" }
        ],
        merits: [
          { id: "m7-1", name: "主動助人", category: "品德", defaultCount: 1, icon: "heart-handshake" },
          { id: "m7-2", name: "打掃認真", category: "生活", defaultCount: 1, icon: "sparkles" }
        ]
      },
      students: [
        { id: "s7-1", seatNumber: 1, name: "王小明", code: "705-H7R2" },
        { id: "s7-2", seatNumber: 2, name: "李小美", code: "705-M3P9" },
        { id: "s7-3", seatNumber: 3, name: "張大華", code: "705-W8K4" }
      ],
      records: []
    }
  ]
};
