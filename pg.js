'use strict'
const { Pool } = require('pg')
const QueryStream = require('pg-query-stream')
const fun = require('funstream')

const PG_INTEGRITY_CONSTRAINT_VIOLATION = '23000'
const PG_RESTRICT_VIOLATION = '23001'
const PG_FOREIGN_KEY_VIOLATION = '23503'
const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
const PG_EXCULSION_VIOLATION = '23P01'
const PG_SERIALIZATION_FAILURE = '40001'
const PG_TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION = '40002'
const PG_DEADLOCK_DETECTED = '40P01'

const retriable = [
  PG_INTEGRITY_CONSTRAINT_VIOLATION,
  PG_RESTRICT_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  PG_CHECK_VIOLATION,
  PG_EXCULSION_VIOLATION,
  PG_SERIALIZATION_FAILURE,
  PG_TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION,
  PG_DEADLOCK_DETECTED
]

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function addSQLToError (ex, sql, binds) {
  const err = new Error(ex.message)
  err.code = ex.code
  for (let key in ex) {
    if (key !== 'message') err[key] = ex[key]
  }
  err.sql = sql
  err.binds = binds
  Error.captureStackTrace(err, addSQLToError)
  return err
}

function mergeErrors (err1, err2) {
  const err = new Error(err1.message + '\n' + err2.message)
  err.code = err1.code || err2.code
  for (let key in err1) {
    if (key !== 'message') err[key] = err1[key]
  }
  if (!err.errors) err.errors = [err1]
  err.errors.push(err2)
  
  Error.captureStackTrace(err, mergeErrors)
}

class PG {
  constructor (opts = {}) {
    this.db = opts.db || new Pool(opts)
    this.inTxn = false
  }
  end () { return this.db.end() }

  async run (sql, binds) {
    try {   
      if (Array.isArray(sql)) [sql, binds] = sql
      const result = await this.db.query({text: sql, values: binds, rowMode: 'array'})
      return result.rowCount
    } catch (ex) {
      throw addSQLToError(ex, sql, binds)
    }
  }
  async value (sql, binds) {
    try {   
      if (Array.isArray(sql)) [sql, binds] = sql
      const result = await this.db.query({text: sql, values: binds, rowMode: 'array'})
      return result.rows.length && result.rows[0][0]
    } catch (ex) {
      throw addSQLToError(ex, sql, binds)
    }
  }
  async get (sql, binds) {
    try {   
      if (Array.isArray(sql)) [sql, binds] = sql
      const result = await this.db.query(sql, binds)
      return result.rows.length && result.rows[0]
    } catch (ex) {
      throw addSQLToError(ex, sql, binds)
    }
  }
  async all (sql, binds) {
    try {   
      if (Array.isArray(sql)) [sql, binds] = sql
      const result = await this.db.query(sql, binds)
      return result.rows
    } catch (ex) {
      throw addSQLToError(ex, sql, binds)
    }
  }
  iterate (sql, binds) {
    try {   
      if (Array.isArray(sql)) [sql, binds] = sql
      const query = new QueryStream(sql, binds)
      if (this.inTxn) {
        return fun(this.db.query(query))
      } else {
        const result = fun()
        this.db.connect().then(client => {
          client.query(query).on('end', client.release).pipe(result)
        }).catch(err => result.emit('error', err))
        return result
      }
    } catch (ex) {
      throw addSQLToError(ex, sql, binds)
    }
  }

  serial (todo, commit, rollback) {
    return this._transact('SERIALIZABLE', todo)
  }
  committed (todo, commit, rollback) {
    return this._transact('READ COMITTED', todo)
  }
  repeatable (todo, commit, rollback) {
    return this._transact('REPEATABLE READ', todo)
  }
  readonly (todo, commit, rollback) {
    return this._transact('REPEATABLE READ READ ONLY', todo)
  }

  async _BEGIN (level) {
    if (this.inTxn) throw new Error("Can't nest transactions")
    await this.db.query('BEGIN')
    if (level) await this.db.query(`SET TRANSACTION ISOLATION LEVEL ${level}`)
    this.inTxn = true
  }
  async _COMMIT () {
    if (!this.inTxn) throw new Error("Can't COMMIT outside transaction")
    await this.db.query('COMMIT')
    this.inTxn = false
  }
  async _ROLLBACK () {
    if (!this.inTxn) throw new Error("Can't ROLLBACK outside transaction")
    await this.db.query('ROLLBACK')
    this.inTxn = false
  }

  async _transact (level, todo, commit, rollback, tries) {
    if (this.inTxn) throw new Error("Can't nest transactions")

    if (!tries) tries = 0
    const client = new PG({db: await this.db.connect()})
    let result
    try {
      await client._BEGIN(level)
      result = await todo(client)
      await client._COMMIT()
    } catch (err) {
      try {
        await client._ROLLBACK()
        client.db.release()
      } catch (rerr) {
        client.db.release(true)
        err = mergeErrors(err, rerr)
      }
      if (rollback) await rollback().catch(rerr => { err = mergeErrors(err, rerr) })
      if (retriable.includes(err.code) && tries < 10) {
        await sleep(Math.floor(Math.random() * 1000))
        return this._transact(level, todo, commit, rollback, tries + 1)
      } else {
        throw err
      }
    }
    client.db.release()
    if (commit) await commit()
    return result
  }
}

module.exports = PG
