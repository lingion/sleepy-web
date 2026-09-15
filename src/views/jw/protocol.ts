/**
 * protocol — data/jw/JwProtocol.kt + JwImportViewModel.detectProtocolFromUrlImpl +
 *            SchoolDomainMatch.kt 三合一 1:1 移植。
 *
 * 协议显示名在 Android 是硬编码中文 (未 i18n), 此处保持一致 (教务系统专名不译)。
 */

import type { SchoolInfo } from './schools'

export const TYPE_HELP = 'help'
export const TYPE_ZF = 'zf'
export const TYPE_ZF_1 = 'zf_1'
export const TYPE_ZF_NEW = 'zf_new'
export const TYPE_URP = 'urp'
export const TYPE_URP_NEW = 'urp_new'
export const TYPE_QZ = 'qz'
export const TYPE_QZ_OLD = 'qz_old'
export const TYPE_QZ_CRAZY = 'qz_crazy'
export const TYPE_QZ_BR = 'qz_br'
export const TYPE_QZ_WITH_NODE = 'qz_with_node'
export const TYPE_CF = 'cf'
export const TYPE_PKU = 'pku'
export const TYPE_BNUZ = 'bnuz'
export const TYPE_LOGIN = 'login'
export const TYPE_MAINTAIN = 'maintain'
export const TYPE_WISEDU = 'wisedu'
export const TYPE_CQU = 'cqu'
export const TYPE_HNUST = 'hnust'
export const TYPE_HNIU = 'hniu'
export const TYPE_QZ_IEAS = 'qz_ieas'
export const TYPE_QZ_APP = 'qz_app'
export const TYPE_UCAS = 'ucas'
export const TYPE_BJTU = 'bjtu'
export const TYPE_EAMS5 = 'eams5'
export const TYPE_SEU = 'seu'
export const TYPE_ZJU = 'zju'
export const TYPE_USTC = 'ustc'
export const TYPE_SCU = 'scu'
export const TYPE_NEU = 'neu'
export const TYPE_CHAOXING = 'chaoxing'
export const TYPE_BOYA_PP = 'boya_pp'
export const TYPE_WHUT = 'whut'
export const TYPE_CLASSIC_EAMS = 'classic_eams'

/** displayName(type) — JwProtocol.displayName 逐条对齐; 未知回落原始 type 串 */
export function protocolDisplayName(type: string | null): string {
  switch (type) {
    case TYPE_QZ:
    case TYPE_QZ_OLD:
    case TYPE_QZ_CRAZY:
    case TYPE_QZ_BR:
    case TYPE_QZ_WITH_NODE:
      return '强智教务'
    case TYPE_QZ_APP:
      return '强智移动教务'
    case TYPE_QZ_IEAS:
      return '强智教务（iEAS 网络版）'
    case TYPE_UCAS:
      return '国科大选课系统'
    case TYPE_BJTU:
      return '北京交通大学'
    case TYPE_ZF:
    case TYPE_ZF_1:
    case TYPE_ZF_NEW:
      return '正方教务'
    case TYPE_URP:
    case TYPE_URP_NEW:
      return 'URP 教务'
    case TYPE_CF:
      return '青果教务'
    case TYPE_PKU:
      return '北京大学'
    case TYPE_BNUZ:
      return '北师珠'
    case TYPE_WISEDU:
      return '金智教务（直连）'
    case TYPE_CQU:
      return '重庆大学门户'
    case TYPE_CHAOXING:
      return '超星综合教务'
    case TYPE_BOYA_PP:
      return '博雅研究生平台'
    case TYPE_HNUST:
      return '湖南科大教务'
    case TYPE_HNIU:
      return '湖南信息职业技术学院'
    case TYPE_EAMS5:
      return '合工大教务 (EAMS5)'
    case TYPE_CLASSIC_EAMS:
      return '金智教务（经典 EAMS）'
    case TYPE_SEU:
      return '东南大学'
    case TYPE_ZJU:
      return '浙江大学'
    case TYPE_USTC:
      return '中国科学技术大学'
    case TYPE_SCU:
      return '四川大学'
    case TYPE_NEU:
      return '东北大学'
    case TYPE_WHUT:
      return '武汉理工大学'
    case TYPE_LOGIN:
      return '特殊登录（v1 暂不支持）'
    case TYPE_HELP:
      return '如何选择教务类型'
    case TYPE_MAINTAIN:
      return '维护中'
    default:
      return type ?? ''
  }
}

// ── URL 判型 (detectProtocolFromUrlImpl 有序链 1:1) ──

const RX_CAS_LOGIN = /\/cas\/login/
const RX_AUTHSERVER = /\/authserver\/login/
const RX_HTTP_HEX = /\/http\/[0-9a-f]+\//
const RX_XTGL = /\/xtgl(\/|$)/
const RX_JXD = /\/jxd(\/|$)/
const RX_IEAS21 = /\/ieas2\.1(\/|$)/
const RX_CQU = /^https?:\/\/my\.cqu\.edu\.cn(\/.*)?$/
const RX_XSD = /\/xsd(\/|$)/
const RX_FOR_STD = /\/for-std(\/|$)/

/** WebVPN 重写形态下 host 段不可见 → 只保留路径级锚点 (Android 同处理) */
function detectInWebvpn(u: string): string | null {
  if (u.includes('/jwapp/')) return TYPE_WISEDU
  if (u.includes('jwglxt') || RX_XTGL.test(u) || u.includes('/kbcx/') || u.includes('xskbcx_cx') || u.includes('/jwtottxuxsysb/'))
    return TYPE_ZF_NEW
  if (u.includes('default2.aspx') || u.includes('xskbcx.aspx')) return TYPE_ZF
  if (u.includes('/jsxsd/') || RX_JXD.test(u) || u.includes('logon.do') || u.includes('verifycode.servlet')) return TYPE_QZ
  if (u.includes('xkaction.do') || u.includes('actiontype=6')) return TYPE_URP
  if (u.includes('thissemestercurriculum') || u.includes('courseselect') || u.includes('ajaxstudentschedule'))
    return TYPE_URP_NEW
  return null
}

/** detectProtocolFromUrl — 高置信有序链, 首个命中即返回; CAS 网关页恒 null */
export function detectProtocolFromUrl(url: string): string | null {
  if (!url.trim()) return null
  const u = url.toLowerCase()

  // ⓪ CAS / authserver 统一身份认证网关: 只是一跳中转, 不当协议指纹
  if (RX_CAS_LOGIN.test(u) || RX_AUTHSERVER.test(u)) return null

  // WebVPN 路径重写形态
  if (u.includes('/webvpn/') || RX_HTTP_HEX.test(u) || u.includes('.webvpn.')) return detectInWebvpn(u)

  // ① WISEDU — 金智 jwapp 微应用
  if (u.includes('/jwapp/')) return TYPE_WISEDU

  // ①a EAMS5 — supwisdom 平台 (issue #25)
  if (
    u.includes('jxglstu') ||
    u.includes('/eams5-student') ||
    u.includes('/for-std/') ||
    RX_FOR_STD.test(u) ||
    u.includes('jw.ahu.edu.cn') ||
    u.includes('jwxt.cumtb.edu.cn')
  )
    return TYPE_EAMS5

  // ①b CQU — 重庆大学统一门户
  if (RX_CQU.test(u)) return TYPE_CQU
  if (u.includes('xkgo.ucas.ac.cn') && u.includes('/course/personschedule')) return TYPE_UCAS

  // ②b QZ_IEAS — 必须先于通用 /kbcx/
  if (
    u.includes('/ieas2.1') ||
    RX_IEAS21.test(u) ||
    u.includes('jwxt.buaa.edu.cn') ||
    u.includes('jwxt-7001.e2.buaa.edu.cn')
  )
    return TYPE_QZ_IEAS

  // ② ZF_NEW — 新版正方 jwglxt 全系
  if (u.includes('jwglxt') || RX_XTGL.test(u) || u.includes('/kbcx/') || u.includes('xskbcx_cx') || u.includes('/jwtottxuxsysb/'))
    return TYPE_ZF_NEW

  // ③ ZF — 老版正方 .aspx
  if (u.includes('default2.aspx') || u.includes('xskbcx.aspx')) return TYPE_ZF

  // ④ QZ — 强智入口四件套
  if (u.includes('/jsxsd/') || RX_JXD.test(u) || u.includes('logon.do') || u.includes('verifycode.servlet')) return TYPE_QZ

  // ⑤ URP — 老 URP TeachRA
  if (u.includes('xkaction.do') || u.includes('actiontype=6')) return TYPE_URP

  // ⑥ URP_NEW — 课表接口入口
  if (u.includes('thissemestercurriculum') || u.includes('courseselect') || u.includes('ajaxstudentschedule'))
    return TYPE_URP_NEW

  // ⑦ CF — 青果/乘方
  if (
    u.includes('/xsgrkbcx') ||
    u.includes('/new/xskb') ||
    u.includes('jxfw.gdut') ||
    u.includes('zhjw.smu') ||
    u.includes('jxgl.wyu') ||
    u.includes('jw.hbmu')
  )
    return TYPE_CF

  // ⑦b CHAOXING — 超星综合教务
  if (RX_XSD.test(u) || u.includes('/xsd/pkgl/') || u.includes('querykbforgrdb') || u.includes('sdpkkblist'))
    return TYPE_CHAOXING

  // ⑧ PKU / ⑨ BNUZ / ⑩ HNUST
  if (u.includes('elective.pku') || u.includes('iaaa.pku')) return TYPE_PKU
  if (u.includes('es.bnuz')) return TYPE_BNUZ
  if (u.includes('kdjw.hnust') || u.includes('xxjw.hnust') || u.includes('jwgl.nepu')) return TYPE_HNUST

  // ⑪ 兜底 null
  return null
}

// ── URL 形态判定 (SchoolSelectScreen.kt looksLikeUrl / normalizeUrl 1:1) ──

// 与 Android SchoolSelectScreen.looksLikeUrl 的唯一有意偏离: 允许多级子域。
// Android 原式只认「单点」域名 (example.com), 输入 jw.hrbeu.edu.cn 不弹「直接用此 URL 登录」行,
// 而带 scheme 的完整地址仍可用 → 属 Android 侧可用性缺陷, 此处放宽为严格超集, 不误判中文校名。
const RX_HOST_URL =
  /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,}([/:?].*)?$/
const RX_IP_URL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/

export function looksLikeUrl(input: string): boolean {
  const t = input.trim()
  if (t.startsWith('http://') || t.startsWith('https://')) return true
  if (RX_HOST_URL.test(t)) return true
  return RX_IP_URL.test(t)
}

export function normalizeUrl(input: string): string {
  const t = input.trim()
  return t.startsWith('http://') || t.startsWith('https://') ? t : `https://${t}`
}

/** 行2 展示用: 去协议头去尾斜杠 */
export function displayHost(url: string): string {
  return url.replace('https://', '').replace('http://', '').replace(/\/+$/, '')
}

// ── SchoolDomainMatch.kt 1:1 ──

/** 注册域启发式: edu.cn / ac.uk / edu.hk / edu.tw / edu.jp 取末三段, 否则末两段 */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().trim().replace(/\.+$/, '')
  if (!h) return ''
  const parts = h.split('.')
  if (parts.length <= 2) return h
  const secondLevel = parts[parts.length - 2]
  const tld = parts[parts.length - 1]
  if (['cn', 'hk', 'uk', 'tw', 'jp'].includes(tld) && ['edu', 'ac', 'gov', 'org'].includes(secondLevel)) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

/** 抽 host: 处理 scheme、尾 path、端口; 空返回空串 */
export function hostOf(url: string): string {
  const u = url.trim()
  if (!u) return ''
  const schemeEnd = u.indexOf('://')
  const rest = u.slice(schemeEnd < 0 ? 0 : schemeEnd + 3)
  const slash = rest.indexOf('/')
  const hostAndPort = slash < 0 ? rest : rest.slice(0, slash)
  const colon = hostAndPort.indexOf(':')
  return colon < 0 ? hostAndPort : hostAndPort.slice(0, colon)
}

export function isVpnRewrite(host: string): boolean {
  if (!host) return false
  return host.includes('/webvpn/') || host.includes('.webvpn.') || host.startsWith('webvpn.')
}

/** 把 typed URL 映射回目录条目 (issue #25) — 同注册域 + supported + 有 URL, 取列表序首个 */
export function matchSchoolByDomain(url: string, catalog: readonly SchoolInfo[]): SchoolInfo | null {
  const host = hostOf(url)
  if (!host || isVpnRewrite(host)) return null
  const target = registrableDomain(host)
  if (!target) return null
  return (
    catalog.find(
      (s) =>
        (s.status === 'supported' || s.status === 'grad_supported') &&
        s.url.trim() !== '' &&
        registrableDomain(hostOf(s.url)) === target
    ) ?? null
  )
}
