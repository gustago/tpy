import type { CellValue, FileModel, Variable } from './model';
import { parse } from './parser';

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function isValidExpression(src: string): boolean {
  const trimmed = src.trim();
  if (trimmed === '') return false;
  const wrapped = `__tpy_check__ = [{"_": ${src}}]\n`;
  const result = parse(wrapped);
  if (result.errors.length > 0) return false;
  const last = trimmed[trimmed.length - 1]!;
  if (/[+\-*/%=<>&|^]/.test(last)) return false;
  return true;
}

export function getVariable(model: FileModel, name: string): Variable | null {
  return model.variables.find((v) => v.name === name) ?? null;
}

export function addVariable(model: FileModel, name: string): FileModel {
  if (!isValidIdentifier(name)) {
    throw new Error(`[operations] nome de variável inválido: ${name}`);
  }
  if (getVariable(model, name) !== null) {
    throw new Error(`[operations] variável já existe: ${name}`);
  }
  const newVar: Variable = {
    name,
    annotation: null,
    schema: [],
    rows: [],
    leadingComments: [],
  };
  return { ...model, variables: [...model.variables, newVar] };
}

export function deleteVariable(model: FileModel, name: string): FileModel {
  if (getVariable(model, name) === null) {
    throw new Error(`[operations] variável não existe: ${name}`);
  }
  return { ...model, variables: model.variables.filter((v) => v.name !== name) };
}

export function renameVariable(
  model: FileModel,
  oldName: string,
  newName: string,
): FileModel {
  if (!isValidIdentifier(newName)) {
    throw new Error(`[operations] nome inválido: ${newName}`);
  }
  if (getVariable(model, oldName) === null) {
    throw new Error(`[operations] variável não existe: ${oldName}`);
  }
  if (oldName !== newName && getVariable(model, newName) !== null) {
    throw new Error(`[operations] variável já existe: ${newName}`);
  }
  return {
    ...model,
    variables: model.variables.map((v) =>
      v.name === oldName ? { ...v, name: newName } : v,
    ),
  };
}

function updateVariable(
  model: FileModel,
  varName: string,
  updater: (v: Variable) => Variable,
): FileModel {
  const idx = model.variables.findIndex((v) => v.name === varName);
  if (idx === -1) throw new Error(`[operations] variável não existe: ${varName}`);
  const newVars = [...model.variables];
  newVars[idx] = updater(model.variables[idx]!);
  return { ...model, variables: newVars };
}

export function addColumn(
  model: FileModel,
  varName: string,
  columnName: string,
): FileModel {
  return updateVariable(model, varName, (v) => {
    if (v.schema.includes(columnName)) {
      throw new Error(`[R4.5] coluna já existe: ${columnName}`);
    }
    return {
      ...v,
      schema: [...v.schema, columnName],
      rows: v.rows.map((row) => [...row, { source: 'None' }]),
    };
  });
}

export function removeColumn(
  model: FileModel,
  varName: string,
  columnName: string,
): FileModel {
  return updateVariable(model, varName, (v) => {
    const idx = v.schema.indexOf(columnName);
    if (idx === -1) throw new Error(`[R4.6] coluna não existe: ${columnName}`);
    return {
      ...v,
      schema: v.schema.filter((_, i) => i !== idx),
      rows: v.rows.map((row) => row.filter((_, i) => i !== idx)),
    };
  });
}

export function renameColumn(
  model: FileModel,
  varName: string,
  oldName: string,
  newName: string,
): FileModel {
  return updateVariable(model, varName, (v) => {
    const idx = v.schema.indexOf(oldName);
    if (idx === -1) throw new Error(`[R4.7] coluna não existe: ${oldName}`);
    if (oldName !== newName) {
      if (v.schema.includes(newName)) {
        throw new Error(`[R4.7] coluna destino já existe: ${newName}`);
      }
    }
    const newSchema = [...v.schema];
    newSchema[idx] = newName;
    return { ...v, schema: newSchema };
  });
}

export function addRow(model: FileModel, varName: string): FileModel {
  return updateVariable(model, varName, (v) => {
    if (v.schema.length === 0) {
      throw new Error(`[R4.8] não é possível adicionar linha em variável sem colunas`);
    }
    const newRow: CellValue[] = v.schema.map(() => ({ source: 'None' }));
    return { ...v, rows: [...v.rows, newRow] };
  });
}

export function removeRow(
  model: FileModel,
  varName: string,
  rowIdx: number,
): FileModel {
  return updateVariable(model, varName, (v) => {
    if (rowIdx < 0 || rowIdx >= v.rows.length) {
      throw new Error(`[operations] índice de linha inválido: ${rowIdx}`);
    }
    return { ...v, rows: v.rows.filter((_, i) => i !== rowIdx) };
  });
}

export function setCell(
  model: FileModel,
  varName: string,
  rowIdx: number,
  columnName: string,
  expressionSource: string,
): FileModel {
  return updateVariable(model, varName, (v) => {
    const colIdx = v.schema.indexOf(columnName);
    if (colIdx === -1) throw new Error(`[operations] coluna não existe: ${columnName}`);
    if (rowIdx < 0 || rowIdx >= v.rows.length) {
      throw new Error(`[operations] índice de linha inválido: ${rowIdx}`);
    }
    if (!isValidExpression(expressionSource)) {
      throw new Error(`[R5.2] expressão Python inválida: ${expressionSource}`);
    }
    const newRows = v.rows.map((row, i) => {
      if (i !== rowIdx) return row;
      const newRow = [...row];
      newRow[colIdx] = { source: expressionSource };
      return newRow;
    });
    return { ...v, rows: newRows };
  });
}
