import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const docs = createRequire(new URL('../../apps/docs/package.json', import.meta.url))
const rehype = createRequire(docs.resolve('rehype-katex'))
const streamdown = createRequire(
  createRequire(new URL('../../apps/studio/package.json', import.meta.url)).resolve('streamdown')
)
const katex = docs('katex')
for (const [name, load] of [
  ['docs', docs],
  ['rehype-katex', rehype],
  ['streamdown', streamdown],
]) {
  assert.equal(
    load('katex/package.json').version,
    '0.18.2',
    name + ' renderer must match the stylesheet'
  )
}
const { evaluate } = await import(docs.resolve('next-mdx-remote-client/rsc'))
const { default: remarkMath } = await import(docs.resolve('remark-math'))
const { default: rehypeKatex } = await import(docs.resolve('rehype-katex'))
const { renderToStaticMarkup } = docs('react-dom/server')
const expression = String.raw`\frac{a}{b}+\sqrt{x}`
const { content, error } = await evaluate({
  source: '$$\n' + expression + '\n$$',
  options: {
    mdxOptions: {
      remarkPlugins: [[remarkMath, { singleDollarTextMath: false }]],
      rehypePlugins: [rehypeKatex],
    },
  },
})
assert.ifError(error)
const html = renderToStaticMarkup(content)
const expected = katex.renderToString(expression, { displayMode: true })
// The docs pipeline must emit exactly the HTML from the engine paired with its CSS.
// React drops trailing style semicolons and expands self-closing SVG paths.
const normalize = (markup) =>
  markup.replace(/;"/g, '"').replace(/<path([^>]+)\/>/g, '<path$1></path>')
assert.equal(
  normalize(html),
  normalize(expected),
  'MDX math renderer differs from direct KaTeX output'
)
const css = readFileSync(docs.resolve('katex/dist/katex.min.css'), 'utf8')
for (const className of new Set(
  [...expected.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(' '))
)) {
  if (className.startsWith('katex-'))
    assert.ok(css.includes('.' + className), 'Missing style for ' + className)
}
assert.doesNotMatch(html, /katex-error/)
console.log('KaTeX 0.18.2: docs MDX math, renderer/CSS versions and generated classes verified')
