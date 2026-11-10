/** ja extension resources. Feature exports remain available through ../*.ts. */
export const themeExtra: Record<string, string> = {
  "custom_theme_editor_title": "カスタムテーマ",
  "theme_custom_default_name": "テーマ {{v1}}",
  "theme_custom_name_label": "テーマ名",
  "theme_editor_preview": "プレビュー",
  "theme_editor_preview_card_title": "Advanced Math",
  "theme_editor_preview_card_room": "Bldg 1 Rm 302",
  "theme_editor_random": "ランダム生成",
  "theme_editor_random_desc": "Generate a random palette — tap again if it is not right",
  "theme_editor_from_seed": "メインカラーから生成",
  "theme_editor_from_seed_desc": "Pick one primary color, get a full harmonized scheme",
  "theme_editor_manual": "役割ごとに指定",
  "theme_editor_manual_desc": "Set primary, secondary, tertiary and surface neutrals separately",
  "theme_role_primary": "メインカラー",
  "theme_role_primary_desc": "Buttons, selection, current-week pill, links",
  "theme_role_secondary": "セカンダリー",
  "theme_role_secondary_desc": "Chips, secondary container",
  "theme_role_tertiary": "サーシャリー",
  "theme_role_tertiary_desc": "Period chips and other accents",
  "theme_role_surface": "表面ニュートラル",
  "theme_role_surface_desc": "Tint of backgrounds and cards",
  "theme_editor_delete_confirm": "このカスタムテーマを削除しますか?",
  "theme_editor_delete_confirm_body": "このテーマを使用しているページとウィジェットはデフォルトテーマに戻ります。",
  "theme_system_desc_web": "ブラウザーの明暗設定に従い、Web のデフォルト配色を使用します"
}

export const holidayExtra: Record<string, string> = {
  "holiday_rule_editor_title": "Holiday Rules"
}

export const timeslotExtra: Record<string, string> = {
  "timeslot_editor_title": "Class Time Slots"
}

export const jwImportExtra: Record<string, string> = {
  "jw_import_view_title": "Academic Import",
  "jw_err_dismiss": "Dismiss",
  "jw_diag_session_expired": "The session for {{v1}} has expired or you are not signed in. Sign in again and stay on the \"My Timetable\" page before capturing.",
  "jw_diag_no_container": "No timetable container was found on the {{v1}} page. Possible causes: the page was captured too early, it is an image timetable or a cross-origin iframe, or the academic system was upgraded — please report it.",
  "jw_diag_header_no_node": "The {{v1}} timetable has no period row headers. Use file or manual import, or report it to the developer.",
  "jw_diag_image_cells": "The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.",
  "jw_diag_empty_semester": "The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.",
  "jw_diag_wrong_protocol": "The protocol declared for {{v1}} does not match the actual page. Please report it to the developer.",
  "jw_diag_unknown_empty": "Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.",
  "jw_diag_campus_vpn_hint": "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
  "jw_diag_qz_vpn_hint": "If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.",
  "jw_capture_intro": "A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.",
  "jw_capture_step1": "Step 1 — sign in and open the \"My Timetable\" page",
  "jw_capture_open_site": "Open academic system",
  "jw_capture_step2": "Step 2 — hand the timetable page to Sleepy",
  "jw_capture_fetch": "Fetch the page directly",
  "jw_capture_fetch_note": "Direct fetch through the Sleepy proxy; without a session this usually returns the login page.",
  "jw_capture_paste": "Paste timetable HTML",
  "jw_capture_paste_hint": "Save the timetable page (Ctrl+S) or copy its HTML from DevTools, then paste it below.",
  "jw_capture_paste_placeholder": "Paste the full HTML source of the timetable page here…",
  "jw_capture_parse": "Parse this HTML",
  "jw_matched_protocol": "Detected protocol: {{v1}}",
  "jw_retry": "Retry",
  "jw_preview_title": "Timetable preview",
  "jw_course_count": "{{v1}} courses",
  "jw_selected_courses": "{{v1}} / {{v2}} selected",
  "jw_matched_count": "{{v1}} matched",
  "jw_select_all": "Select all",
  "jw_select_none": "Clear",
  "jw_no_course_selected": "Select at least one course",
  "jw_dest_table_label": "Import into",
  "jw_dest_new_table": "New timetable",
  "jw_empty_course_list": "The course list is empty — make sure you are on the timetable page",
  "jw_imported_table_default": "Imported timetable",
  "jw_week_unit": "週"
}

export const importSheetExtra: Record<string, string> = {
  "import_sheet_title": "Import Timetable"
}

export const reminderExtra: Record<string, string> = {
  "reminder_web_notify_unsupported": "This browser has no system notification support; settings are saved locally only.",
  "reminder_web_notify_denied": "Notification permission is blocked by the browser. Re-allow it in site settings.",
  "reminder_web_only": "Web reminders only fire while the page is open; nothing is pushed after the tab closes.",
  "reminder_fluid_test_button": "Live update test",
  "reminder_fluid_test_started": "Test card posted — check the top of your notification shade",
  "reminder_fluid_go_to_settings": "Go to settings",
  "reminder_reliability_title": "Background reliability",
  "reminder_reliability_notification": "Notifications: {{v1}}",
  "reminder_reliability_exact_alarm": "Exact alarms: {{v1}}",
  "reminder_reliability_battery": "Battery optimization: {{v1}}",
  "reminder_reliability_widget": "Home-screen widgets: {{v1}}",
  "reminder_reliability_vendor": "Vendor live card: {{v1}}",
  "reminder_reliability_promoted": "Live Updates permission: {{v1}}",
  "reminder_reliability_ready": "ready",
  "reminder_reliability_missing": "not enabled",
  "reminder_reliability_degraded": "degraded",
  "reminder_reliability_unknown": "unknown",
  "reminder_reliability_not_applicable": "not applicable"
}

export const migrationExtra: Record<string, string> = {
  "backup_title": "Full backup (.sleepybackup)",
  "backup_subtitle": "Timetables + settings, interoperable with Android",
  "backup_import_title": "Restore from .sleepybackup",
  "backup_import_sub": "Pick a backup file, then choose overwrite or merge",
  "backup_mode_overwrite": "Overwrite — clear local data, then restore",
  "backup_mode_merge": "Merge — keep local data, append backup contents",
  "backup_import_ok": "Restored: {v1} timetable(s) / {v2} course(s)",
  "backup_import_fail": "Backup file unreadable: {v1}",
  "backup_cancel": "Cancel",
  "backup_confirm": "Restore"
}

export const calendarExportExtra: Record<string, string> = {
  "ics_export_options_title": "ICS export format",
  "ics_recurring_label": "Recurring events (full semester, standard RRULE)",
  "ics_dated_label": "Dated events (within range)",
  "ics_dated_note": "Dated events, importable into any calendar app; courses outside the range are skipped."
}

export const widgetExtra: Record<string, string> = {
  "web_widget_unavailable": "Web 版には Android のホーム画面ウィジェットはありません。時間割はこのページでリアルタイムに更新されます。",
  "web_high_refresh_unavailable": "ブラウザーのリフレッシュレートは端末とシステムが制御します。この設定は移行用にのみ保存されます。"
}

export const portableImportExtra: Record<string, string> = {
  "import_sheet_title": "時間割をインポート",
  "add_course_title": "授業を追加",
  "add_course_manual": "授業を手動で追加",
  "add_course_from_existing": "既存の時間割から選択",
  "add_course_no_source": "他の時間割がありません。先に時間割を追加してください。",
  "import_backup_original": "インポート前に元の時間割をバックアップ",
  "import_append_conflicts_option": "重複する授業も追加",
  "import_new_period_table": "インポートした時限設定を使用",
  "import_select_courses": "インポートする授業を選択",
  "deselect_all": "すべて解除",
  "select_all": "すべて選択",
  "import_selection_empty": "授業を一つ以上選択してください。",
  "confirm": "確定",
  "import_confirm": "インポートを確定",
  "import_add_courses": "時間割やファイルから授業をインポート",
  "manage_export_sub": "JSON、共有テキスト、カレンダー、Sleepy ファイルを出力",
  "copy_failed": "コピーできませんでした。ブラウザーの権限を確認するか、テキストを手動で選択してください。",
  "format_wakeup_online_hint": "WakeUP の共有コードの読み込みにはインターネット接続が必要です。出力済みのファイルと共有テキストはオフラインでインポートできます。",
  "copy_done": "コピーしました",
  "import_append_hint": "授業を選び、重複を確認してから対象の時間割に追加します。",
  "import_target_missing": "対象の時間割が見つかりません。戻って時間割を選び直してください。",
  "import_bound_period_missing": "選択した時限設定が見つかりません。選び直してください。",
  "import_period_summary": "{{v1}}、1 日 {{v2}} 時限",
  "import_conflict_detail": "{{v1}} と {{v2}} が重複（{{v3}}、{{v4}}～{{v5}} 限）",
  "import_course_group_count": "{{v1}}（{{v2}}）",
  "export_share_subtitle": "授業の日付と元のインポート情報を保持する Sleepy 共有テキストをコピー",
  "export_saved_to": "ダウンロードしました：{{v1}}",
  "export_failed": "エクスポートできませんでした。もう一度お試しください。",
  "ics_export_options_title": "ICS の出力形式",
  "ics_recurring_label": "繰り返し予定（学期全体、標準 RRULE）",
  "ics_dated_label": "日付ごとの予定（指定範囲）",
  "ics_dated_note": "日付ごとの予定はカレンダーアプリに読み込めます。指定範囲外の授業は出力されません。",
  "schedule_prev_week": "前の週",
  "schedule_next_week": "次の週"
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
