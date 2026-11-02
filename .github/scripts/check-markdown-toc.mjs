import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const www = createRequire(new URL('../../apps/www/package.json', import.meta.url))
const toc = www('markdown-toc')
const fromToc = createRequire(www.resolve('markdown-toc'))
const matter = fromToc('gray-matter')
assert.equal(fromToc('gray-matter/package.json').version, '4.0.3')
assert.throws(() => fromToc.resolve('toml'), { code: 'MODULE_NOT_FOUND' })

const source =
  '---\ntitle: Customer story\ntoc_depth: 2\n---\n\n<!-- toc -->\n\n<!-- tocstop -->\n\n# Overview\n\n## Getting started\n\n### Details\n\n## Getting started\n'
const { data, content } = matter(source)
assert.deepEqual(data, { title: 'Customer story', toc_depth: 2 })
assert.equal(
  toc(content, { maxdepth: data.toc_depth }).content,
  '- [Overview](#overview)\n  * [Getting started](#getting-started)\n  * [Getting started](#getting-started-1)'
)
const inserted = toc.insert(source, { maxdepth: data.toc_depth })
assert.deepEqual(matter(inserted).data, data)
assert.match(inserted, /\[Getting started\]\(#getting-started-1\)/)
assert.match(matter(inserted).content, /### Details/)
assert.equal(toc('No headings').content, '')
console.log(
  'Markdown TOC: front-matter, depth, repeated anchors and insertion verified; obsolete TOML absent'
)
