/**
 * diagnostics — data/jw/JwParseDiagnostics.kt 的 1:1 移植 (T9 失败分类嗅探)。
 *
 * 关键约束 (与 Android 同): 绝不把学号 / 姓名 / Cookie / token / 完整 HTML
 * 写进 userMessage, 只输出「指纹片段」。
 */

import { parseHtmlDoc, text } from '../../domain/jw/jwCourse'
import type { SchoolInfo } from './schools'
import {
  TYPE_BNUZ,
  TYPE_CF,
  TYPE_PKU,
  TYPE_QZ,
  TYPE_QZ_BR,
  TYPE_QZ_CRAZY,
  TYPE_QZ_OLD,
  TYPE_QZ_WITH_NODE,
  TYPE_URP,
  TYPE_URP_NEW,
  TYPE_ZF,
  TYPE_ZF_1,
  TYPE_ZF_NEW,
} from './protocol'

export const DIAG_SESSION_EXPIRED = 'SESSION_EXPIRED'
export const DIAG_NO_TABLE_CONTAINER = 'NO_TABLE_CONTAINER'
export const DIAG_HEADER_NO_NODE = 'HEADER_NO_NODE'
export const DIAG_IMAGE_OR_EMPTY_CELLS = 'IMAGE_OR_EMPTY_CELLS'
export const DIAG_EMPTY_SEMESTER = 'EMPTY_SEMESTER'
export const DIAG_WRONG_PROTOCOL = 'WRONG_PROTOCOL'
export const DIAG_UNKNOWN_EMPTY = 'UNKNOWN_EMPTY'

export type DiagCategory =
  | typeof DIAG_SESSION_EXPIRED
  | typeof DIAG_NO_TABLE_CONTAINER
  | typeof DIAG_HEADER_NO_NODE
  | typeof DIAG_IMAGE_OR_EMPTY_CELLS
  | typeof DIAG_EMPTY_SEMESTER
  | typeof DIAG_WRONG_PROTOCOL
  | typeof DIAG_UNKNOWN_EMPTY

export interface DiagResult {
  category: DiagCategory
  matchedFeatures: string[]
  courseCount: number
  /** 开发者向的长诊断串 (Android Result.userMessage) */
  userMessage: string
}

/**
 * 老正方通用「登录态失效」硬指纹 — 整段 script 只含
 *   (window.)(parent|top).location(.href)? = 'logout.aspx'
 * 一条即判, 不走 score>=2 门槛 (JOU 2026-09-09 SOP Step 5.5)。
 */
export const LOGOUT_REDIRECT =
  /<script[^>]*>\s*(?:window\.)?(?:parent|top)\.location(?:\.href)?\s*=\s*['"]logout\.aspx['"]\s*;?\s*<\/script>/is

const LOGIN_MARKERS: Array<[string, RegExp]> = [
  ['logout-redirect', LOGOUT_REDIRECT],
  ['login_slogin', /login_slogin|csrfToken|csrftoken/],
  ['登录', /用户登录|请输入密码|请输入账号|登录系统|统一身份认证登录|请重新登录/],
  ['captcha', /kaptcha|verifycode|RANDOMCODE|输入验证码|CheckCode/],
  ['logon', /Logon\.do\?method=logon|\/jsxsd\/xk\/LoginToXk|Logon\.do/],
  ['cas', /iaaa\.pku\.edu\.cn|\/cas\/login|casAuth/],
  ['viewstate', /__VIEWSTATE|ASP\.NET_SessionId/],
]

const EMPTY_SEMESTER_MARKERS = [
  '暂无课表',
  '暂无课程',
  '本学期暂无',
  '本学期无课',
  '尚未产生课表数据',
  '本学期暂无课表数据',
  '未查询到课表',
  '没有可选的课程',
  '未排课',
]

const CONTAINER_MARKERS: Array<[string, RegExp]> = [
  ['id=Table1', /id\s*=\s*["']Table1["']/i],
  ['id=kbtable', /id\s*=\s*["']kbtable["']/i],
  ['id=table1', /id\s*=\s*["']table1["']/i],
  ['kbList', /["']kbList["']/],
  ['kbxx', /var\s+kbxx\s*=|kbxx\s*=\s*\[/],
  ['kbgrid', /kbgrid_table|kbgrid_view/],
  ['kblist', /kblist_table/],
  ['dateList', /["']dateList["']/],
  ['datagrid', /\.datagrid\b|class\s*=\s*["'][^"']*datagrid/],
  ['displayTag', /class\s*=\s*["'][^"']*displayTag/],
]

const RX_NODE_HEADER = /第\s*[一二三四五六七八九十0-9]+\s*节/

/** 学校标注协议 -> 期望容器族 (else = 不检查) */
function expectedFamily(type: string | null | undefined): Set<string> | null {
  switch (type) {
    case TYPE_ZF:
    case TYPE_ZF_1:
      return new Set(['id=Table1'])
    case TYPE_ZF_NEW:
      return new Set(['kbList', 'kbgrid', 'kblist'])
    case TYPE_QZ:
    case TYPE_QZ_CRAZY:
    case TYPE_QZ_BR:
    case TYPE_QZ_WITH_NODE:
    case TYPE_QZ_OLD:
      return new Set(['id=kbtable'])
    case TYPE_URP_NEW:
      return new Set(['dateList'])
    case TYPE_URP:
      return new Set(['displayTag'])
    case TYPE_CF:
      return new Set(['kbxx'])
    case TYPE_PKU:
      return new Set(['datagrid'])
    case TYPE_BNUZ:
      return new Set(['id=table1', 'id=Table1'])
    default:
      return null
  }
}

/**
 * 给一段 HTML 做「页面级嗅探」。
 * 优先级: SessionExpired > EmptySemester > NoContainer > HeaderNoNode
 *         > ImageOrEmpty > WrongProtocol > UnknownEmpty
 */
export function classifyDiagnostics(html: string, school: SchoolInfo | null): DiagResult {
  if (!html.trim()) throw new Error('html 不能为空')
  const doc = parseHtmlDoc(html)
  const bodyText = doc.body ? text(doc.body) : ''
  const matched: string[] = []
  const done = (category: DiagCategory, features: string[], userMessage: string): DiagResult => ({
    category,
    matchedFeatures: features,
    courseCount: 0,
    userMessage,
  })

  // 1) 会话过期 / 登录页
  let loginHit = false
  for (const [name, re] of LOGIN_MARKERS) {
    if (re.test(html)) {
      matched.push(name)
      loginHit = true
    }
  }
  const formAction = doc.querySelector('form[action]')?.getAttribute('action') ?? ''
  const actionLower = formAction.toLowerCase()
  const looksLikeLogin =
    loginHit ||
    (formAction.trim() !== '' &&
      (actionLower.includes('login') || actionLower.includes('slogin')) &&
      !actionLower.includes('xskbcx') &&
      !actionLower.includes('xskb'))
  if (looksLikeLogin) {
    return done(
      DIAG_SESSION_EXPIRED,
      matched,
      `登录页与会话过期：检测到 ${matched.join('/')}，请确认已完成登录并停留在「个人课表」页（而非登录页或首页）`
    )
  }

  // 1.5) 可信空课表声明 — 优先于容器缺失判定
  const emptyHit = EMPTY_SEMESTER_MARKERS.find((m) => bodyText.includes(m))
  if (emptyHit) {
    return done(
      DIAG_EMPTY_SEMESTER,
      [...matched, emptyHit],
      `页面声明本学期暂无课程："${emptyHit}"。请确认已选对学期，或下学期开学后再导入`
    )
  }

  // 2) 页面无课表容器
  const containerHits = CONTAINER_MARKERS.filter(([, re]) => re.test(html)).map(([n]) => n)
  if (containerHits.length === 0) {
    return done(
      DIAG_NO_TABLE_CONTAINER,
      [...matched, 'no_container'],
      '未找到课表容器（Table1 / kbtable / kbList / dateList 均缺失）。可能原因：①抓取协议与实际教务系统不匹配；②抓取时机过早，课表尚未加载；③页面为图片课表或跨域 iframe'
    )
  }
  matched.push(...containerHits)

  // 3) 有容器但组头无逐节行头 (纯 JSON 协议 kbList/dateList/kbxx 本就无行头 -> 跳过)
  const hasNodeHeader = RX_NODE_HEADER.test(bodyText)
  if (!hasNodeHeader && containerHits.some((h) => h !== 'kbList' && h !== 'dateList' && h !== 'kbxx')) {
    return done(
      DIAG_HEADER_NO_NODE,
      matched,
      `找到课表容器（${containerHits.join('/')}）但未识别到逐节行头。可能原因：①该课表为图片截图，请改用 HTML/CSV 文件导入或手动添加；②组头被合并（如"第一节-第二节"），请反馈开发者适配`
    )
  }

  // 4) 课程格是 <img> — 图片课表
  const imgInTable = doc.querySelectorAll('table img').length + doc.querySelectorAll('td img').length
  let imgWithLongAlt = 0
  doc.querySelectorAll('img').forEach((el) => {
    if ((el.getAttribute('alt') ?? '').length >= 3) imgWithLongAlt += 1
  })
  if (imgInTable >= 2 || imgWithLongAlt >= 1) {
    return done(
      DIAG_IMAGE_OR_EMPTY_CELLS,
      [...matched, 'img_in_table'],
      `课表单元格为图片（检测到 ${imgInTable} 个 <img>），Sleepy 无法识别。建议改用 HTML/CSV 文件导入，或手动添加课程`
    )
  }

  // 6) 抓取协议不匹配
  const family = expectedFamily(school?.type)
  if (family && !containerHits.some((h) => family.has(h))) {
    return done(
      DIAG_WRONG_PROTOCOL,
      matched,
      `抓取协议与学校配置不一致：学校标注 ${school?.type}，但页面容器为 ${containerHits.join('/')}。可能原因：①学校已切换教务系统，请反馈开发者更新 schools.json；②抓取时机过早；③页面为图片课表`
    )
  }

  // 7) 兜底
  return done(
    DIAG_UNKNOWN_EMPTY,
    matched,
    `解析结果为空，但未找到明确原因。请尝试重新加载页面或反馈开发者。（诊断特征：${matched.slice(0, 5).join('/')}）`
  )
}
