'use strict'
function kindOf (aa) {
  if (aa === null) return 'null'
  if (Array.isArray(aa)) return 'array'
  if (Buffer.isBuffer(aa)) return 'buffer'
  if (typeof aa === 'object' && (aa instanceof Date || aa._isAMomentObject)) return 'date'
  if (typeof aa === 'bigint') return 'number'
  
  return typeof aa
}

module.exports = function sql () {
  const args = Object.assign([], arguments[0])
  const values = [].slice.call(arguments, 1)
  let sql = args.shift()
  let bind = []
  let bound = 0
  while (values.length) {
    const value = values.shift()
    const arg = args.shift()
    const valueType = kindOf(value)
    if (valueType === 'array') {
      sql += '(' + value.map((_, ii) => `$${++bound}`).join(', ') + ')' + arg
      bind.push.apply(bind, value)
    } else if (valueType === 'object') {
      const values = []
      sql += Object.keys(value).map(_ => {
        const svalue = value[_]
        if (Array.isArray(svalue)) {
          values.push.apply(values, svalue)
          return `${_} IN (` + svalue.map(_ => `$${++bound}`).join(', ') + ')'
        } else if (svalue == null) {
          return `${_}=NULL`
        } else {
          values.push(svalue)
          return `${_}=$${++bound}`
        }
      }).join(', ') + arg
      bind.push.apply(bind, values)
    } else if (valueType === 'null' || valueType === 'undefined') {
      sql += 'NULL' + arg
    } else {
      sql += `$${++bound}` + arg
      bind.push(value)
    }
  }
  return [sql, bind]
}
