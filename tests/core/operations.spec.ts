import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parser';
import {
  addColumn,
  addRow,
  addVariable,
  deleteVariable,
  getVariable,
  removeColumn,
  removeRow,
  renameColumn,
  renameVariable,
  setCell,
} from '../../src/core/operations';
import type { FileModel } from '../../src/core/model';

const modelOf = (src: string): FileModel => {
  const { model } = parse(src);
  if (!model) throw new Error('expected valid model');
  return model;
};

describe('operations — variáveis', () => {
  it('addVariable cria variável vazia (0×0)', () => {
    const m = addVariable(modelOf(''), 'foo');
    const v = getVariable(m, 'foo');
    expect(v).not.toBeNull();
    expect(v?.schema).toEqual([]);
    expect(v?.rows).toEqual([]);
  });

  it('addVariable nova vai pro fim (R6.3)', () => {
    const m = addVariable(modelOf('a = []\nb = []\n'), 'c');
    expect(m.variables.map((v) => v.name)).toEqual(['a', 'b', 'c']);
  });

  it('addVariable falha se nome já existe', () => {
    expect(() => addVariable(modelOf('foo = []\n'), 'foo')).toThrow();
  });

  it('addVariable falha se nome não é identificador Python', () => {
    expect(() => addVariable(modelOf(''), '1foo')).toThrow();
    expect(() => addVariable(modelOf(''), 'with space')).toThrow();
  });

  it('deleteVariable remove a variável', () => {
    const m = deleteVariable(modelOf('a = []\nb = []\n'), 'a');
    expect(m.variables.map((v) => v.name)).toEqual(['b']);
  });

  it('deleteVariable falha se nome não existe', () => {
    expect(() => deleteVariable(modelOf(''), 'ghost')).toThrow();
  });

  it('renameVariable renomeia preservando posição', () => {
    const m = renameVariable(modelOf('a = []\nb = []\n'), 'a', 'z');
    expect(m.variables.map((v) => v.name)).toEqual(['z', 'b']);
  });

  it('renameVariable falha em colisão', () => {
    expect(() => renameVariable(modelOf('a = []\nb = []\n'), 'a', 'b')).toThrow();
  });
});

describe('operations — colunas (R4.5–R4.7)', () => {
  it('R4.5 — addColumn em var com linhas adiciona None em todos dicts', () => {
    const m = addColumn(modelOf('var = [{"a": 1}, {"a": 2}]\n'), 'var', 'b');
    const v = getVariable(m, 'var');
    expect(v?.schema).toEqual(['a', 'b']);
    expect(v?.rows[0]?.[1]?.source).toBe('None');
    expect(v?.rows[1]?.[1]?.source).toBe('None');
  });

  it('R4.5 — addColumn em var vazia 0×0 cria coluna no schema', () => {
    const m = addColumn(modelOf('var = []\n'), 'var', 'a');
    const v = getVariable(m, 'var');
    expect(v?.schema).toEqual(['a']);
    expect(v?.rows).toEqual([]);
  });

  it('R4.5 — addColumn falha se coluna já existe', () => {
    expect(() => addColumn(modelOf('var = [{"a": 1}]\n'), 'var', 'a')).toThrow();
  });

  it('R4.6 — removeColumn remove a chave de todos dicts', () => {
    const m = removeColumn(modelOf('var = [{"a": 1, "b": 2}]\n'), 'var', 'a');
    const v = getVariable(m, 'var');
    expect(v?.schema).toEqual(['b']);
    expect(v?.rows[0]).toHaveLength(1);
  });

  it('R4.6 — removeColumn falha se coluna não existe', () => {
    expect(() => removeColumn(modelOf('var = [{"a": 1}]\n'), 'var', 'b')).toThrow();
  });

  it('R4.7 — renameColumn preserva posição e valores', () => {
    const m = renameColumn(modelOf('var = [{"a": 1, "b": 2}]\n'), 'var', 'a', 'z');
    const v = getVariable(m, 'var');
    expect(v?.schema).toEqual(['z', 'b']);
    expect(v?.rows[0]?.[0]?.source).toBe('1');
  });

  it('R4.7 — renameColumn falha se destino já existe', () => {
    expect(() => renameColumn(modelOf('var = [{"a": 1, "b": 2}]\n'), 'var', 'a', 'b')).toThrow();
  });
});

describe('operations — linhas', () => {
  it('addRow adiciona linha com None em cada coluna (R5.4)', () => {
    const m = addRow(modelOf('var = [{"a": 1, "b": 2}]\n'), 'var');
    const v = getVariable(m, 'var');
    expect(v?.rows).toHaveLength(2);
    expect(v?.rows[1]?.map((c) => c.source)).toEqual(['None', 'None']);
  });

  it('R4.8 — addRow em var com 0 colunas falha (gate)', () => {
    expect(() => addRow(modelOf('var = []\n'), 'var')).toThrow(/R4\.8/);
  });

  it('addRow em var com schema mas 0 linhas funciona', () => {
    const m = addRow(modelOf('var = []  # tpy:cols=["a","b"]\n'), 'var');
    const v = getVariable(m, 'var');
    expect(v?.rows).toHaveLength(1);
    expect(v?.rows[0]?.map((c) => c.source)).toEqual(['None', 'None']);
  });

  it('removeRow remove a linha pelo índice', () => {
    const m = removeRow(modelOf('var = [{"a": 1}, {"a": 2}]\n'), 'var', 0);
    const v = getVariable(m, 'var');
    expect(v?.rows).toHaveLength(1);
    expect(v?.rows[0]?.[0]?.source).toBe('2');
  });

  it('removeRow falha em índice inválido', () => {
    expect(() => removeRow(modelOf('var = [{"a": 1}]\n'), 'var', 5)).toThrow();
  });
});

describe('operations — setCell (R5.2/R5.3)', () => {
  it('atualiza source da célula verbatim', () => {
    const m = setCell(modelOf('var = [{"a": 1}]\n'), 'var', 0, 'a', '42');
    expect(getVariable(m, 'var')?.rows[0]?.[0]?.source).toBe('42');
  });

  it('aceita expressão Python complexa', () => {
    const m = setCell(modelOf('var = [{"a": 1}]\n'), 'var', 0, 'a', 'pd.Timestamp("2024-01-01")');
    expect(getVariable(m, 'var')?.rows[0]?.[0]?.source).toBe('pd.Timestamp("2024-01-01")');
  });

  it('R5.2 — rejeita expressão sintaticamente inválida', () => {
    expect(() => setCell(modelOf('var = [{"a": 1}]\n'), 'var', 0, 'a', '1 +')).toThrow(/R5\.2/);
  });

  it('rejeita coluna inexistente', () => {
    expect(() => setCell(modelOf('var = [{"a": 1}]\n'), 'var', 0, 'b', '1')).toThrow();
  });

  it('rejeita linha inexistente', () => {
    expect(() => setCell(modelOf('var = [{"a": 1}]\n'), 'var', 5, 'a', '1')).toThrow();
  });
});
