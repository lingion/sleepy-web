import { JW_WEB_UNSUPPORTED } from '../../domain/jw/webPolicy'
import type { FetchOutcome, ProxyFetcher } from './proxyClient'
import type { SchoolInfo } from './schools'

/** Legacy mount points cannot reopen academic login or capture on the Web. */
export function JwCapturePage({ school }: {
  school: SchoolInfo
  fetcher: ProxyFetcher
  onHtml: (html: string) => void
  onFetchError: (outcome: Extract<FetchOutcome, { ok: false }>) => void
}) {
  return <div className="m3-card" style={{padding:20}}>
    <h2>{school.name}</h2>
    <p role="alert">{JW_WEB_UNSUPPORTED}</p>
  </div>
}
