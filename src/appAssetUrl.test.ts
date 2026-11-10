import { expect, it } from 'vitest'
import { appAssetUrl } from './appAssetUrl'

it.each([
  ['https://sleepy.qdp.qzz.io/#/我的', 'https://sleepy.qdp.qzz.io/widget-previews/today.png'],
  ['https://sleepy.is-my.app/preview/#/我的', 'https://sleepy.is-my.app/preview/widget-previews/today.png'],
  ['https://sleepy.is-my.app/preview?theme=dark#/我的', 'https://sleepy.is-my.app/preview/widget-previews/today.png'],
  ['https://lingion.github.io/sleepy-web/index.html#/我的', 'https://lingion.github.io/sleepy-web/widget-previews/today.png'],
])('keeps assets within the mounted application at %s', (page, expected) => {
  expect(appAssetUrl('widget-previews/today.png', page)).toBe(expected)
  expect(appAssetUrl('sw.js', page)).toBe(expected.replace('widget-previews/today.png', 'sw.js'))
})
