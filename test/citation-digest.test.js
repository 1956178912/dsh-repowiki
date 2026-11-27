/**
 * 引用内容指纹：行切片、整文件、非法范围与空文件。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { citationLineSlice, citationDigest } from '../src/citation-digest.js'
import { digestText } from '../src/util.js'

test('citationLineSlice：1-based 闭区间与结尾换行语义', () => {
  const text = 'a\nb\nc\n'
  assert.equal(citationLineSlice(text, 1, 1), 'a')
  assert.equal(citationLineSlice(text, 2, 3), 'b\nc')
  assert.equal(citationLineSlice(text, 3), 'c')
  assert.equal(citationLineSlice('a\nb', 2, 2), 'b')
  assert.equal(citationLineSlice('', 1), null)
  assert.equal(citationLineSlice(text, 0, 1), null)
  assert.equal(citationLineSlice(text, 3, 2), null)
  assert.equal(citationLineSlice(text, 2, 4), null, '结尾换行不额外产生第 4 行')
  assert.equal(citationLineSlice(text, 5), null)
})

test('citationDigest：范围摘要、整文件摘要与非法范围', () => {
  const text = 'a\nb\nc\n'
  assert.equal(citationDigest(text, 1, 1), digestText('a'))
  assert.equal(citationDigest(text, 2, 3), digestText('b\nc'))
  assert.equal(citationDigest(text), digestText(text), '无行号时使用全文')
  assert.equal(citationDigest(text, 2, 9), null)
  assert.equal(citationDigest('', 1, 1), null)
  assert.equal(citationDigest('', undefined, undefined), digestText(''))
})
