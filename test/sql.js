'use strict'
const test = require('tap').test
const sql = require('../sql.js')

test('sql', async t => {
  t.isDeeply(sql`SELECT * FROM example WHERE id=${23}`, ['SELECT * FROM example WHERE id=$1', [23]], 'synopsis example')

  t.isDeeply(sql`${null}`, ['NULL', []], 'value: null')
  t.isDeeply(sql`${undefined}`, ['NULL', []], 'value: undefined')

  t.isDeeply(sql`${23}`, ['$1', [23]], 'value: number')
  t.isDeeply(sql`${'abc'}`, ['$1', ['abc']], 'value: string')

  t.isDeeply(sql`${{'::int': 23}}`, ['$1::int', [23]], 'value: cast$$')
  t.isDeeply(sql`${{$$int: 23}}`, ['$1::int', [23]], 'value: cast::')

  t.isDeeply(sql`${[1, 2, 3]}`, ['($1, $2, $3)', [1, 2, 3]], 'array')
  t.isDeeply(sql`${[1, 2, {$$int: 3}]}`, ['($1, $2, $3::int)', [1, 2, 3]], 'array: value cast')

  t.isDeeply(sql`${{$$array: [1, 2, 3]}}`, ['$1::numeric[]', [[1, 2, 3]]], 'array: cast guess')
  t.isDeeply(sql`${{$$text: [1, 2, 3]}}`, ['$1::text[]', [[1, 2, 3]]], 'array: cast')

  t.isDeeply(sql`${{$$jsonb: {a: 1, b: 2}}}`, ['$1::jsonb', [{a: 1, b: 2}]], 'obj: cast')

  t.isDeeply(sql`${{abc: 1, def: 2, ghi: null}}`, ['abc=$1, def=$2, ghi=NULL', [1, 2]], 'obj')

  t.isDeeply(sql`${{abc: [1, 2, 3]}}`, ['abc=$1::numeric[]', [[1, 2, 3]]], 'obj: array')

  t.isDeeply(sql`${{abc: {$$int: [1, 2, 3]}}}`, ['abc=$1::int[]', [[1, 2, 3]]], 'obj: array cast')

  t.isDeeply(sql`${{_: {a: 23, b: 'abc'}}}`, ['(a = $1 AND b = $2)', [23, 'abc']], 'where: parens and AND')

  t.isDeeply(sql`${{_: {a: null, b: undefined}}}`, ['(a IS NULL)', []], 'where: null & undefined')

  t.isDeeply(sql`${{_: {a: [1, 2, 3]}}}`, ['(a IN ($1, $2, $3))', [1, 2, 3]], 'where: array')

  t.isDeeply(sql`${{_: {a: {b: 1, c: 2}}}}`, ['(a @> $1::jsonb)', [{b: 1, c: 2}]], 'where: obj value')

  t.isDeeply(sql`${{_: {a: {$$int: [1, 2, 3]}}}}`, [ '(a @> $1::int[])', [[1, 2, 3]] ], 'where: cast array')

  t.isDeeply(sql`${{$$int: undefined}}`, ['NULL', []], 'value: cast undefined')
  t.isDeeply(sql`${{a: 23, b: {$$int: undefined}}}`, ['a=$1', [23]], 'obj: cast undefined')

  t.isDeeply(sql`${{a: [null, 'abc']}}`, ['a=$1::text[]', [['abc']]], 'arr: null stripping')
  const dt = new Date()
  t.isDeeply(sql`${{a: [dt]}}`, ['a=$1::timestamptz[]', [[dt]]], 'arr: date type detection')
  const b = Buffer.from('example')
  t.isDeeply(sql`${{a: [b]}}`, ['a=$1::bytea[]', [[b]]], 'arr: buffer type detection')
  t.isDeeply(sql`${{a: [true]}}`, ['a=$1::boolean[]', [[true]]], 'arr: boolean type detection')
  const o = {}
  t.isDeeply(sql`${{a: [o]}}`, ['a=$1::jsonb[]', [[o]]], 'arr: boolean type detection')
  t.isDeeply(sql`${{$$int: [23]}}`, ['$1::int[]', [[23]]], 'arr: typed plain value')

  t.isDeeply(sql`${{a: true, b: undefined}}`, ['a=$1', [true]], 'obj: untyped undef trimming')
  t.isDeeply(sql`${{_: {a: true, b: {$$int: undefined}}}}`, ['(a = $1)', [true]], 'where: typed undef trimming')

  /* eslint-disable no-undef */ // bigint is a thing, I swear =p
  t.isDeeply(sql`${BigInt(18)}`, ['$1', [BigInt(18)]], 'bigints')

  t.throws(() => sql`${{$$array: [Symbol('test')]}}`, 'no symbols')
  t.throws(() => sql`${{a: []}}`, 'empty arrays')
})
