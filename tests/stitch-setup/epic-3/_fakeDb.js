'use strict';
// Supabase giả tối thiểu cho test lớp server F2 (không phải file test): from(table).select().eq().in().neq().order()
// .limit().maybeSingle() / update(payload)…select().maybeSingle(). Ghi lại mọi truy vấn để test kiểm scope + cột.

function fakeDb(tables = {}) {
  const log = [];
  const data = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  function from(table) {
    const query = { table, select: null, filters: [], update: null, single: false, limit: null };
    log.push(query);
    const match = (row) => query.filters.every(([op, field, value]) => {
      if (op === 'eq') return String(row[field]) === String(value);
      if (op === 'neq') return String(row[field]) !== String(value);
      if (op === 'in') return value.map(String).includes(String(row[field]));
      return true;
    });
    const run = () => {
      let rows = (data[table] || []).filter(match);
      if (query.update) {
        rows.forEach((row) => Object.assign(row, query.update));
        rows = rows.map((row) => ({ ...row }));
      }
      if (query.limit != null) rows = rows.slice(0, query.limit);
      return { data: query.single ? rows[0] || null : rows, error: null };
    };
    const builder = {
      select(columns) { query.select = columns; return builder; },
      update(payload) { query.update = payload; return builder; },
      eq(field, value) { query.filters.push(['eq', field, value]); return builder; },
      neq(field, value) { query.filters.push(['neq', field, value]); return builder; },
      in(field, value) { query.filters.push(['in', field, value]); return builder; },
      order() { return builder; },
      limit(n) { query.limit = n; return builder; },
      maybeSingle() { query.single = true; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  }
  return { from, log, data };
}

const has = (query, op, field) => query.filters.some(([o, f]) => o === op && f === field);

module.exports = { fakeDb, has };
