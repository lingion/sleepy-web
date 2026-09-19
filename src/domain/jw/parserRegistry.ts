/**
 * JwParserRegistry — Kotlin data/jw/JwParserRegistry.kt 1:1 移植
 * 协议 type → parser 工厂 + 优先级表 + 兜底裁决 (confidence ≥80 优先,
 * 其次 courseCount 最大, 并列按 TYPE_PRIORITY)。
 * 已移植协议覆盖 163/185 校 (16 协议族); 未移植单校协议不入 FACTORIES。
 */

import type { JwCourse, JwParser } from './jwCourse'
import type { ParserAttempt } from './jwFetchError'
import { JwParseException } from './jwFetchError'
import { JwOldZfParser } from './oldZfParser'
import { JwNewZfParser } from './newZfParser'
import { JwQzParser } from './qzParser'
import { JwQzCrazyParser, JwQzBrParser, JwQzWithNodeParser, JwOldQzParser } from './qzVariants'
import { JwChengFangParser, JwPekingParser, JwBnuzParser, JwUrpParser, JwNewUrpParser, JwHnustParser } from './miscParsers'
import { JwWiseduParser } from './wiseduParser'
import { JwQzAppParser } from './qzAppParser'
import { JwEams5Parser } from './eams5Parser'
import { JwClassicEamsParser } from './classicEamsParser'
import { JwBoyaPpParser } from './boyaPpParser'
import { JwBjtuParser } from './bjtuParser'
import { JwChaoxingParser } from './chaoxingParser'
import { JwCquParser } from './cquParser'
import { JwSeuParser } from './seuParser'
import { JwZjuParser } from './zjuParser'
import { JwUstcParser } from './ustcParser'
import { JwScuParser } from './scuParser'
import { JwNeuParser } from './neuParser'
import { JwWhutParser } from './wiseduParser'
import { JwUcasParser } from './ucasParser'
import { JwYethanParser } from './yethanParser'
import { JwXjuPostParser } from './xjuPostParser'
import { JwQzIeasParser } from './qzIeasParser'

export const TYPE_PRIORITY: Array<[string, number]> = [
  ['wisedu', 10],
  ['cqu', 15],
  ['chaoxing', 16],
  ['boya_pp', 17],
  ['eams5', 18],
  ['classic_eams', 19],
  ['pku', 20],
  ['seu', 22],
  ['zju', 23],
  ['ustc', 24],
  ['scu', 25],
  ['neu', 26],
  ['bjtu', 27],
  ['bnuz', 30],
  ['cf', 40],
  ['hnust', 50],
  ['hniu', 60],
  ['whut', 65],
  ['zf', 70],
  ['zf_1', 75],
  ['urp', 80],
  ['urp_new', 85],
  ['zf_new', 90],
  ['qz', 100],
  ['qz_crazy', 110],
  ['qz_br', 120],
  ['qz_with_node', 130],
  ['qz_ieas', 140],
  ['qz_app', 141],
  ['ucas', 142],
  ['yethan', 143],
  ['xju_post', 144],
  ['qz_old', 145],
]

type Factory = (html: string) => JwParser

/** 已移植协议的工厂表 (TYPE_ZF_1 复用 JwOldZfParser(type=1)); 未移植单校协议不入表 */
const REGISTRY = new Map<string, Factory>([
  ['wisedu', (h) => new JwWiseduParser(h)],
  ['pku', (h) => new JwPekingParser(h)],
  ['bnuz', (h) => new JwBnuzParser(h)],
  ['cf', (h) => new JwChengFangParser(h)],
  ['hnust', (h) => new JwHnustParser(h)],
  ['zf', (h) => new JwOldZfParser(h, 0)],
  ['zf_1', (h) => new JwOldZfParser(h, 1)],
  ['urp', (h) => new JwUrpParser(h)],
  ['urp_new', (h) => new JwNewUrpParser(h)],
  ['zf_new', (h) => new JwNewZfParser(h)],
  ['qz', (h) => new JwQzParser(h)],
  ['qz_crazy', (h) => new JwQzCrazyParser(h)],
  ['qz_br', (h) => new JwQzBrParser(h)],
  ['qz_with_node', (h) => new JwQzWithNodeParser(h)],
  ['qz_old', (h) => new JwOldQzParser(h)],
  ['qz_app', (h) => new JwQzAppParser(h)],
  ['eams5', (h) => new JwEams5Parser(h)],
  ['classic_eams', (h) => new JwClassicEamsParser(h)],
  ['boya_pp', (h) => new JwBoyaPpParser(h)],
  ['bjtu', (h) => new JwBjtuParser(h)],
  ['chaoxing', (h) => new JwChaoxingParser(h)],
  ['cqu', (h) => new JwCquParser(h)],
  ['seu', (h) => new JwSeuParser(h)],
  ['zju', (h) => new JwZjuParser(h)],
  ['ustc', (h) => new JwUstcParser(h)],
  ['scu', (h) => new JwScuParser(h)],
  ['neu', (h) => new JwNeuParser(h)],
  ['whut', (h) => new JwWhutParser(h)],
  ['ucas', (h) => new JwUcasParser(h)],
  ['yethan', (h) => new JwYethanParser(h)],
  ['xju_post', (h) => new JwXjuPostParser(h)],
  ['qz_ieas', (h) => new JwQzIeasParser(h)],
])

/** 兜底候选: 按 TYPE_PRIORITY 升序, 只含已注册协议 */
export function allCandidates(html: string): Array<[string | null, JwParser]> {
  return TYPE_PRIORITY.flatMap(([t]) => {
    const factory = REGISTRY.get(t)
    return factory ? ([[t, factory(html)] as [string | null, JwParser]]) : []
  })
}

/** 显式分发: 未注册 type 抛 IllegalArgumentException 语义 */
export function parserFor(type: string, html: string): JwParser {
  const factory = REGISTRY.get(type)
  if (!factory) throw new Error(`协议 ${type} 暂不支持`)
  return factory(html)
}

interface Row {
  type: string | null
  attempt: ParserAttempt
  result: JwCourse[]
}

/** parser 名 — 诊断输出 */
function nameForDiag(parser: JwParser): string {
  const cls = parser.constructor.name
  if (parser instanceof JwOldZfParser) return `${cls}(type=${parser.zfType})`
  if (parser instanceof JwHnustParser) return `${cls}(oldQzType=${parser.oldQzType})`
  return cls
}

// instanceof 收窄依赖具体类 — JwParser 接口无这些字段, 上面已 import 具体类

/** 兜底裁决: 返回 [best, attempts] */
export function selectBest(html: string, declaredType: string | null = null): [JwCourse[], ParserAttempt[]] {
  const attempts: ParserAttempt[] = []
  const candidates = allCandidates(html)

  const results: Row[] = candidates.map(([type, parser]) => {
    let conf = 0
    try {
      conf = parser.confidence()
    } catch {
      conf = 0
    }
    let matched: string[] = []
    try {
      matched = parser.matchedFeatures()
    } catch {
      matched = []
    }
    let count = 0
    let result: JwCourse[] = []
    let exMsg: string | null = null
    try {
      result = parser.generateCourseList()
      count = result.length
    } catch (e) {
      if (e instanceof JwParseException) {
        exMsg = e.attempts[0]?.exception ?? `JwParseException: ${e.message?.slice(0, 60) ?? ''}`
      } else {
        exMsg = `${e instanceof Error ? e.name : 'Exception'}: ${e instanceof Error ? e.message?.slice(0, 60) : String(e)}`
      }
    }
    const attempt: ParserAttempt = {
      parserName: nameForDiag(parser),
      type,
      courseCount: count,
      confidence: conf,
      matchedFeatures: matched,
      exception: exMsg,
    }
    attempts.push(attempt)
    return { type, attempt, result }
  })

  const best = declaredType ? declaredOrGeneral(results, declaredType) : generalAdjudication(results)
  return [best, attempts]
}

function declaredOrGeneral(results: Row[], declaredType: string): JwCourse[] {
  const declared = results.find((r) => r.type === declaredType)?.result ?? []
  return declared.length > 0 ? declared : generalAdjudication(results)
}

/** 通用裁决: confidence ≥80 且 >0 课取最高 → courseCount 最大(并列 conf 高者/PRIORITY 序) */
function generalAdjudication(results: Row[]): JwCourse[] {
  const eligible = results.filter((r) => r.result.length > 0)
  if (eligible.length === 0) return []
  const highConf = eligible.filter((r) => (r.attempt.confidence ?? 0) >= 80)
  const pool = highConf.length > 0 ? highConf : eligible
  pool.sort((a, b) => {
    if (b.result.length !== a.result.length) return b.result.length - a.result.length
    const confA = a.attempt.confidence ?? 0
    const confB = b.attempt.confidence ?? 0
    if (confB !== confA) return confB - confA
    const priA = TYPE_PRIORITY.find(([t]) => t === a.type)?.[1] ?? 999
    const priB = TYPE_PRIORITY.find(([t]) => t === b.type)?.[1] ?? 999
    return priA - priB
  })
  return pool[0].result
}

// FACTORIES 兼容导出 — REGISTRY 别名
export { REGISTRY as FACTORIES }
