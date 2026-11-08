import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const requireFromTest = createRequire(import.meta.url)
const shadcnRequire = createRequire(requireFromTest.resolve('shadcn'))
const pwaRequire = createRequire(requireFromTest.resolve('@ducanh2912/next-pwa'))
const workboxRequire = createRequire(pwaRequire.resolve('workbox-build'))
const rollupRequire = createRequire(workboxRequire.resolve('@rollup/plugin-node-resolve'))

// Exercise the installed copies imported by the CLI and PWA build toolchain.
for (const [entry, merge] of [
  ['shadcn/CJS', shadcnRequire('deepmerge')],
  ['shadcn/UMD', shadcnRequire('deepmerge/dist/umd.js')],
  ['workbox/rollup', rollupRequire('deepmerge')],
] as const) {
  const check = (name: string, run: () => void) => test(`${entry}: ${name}`, run)
  const hostile = () => JSON.parse('{"__proto__":{"securityProbeAdmin":true}}')

  function assertClean(value: Record<string, unknown>) {
    assert.equal(Object.getPrototypeOf(value), Object.prototype)
    assert.equal(value.securityProbeAdmin, undefined)
    assert.equal(Object.hasOwn(value, '__proto__'), false)
    assert.equal(Reflect.get(Object.prototype, 'securityProbeAdmin'), undefined)
  }

  check('null-prototype defaults cannot acquire an attacker-controlled result prototype', () => {
    const target = Object.assign(Object.create(null), { debug: false })
    const result = merge(target, hostile())
    assertClean(result)
    assert.equal(result.debug, false)
    assert.equal(Object.getPrototypeOf(target), null)
  })

  check('null and primitive nested defaults cannot acquire a poisoned prototype', () => {
    for (const placeholder of [null, undefined, false, 0, '']) {
      const result = merge({ session: placeholder }, { session: hostile() })
      assertClean(result.session)
    }
  })

  check('an own __proto__ property on the target is not copied into the result', () => {
    const target = JSON.parse('{"__proto__":{"securityProbeAdmin":true},"debug":false}')
    const result = merge(target, { verbose: true })
    assertClean(result)
    assert.equal(result.debug, false)
    assert.equal(result.verbose, true)
    assert.equal(Object.hasOwn(target, '__proto__'), true, 'merge must not mutate its input')
  })

  check('array-element cloning does not introduce a poisoned prototype', () => {
    const result = merge({ list: [] }, { list: [hostile(), { nested: hostile() }] })
    assertClean(result.list[0])
    assertClean(result.list[1].nested)
  })

  check('shadcn component configuration keeps nested defaults and source precedence', () => {
    const target = { tailwind: { baseColor: 'neutral', cssVariables: true }, aliases: { ui: '@/components/ui' } }
    const source = { tailwind: { baseColor: 'slate' }, registries: { '@example': 'https://example.com/{name}.json' } }
    const result = merge(target, source)
    assert.deepEqual(result, {
      tailwind: { baseColor: 'slate', cssVariables: true }, aliases: { ui: '@/components/ui' },
      registries: { '@example': 'https://example.com/{name}.json' },
    })
    assert.equal(target.tailwind.baseColor, 'neutral')
    assert.notEqual(result.tailwind, target.tailwind)
    assert.notEqual(result.registries, source.registries)
  })

  check('shadcn registry CSS, theme and environment objects merge recursively', () => {
    const result = merge(
      { theme: { fonts: ['Arial'] }, cssVars: { light: { primary: 'green' } }, envVars: { API_URL: 'first' } },
      { theme: { fonts: ['Verdana'] }, cssVars: { light: { secondary: 'gold' }, dark: { primary: 'teal' } }, envVars: { API_URL: 'second' } },
    )
    assert.deepEqual(result, {
      theme: { fonts: ['Arial', 'Verdana'] },
      cssVars: { light: { primary: 'green', secondary: 'gold' }, dark: { primary: 'teal' } },
      envVars: { API_URL: 'second' },
    })
  })

  check('merge.all preserves registry dependency concatenation including duplicates', () => {
    assert.deepEqual(merge.all([['react', 'tailwindcss'], ['react', 'zod']]), ['react', 'tailwindcss', 'react', 'zod'])
    assert.deepEqual(merge.all([]), {})
    assert.deepEqual(merge.all([{ aliases: { ui: 'ui' } }, { aliases: { lib: 'lib' } }]), { aliases: { ui: 'ui', lib: 'lib' } })
  })

  check('shadcn config arrayMerge can replace arrays with the source', () => {
    const source = { theme: { fonts: ['Verdana'] } }
    const result = merge({ theme: { fonts: ['Arial'] } }, source, { arrayMerge: (_target: unknown[], sourceArray: unknown[]) => sourceArray })
    assert.deepEqual(result, source)
    assert.equal(result.theme.fonts, source.theme.fonts)
  })

  check('shadcn config arrayMerge can combine unique entries and receives cloning helpers', () => {
    let receivedHelpers = false
    const result = merge({ plugins: ['first', 'shared'] }, { plugins: ['shared', 'last'] }, {
      arrayMerge(target: unknown[], source: unknown[], options: { isMergeableObject?: unknown; cloneUnlessOtherwiseSpecified?: unknown }) {
        receivedHelpers = typeof options.isMergeableObject === 'function' && typeof options.cloneUnlessOtherwiseSpecified === 'function'
        return [...new Set([...target, ...source])]
      },
    })
    assert.deepEqual(result, { plugins: ['first', 'shared', 'last'] })
    assert.equal(receivedHelpers, true)
  })
}
