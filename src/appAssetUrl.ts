/** Hash routes leave the document path as the application mount directory. */
export function appAssetUrl(path: string, pageUrl = window.location.href): string {
  const base = new URL(pageUrl)
  base.hash = ''
  base.search = ''
  if (base.pathname.endsWith('/index.html')) base.pathname = base.pathname.slice(0, -'index.html'.length)
  else if (!base.pathname.endsWith('/')) base.pathname += '/'
  return new URL(path.replace(/^\/+/, ''), base).href
}
