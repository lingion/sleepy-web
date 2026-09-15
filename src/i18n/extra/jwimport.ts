/**
 * i18n 扩展键 — 教务导入分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 注: 主 JSON 已有 jw_import_title (教务导入 - %1$s), 故此处用独立 key 不冲突。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 *
 * 本文件补齐两类键:
 *   1) Android values/strings.xml 里只有中文默认值、主 JSON 缺失的 jw_diag_* 诊断族
 *      (DiagMapper 消费); 占位符按 index.ts 约定直接写 {{v1}} / {{v2}}。
 *   2) web 端独有键 —— 浏览器无法像 Android WebView 那样在页内登录并携带会话 Cookie,
 *      教务抓取多出一条「粘贴课表网页源码」通道, 需要对应文案。
 */

import type { Lang } from '../index'

export const jwImportExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    jw_import_view_title: '教务导入',

    jw_err_dismiss: '知道了',
    jw_diag_session_expired:
      '{{v1}} 的会话已过期或未登录。请重新登录后停留到「个人课表」页再点抓取',
    jw_diag_no_container:
      '{{v1}} 的页面未找到课表容器。可能原因：①抓取时机过早课表未加载；②页面为图片课表或跨域 iframe；③教务系统已升级，请反馈开发者',
    jw_diag_header_no_node:
      '{{v1}} 的课表缺少逐节行头。可能原因：①图片课表（请用文件/手动导入）；②组头被合并（如“第一节-第二节”），请反馈开发者',
    jw_diag_image_cells: '{{v1}} 的课表单元格为图片，无法识别。请改用 HTML/CSV 文件导入或手动添加课程',
    jw_diag_empty_semester: '{{v1}} 的页面声明本学期暂无课程。请确认已选对学期，或下学期开学后再导入',
    jw_diag_wrong_protocol:
      '{{v1}} 的学校标注协议与实际页面不一致。可能原因：①学校已切换教务系统；②抓取协议选择有误。请反馈开发者',
    // 诊断特征由 DiagMapper 以「（特征/特征）」形式追加, 故此处不再重复 %2$s
    jw_diag_unknown_empty: '{{v1}} 解析结果为空，未找到明确原因。请重试或反馈开发者。',
    jw_diag_campus_vpn_hint: '该校教务系统仅校内可访问。若在校外，请先连接校园网或 VPN 后再试',
    jw_diag_qz_vpn_hint: '若强智教务长时间无法加载，多为会话被踢或校外网络限制，请重新登录或换网络',

    jw_capture_intro:
      '浏览器无法替你把教务系统的登录状态带过来。请先在自己的浏览器里登录教务系统，再选下面任一方式导入。',
    jw_capture_step1: '第一步：登录教务系统，并打开「个人课表」页面',
    jw_capture_open_site: '打开教务系统',
    jw_capture_step2: '第二步：把课表页面交给 Sleepy',
    jw_capture_fetch: '直接抓取教务页面',
    jw_capture_fetch_note: '经 Sleepy 代理直连学校 URL；未登录时通常只会抓到登录页。',
    jw_capture_paste: '粘贴课表网页源码',
    jw_capture_paste_hint:
      '在课表页面按 Ctrl+S 保存完整网页，或按 F12 → Elements → 复制整段 HTML，粘贴到下方。',
    jw_capture_paste_placeholder: '在此粘贴课表页面的完整 HTML 源码…',
    jw_capture_parse: '解析此 HTML',
    jw_matched_protocol: '识别协议：{{v1}}',
    jw_retry: '重试',

    jw_preview_title: '课表预览',
    jw_course_count: '{{v1}} 门课程',
    jw_selected_courses: '已选 {{v1}} / {{v2}} 门',
    jw_matched_count: '匹配 {{v1}}',
    jw_select_all: '全选',
    jw_select_none: '全不选',
    jw_no_course_selected: '请至少选择一门课程',
    jw_dest_table_label: '导入到',
    jw_dest_new_table: '新建课表',
    jw_empty_course_list: '课程列表为空，请确认已到达课表页面',
    jw_imported_table_default: '导入的课表',
    jw_week_unit: '周',
  },
  'zh-TW': {
    jw_import_view_title: '教務匯入',

    jw_err_dismiss: '知道了',
    jw_diag_session_expired: '{{v1}} 的會話已過期或未登入。請重新登入後停留到「個人課表」頁再點抓取',
    jw_diag_no_container:
      '{{v1}} 的頁面未找到課表容器。可能原因：①抓取時機過早課表未載入；②頁面為圖片課表或跨域 iframe；③教務系統已升級，請回饋開發者',
    jw_diag_header_no_node:
      '{{v1}} 的課表缺少逐節行頭。可能原因：①圖片課表（請用檔案/手動匯入）；②組頭被合併（如「第一節-第二節」），請回饋開發者',
    jw_diag_image_cells: '{{v1}} 的課表儲存格為圖片，無法辨識。請改用 HTML/CSV 檔案匯入或手動新增課程',
    jw_diag_empty_semester: '{{v1}} 的頁面宣告本學期暫無課程。請確認已選對學期，或下學期開學後再匯入',
    jw_diag_wrong_protocol:
      '{{v1}} 的學校標註協議與實際頁面不一致。可能原因：①學校已切換教務系統；②抓取協議選擇有誤。請回饋開發者',
    jw_diag_unknown_empty: '{{v1}} 解析結果為空，未找到明確原因。請重試或回饋開發者。',
    jw_diag_campus_vpn_hint: '該校教務系統僅校內可存取。若在校外，請先連線校園網或 VPN 後再試',
    jw_diag_qz_vpn_hint: '若強智教務長時間無法載入，多為會話被踢或校外網路限制，請重新登入或換網路',

    jw_capture_intro:
      '瀏覽器無法替你把教務系統的登入狀態帶過來。請先在自己的瀏覽器登入教務系統，再選下面任一方式匯入。',
    jw_capture_step1: '第一步：登入教務系統，並開啟「個人課表」頁面',
    jw_capture_open_site: '開啟教務系統',
    jw_capture_step2: '第二步：把課表頁面交給 Sleepy',
    jw_capture_fetch: '直接抓取教務頁面',
    jw_capture_fetch_note: '經 Sleepy 代理直連學校 URL；未登入時通常只會抓到登入頁。',
    jw_capture_paste: '貼上課表網頁原始碼',
    jw_capture_paste_hint:
      '在課表頁面按 Ctrl+S 儲存完整網頁，或按 F12 → Elements → 複製整段 HTML，貼到下方。',
    jw_capture_paste_placeholder: '在此貼上課表頁面的完整 HTML 原始碼…',
    jw_capture_parse: '解析此 HTML',
    jw_matched_protocol: '識別協議：{{v1}}',
    jw_retry: '重試',

    jw_preview_title: '課表預覽',
    jw_course_count: '{{v1}} 門課程',
    jw_selected_courses: '已選 {{v1}} / {{v2}} 門',
    jw_matched_count: '匹配 {{v1}}',
    jw_select_all: '全選',
    jw_select_none: '全不選',
    jw_no_course_selected: '請至少選擇一門課程',
    jw_dest_table_label: '匯入到',
    jw_dest_new_table: '新建課表',
    jw_empty_course_list: '課程清單為空，請確認已到達課表頁面',
    jw_imported_table_default: '匯入的課表',
    jw_week_unit: '週',
  },
  en: {
    jw_import_view_title: 'Academic Import',

    jw_err_dismiss: 'Dismiss',
    jw_diag_session_expired:
      'The session for {{v1}} has expired or you are not signed in. Sign in again and stay on the "My Timetable" page before capturing.',
    jw_diag_no_container:
      'No timetable container was found on the {{v1}} page. Possible causes: ① captured too early, the timetable had not loaded; ② the page is an image timetable or a cross-origin iframe; ③ the academic system was upgraded — please report it.',
    jw_diag_header_no_node:
      'The {{v1}} timetable has no period row headers. Possible causes: ① image timetable (use file or manual import); ② merged headers (e.g. "Period 1-2") — please report it.',
    jw_diag_image_cells:
      'The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.',
    jw_diag_empty_semester:
      'The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.',
    jw_diag_wrong_protocol:
      'The protocol declared for {{v1}} does not match the actual page. Possible causes: ① the school switched systems; ② wrong protocol selected. Please report it.',
    jw_diag_unknown_empty: 'Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.',
    jw_diag_campus_vpn_hint:
      "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
    jw_diag_qz_vpn_hint:
      'If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.',

    jw_capture_intro:
      'A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.',
    jw_capture_step1: 'Step 1 — sign in to the academic system and open the "My Timetable" page',
    jw_capture_open_site: 'Open academic system',
    jw_capture_step2: 'Step 2 — hand the timetable page to Sleepy',
    jw_capture_fetch: 'Fetch the page directly',
    jw_capture_fetch_note: 'Direct fetch of the school URL through the Sleepy proxy; without a session this usually returns the login page.',
    jw_capture_paste: 'Paste timetable HTML',
    jw_capture_paste_hint:
      'Press Ctrl+S on the timetable page to save the full page, or F12 → Elements → copy the whole HTML, then paste it below.',
    jw_capture_paste_placeholder: 'Paste the full HTML source of the timetable page here…',
    jw_capture_parse: 'Parse this HTML',
    jw_matched_protocol: 'Detected protocol: {{v1}}',
    jw_retry: 'Retry',

    jw_preview_title: 'Timetable preview',
    jw_course_count: '{{v1}} courses',
    jw_selected_courses: '{{v1}} / {{v2}} selected',
    jw_matched_count: '{{v1}} matched',
    jw_select_all: 'Select all',
    jw_select_none: 'Clear',
    jw_no_course_selected: 'Select at least one course',
    jw_dest_table_label: 'Import into',
    jw_dest_new_table: 'New timetable',
    jw_empty_course_list: 'The course list is empty — make sure you are on the timetable page',
    jw_imported_table_default: 'Imported timetable',
    jw_week_unit: 'w',
  },
  'en-GB': {
    jw_import_view_title: 'Academic Import',

    jw_err_dismiss: 'Dismiss',
    jw_diag_session_expired:
      'The session for {{v1}} has expired or you are not signed in. Sign in again and stay on the "My Timetable" page before capturing.',
    jw_diag_no_container:
      'No timetable container was found on the {{v1}} page. Possible causes: ① captured too early, the timetable had not loaded; ② the page is an image timetable or a cross-origin iframe; ③ the academic system was upgraded — please report it.',
    jw_diag_header_no_node:
      'The {{v1}} timetable has no period row headers. Possible causes: ① image timetable (use file or manual import); ② merged headers (e.g. "Period 1-2") — please report it.',
    jw_diag_image_cells:
      'The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.',
    jw_diag_empty_semester:
      'The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.',
    jw_diag_wrong_protocol:
      'The protocol declared for {{v1}} does not match the actual page. Possible causes: ① the school switched systems; ② wrong protocol selected. Please report it.',
    jw_diag_unknown_empty: 'Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.',
    jw_diag_campus_vpn_hint:
      "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
    jw_diag_qz_vpn_hint:
      'If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.',

    jw_capture_intro:
      'A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.',
    jw_capture_step1: 'Step 1 — sign in to the academic system and open the "My Timetable" page',
    jw_capture_open_site: 'Open academic system',
    jw_capture_step2: 'Step 2 — hand the timetable page to Sleepy',
    jw_capture_fetch: 'Fetch the page directly',
    jw_capture_fetch_note: 'Direct fetch of the school URL through the Sleepy proxy; without a session this usually returns the login page.',
    jw_capture_paste: 'Paste timetable HTML',
    jw_capture_paste_hint:
      'Press Ctrl+S on the timetable page to save the full page, or F12 → Elements → copy the whole HTML, then paste it below.',
    jw_capture_paste_placeholder: 'Paste the full HTML source of the timetable page here…',
    jw_capture_parse: 'Parse this HTML',
    jw_matched_protocol: 'Detected protocol: {{v1}}',
    jw_retry: 'Retry',

    jw_preview_title: 'Timetable preview',
    jw_course_count: '{{v1}} courses',
    jw_selected_courses: '{{v1}} / {{v2}} selected',
    jw_matched_count: '{{v1}} matched',
    jw_select_all: 'Select all',
    jw_select_none: 'Clear',
    jw_no_course_selected: 'Select at least one course',
    jw_dest_table_label: 'Import into',
    jw_dest_new_table: 'New timetable',
    jw_empty_course_list: 'The course list is empty — make sure you are on the timetable page',
    jw_imported_table_default: 'Imported timetable',
    jw_week_unit: 'w',
  },
  ja: {
    jw_import_view_title: 'Academic Import',

    jw_err_dismiss: 'Dismiss',
    jw_diag_session_expired:
      'The session for {{v1}} has expired or you are not signed in. Sign in again and stay on the "My Timetable" page before capturing.',
    jw_diag_no_container:
      'No timetable container was found on the {{v1}} page. Possible causes: the page was captured too early, it is an image timetable or a cross-origin iframe, or the academic system was upgraded — please report it.',
    jw_diag_header_no_node:
      'The {{v1}} timetable has no period row headers. Use file or manual import, or report it to the developer.',
    jw_diag_image_cells:
      'The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.',
    jw_diag_empty_semester:
      'The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.',
    jw_diag_wrong_protocol:
      'The protocol declared for {{v1}} does not match the actual page. Please report it to the developer.',
    jw_diag_unknown_empty: 'Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.',
    jw_diag_campus_vpn_hint:
      "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
    jw_diag_qz_vpn_hint:
      'If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.',

    jw_capture_intro:
      'A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.',
    jw_capture_step1: 'Step 1 — sign in and open the "My Timetable" page',
    jw_capture_open_site: 'Open academic system',
    jw_capture_step2: 'Step 2 — hand the timetable page to Sleepy',
    jw_capture_fetch: 'Fetch the page directly',
    jw_capture_fetch_note: 'Direct fetch through the Sleepy proxy; without a session this usually returns the login page.',
    jw_capture_paste: 'Paste timetable HTML',
    jw_capture_paste_hint: 'Save the timetable page (Ctrl+S) or copy its HTML from DevTools, then paste it below.',
    jw_capture_paste_placeholder: 'Paste the full HTML source of the timetable page here…',
    jw_capture_parse: 'Parse this HTML',
    jw_matched_protocol: 'Detected protocol: {{v1}}',
    jw_retry: 'Retry',

    jw_preview_title: 'Timetable preview',
    jw_course_count: '{{v1}} courses',
    jw_selected_courses: '{{v1}} / {{v2}} selected',
    jw_matched_count: '{{v1}} matched',
    jw_select_all: 'Select all',
    jw_select_none: 'Clear',
    jw_no_course_selected: 'Select at least one course',
    jw_dest_table_label: 'Import into',
    jw_dest_new_table: 'New timetable',
    jw_empty_course_list: 'The course list is empty — make sure you are on the timetable page',
    jw_imported_table_default: 'Imported timetable',
    jw_week_unit: '週',
  },
  es: {
    jw_import_view_title: 'Academic Import',

    jw_err_dismiss: 'Dismiss',
    jw_diag_session_expired:
      'The session for {{v1}} has expired or you are not signed in. Sign in again and stay on the "My Timetable" page before capturing.',
    jw_diag_no_container:
      'No timetable container was found on the {{v1}} page. Possible causes: the page was captured too early, it is an image timetable or a cross-origin iframe, or the academic system was upgraded — please report it.',
    jw_diag_header_no_node:
      'The {{v1}} timetable has no period row headers. Use file or manual import, or report it to the developer.',
    jw_diag_image_cells:
      'The {{v1}} timetable cells are images and cannot be recognised. Use HTML/CSV file import or add courses manually.',
    jw_diag_empty_semester:
      'The {{v1}} page states there are no courses this term. Check the selected term, or import after the next term starts.',
    jw_diag_wrong_protocol:
      'The protocol declared for {{v1}} does not match the actual page. Please report it to the developer.',
    jw_diag_unknown_empty: 'Parsing {{v1}} returned nothing and no clear cause was found. Retry or report it.',
    jw_diag_campus_vpn_hint:
      "This school's academic system is only reachable on campus. Off campus, connect to the campus network or VPN first.",
    jw_diag_qz_vpn_hint:
      'If a QZ (Qiangzhi) system keeps failing to load, the session was usually kicked or the network is restricted — sign in again or change network.',

    jw_capture_intro:
      'A browser cannot carry your academic-system login for you. Sign in in your own browser first, then pick one of the options below.',
    jw_capture_step1: 'Step 1 — sign in and open the "My Timetable" page',
    jw_capture_open_site: 'Open academic system',
    jw_capture_step2: 'Step 2 — hand the timetable page to Sleepy',
    jw_capture_fetch: 'Fetch the page directly',
    jw_capture_fetch_note: 'Direct fetch through the Sleepy proxy; without a session this usually returns the login page.',
    jw_capture_paste: 'Paste timetable HTML',
    jw_capture_paste_hint: 'Save the timetable page (Ctrl+S) or copy its HTML from DevTools, then paste it below.',
    jw_capture_paste_placeholder: 'Paste the full HTML source of the timetable page here…',
    jw_capture_parse: 'Parse this HTML',
    jw_matched_protocol: 'Detected protocol: {{v1}}',
    jw_retry: 'Retry',

    jw_preview_title: 'Timetable preview',
    jw_course_count: '{{v1}} courses',
    jw_selected_courses: '{{v1}} / {{v2}} selected',
    jw_matched_count: '{{v1}} matched',
    jw_select_all: 'Select all',
    jw_select_none: 'Clear',
    jw_no_course_selected: 'Select at least one course',
    jw_dest_table_label: 'Import into',
    jw_dest_new_table: 'New timetable',
    jw_empty_course_list: 'The course list is empty — make sure you are on the timetable page',
    jw_imported_table_default: 'Imported timetable',
    jw_week_unit: 'sem',
  },
}
