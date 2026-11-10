/** Rounded lens normals, sampled by SVG backdrop displacement rather than a painted blur.
 * The rim separates the RGB samples, as FLClash's uEdge.dispersion does. Foreground
 * labels stay outside this filter so the pane never captures itself recursively.
 */
const NS = 'http://www.w3.org/2000/svg'
let serial = 0
export function lensNormals(width: number, height: number, radius: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const r = Math.min(radius, width / 2, height / 2), bevel = Math.max(2, Math.min(12, height * .24))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x + .5 - width / 2, py = y + .5 - height / 2
    const qx = Math.abs(px) - (width / 2 - r), qy = Math.abs(py) - (height / 2 - r)
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), length = Math.hypot(ox, oy)
    const distance = length + Math.min(Math.max(qx, qy), 0) - r
    const nx = length ? Math.sign(px) * ox / length : qx > qy ? Math.sign(px) : 0
    const ny = length ? Math.sign(py) * oy / length : qy >= qx ? Math.sign(py) : 0
    const edge = Math.max(0, Math.min(1, 1 + distance / bevel))
    const bend = Math.sin(edge * Math.PI / 2) * .42
    const i = (y * width + x) * 4
    pixels[i] = Math.round(255 * Math.max(0, Math.min(1, .5 - nx * bend - px / width * .12)))
    pixels[i + 1] = Math.round(255 * Math.max(0, Math.min(1, .5 - ny * bend - py / height * .12)))
    pixels[i + 2] = 128; pixels[i + 3] = 255
  }
  return pixels
}

export function installLensOptics(element: HTMLElement) {
  if (typeof ResizeObserver === 'undefined' || !window.CanvasRenderingContext2D) return { update: (_lift: number) => {}, destroy: () => {} }
  const id = `sleepy-optics-${++serial}`, svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden'
  const filter = document.createElementNS(NS, 'filter')
  filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.setAttribute('x', '0%'); filter.setAttribute('y', '0%'); filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%')
  const map = document.createElementNS(NS, 'feImage'); map.setAttribute('result', 'normals'); map.setAttribute('preserveAspectRatio', 'none'); map.setAttribute('width', '100%'); map.setAttribute('height', '100%')
  filter.appendChild(map)
  const displacements: SVGElement[] = []
  for (const [channel, matrix] of [
    ['r', '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1'],
    ['g', '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 1'],
    ['b', '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 1'],
  ]) {
    const displacement = document.createElementNS(NS, 'feDisplacementMap')
    displacement.setAttribute('in', 'SourceGraphic'); displacement.setAttribute('in2', 'normals')
    displacement.setAttribute('xChannelSelector', 'R'); displacement.setAttribute('yChannelSelector', 'G'); displacement.setAttribute('scale', '4'); displacement.setAttribute('result', `${channel}-bend`)
    filter.appendChild(displacement); displacements.push(displacement)
    const color = document.createElementNS(NS, 'feColorMatrix'); color.setAttribute('in', `${channel}-bend`); color.setAttribute('values', matrix); color.setAttribute('result', channel); filter.appendChild(color)
  }
  const rg = document.createElementNS(NS, 'feBlend'); rg.setAttribute('in', 'r'); rg.setAttribute('in2', 'g'); rg.setAttribute('mode', 'screen'); rg.setAttribute('result', 'rg'); filter.appendChild(rg)
  const rgb = rg.cloneNode() as SVGElement; rgb.setAttribute('in', 'rg'); rgb.setAttribute('in2', 'b'); rgb.setAttribute('result', 'rgb'); filter.appendChild(rgb)
  const alpha = document.createElementNS(NS, 'feComposite'); alpha.setAttribute('in','rgb'); alpha.setAttribute('in2','g-bend'); alpha.setAttribute('operator','in'); filter.appendChild(alpha)
  svg.appendChild(filter); document.body.appendChild(svg)
  element.style.setProperty('--glass-optics-filter', `url("#${id}")`)
  let size = '', shortest = 32
  const resize = () => {
    const icon = element.dataset.glassIcon === 'true'
    const width = Math.max(1, Math.round(icon ? 36 : element.offsetWidth)), height = Math.max(1, Math.round(icon ? 36 : element.offsetHeight))
    const key = `${width}/${height}`
    if (key === size) return
    size = key; shortest = Math.min(width, height)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const radius = parseFloat(getComputedStyle(element).borderRadius) || shortest / 2
    const data = ctx.createImageData(width, height); data.data.set(lensNormals(width, height, icon ? 18 : radius)); ctx.putImageData(data, 0, 0)
    map.setAttribute('href', canvas.toDataURL())
  }
  const observer = new ResizeObserver(resize); observer.observe(element); resize()
  return {
    update(lift: number) { displacements.forEach((node, index) => node.setAttribute('scale', String(Math.min(shortest * .48, 16) * (.24 + lift * .76) + (index - 1) * 2.4 * lift))) },
    destroy() { observer.disconnect(); svg.remove(); element.style.removeProperty('--glass-optics-filter') },
  }
}
