'use strict'

module.exports = function sql () {
  const args = Object.assign([], arguments[0])
  const values = [].slice.call(arguments, 1)
  const str = new SQLString(args, values)
  return str.toSQL()
}

class SQLString {
  constructor (args, values) {
    this.args = args
    this.values = values
    this.sql = this.args.shift()
    this.bind = []
    this.bound = 0
  }
  toSQL () {
    while (this.values.length) {
      const value = this.values.shift()
      const arg = this.args.shift()
      this.translate(value)
      this.sql += arg
    }
    return [this.sql, this.bind]
  }
  translate (value) {
    const kind = this.kindOf(value)
    if (kind === 'array') {
      this.bindArray(value)
    } else if (kind === 'undefined') {
      this.bindValue(null)
    } else if (kind === 'object') {
      this.bindObject(value)
    } else {
      this.bindValue(value)
    }
  }
  bindArray (value) {
    const [ctype, cvalue] = this.castType(value)
    const arr = cvalue || value
    this.sql += '('
    let seenFirst = false
    for (let _ of arr) {
      if (seenFirst) {
        this.sql += ', '
      } else {
        seenFirst = true
      }
      this.bindValue(_, ctype)
    }
    this.sql += ')'
  }
  bindObject (value) {
    if (Object.keys(value).length === 1) {
      const key = Object.keys(value)[0].toLowerCase()
      if (key.toLowerCase() === '_') {
        return this.bindWhere(value[key])
      } else {
        const [type] = this.castType(value)
        if (type) return this.bindValue(value)
      }
    }
    return this.bindInsert(value)
  }
  bindValue (value) {
    let [type, castValue] = this.castType(value)
    if (type) value = castValue
    const kind = this.kindOf(value)
    if (kind === 'null' || kind === 'undefined' || (type && value == null)) {
      this.sql += 'NULL'
    } else if (type === 'array') {
      this.sql += `$${++this.bound}::${this.arrayType(value)}[]`
      this.bind.push(value.filter(_ => _ != null))
    } else if (kind === 'array' && type) {
      this.sql += `$${++this.bound}::${type}[]`
      this.bind.push(value.filter(_ => _ != null))
    } else if (kind === 'array') {
      this.sql += `$${++this.bound}::${this.arrayType(value)}[]`
      this.bind.push(value.filter(_ => _ != null))
    } else if (type) {
      this.sql += '$' + (++this.bound) + '::' + type
      this.bind.push(value)
    } else if (kind === 'object') {
      this.sql += `$${++this.bound}::jsonb`
      this.bind.push(value)
    } else {
      this.sql += '$' + (++this.bound)
      this.bind.push(value)
    }
  }
  bindInsert (value) {
    let seenFirst = false
    for (let _ of Object.keys(value)) {
      if (typeof value[_] === 'undefined') continue
      const [ctype, cvalue] = this.castType(value[_])
      if (ctype && typeof cvalue === 'undefined') continue
      if (seenFirst) {
        this.sql += ', '
      } else {
        seenFirst = true
      }
      this.sql += _ + '='
      this.bindValue(value[_])
    }
  }
  bindWhere (value) {
    let seenFirst = false
    this.sql += '('
    for (let _ of Object.keys(value)) {
      const svalue = value[_]
      const skind = this.kindOf(svalue)
      if (skind === 'undefined') continue
      const [ctype, cvalue] = this.castType(svalue)
      if (ctype && typeof cvalue === 'undefined') continue
      if (seenFirst) {
        this.sql += ' AND '
      } else {
        seenFirst = true
      }
      if (Array.isArray(svalue)) {
        this.sql += `${_} IN `
        this.bindArray(svalue)
      } else if (Array.isArray(cvalue)) {
        this.sql += _ + ' @> '
        this.bindValue(svalue)
      } else if (skind === 'null') {
        this.sql += _ + ' IS NULL'
      } else if (!ctype && skind === 'object') {
        this.sql += _ + ' @> '
        this.bindValue(svalue)
      } else {
        this.sql += _ + ' = '
        this.bindValue(svalue)
      }
    }
    this.sql += ')'
  }
  kindOf (aa) {
    if (aa === null) return 'null'
    if (Array.isArray(aa)) return 'array'
    if (Buffer.isBuffer(aa)) return 'buffer'
    if (typeof aa === 'object' && (aa instanceof Date || aa._isAMomentObject)) return 'date'
    /* eslint-disable valid-typeof */ // bigint is too real
    if (typeof aa === 'bigint') return 'number'
    return typeof aa
  }
  castType (value) {
    if (value === null || typeof value !== 'object') return []
    const keys = Object.keys(value)
    if (keys.length !== 1) return []
    if (keys[0].slice(0, 2) === '::' || keys[0].slice(0, 2) === '$$') {
      return [keys[0].slice(2), value[keys[0]]]
    }
    return []
  }
  arrayType (value) {
    const valueType = this.kindOf(value)
    if (valueType === 'array') {
      for (let svalue of value) {
        const type = this.arrayType(svalue)
        if (type) return type
      }
      throw new Error("Can't magically determine array type with no values or all values are null, set it explicitly")
    } else if (valueType === 'object') {
      return 'jsonb'
    } else if (valueType === 'number') {
      return 'numeric'
    } else if (valueType === 'boolean') {
      return 'boolean'
    } else if (valueType === 'buffer') {
      return 'bytea'
    } else if (valueType === 'date') {
      return 'timestamptz'
    } else if (valueType === 'string') {
      return 'text'
    } else if (valueType === 'null' || valueType === 'undefined') {
      /* nothing */
    } else {
      throw new Error(`Can't include ${valueType}s in arrays`)
    }
  }
}
