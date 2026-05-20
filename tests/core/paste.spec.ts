import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parser';
import { applyPaste, parseTsv, toPythonStringLiteral } from '../../src/core/paste';
import { getVariable } from '../../src/core/operations';
import type { FileModel } from '../../src/core/model';

const modelOf = (src: string): FileModel => {
  const { model } = parse(src);
  if (!model) throw new Error('expected valid model');
  return model;
};

describe('paste.parseTsv — R9.1', () => {
  it('parseia TSV simples com LF', () => {
    expect(parseTsv('a\tb\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('aceita CRLF', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserva células vazias', () => {
    expect(parseTsv('a\t\tb\n')).toEqual([['a', '', 'b']]);
  });

  it('não inclui última linha vazia', () => {
    expect(parseTsv('a\n')).toEqual([['a']]);
  });

  it('linha sem trailing newline', () => {
    expect(parseTsv('a\tb')).toEqual([['a', 'b']]);
  });
});

describe('paste.toPythonStringLiteral — R9.2/R9.3', () => {
  it('valor simples vira aspas duplas', () => {
    expect(toPythonStringLiteral('hello')).toBe('"hello"');
  });

  it('escapa aspas duplas', () => {
    expect(toPythonStringLiteral('she said "hi"')).toBe('"she said \\"hi\\""');
  });

  it('escapa backslash', () => {
    expect(toPythonStringLiteral('a\\b')).toBe('"a\\\\b"');
  });

  it('escapa newline', () => {
    expect(toPythonStringLiteral('line1\nline2')).toBe('"line1\\nline2"');
  });

  it('escapa carriage return', () => {
    expect(toPythonStringLiteral('a\rb')).toBe('"a\\rb"');
  });

  it('escapa tab', () => {
    expect(toPythonStringLiteral('a\tb')).toBe('"a\\tb"');
  });

  it('vazio vira ""', () => {
    expect(toPythonStringLiteral('')).toBe('""');
  });
});

describe('paste.applyPaste — R9.4/R9.5/R9.6', () => {
  it('R9.4 — paste expande linhas e colunas se exceder range', () => {
    const m = modelOf('var = [{"a": "x"}]\n');
    const out = applyPaste(m, 'var', 0, 0, [
      ['1', '2'],
      ['3', '4'],
    ]);
    const v = getVariable(out, 'var');
    expect(v?.schema).toEqual(['a', 'col_2']);
    expect(v?.rows).toHaveLength(2);
    expect(v?.rows[0]?.map((c) => c.source)).toEqual(['"1"', '"2"']);
    expect(v?.rows[1]?.map((c) => c.source)).toEqual(['"3"', '"4"']);
  });

  it('R9.5 — paste em variável 0×0 cria colunas e linhas', () => {
    const m = modelOf('var = []\n');
    const out = applyPaste(m, 'var', 0, 0, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const v = getVariable(out, 'var');
    expect(v?.schema).toEqual(['col_1', 'col_2']);
    expect(v?.rows[0]?.map((c) => c.source)).toEqual(['"a"', '"b"']);
  });

  it('R9.6 — paste em variável 0 linhas × N colunas usa schema existente', () => {
    const m = modelOf('var = []  # tpy:cols=["x","y"]\n');
    const out = applyPaste(m, 'var', 0, 0, [['1', '2']]);
    const v = getVariable(out, 'var');
    expect(v?.schema).toEqual(['x', 'y']);
    expect(v?.rows[0]?.map((c) => c.source)).toEqual(['"1"', '"2"']);
  });

  it('R9.6 — paste mais largo que schema existente expande à direita', () => {
    const m = modelOf('var = []  # tpy:cols=["x"]\n');
    const out = applyPaste(m, 'var', 0, 0, [['1', '2', '3']]);
    const v = getVariable(out, 'var');
    expect(v?.schema).toEqual(['x', 'col_2', 'col_3']);
  });
});
