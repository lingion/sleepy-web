/**
 * JwParseException — Kotlin JwParserRegistry.kt L197 移植
 * 诊断用异常: message + attempts 快照 (T9 分类消费, web 端诊断模块后续接)。
 */

export interface ParserAttempt {
  parserName: string
  type: string | null
  courseCount: number
  confidence: number
  matchedFeatures: string[]
  exception: string | null
}

export class JwParseException extends Error {
  readonly attempts: ParserAttempt[]

  constructor(message: string, attempts: ParserAttempt[] = []) {
    super(message)
    this.name = 'JwParseException'
    this.attempts = attempts
  }
}

/** 共享标记 — QZ 缺 #kbtable 时的 exception 短语 */
export const NO_TABLE_CONTAINER_MARKER = 'NO_TABLE_CONTAINER_MARKER'
