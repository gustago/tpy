import type { CellValue, FileModel, HeaderItem, Variable } from './model';

const LINE_LENGTH = 88;
const INDENT = '    ';

export function serialize(model: FileModel): string {
  let out = '';
  out += renderHeader(model.header);
  for (const v of model.variables) {
    out += renderVariable(v);
  }
  out += renderHeader(model.trailer);
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

function renderHeader(items: HeaderItem[]): string {
  let out = '';
  for (const item of items) {
    switch (item.kind) {
      case 'docstring':
        out += item.source + '\n';
        break;
      case 'import':
        out += item.source + '\n';
        break;
      case 'comment':
        out += item.source + '\n';
        break;
      case 'blank':
        out += '\n';
        break;
    }
  }
  return out;
}

function renderVariable(v: Variable): string {
  let out = '';
  for (const c of v.leadingComments) out += c + '\n';
  const annotation = v.annotation ?? '';
  out += `${v.name}${annotation} = ${renderListBody(v)}\n`;
  return out;
}

function renderListBody(v: Variable): string {
  if (v.rows.length === 0) {
    if (v.schema.length === 0) return '[]';
    const cols = v.schema.map((c) => JSON.stringify(c)).join(',');
    return `[]  # tpy:cols=[${cols}]`;
  }
  const lines: string[] = ['['];
  for (const row of v.rows) {
    lines.push(renderRow(row, v.schema));
  }
  lines.push(']');
  return lines.join('\n');
}

function renderRow(row: CellValue[], schema: string[]): string {
  const inline = `${INDENT}${renderDictInline(row, schema)},`;
  if (inline.length <= LINE_LENGTH && !rowHasNewline(row)) {
    return inline;
  }
  return renderDictExpanded(row, schema);
}

function renderDictInline(row: CellValue[], schema: string[]): string {
  if (schema.length === 0) return '{}';
  const parts = schema.map((k, i) => `${JSON.stringify(k)}: ${row[i]!.source}`);
  return `{${parts.join(', ')}}`;
}

function renderDictExpanded(row: CellValue[], schema: string[]): string {
  const lines: string[] = [`${INDENT}{`];
  for (let i = 0; i < schema.length; i++) {
    const k = schema[i]!;
    const v = row[i]!.source;
    lines.push(`${INDENT}${INDENT}${JSON.stringify(k)}: ${v},`);
  }
  lines.push(`${INDENT}},`);
  return lines.join('\n');
}

function rowHasNewline(row: CellValue[]): boolean {
  return row.some((v) => v.source.includes('\n'));
}
