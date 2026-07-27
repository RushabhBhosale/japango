import type * as SQLite from 'expo-sqlite';

export type SqlValue = string | number | null;

// Keep statements comfortably below SQLite and bridge-size limits while still
// avoiding one native round trip per authored row.
const maximumSqlBatchLength = 350_000;

export function sqlLiteral(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A database batch contains a non-finite number.');
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export async function insertSqlRows(
  database: SQLite.SQLiteDatabase,
  statement: string,
  rows: readonly (readonly SqlValue[])[],
  suffix = '',
): Promise<void> {
  if (!rows.length) return;
  let tuples: string[] = [];
  let length = statement.length + suffix.length + 2;
  const flush = async (): Promise<void> => {
    if (!tuples.length) return;
    await database.execAsync(`${statement}\n${tuples.join(',\n')}\n${suffix};`);
    tuples = [];
    length = statement.length + suffix.length + 2;
  };

  for (const row of rows) {
    const tuple = `(${row.map(sqlLiteral).join(', ')})`;
    if (tuples.length && length + tuple.length + 2 > maximumSqlBatchLength) await flush();
    tuples.push(tuple);
    length += tuple.length + 2;
  }
  await flush();
}
