/** zh-TW extension resources. Feature exports remain available through ../*.ts. */
export const themeExtra: Record<string, string> = {
  "custom_theme_editor_title": "自訂主題",
  "theme_custom_default_name": "主題 {{v1}}",
  "theme_custom_name_label": "主題名稱",
  "theme_editor_preview": "預覽",
  "theme_editor_preview_card_title": "高等數學",
  "theme_editor_preview_card_room": "教一 302",
  "theme_editor_random": "隨機產生",
  "theme_editor_random_desc": "隨機一套配色,不合適再點一次",
  "theme_editor_from_seed": "選主色產生整套",
  "theme_editor_from_seed_desc": "選一個主色,自動配出全套協調配色",
  "theme_editor_manual": "逐角色手選",
  "theme_editor_manual_desc": "分別指定主互動色、次級強調、第三強調與表面中性色",
  "theme_role_primary": "主互動色",
  "theme_role_primary_desc": "按鈕、選中態、當前週膠囊、連結色",
  "theme_role_secondary": "次級強調",
  "theme_role_secondary_desc": "晶片、次級容器底色",
  "theme_role_tertiary": "第三強調",
  "theme_role_tertiary_desc": "節次 chip 等點綴色",
  "theme_role_surface": "表面中性色",
  "theme_role_surface_desc": "背景與卡片的底色傾向",
  "theme_editor_delete_confirm": "刪除這個自訂主題?",
  "theme_editor_delete_confirm_body": "刪除後使用該主題的頁面與小工具將回落到預設主題「淡紫」。",
  "theme_system_desc_web": "跟隨瀏覽器系統明暗模式，使用 Web 預設色板"
}

export const holidayExtra: Record<string, string> = {
  "holiday_rule_editor_title": "假日規則"
}

export const timeslotExtra: Record<string, string> = {
  "timeslot_editor_title": "節次時間"
}

export const jwImportExtra: Record<string, string> = {
  "jw_import_view_title": "教務匯入",
  "jw_err_dismiss": "知道了",
  "jw_diag_session_expired": "{{v1}} 的會話已過期或未登入。請重新登入後停留到「個人課表」頁再點抓取",
  "jw_diag_no_container": "{{v1}} 的頁面未找到課表容器。可能原因：①抓取時機過早課表未載入；②頁面為圖片課表或跨域 iframe；③教務系統已升級，請回饋開發者",
  "jw_diag_header_no_node": "{{v1}} 的課表缺少逐節行頭。可能原因：①圖片課表（請用檔案/手動匯入）；②組頭被合併（如「第一節-第二節」），請回饋開發者",
  "jw_diag_image_cells": "{{v1}} 的課表儲存格為圖片，無法辨識。請改用 HTML/CSV 檔案匯入或手動新增課程",
  "jw_diag_empty_semester": "{{v1}} 的頁面宣告本學期暫無課程。請確認已選對學期，或下學期開學後再匯入",
  "jw_diag_wrong_protocol": "{{v1}} 的學校標註協議與實際頁面不一致。可能原因：①學校已切換教務系統；②抓取協議選擇有誤。請回饋開發者",
  "jw_diag_unknown_empty": "{{v1}} 解析結果為空，未找到明確原因。請重試或回饋開發者。",
  "jw_diag_campus_vpn_hint": "該校教務系統僅校內可存取。若在校外，請先連線校園網或 VPN 後再試",
  "jw_diag_qz_vpn_hint": "若強智教務長時間無法載入，多為會話被踢或校外網路限制，請重新登入或換網路",
  "jw_capture_intro": "瀏覽器無法替你把教務系統的登入狀態帶過來。請先在自己的瀏覽器登入教務系統，再選下面任一方式匯入。",
  "jw_capture_step1": "第一步：登入教務系統，並開啟「個人課表」頁面",
  "jw_capture_open_site": "開啟教務系統",
  "jw_capture_step2": "第二步：把課表頁面交給 Sleepy",
  "jw_capture_fetch": "直接抓取教務頁面",
  "jw_capture_fetch_note": "經 Sleepy 代理直連學校 URL；未登入時通常只會抓到登入頁。",
  "jw_capture_paste": "貼上課表網頁原始碼",
  "jw_capture_paste_hint": "在課表頁面按 Ctrl+S 儲存完整網頁，或按 F12 → Elements → 複製整段 HTML，貼到下方。",
  "jw_capture_paste_placeholder": "在此貼上課表頁面的完整 HTML 原始碼…",
  "jw_capture_parse": "解析此 HTML",
  "jw_matched_protocol": "識別協議：{{v1}}",
  "jw_retry": "重試",
  "jw_preview_title": "課表預覽",
  "jw_course_count": "{{v1}} 門課程",
  "jw_selected_courses": "已選 {{v1}} / {{v2}} 門",
  "jw_matched_count": "匹配 {{v1}}",
  "jw_select_all": "全選",
  "jw_select_none": "全不選",
  "jw_no_course_selected": "請至少選擇一門課程",
  "jw_dest_table_label": "匯入到",
  "jw_dest_new_table": "新建課表",
  "jw_empty_course_list": "課程清單為空，請確認已到達課表頁面",
  "jw_imported_table_default": "匯入的課表",
  "jw_week_unit": "週"
}

export const importSheetExtra: Record<string, string> = {
  "import_sheet_title": "匯入課表"
}

export const reminderExtra: Record<string, string> = {
  "reminder_web_notify_unsupported": "目前瀏覽器不支援系統通知，設定僅儲存在本機。",
  "reminder_web_notify_denied": "通知權限已被瀏覽器拒絕，請在網站設定中重新允許。",
  "reminder_web_only": "網頁提醒僅在頁面開啟時觸發，關閉分頁後不會推送。",
  "reminder_fluid_test_button": "流體雲測試",
  "reminder_fluid_test_started": "流體雲測試已傳送, 查看通知欄頂部卡片",
  "reminder_fluid_go_to_settings": "前往設定",
  "reminder_reliability_title": "背景可靠性",
  "reminder_reliability_notification": "通知權限：{{v1}}",
  "reminder_reliability_exact_alarm": "精確提醒：{{v1}}",
  "reminder_reliability_battery": "電池最佳化：{{v1}}",
  "reminder_reliability_widget": "桌面小工具：{{v1}}",
  "reminder_reliability_vendor": "廠商即時卡片：{{v1}}",
  "reminder_reliability_promoted": "系統即時更新授權：{{v1}}",
  "reminder_reliability_ready": "已滿足",
  "reminder_reliability_missing": "未滿足",
  "reminder_reliability_degraded": "降級執行",
  "reminder_reliability_unknown": "未知",
  "reminder_reliability_not_applicable": "系統不適用"
}

export const migrationExtra: Record<string, string> = {
  "backup_title": "全量備份 (.sleepybackup)",
  "backup_subtitle": "課表 + 設定打包, 與 Android 端互通",
  "backup_import_title": "從 .sleepybackup 還原",
  "backup_import_sub": "選擇備份檔案, 選擇覆蓋或合併",
  "backup_mode_overwrite": "覆蓋匯入 — 先清空本機資料再寫入",
  "backup_mode_merge": "合併匯入 — 保留本機資料, 追加備份內容",
  "backup_import_ok": "還原完成: 課表 {v1} / 課程 {v2}",
  "backup_import_fail": "備份檔案無法讀取: {v1}",
  "backup_cancel": "取消",
  "backup_confirm": "開始還原"
}

export const calendarExportExtra: Record<string, string> = {
  "ics_export_options_title": "ICS 匯出方式",
  "ics_recurring_label": "循環事件（整學期，標準 RRULE）",
  "ics_dated_label": "逐日事件（按範圍）",
  "ics_dated_note": "逐日事件，可匯入任意日曆應用；範圍外課程不匯出。"
}

export const widgetExtra: Record<string, string> = {
  "web_widget_unavailable": "Web 不提供 Android 桌面小工具；課表資料會在本頁面即時更新。",
  "web_high_refresh_unavailable": "瀏覽器更新率由裝置和系統控制，此設定僅保留為可遷移的偏好。"
}

export const portableImportExtra: Record<string, string> = {
  "import_sheet_title": "匯入課表",
  "add_course_title": "新增課程",
  "add_course_manual": "手動新增課程",
  "add_course_from_existing": "從現有課表選擇",
  "add_course_no_source": "沒有其他可用課表，請先新增課表。",
  "import_backup_original": "匯入前備份原課表",
  "import_append_conflicts_option": "同時新增衝突課程",
  "import_new_period_table": "使用匯入的作息",
  "import_select_courses": "選擇匯入課程",
  "deselect_all": "取消全選",
  "select_all": "全選",
  "import_selection_empty": "請至少選擇一門課程。",
  "confirm": "確定",
  "import_confirm": "確認匯入",
  "import_add_courses": "從課表或檔案匯入課程",
  "manage_export_sub": "匯出 JSON、分享文字、行事曆或 Sleepy 檔案",
  "copy_failed": "複製失敗，請檢查瀏覽器權限或手動選取文字。",
  "format_wakeup_online_hint": "WakeUP 分享口令需要連線讀取；已匯出的檔案和分享文字可離線匯入。",
  "copy_done": "已複製",
  "import_append_hint": "先選擇課程並預覽衝突，再新增至目標課表。",
  "import_target_missing": "目標課表已不存在，請返回並重新選擇課表。",
  "import_bound_period_missing": "所選作息表已不存在，請重新選擇。",
  "import_period_summary": "{{v1}}，每天 {{v2}} 節",
  "import_conflict_detail": "{{v1}} 與 {{v2}} 衝突（{{v3}}，第 {{v4}}–{{v5}} 節）",
  "import_course_group_count": "{{v1}}（{{v2}}）",
  "export_share_subtitle": "複製 Sleepy 分享文字，保留課程日期和原始匯入來源",
  "export_saved_to": "已下載：{{v1}}",
  "export_failed": "匯出失敗，請重試。",
  "ics_export_options_title": "ICS 匯出方式",
  "ics_recurring_label": "循環事件（整學期，標準 RRULE）",
  "ics_dated_label": "逐日事件（按範圍）",
  "ics_dated_note": "逐日事件可匯入行事曆應用程式；所選範圍外的課程不匯出。",
  "schedule_prev_week": "上一週",
  "schedule_next_week": "下一週"
}

// Unused locale aggregation has no side effects; keep it out of the startup graph.
export const translationExtras = /* @__PURE__ */ Object.assign({},
  themeExtra,
  holidayExtra,
  timeslotExtra,
  jwImportExtra,
  importSheetExtra,
  reminderExtra,
  migrationExtra,
  calendarExportExtra,
  widgetExtra,
  portableImportExtra,
)
