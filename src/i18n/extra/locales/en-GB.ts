/** en-GB extension resources. Feature exports remain available through ../*.ts. */
export const themeExtra: Record<string, string> = {
  "custom_theme_editor_title": "Custom Theme",
  "theme_custom_default_name": "Theme {{v1}}",
  "theme_custom_name_label": "Theme name",
  "theme_editor_preview": "Preview",
  "theme_editor_preview_card_title": "Calculus",
  "theme_editor_preview_card_room": "Bldg 1 Rm 302",
  "theme_editor_random": "Random",
  "theme_editor_random_desc": "Generate a random palette — tap again if it is not right",
  "theme_editor_from_seed": "Generate from a primary colour",
  "theme_editor_from_seed_desc": "Pick one primary colour, get a full harmonised scheme",
  "theme_editor_manual": "Pick each role",
  "theme_editor_manual_desc": "Set primary, secondary, tertiary and surface neutrals separately",
  "theme_role_primary": "Primary",
  "theme_role_primary_desc": "Buttons, selection, current-week pill, links",
  "theme_role_secondary": "Secondary",
  "theme_role_secondary_desc": "Chips, secondary container",
  "theme_role_tertiary": "Tertiary",
  "theme_role_tertiary_desc": "Period chips and other accents",
  "theme_role_surface": "Surface neutral",
  "theme_role_surface_desc": "Tint of backgrounds and cards",
  "theme_editor_delete_confirm": "Delete this custom theme?",
  "theme_editor_delete_confirm_body": "Pages and widgets using it will fall back to the default theme.",
  "theme_system_desc_web": "Follows the browser light/dark setting with the Web default palette"
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
  "jw_diag_no_container": "No timetable container was found on the {{v1}} page. Possible causes: ① captured too early, the timetable had not loaded; ② the page is an image timetable or a cross-origin iframe; ③ the academic system was upgraded — please report it.",
  "jw_diag_header_no_node": "The {{v1}} timetable has no period row headers. Possible causes: ① image timetable (use file or manual import); ② merged headers (e.g. \"Period 1-2\") — please report it.",
  "jw_diag_image_cells": "The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.",
  "jw_diag_empty_semester": "The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.",
  "jw_diag_wrong_protocol": "The protocol declared for {{v1}} does not match the actual page. Possible causes: ① the school switched systems; ② wrong protocol selected. Please report it.",
  "jw_diag_unknown_empty": "Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.",
  "jw_diag_campus_vpn_hint": "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
  "jw_diag_qz_vpn_hint": "If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.",
  "jw_capture_intro": "A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.",
  "jw_capture_step1": "Step 1 — sign in to the academic system and open the \"My Timetable\" page",
  "jw_capture_open_site": "Open academic system",
  "jw_capture_step2": "Step 2 — hand the timetable page to Sleepy",
  "jw_capture_fetch": "Fetch the page directly",
  "jw_capture_fetch_note": "Direct fetch of the school URL through the Sleepy proxy; without a session this usually returns the login page.",
  "jw_capture_paste": "Paste timetable HTML",
  "jw_capture_paste_hint": "Press Ctrl+S on the timetable page to save the full page, or F12 → Elements → copy the whole HTML, then paste it below.",
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
  "jw_week_unit": "w"
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
  "backup_mode_overwrite": "Overwrite — clear local storage, then restore",
  "backup_mode_merge": "Merge — keep local storage, append backup contents",
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
  "web_widget_unavailable": "The web app has no Android home-screen widgets; your timetable updates live on this page.",
  "web_high_refresh_unavailable": "Browser refresh rate is controlled by the device and operating system; this preference is kept for migration only."
}

export const portableImportExtra: Record<string, string> = {
  "import_sheet_title": "Import Timetable",
  "add_course_title": "Add Courses",
  "add_course_manual": "Add Course Manually",
  "add_course_from_existing": "Choose from Existing Timetables",
  "add_course_no_source": "No other timetables are available. Add a timetable first.",
  "import_backup_original": "Back Up the Original Timetable Before Importing",
  "import_append_conflicts_option": "Also Append Conflicting Courses",
  "import_new_period_table": "Use Imported Period Times",
  "import_select_courses": "Select Courses to Import",
  "deselect_all": "Deselect All",
  "select_all": "Select All",
  "import_selection_empty": "Select at least one course.",
  "confirm": "Confirm",
  "import_confirm": "Confirm Import",
  "import_add_courses": "Import Courses from a Timetable or File",
  "manage_export_sub": "Export JSON, share text, a calendar or a Sleepy file",
  "copy_failed": "Copy failed. Check browser permissions or select the text manually.",
  "format_wakeup_online_hint": "WakeUP share codes require an internet connection. Exported files and share text can be imported offline.",
  "copy_done": "Copied",
  "import_append_hint": "Select courses, review conflicts, then append to the target timetable.",
  "import_target_missing": "The target timetable is unavailable. Return and select a timetable.",
  "import_bound_period_missing": "The selected period timetable is unavailable. Select it again.",
  "import_period_summary": "{{v1}}, {{v2}} periods per day",
  "import_conflict_detail": "{{v1}} conflicts with {{v2}} ({{v3}}, periods {{v4}}–{{v5}})",
  "import_course_group_count": "{{v1}} ({{v2}})",
  "export_share_subtitle": "Copy Sleepy share text that preserves course dates and import source data",
  "export_saved_to": "Downloaded: {{v1}}",
  "export_failed": "Export failed. Please try again.",
  "ics_export_options_title": "ICS Export Format",
  "ics_recurring_label": "Recurring Events (Full Semester, Standard RRULE)",
  "ics_dated_label": "Dated Events (Within Range)",
  "ics_dated_note": "Import dated events into any calendar app. Courses outside the selected range are skipped.",
  "schedule_prev_week": "Previous Week",
  "schedule_next_week": "Next Week"
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
