import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 品牌裁决(2026-10-27):全部尖角 Sleepy logo 已圆角化上线,但浏览器 favicon 缓存
// 按「URL 不变则不重新拉取」工作,老访客在缓存自然过期前仍看到尖角旧图(实测
// /preview 标签页尖角复现,线上资产五点采样已证全圆角——死点在缓存不在资产)。
// 根治 = 图标 URL 统一加版本查询串,URL 变 -> 浏览器与 SW 的 /assets/ cache-first
// 桶都视为新条目强制回源。本契约锁「四个图标入口必须带 ?v=」防回退。

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('图标 URL 缓存破除(品牌圆角化换代必需)', () => {
  it('favicon.svg 链接带版本查询串', () => {
    expect(html).toMatch(/rel="icon"[^>]*href="\.\/favicon\.svg\?v=\d+"/);
  });
  it('PNG 备胎图标带版本查询串', () => {
    expect(html).toMatch(/rel="alternate icon"[^>]*href="\.\/assets\/sleepy-logo\.png\?v=\d+"/);
  });
  it('apple-touch 图标带版本查询串', () => {
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\.\/assets\/pwa-192\.png\?v=\d+"/);
  });
  it('manifest 链接带版本查询串(manifest 本体路径不改,仅入口钉版本)', () => {
    expect(html).toMatch(/rel="manifest"[^>]*href="\.\/manifest\.webmanifest\?v=\d+"/);
  });
});
