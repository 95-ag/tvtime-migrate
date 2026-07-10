// RFC-4180 CSV parser — comma-in-title safe (see lessons.md: never split TV Time CSVs on commas).
// parseCsv(text) -> string[][]  (array of rows; row 0 is the header). Honors quotes,
// escaped double-quotes (""), and quoted newlines (multi-line records).

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore — handled at the \n
    } else {
      field += c;
    }
  }
  // flush trailing field/row if the file has no final newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Convenience: parse into objects keyed by header. Duplicate/blank trailing cells preserved.
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? '';
    return obj;
  });
}
