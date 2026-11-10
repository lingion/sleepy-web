/** zh-CN extension resources. Feature exports remain available through ../*.ts. */
export const themeExtra: Record<string, string> = {
  "custom_theme_editor_title": "自定义主题",
  "theme_custom_default_name": "主题 {{v1}}",
  "theme_custom_name_label": "主题名称",
  "theme_editor_preview": "预览",
  "theme_editor_preview_card_title": "高等数学",
  "theme_editor_preview_card_room": "教一 302",
  "theme_editor_random": "随机生成",
  "theme_editor_random_desc": "随机一套配色,不合适再点一次",
  "theme_editor_from_seed": "选主色生成整套",
  "theme_editor_from_seed_desc": "选一个主色,自动配出全套协调配色",
  "theme_editor_manual": "逐角色手选",
  "theme_editor_manual_desc": "分别指定主交互色、次级强调、第三强调与表面中性色",
  "theme_role_primary": "主交互色",
  "theme_role_primary_desc": "按钮、选中态、当前周胶囊、链接色",
  "theme_role_secondary": "次级强调",
  "theme_role_secondary_desc": "芯片、次级容器底色",
  "theme_role_tertiary": "第三强调",
  "theme_role_tertiary_desc": "节次 chip 等点缀色",
  "theme_role_surface": "表面中性色",
  "theme_role_surface_desc": "背景与卡片的底色倾向",
  "theme_editor_delete_confirm": "删除这个自定义主题?",
  "theme_editor_delete_confirm_body": "删除后使用该主题的页面与小组件将回落到默认主题「淡紫」。",
  "theme_system_desc_web": "跟随浏览器系统明暗模式，使用 Web 默认色板"
}

export const holidayExtra: Record<string, string> = {
  "holiday_rule_editor_title": "节假日规则"
}

export const timeslotExtra: Record<string, string> = {
  "timeslot_editor_title": "节次时间"
}

export const jwImportExtra: Record<string, string> = {
  "jw_import_view_title": "教务导入",
  "jw_err_dismiss": "知道了",
  "jw_diag_session_expired": "{{v1}} 的会话已过期或未登录。请重新登录后停留到「个人课表」页再点抓取",
  "jw_diag_no_container": "{{v1}} 的页面未找到课表容器。可能原因：①抓取时机过早课表未加载；②页面为图片课表或跨域 iframe；③教务系统已升级，请反馈开发者",
  "jw_diag_header_no_node": "{{v1}} 的课表缺少逐节行头。可能原因：①图片课表（请用文件/手动导入）；②组头被合并（如“第一节-第二节”），请反馈开发者",
  "jw_diag_image_cells": "{{v1}} 的课表单元格为图片，无法识别。请改用 HTML/CSV 文件导入或手动添加课程",
  "jw_diag_empty_semester": "{{v1}} 的页面声明本学期暂无课程。请确认已选对学期，或下学期开学后再导入",
  "jw_diag_wrong_protocol": "{{v1}} 的学校标注协议与实际页面不一致。可能原因：①学校已切换教务系统；②抓取协议选择有误。请反馈开发者",
  "jw_diag_unknown_empty": "{{v1}} 解析结果为空，未找到明确原因。请重试或反馈开发者。",
  "jw_diag_campus_vpn_hint": "该校教务系统仅校内可访问。若在校外，请先连接校园网或 VPN 后再试",
  "jw_diag_qz_vpn_hint": "若强智教务长时间无法加载，多为会话被踢或校外网络限制，请重新登录或换网络",
  "jw_capture_intro": "浏览器无法替你把教务系统的登录状态带过来。请先在自己的浏览器里登录教务系统，再选下面任一方式导入。",
  "jw_capture_step1": "第一步：登录教务系统，并打开「个人课表」页面",
  "jw_capture_open_site": "打开教务系统",
  "jw_capture_step2": "第二步：把课表页面交给 Sleepy",
  "jw_capture_fetch": "直接抓取教务页面",
  "jw_capture_fetch_note": "经 Sleepy 代理直连学校 URL；未登录时通常只会抓到登录页。",
  "jw_capture_paste": "粘贴课表网页源码",
  "jw_capture_paste_hint": "在课表页面按 Ctrl+S 保存完整网页，或按 F12 → Elements → 复制整段 HTML，粘贴到下方。",
  "jw_capture_paste_placeholder": "在此粘贴课表页面的完整 HTML 源码…",
  "jw_capture_parse": "解析此 HTML",
  "jw_matched_protocol": "识别协议：{{v1}}",
  "jw_retry": "重试",
  "jw_preview_title": "课表预览",
  "jw_course_count": "{{v1}} 门课程",
  "jw_selected_courses": "已选 {{v1}} / {{v2}} 门",
  "jw_matched_count": "匹配 {{v1}}",
  "jw_select_all": "全选",
  "jw_select_none": "全不选",
  "jw_no_course_selected": "请至少选择一门课程",
  "jw_dest_table_label": "导入到",
  "jw_dest_new_table": "新建课表",
  "jw_empty_course_list": "课程列表为空，请确认已到达课表页面",
  "jw_imported_table_default": "导入的课表",
  "jw_week_unit": "周"
}

export const importSheetExtra: Record<string, string> = {
  "import_sheet_title": "导入课表"
}

export const reminderExtra: Record<string, string> = {
  "reminder_web_notify_unsupported": "当前浏览器不支持系统通知，配置仅保存在本地。",
  "reminder_web_notify_denied": "通知权限已被浏览器拒绝，请在站点设置中重新允许。",
  "reminder_web_only": "网页提醒仅在页面打开时触发，关闭标签页后不会推送。",
  "reminder_fluid_test_button": "流体云测试",
  "reminder_fluid_test_started": "流体云测试已发送, 查看通知栏顶部卡片",
  "reminder_fluid_go_to_settings": "去设置",
  "reminder_reliability_title": "后台可靠性",
  "reminder_reliability_notification": "通知权限：{{v1}}",
  "reminder_reliability_exact_alarm": "精确提醒：{{v1}}",
  "reminder_reliability_battery": "电池优化：{{v1}}",
  "reminder_reliability_widget": "桌面小组件：{{v1}}",
  "reminder_reliability_vendor": "厂商实时卡片：{{v1}}",
  "reminder_reliability_promoted": "系统实时更新授权：{{v1}}",
  "reminder_reliability_ready": "已满足",
  "reminder_reliability_missing": "未满足",
  "reminder_reliability_degraded": "降级运行",
  "reminder_reliability_unknown": "未知",
  "reminder_reliability_not_applicable": "系统不适用"
}

export const migrationExtra: Record<string, string> = {
  "backup_title": "全量备份 (.sleepybackup)",
  "backup_subtitle": "课表 + 设置打包, 与 Android 端互通",
  "backup_import_title": "从 .sleepybackup 恢复",
  "backup_import_sub": "选择备份文件, 选择覆盖或合并",
  "backup_mode_overwrite": "覆盖导入 — 先清空本机数据再写入",
  "backup_mode_merge": "合并导入 — 保留本机数据, 追加备份内容",
  "backup_import_ok": "恢复完成: 课表 {v1} / 课程 {v2}",
  "backup_import_fail": "备份文件无法读取: {v1}",
  "backup_cancel": "取消",
  "backup_confirm": "开始恢复"
}

export const calendarExportExtra: Record<string, string> = {
  "ics_export_options_title": "ICS 导出方式",
  "ics_recurring_label": "循环事件（整学期，标准 RRULE）",
  "ics_dated_label": "逐日事件（按范围）",
  "ics_dated_note": "逐日事件，可导入任意日历应用；范围外课程不导出。"
}

export const widgetExtra: Record<string, string> = {
  "web_widget_unavailable": "Web 不提供 Android 桌面小组件；课表数据会在本页面实时更新。",
  "web_high_refresh_unavailable": "浏览器刷新率由设备和系统控制，此设置仅保留为可迁移的偏好。"
}

export const portableImportExtra: Record<string, string> = {
  "import_sheet_title": "导入课表",
  "add_course_title": "添加课程",
  "add_course_manual": "手动添加课程",
  "add_course_from_existing": "从已有课表选择",
  "add_course_no_source": "没有其他可用课表，请先添加课表。",
  "import_backup_original": "导入前备份原课表",
  "import_append_conflicts_option": "同时追加冲突课程",
  "import_new_period_table": "使用导入作息",
  "import_select_courses": "选择导入课程",
  "deselect_all": "取消全选",
  "select_all": "全选",
  "import_selection_empty": "请至少选择一门课程。",
  "confirm": "确定",
  "import_confirm": "确认导入",
  "import_add_courses": "从课表或文件导入课程",
  "manage_export_sub": "导出 JSON、分享文本、日历或 Sleepy 文件",
  "copy_failed": "复制失败，请检查浏览器权限或手动选择文本。",
  "format_wakeup_online_hint": "WakeUP 分享口令需要联网读取；已导出的文件和分享文本可离线导入。",
  "copy_done": "已复制",
  "import_append_hint": "先选择课程并预览冲突，再追加到目标课表。",
  "import_target_missing": "目标课表已不存在，请返回并重新选择课表。",
  "import_bound_period_missing": "所选作息表已不存在，请重新选择。",
  "import_period_summary": "{{v1}}，每天 {{v2}} 节",
  "import_conflict_detail": "{{v1}} 与 {{v2}} 冲突（{{v3}}，第 {{v4}}–{{v5}} 节）",
  "import_course_group_count": "{{v1}}（{{v2}}）",
  "export_share_subtitle": "复制 Sleepy 分享文本，保留课程日期和原始导入来源",
  "export_saved_to": "已下载：{{v1}}",
  "export_failed": "导出失败，请重试。",
  "ics_export_options_title": "ICS 导出方式",
  "ics_recurring_label": "循环事件（整学期，标准 RRULE）",
  "ics_dated_label": "逐日事件（按范围）",
  "ics_dated_note": "逐日事件可导入日历应用；所选范围外的课程不导出。",
  "schedule_prev_week": "上一周",
  "schedule_next_week": "下一周"
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
