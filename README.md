# @iarna/pg

A wrapper around `pg` providing convenience methods, an appropriate SQL
template string function, easy access to cursor based streaming results
(thanks to `pg-query-stream`) and a reasonable, retrying, transaction
interface.

## CONSTRUCTION

Databases always use instances of Pool.

```js
const { PG, sql } = require('@iarna/pg')

const pg = new PG({connectionString: 'postgresql://...'})
const row = pg.get(sql`SELECT * FROM example WHERE id=${23}`)
```

### pg.end()

Closes all connections and disables the pool.  Further queries will be an
error.

## QUERY METHODS

All query methods either take a query produced by the `sql` template string
function, or an SQL string, followed by an array of values to use as values
for  bound parameters.

If any of the queries encounter an error, the resulting error object will
have the SQL and bound parameters in the `sql` and `binds` properties
respectively.

### sql`SQL QUERY HERE` -> Query

The SQL template strings replace values as follows:

* Nulls and undefined values are replaced with `NULL`
* Plain values are replaced with a placeholder, eg `$1`
* Arrays are replaced with a parenthisized list with placeholders for each value, eg `($1, $2, $3)`
* Objects are replaced with comma separated key=value pairs.  Object values
  of NULL will be `key=NULL` (and are thus unsuitable for queries). Object values that are arrays
  are replaced with `key IN ($1, $2, $3)`. All other object values are bound as `key=$1`.

### pg.run(query) -> Promise(rowCount)

Execute a query for which you don't need any results.

### pg.value(query) -> Promise(value)

Execute a query and return the value of the first column of the first row. As a rule, your query should only have one column and row.

### pg.get(query) -> Promise(row)

Execute a query and return the first row. As a rule, your query should only return one row.

### pg.all(query) -> Promise(Array(row))

Execute a query and return an array of all of the matching rows.

### pg.iterate(query) -> FunStream

Execute a query and return a stream of rows.  As a `funstream`, it is an
ordinary Node stream, but it also has Array-type functions like `.map`,
`.filter`, etc.

## TRANSACTION METHODS

All transaction methods work the same under the hood:

They create a dedicated connection for the transaction

### pg.serial(todo[, commit, rollback]) -> Promise(todoResult)
### pg.committed(todo[, commit, rollback]) -> Promise(todoResult)
### pg.repeatable(todo[, commit, rollback]) -> Promise(todoResult)
### pg.readonly(todo[, commit, rollback]) -> Promise(todoResult)

`todo`, `commit` and `rollback` are all functions that may return promises
or act synchronously.  `commit` and `rollback` are there to take actions in
Node.js needed to make either commit or rollback the actions taken in the
transaction.  They are NOT for doing database things in.  Most of the time
you don't need them.  You only need them if you want to mutate Node.js
datastructures in your transaction.

Runs the function `todo(client)` in a transaction of the specified isolation
level:

* serial - SERIALIZABLE
* committed - READ COMMITTED
* repeatable - REPEATABLE READ
* readonly - REPEATABLE READ READ ONLY

All actions within the transaction must be on the provided client, not the
object that you created the transaction on.

If `todo` succeeds, then the transaction is committed and `commit()` is run
before finally returning the value that `todo` returned.

If `todo` fails, then the transaction is rolled back and `rollback()` is run
before finally throwing the error.

If the transaction fails due to an error that may be retriable (eg, a
deadlock) then it will be retried up to 10 times.  The system will sleep a
random amount of time between 1ms and 1000ms between each attempt.

## WHY THIS?

Everyone seems to need to write one of these, myself included. 
