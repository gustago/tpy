import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parser';
import { serialize } from '../../src/core/serializer';
import {
  addColumn,
  addRow,
  applyPaste as _unusedPaste,
  removeColumn,
  removeRow,
  renameColumn,
  renameVariable,
  setCell,
} from '../../src/core/operations';
import { applyPaste } from '../../src/core/paste';
import {
  completionsAt,
  diagnosticsFor,
  hoverAt,
} from '../../src/core/lsp-logic';
import { RULES } from '../../src/core/rules';
import type { FileModel } from '../../src/core/model';

void _unusedPaste; // tree-shake suppressor

const ok = (src: string): FileModel => {
  const r = parse(src);
  expect(r.errors).toEqual([]);
  expect(r.model).not.toBeNull();
  return r.model!;
};

const fail = (src: string, ruleId: string) => {
  const r = parse(src);
  expect(r.errors.some((e) => e.ruleId === ruleId)).toBe(true);
  expect(r.model).toBeNull();
};

describe('tokenizer — line continuation', () => {
  it('aceita `\\` + newline juntando linhas', () => {
    ok('var \\\n= []\n');
  });
  it('aceita `\\` + CRLF', () => {
    ok('var \\\r\n= []\n');
  });
});

describe('tokenizer — números científicos', () => {
  it('aceita 1e10', () => {
    ok('var = [{"a": 1e10}]\n');
  });
  it('aceita 1e+10', () => {
    ok('var = [{"a": 1e+10}]\n');
  });
  it('aceita 1e-10', () => {
    ok('var = [{"a": 1e-10}]\n');
  });
});

describe('tokenizer — triple-quoted strings', () => {
  it('aceita docstring multi-linha', () => {
    ok('"""line1\nline2\nline3"""\n');
  });
  it('aceita triple string com aspas internas', () => {
    ok('"""text with "quote" inside"""\n');
  });
  it('aceita triple string com escape de barra', () => {
    ok('"""has \\\\backslash"""\n');
  });
  it('rejeita triple string não terminada', () => {
    fail('"""never ends\n', RULES.R2_1);
  });
  it('aceita triple-single quote', () => {
    ok("'''single triple'''\n");
  });
});

describe('tokenizer — single-quoted strings escapes', () => {
  it('decodifica todos os escapes em chave', () => {
    const m = ok('var = [{"a\\nb\\tc\\rd\\\\e\\"f\\\'g\\ah\\bi\\fj\\vk\\0l": 1}]\n');
    expect(m.variables[0]?.schema[0]).toContain('\n');
    expect(m.variables[0]?.schema[0]).toContain('\t');
  });
  it('escape desconhecido preserva literal', () => {
    ok('var = [{"a\\zb": 1}]\n');
  });
  it('raw string ignora escapes', () => {
    ok('var = [{r"a\\nb": 1}]\n');
  });
  it('rejeita string single-line não terminada com newline', () => {
    fail('var = "abc\n', RULES.R2_1);
  });
  it('rejeita string single-line não terminada com EOF', () => {
    fail('var = "abc', RULES.R2_1);
  });
  it('rejeita triple string com escape no final do source (EOF)', () => {
    fail('var = """abc\\', RULES.R2_1);
  });
});

describe('tokenizer — operadores multi-char', () => {
  it('valor com == e != etc', () => {
    ok('var = [{"a": (1 == 2), "b": (1 != 2), "c": (1 <= 2), "d": (1 >= 2)}]\n');
  });
  it('valor com **, //, <<, >>, ->', () => {
    ok('var = [{"a": 2 ** 3, "b": 5 // 2, "c": 1 << 2, "d": 8 >> 1}]\n');
  });
  it('valor com := walrus', () => {
    ok('var = [{"a": (n := 10)}]\n');
  });
  it('valor com aug-assign-style operadores em expressões válidas', () => {
    ok('var = [{"a": [1, 2, 3, ...]}]\n');
  });
  it('rejeita aug-assign no toplevel', () => {
    fail('x **= 2\n', RULES.R2_2);
  });
});

describe('parser — dict edge cases', () => {
  it('rejeita entrada de dict sem `:`', () => {
    fail('var = [{"a"}]\n', RULES.R3_5);
  });
  it('rejeita valor vazio em dict', () => {
    fail('var = [{"a":}]\n', RULES.R3_7);
  });
  it('rejeita chave vazia em dict (`:value`)', () => {
    fail('var = [{: 1}]\n', RULES.R3_5);
  });
  it('rejeita ** unpack em dict', () => {
    fail('var = [{**other}]\n', RULES.R3_3);
  });
  it('rejeita dict comprehension', () => {
    fail('var = [{k: 1 for k in []}]\n', RULES.R3_3);
  });
  it('rejeita bracket fechando sem abrir', () => {
    fail('var = [{"a": 1}])\n', RULES.R2_1);
  });
  it('aceita lista com dict vazio (1 linha × 0 colunas)', () => {
    const m = ok('var = [{}]\n');
    expect(m.variables[0]?.schema).toEqual([]);
    expect(m.variables[0]?.rows).toHaveLength(1);
  });
  it('serializa dict vazio inline', () => {
    const out = serialize(ok('var = [{}]\n'));
    expect(out).toContain('{},');
  });
});

describe('parser — imports após variável', () => {
  it('rejeita import depois da primeira variável', () => {
    fail('var = []\nimport pandas\n', RULES.R2_2);
  });
});

describe('parser — RHS com sufixo (lista não isolada)', () => {
  it('rejeita `var = [].extra`', () => {
    fail('var = [].extra\n', RULES.R3_1);
  });
});

describe('serializer — comentário no trailer', () => {
  it('preserva comentário após última variável', () => {
    const out = serialize(ok('var = []\n# trailing comment\n'));
    expect(out).toContain('# trailing comment');
  });

  it('round-trip estável com múltiplas seções', () => {
    const src = '"""doc"""\n\nimport x\n\n# leading\nvar = [\n    {"a": 1},\n]\n# tail\n';
    const a = serialize(ok(src));
    const b = serialize(ok(a));
    expect(b).toBe(a);
  });
});

describe('operations — gates remanescentes', () => {
  it('renameVariable falha com nome destino inválido', () => {
    expect(() => renameVariable(ok('var = []\n'), 'var', '1bad')).toThrow();
  });

  it('renameVariable falha se origem não existe', () => {
    expect(() => renameVariable(ok('var = []\n'), 'ghost', 'newname')).toThrow();
  });

  it('renameVariable aceita rename para o mesmo nome (no-op semântico)', () => {
    const m = renameVariable(ok('var = []\n'), 'var', 'var');
    expect(m.variables[0]?.name).toBe('var');
  });

  it('addColumn falha em variável inexistente', () => {
    expect(() => addColumn(ok(''), 'ghost', 'a')).toThrow();
  });

  it('removeRow rejeita índice negativo', () => {
    expect(() => removeRow(ok('var = [{"a": 1}]\n'), 'var', -1)).toThrow();
  });

  it('removeColumn falha se variável não existe', () => {
    expect(() => removeColumn(ok(''), 'ghost', 'a')).toThrow();
  });

  it('renameColumn permite no-op (mesmo nome)', () => {
    const m = renameColumn(ok('var = [{"a": 1}]\n'), 'var', 'a', 'a');
    expect(m.variables[0]?.schema).toEqual(['a']);
  });

  it('setCell rejeita coluna inexistente', () => {
    expect(() => setCell(ok('var = [{"a": 1}]\n'), 'var', 0, 'b', '2')).toThrow();
  });

  it('setCell rejeita expressão vazia', () => {
    expect(() => setCell(ok('var = [{"a": 1}]\n'), 'var', 0, 'a', '')).toThrow(/R5\.2/);
  });

  it('setCell rejeita expressão com bracket aberto', () => {
    expect(() => setCell(ok('var = [{"a": 1}]\n'), 'var', 0, 'a', 'foo(')).toThrow(/R5\.2/);
  });
});

describe('paste — edge', () => {
  it('applyPaste falha em variável inexistente', () => {
    expect(() => applyPaste(ok(''), 'ghost', 0, 0, [['a']])).toThrow();
  });

  it('parseTsv com TSV totalmente vazio', () => {
    // string vazia → uma linha vazia → vira [['']]
    // (uma linha em branco com uma célula vazia)
    const r = applyPaste(
      ok('var = [{"a": 1}]\n'),
      'var',
      0,
      0,
      [],
    );
    expect(r.variables[0]?.rows).toHaveLength(1); // não muda
  });
});

describe('parser — comentários dentro de listas e dicts (tolerância a comentários de IA)', () => {
  it('ignora comentário inline entre items da lista', () => {
    ok('var = [\n    {"a": 1},  # comentário\n    {"a": 2},\n]\n');
  });

  it('ignora comentário após último item antes do ]', () => {
    ok('var = [\n    {"a": 1},  # fim\n]\n');
  });

  it('ignora comentário inline entre entradas de um dict', () => {
    ok('var = [\n    {\n        "a": 1,  # col a\n        "b": 2,\n    },\n]\n');
  });

  it('ignora múltiplos comentários consecutivos dentro de []', () => {
    ok('var = [\n    {"a": 1},  # primeiro\n    {"a": 2},  # segundo\n]\n');
  });

  it('preserva schema e linhas corretos após ignorar comentários', () => {
    const m = ok('var = [\n    {"nome": "Alice"},  # linha 1\n    {"nome": "Bob"},  # linha 2\n]\n');
    expect(m.variables[0]?.rows).toHaveLength(2);
    expect(m.variables[0]?.schema).toEqual(['nome']);
  });

  it('ignora comentário entre entradas com múltiplas colunas', () => {
    const m = ok('var = [\n    {\n        "a": 1,  # coluna a\n        "b": 2,  # coluna b\n    },\n]\n');
    expect(m.variables[0]?.schema).toEqual(['a', 'b']);
  });
});

describe('lsp-logic — diagnostics e import binding', () => {
  it('extrai binding de `import x.y` (primeiro segmento)', () => {
    const src = 'import os.path\nvar = [{"a": os.path.join("a", "b")}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.find((d) => d.message.includes('os'))).toBeUndefined();
  });

  it('extrai binding de `from x import y`', () => {
    const src = 'from datetime import date\nvar = [{"d": date(2024, 1, 1)}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.find((d) => d.message.includes('date'))).toBeUndefined();
  });

  it('extrai binding de `from x import y as z`', () => {
    const src = 'from datetime import date as D\nvar = [{"d": D(2024, 1, 1)}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.find((d) => d.message.includes('R5.5'))).toBeUndefined();
  });

  it('extrai bindings de `from x import (y, z)` parens', () => {
    const src = 'from datetime import (date, time)\nvar = [{"d": date, "t": time}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.filter((d) => d.message.includes('R5.5'))).toEqual([]);
  });

  it('`from x import *` ignora bindings (não faz crash)', () => {
    const src = 'from datetime import *\nvar = [{"d": foo_unbound}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    // wildcard não vincula nomes — foo_unbound permanece warning
    expect(diags.find((d) => d.message.includes('foo_unbound'))).toBeDefined();
  });

  it('multiple imports na mesma linha: `import a, b`', () => {
    const src = 'import json, os\nvar = [{"a": json.dumps([]), "b": os.getcwd()}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.filter((d) => d.message.includes('R5.5'))).toEqual([]);
  });

  it('positionToOffset atravessa múltiplas linhas', () => {
    const src = 'var = [\n    {"a": 1},\n]\n';
    const items = completionsAt(parse(src).model!, src, { line: 1, column: 5 });
    expect(items.map((i) => i.label)).toContain('a');
  });

  it('completionsAt cruza NEWLINE entre statements', () => {
    const src = 'first = []\nsecond = [{"x": 1, "y": 2}]\n';
    const r = parse(src);
    const idx = src.indexOf('"x"');
    const items = completionsAt(r.model!, src, { line: 1, column: idx - 'second = [\n'.length + 5 });
    // Apenas valida que não dá crash atravessando NEWLINE
    expect(items).toBeDefined();
  });

  it('hoverAt retorna null se cursor em chave de variável desconhecida', () => {
    // Source válido mas cursor numa string fora de dict (hipotético)
    const src = 'var = [{"a": 1}]\n';
    const h = hoverAt(parse(src).model!, src, { line: 0, column: 100 });
    expect(h).toBeNull();
  });

  it('hoverAt funciona para chave em variável real', () => {
    const src = 'var = [{"x": 1}]\n';
    const idx = src.indexOf('"x"');
    const h = hoverAt(parse(src).model!, src, { line: 0, column: idx + 1 });
    expect(h?.markdown).toContain('x');
    expect(h?.markdown).toContain('1');
  });

  it('builtins (len, range) não disparam warning R5.5', () => {
    const src = 'var = [{"a": len("x"), "b": range(3)}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.filter((d) => d.message.includes('R5.5'))).toEqual([]);
  });

  it('mesmo nome não importado em duas células gera apenas 1 warning (seen)', () => {
    const src = 'var = [{"a": foo, "b": foo}]\n';
    const r = parse(src);
    const diags = diagnosticsFor(r.errors, r.model, src);
    const fooWarnings = diags.filter((d) => d.message.includes('foo'));
    expect(fooWarnings).toHaveLength(1);
  });

  it('header com docstring + comentário + import — todos preservados', () => {
    const src = '"""doc"""\n# header note\nimport os\nvar = [{"a": os.getcwd()}]\n';
    const r = parse(src);
    expect(r.errors).toEqual([]);
    const diags = diagnosticsFor(r.errors, r.model, src);
    expect(diags.filter((d) => d.message.includes('os'))).toEqual([]);
  });

  it('hoverAt retorna null se cursor em string que não é chave do schema', () => {
    // String value (não chave) - colIdx === -1
    const src = 'var = [{"a": "value_string"}]\n';
    const idx = src.indexOf('"value');
    const h = hoverAt(parse(src).model!, src, { line: 0, column: idx + 2 });
    expect(h).toBeNull();
  });
});
