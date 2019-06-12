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
for  bound parameters.  That is to say the all accept the following function
signatures: `([SQL, BoundParams])` or `(SQL, BoundParams)`.

If any of the queries encounter an error, the resulting error object will
have the SQL and bound parameters in the `sql` and `binds` properties
respectively.

### sql\`SQL QUERY HERE\` -> [SQL, BoundParams]

The SQL template strings replace values as follows:

* Nulls and undefined values are replaced with `NULL`
  ```
  sql`${null}` -> [NULL, []]
  sql`${undefined}` -> [NULL, []]
  ```
* Plain values are replaced with a placeholder, eg `$1` and bound, eg
  ```
  sql`${23}` -> ['$1', [23]]
  sql`${'abc'}` -> ['$1', ['abc']]
  ```
* You can explicitly cast a value by passing in an object with a key of
  `::type` or `$$type`.  eg
  ```
  sql`${{'::int': 23}}` -> ['$1::int', [23]]
  sql`${{$$int: 23}} -> ['$1::int', [23]]
  ```
* Arrays are replaced with a parenthisized list with placeholders for each value, eg
  ```
  sql`${[1,2,3]}` -> ['($1, $2, $3)', [1, 2, 3]]
  ```
  Individual values of the arrays may be cast, eg:
  ```
  sql`${[1,2,{$$int: 3}]}` -> ['($1, $2, $3::int)', [1, 2, 3]]
  ```
* If you want a postgres array type, you can get them by explicitly casting, either to
  a concrete type, or to `array` where it will be guessed from your data.
  ```
  sql`${{$$array:[1,2,3]}}` -> ['$1::numeric[]', [[1,2,3]]]
  sql`${{$$text:[1,2,3]}}` -> ['$1::text[]', [[1,2,3]]]
  ```
* Ordinary objects become comma separated key-value pairs, appropriate for
  UPDATE.  Nulls and plain values are the same as with direct values.
  Undefined values are ignored.  eg
  ```
  sql`${{abc: 1, def: 2, ghi: null}}` -> ['abc=$1, def=$2, ghi=NULL', [1, 2]]
  ```
  Array values of objects are always cast to postgres array types, with a
  best guess as to type, eg
  ```
  sql`${{abc: [1, 2, 3]}}` -> ['abc=$1::numeric[]', [[1, 2, 3]]]
  ```
  Or you can explicitly cast the array, and you should if your array might be empty:
  ```
  sql`${{abc: {$$int: [1, 2, 3]}}}` -> ['abc=$1::int[]', [[1, 2, 3]]]
  ```
* And finally, if you want to construct portions of WHERE clauses, an object
  with only a key of `_` and a value of the object to become the where
  clause.  The output is parenthesised and the fields are separated with
  ` AND ` instead of `, `.
  Specific value types differ in:
  * Null values are emitted as `field IS NULL` instead of `field=NULL`
  * Undefined values are ignored instead of being emitted as `field=NULL`.
  * Arrays are emitted as `field IN ($1, $2, $2)`
  * Cast arrays are emitted with a contains-within query, eg `field @> $1::type[]`

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
`.filter`, etc.  `.all` will always be faster, unless you're running out of
memory.

## TRANSACTION METHODS

### pg.serial(todo[, commit, rollback]) -> Promise(todoResult)
### pg.committed(todo[, commit, rollback]) -> Promise(todoResult)
### pg.repeatable(todo[, commit, rollback]) -> Promise(todoResult)
### pg.readonly(todo[, commit, rollback]) -> Promise(todoResult)

Creates a dedicated connection for the transaction and passes that to the
`todo` function.

`todo`, `commit` and `rollback` are all functions that may return promises
or act synchronously.  `commit` and `rollback` are there to take actions in
Node.js needed to make either commit or rollback the actions taken in the
transaction.  They are NOT for doing database things in.  Most of the time
you don't need them.  You only need them if you want to mutate Node.js
data structures in your transaction.

Based on which transaction method you used, it selects an isolation level as
follows:

* serial - SERIALIZABLE
* committed - READ COMMITTED
* repeatable - REPEATABLE READ
* readonly - REPEATABLE READ READ ONLY

All actions within the transaction must be on the provided client, not the
object that you created the transaction on.

If `todo` succeeds, then the transaction is committed and `commit()` is run
before finally returning the value that `todo` returned.

If `todo` fails, then the transaction is rolled back and `rollback()` is run.

If the transaction fails due to an error that may be retriable (eg, a
deadlock) then it will be retried up to 10 times.  The system will sleep a
random amount of time between 1ms and 1000ms between each attempt.

If the transaction fails for any other reason, then the error propagated.

Please note that due to retries, your `todo` and `rollback` methods may be called
several times as retries happen.

## WHY THIS?

Everyone seems to need to write one of these, myself included. 
