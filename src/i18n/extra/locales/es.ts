/** es extension resources. Feature exports remain available through ../*.ts. */
export const themeExtra: Record<string, string> = {
  "custom_theme_editor_title": "Tema personalizado",
  "theme_custom_default_name": "Tema {{v1}}",
  "theme_custom_name_label": "Nombre del tema",
  "theme_editor_preview": "Vista previa",
  "theme_editor_preview_card_title": "Cálculo",
  "theme_editor_preview_card_room": "Edif. 1 Aula 302",
  "theme_editor_random": "Aleatorio",
  "theme_editor_random_desc": "Genera una paleta aleatoria; toca de nuevo si no te convence",
  "theme_editor_from_seed": "Generar desde un color primario",
  "theme_editor_from_seed_desc": "Elige un color primario y obtén un esquema armonizado completo",
  "theme_editor_manual": "Elegir cada rol",
  "theme_editor_manual_desc": "Define primario, secundario, terciario y neutros de superficie por separado",
  "theme_role_primary": "Primario",
  "theme_role_primary_desc": "Botones, selección, píldora de semana actual, enlaces",
  "theme_role_secondary": "Secundario",
  "theme_role_secondary_desc": "Chips, contenedor secundario",
  "theme_role_tertiary": "Terciario",
  "theme_role_tertiary_desc": "Chips de periodo y otros acentos",
  "theme_role_surface": "Neutro de superficie",
  "theme_role_surface_desc": "Tinte de fondos y tarjetas",
  "theme_editor_delete_confirm": "¿Eliminar este tema personalizado?",
  "theme_editor_delete_confirm_body": "Las páginas y widgets que lo usen volverán al tema predeterminado.",
  "theme_system_desc_web": "Sigue la configuración clara u oscura del navegador con la paleta predeterminada de la Web"
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
  "jw_week_unit": "sem"
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
  "backup_title": "Copia completa (.sleepybackup)",
  "backup_subtitle": "Horarios + ajustes, compatible con Android",
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
  "web_widget_unavailable": "La versión web no tiene widgets de pantalla de inicio de Android; tu horario se actualiza en esta página en tiempo real.",
  "web_high_refresh_unavailable": "La frecuencia de actualización del navegador depende del dispositivo y del sistema; esta preferencia solo se conserva para la migración."
}

export const portableImportExtra: Record<string, string> = {
  "import_sheet_title": "Importar horario",
  "add_course_title": "Añadir cursos",
  "add_course_manual": "Añadir curso manualmente",
  "add_course_from_existing": "Elegir de otros horarios",
  "add_course_no_source": "No hay otros horarios disponibles. Añade un horario primero.",
  "import_backup_original": "Crear una copia del horario original antes de importar",
  "import_append_conflicts_option": "Añadir también los cursos con conflictos",
  "import_new_period_table": "Usar las horas de clase importadas",
  "import_select_courses": "Seleccionar cursos para importar",
  "deselect_all": "Deseleccionar todo",
  "select_all": "Seleccionar todo",
  "import_selection_empty": "Selecciona al menos un curso.",
  "confirm": "Confirmar",
  "import_confirm": "Confirmar importación",
  "import_add_courses": "Importar cursos desde un horario o archivo",
  "manage_export_sub": "Exportar JSON, texto para compartir, calendario o archivo Sleepy",
  "copy_failed": "No se pudo copiar. Revisa los permisos del navegador o selecciona el texto manualmente.",
  "format_wakeup_online_hint": "Los códigos de WakeUP requieren conexión a Internet. Los archivos exportados y el texto compartido se pueden importar sin conexión.",
  "copy_done": "Copiado",
  "import_append_hint": "Selecciona cursos, revisa los conflictos y añádelos al horario de destino.",
  "import_target_missing": "El horario de destino no está disponible. Vuelve y selecciona un horario.",
  "import_bound_period_missing": "El horario de horas de clase seleccionado no está disponible. Selecciónalo de nuevo.",
  "import_period_summary": "{{v1}}, {{v2}} períodos al día",
  "import_conflict_detail": "{{v1}} coincide con {{v2}} ({{v3}}, períodos {{v4}}–{{v5}})",
  "import_course_group_count": "{{v1}} ({{v2}})",
  "export_share_subtitle": "Copiar texto de Sleepy que conserva las fechas de los cursos y el origen de importación",
  "export_saved_to": "Descargado: {{v1}}",
  "export_failed": "No se pudo exportar. Inténtalo de nuevo.",
  "ics_export_options_title": "Formato de exportación ICS",
  "ics_recurring_label": "Eventos recurrentes (semestre completo, RRULE estándar)",
  "ics_dated_label": "Eventos por fecha (dentro del intervalo)",
  "ics_dated_note": "Importa los eventos por fecha en cualquier calendario. Se omiten los cursos fuera del intervalo seleccionado.",
  "schedule_prev_week": "Semana anterior",
  "schedule_next_week": "Semana siguiente"
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
