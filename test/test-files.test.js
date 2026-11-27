/**
 * 测试文件启发式与受影响测试收集。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTestPath, collectAffectedTests, MAX_AFFECTED_TESTS,
} from '../src/test-files.js'

test('test-files：常见测试路径命中', () => {
  const hits = [
    'src/a.test.ts', 'src/a.spec.js', 'test/a.ts', 'tests/unit/a.ts',
    '__tests__/a.tsx', 'spec/a.rb', 'e2e/login.ts', 'cypress/e2e/x.cy.ts',
    'pkg/test_helper.py', 'pkg/foo_test.go', 'pkg/foo_spec.rb',
    'src/test_utils.py', 'src/FooTest.java', 'src/FooTests.cs',
    'src/FooSpec.scala', 'src/FooTests.swift', 'src/FooIT.java',
    'src\\win\\a.test.js',
    'test/my_app/accounts_test.exs', 'apps/web/test/web/router_test.exs',
    'src/demo_SUITE.erl', 'src/demo_tests.erl', 'R/test-api.R', 'runtests.jl',
    't/basic.t', 't/lib/Helper.pm',
  ]
  for (const path of hits) assert.equal(isTestPath(path), true, path)
})

test('test-files：非测试路径不误判', () => {
  const misses = [
    'src/latest.ts', 'src/contest.js', 'src/testing.ts', 'src/attestation.go',
    'src/testdata/a.go', 'src/tests-utils/a.ts', 'src/Testament.java',
    'src/suite.erl', 'R/api.R', 'src/core.jl', 'lib/My/App.pm',
    'README.md', '', null, undefined,
  ]
  for (const path of misses) assert.equal(isTestPath(path), false, String(path))
})

test('test-files：受影响测试按最小跳数去重排序并截断', () => {
  const result = collectAffectedTests([
    { path: 'b.test.ts', depth: 2 },
    { path: 'a.test.ts', depth: 1 },
    { path: 'src/x.ts', depth: 1 },
    { path: 'a.test.ts', depth: 1 },
    { path: 'z.spec.ts', depth: 2 },
    null,
    { path: 'bad' },
  ])
  assert.deepEqual(result.tests, [
    { path: 'a.test.ts', depth: 1 },
    { path: 'b.test.ts', depth: 2 },
    { path: 'z.spec.ts', depth: 2 },
  ])
  assert.equal(result.truncated, false)

  const capped = collectAffectedTests([
    { path: 'a.test.ts', depth: 1 },
    { path: 'b.test.ts', depth: 1 },
  ], 1)
  assert.deepEqual(capped.tests, [{ path: 'a.test.ts', depth: 1 }])
  assert.equal(capped.truncated, true)
  assert.deepEqual(collectAffectedTests([]), { tests: [], truncated: false })
  assert.equal(MAX_AFFECTED_TESTS, 50)
})
