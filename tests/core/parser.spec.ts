import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parser';
import { RULES } from '../../src/core/rules';
import * as fx from '../helpers/fixtures';

const errorWith = (ruleId: string) => expect.objectContaining({ ruleId });
const ok = (src: string) => {
  const r = parse(src);
  expect(r.errors).toEqual([]);
  expect(r.model).not.toBeNull();
  return r;
};
const fail = (src: string, ruleId: string) => {
  const r = parse(src);
  expect(r.errors).toContainEqual(errorWith(ruleId));
  expect(r.model).toBeNull();
  return r;
};

describe('parse() — §2 contrato sintático toplevel', () => {
  describe('R2.1 — Python sintaticamente válido', () => {
    it('arquivo vazio é válido', () => {
      const r = parse(fx.EMPTY);
      expect(r.errors).toEqual([]);
      expect(r.model).not.toBeNull();
    });

    it('detecta string aberta', () => {
      fail('var = "abc\n', RULES.R2_1);
    });

    it('detecta parêntese desbalanceado', () => {
      fail('var = [{"a": (}]\n', RULES.R2_1);
    });

    it('detecta lista desbalanceada', () => {
      fail('var = [\n', RULES.R2_1);
    });
  });

  describe('R2.2 — toplevel só permite imports/atribuições/comentários/docstring', () => {
    it('aceita docstring de módulo', () => {
      ok('"""hello world"""\n');
    });

    it('aceita comentário solto antes de import', () => {
      ok('# comment\nimport x\n');
    });

    it('aceita comentário solto entre statements', () => {
      ok('import x\n# inter\nvar = []\n');
    });

    it('aceita arquivo só com comentários', () => {
      ok('# only comment\n');
    });

    it('aceita linhas em branco', () => {
      ok('\n\nimport x\n\n\nvar = []\n\n');
    });
  });

  describe('R2.3 — formas válidas de import', () => {
    const valid = [
      'import x',
      'import x as y',
      'import x.y',
      'import x.y.z',
      'import x, y',
      'import x as a, y as b',
      'from x import y',
      'from x import y as z',
      'from x import y, z',
      'from x import (y, z)',
      'from x import (\n    y,\n    z,\n)',
      'from .x import y',
      'from . import y',
      'from ..x.y import z',
    ];
    for (const src of valid) {
      it(`aceita: ${JSON.stringify(src)}`, () => {
        ok(src + '\n');
      });
    }
  });

  describe('R2.4 — construções inválidas no toplevel (emitem R2.2)', () => {
    const invalid: string[] = [
      'def foo(): pass\n',
      'def foo():\n    return 1\n',
      'class Foo: pass\n',
      'class Foo:\n    x = 1\n',
      'for x in []:\n    pass\n',
      'while True:\n    pass\n',
      'try:\n    pass\nexcept Exception:\n    pass\n',
      'with open("f") as f:\n    pass\n',
      'if True:\n    x = 1\n',
      'x += 1\n',
      'x -= 1\n',
      'a = b = []\n',
      'a, b = [], []\n',
      'del x\n',
      'global x\n',
      'raise Exception()\n',
      'return 1\n',
      'async def foo(): pass\n',
      '42\n', // bare expression non-docstring
      'foo()\n', // bare call
    ];
    for (const src of invalid) {
      it(`rejeita: ${JSON.stringify(src.trim())}`, () => {
        fail(src, RULES.R2_2);
      });
    }
  });

  describe('R2.5 — anotação com valor é permitida', () => {
    it('aceita `x: list[dict] = []`', () => {
      const r = ok('x: list[dict] = []\n');
      expect(r.model?.variables[0]?.annotation).toBe(': list[dict]');
    });

    it('aceita anotação simples `x: list = []`', () => {
      ok('x: list = []\n');
    });
  });

  describe('R2.6 — anotação sem valor é inválida', () => {
    it('rejeita `x: int`', () => {
      fail('x: int\n', RULES.R2_6);
    });

    it('rejeita `x: list[dict]`', () => {
      fail('x: list[dict]\n', RULES.R2_6);
    });
  });

  describe('R2.7 — re-atribuição da mesma variável', () => {
    it('rejeita variável atribuída duas vezes', () => {
      fail('x = []\nx = [{"a": 1}]\n', RULES.R2_7);
    });

    it('aceita variáveis com nomes distintos', () => {
      ok('x = []\ny = []\n');
    });
  });
});

describe('parse() — §3 estrutura de variável', () => {
  describe('R3.1 — RHS deve ser list literal', () => {
    it('aceita lista vazia', () => {
      ok('var = []\n');
    });

    it('aceita lista com dicts', () => {
      ok('var = [{"a": 1}]\n');
    });

    it.each([
      ['var = 42\n'],
      ['var = "hi"\n'],
      ['var = (1, 2)\n'],
      ['var = {"a": 1}\n'],
      ['var = list()\n'],
      ['var = None\n'],
      ['var = True\n'],
    ])('rejeita não-lista: %s', (src) => {
      fail(src, RULES.R3_1);
    });
  });

  describe('R3.2 — só dict literals na lista', () => {
    it.each([
      ['var = [1, 2, 3]\n'],
      ['var = [{"a": 1}, 2]\n'],
      ['var = ["x"]\n'],
      ['var = [None]\n'],
      ['var = [[]]\n'],
    ])('rejeita: %s', (src) => {
      fail(src, RULES.R3_2);
    });
  });

  describe('R3.3 — sem comprehensions/splats/unpack', () => {
    it.each([
      ['var = [{"a": i} for i in range(3)]\n'],
      ['var = [*other]\n'],
      ['var = [{"a": 1, **other}]\n'],
      ['var = [{k: v for k, v in pairs}]\n'],
    ])('rejeita: %s', (src) => {
      fail(src, RULES.R3_3);
    });
  });

  describe('R3.4 — schema homogêneo', () => {
    it('aceita dicts com chaves iguais e ordem igual', () => {
      const r = ok('var = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]\n');
      expect(r.model?.variables[0]?.schema).toEqual(['a', 'b']);
    });

    it('rejeita chave extra', () => {
      fail('var = [{"a": 1}, {"a": 1, "b": 2}]\n', RULES.R3_4);
    });

    it('rejeita chave faltando', () => {
      fail('var = [{"a": 1, "b": 2}, {"a": 3}]\n', RULES.R3_4);
    });

    it('rejeita ordem diferente', () => {
      fail('var = [{"a": 1, "b": 2}, {"b": 4, "a": 3}]\n', RULES.R3_4);
    });
  });

  describe('R3.5 — chaves devem ser string literals', () => {
    it('aceita aspas simples e duplas', () => {
      const r = ok(`var = [{'a': 1, "b": 2}]\n`);
      expect(r.model?.variables[0]?.schema).toEqual(['a', 'b']);
    });

    it('aceita concatenação implícita', () => {
      const r = ok(`var = [{"a" "b": 1}]\n`);
      expect(r.model?.variables[0]?.schema).toEqual(['ab']);
    });

    it.each([
      [`var = [{f"a": 1}]\n`],
      [`var = [{1: "a"}]\n`],
      [`var = [{("a",): 1}]\n`],
      [`var = [{b"a": 1}]\n`],
      [`var = [{None: 1}]\n`],
      [`var = [{"a"+"b": 1}]\n`],
    ])('rejeita chave não-literal: %s', (src) => {
      fail(src, RULES.R3_5);
    });
  });

  describe('R3.6 — chaves duplicadas no mesmo dict', () => {
    it('rejeita', () => {
      fail(`var = [{"a": 1, "a": 2}]\n`, RULES.R3_6);
    });
  });

  describe('R3.7 — valor: qualquer expression Python válida', () => {
    it('aceita literais variados', () => {
      ok(`var = [{"a": 1, "b": "x", "c": None, "d": True, "e": [1,2], "f": {"k":"v"}, "g": (1,2)}]\n`);
    });

    it('aceita chamada de função e atributo', () => {
      ok(`import pandas as pd\nvar = [{"t": pd.Timestamp("2024-01-01"), "n": pd.NA}]\n`);
    });

    it('aceita lambda e ternário', () => {
      ok(`var = [{"a": (lambda x: x+1), "b": 1 if True else 0}]\n`);
    });
  });
});

describe('parse() — §4 schema', () => {
  it('R4.1 — schema vem do primeiro dict', () => {
    const r = ok(fx.SIMPLE_VAR_WITH_ROWS);
    expect(r.model?.variables[0]?.schema).toEqual(['a', 'b']);
    expect(r.model?.variables[0]?.rows).toHaveLength(2);
  });

  describe('R4.2 — sentinela em variável vazia', () => {
    it('aceita sentinela bem-formado', () => {
      const r = ok('var = []  # tpy:cols=["a","b"]\n');
      expect(r.model?.variables[0]?.schema).toEqual(['a', 'b']);
      expect(r.model?.variables[0]?.rows).toEqual([]);
    });

    it('aceita sentinela vazio', () => {
      const r = ok('var = []  # tpy:cols=[]\n');
      expect(r.model?.variables[0]?.schema).toEqual([]);
    });

    it('aceita sentinela com aspas duplas escapadas', () => {
      const r = ok('var = []  # tpy:cols=["with \\"quote\\"","b"]\n');
      expect(r.model?.variables[0]?.schema).toEqual(['with "quote"', 'b']);
    });

    it.each([
      ['var = []  # tpy:cols=[a,b]\n'], // sem aspas
      ['var = []  # tpy:cols=["a"\n'], // não fecha
      ['var = []  # tpy:cols={"a":1}\n'], // não-array
      ['var = []  # tpy:cols=[1,2]\n'], // não-string
    ])('rejeita sentinela malformado: %s', (src) => {
      fail(src, RULES.R4_2);
    });
  });

  it('R4.3 — 0 linhas sem sentinela = 0 colunas', () => {
    const r = ok('var = []\n');
    expect(r.model?.variables[0]?.schema).toEqual([]);
    expect(r.model?.variables[0]?.rows).toEqual([]);
  });

  it('R4.4 — sentinela ignorado se há linhas', () => {
    const r = ok('var = [{"x": 1}]  # tpy:cols=["wrong"]\n');
    expect(r.model?.variables[0]?.schema).toEqual(['x']);
  });
});

describe('parse() — preservação de células e header', () => {
  it('R5.1/R5.3 — cell.source preserva expressão verbatim', () => {
    const r = ok(`var = [{"t": pd.Timestamp("2024-01-01")}]\n`);
    expect(r.model?.variables[0]?.rows[0]?.[0]?.source).toBe(
      'pd.Timestamp("2024-01-01")',
    );
  });

  it('preserva docstring de módulo', () => {
    const r = ok(fx.WITH_DOCSTRING);
    expect(r.model?.header).toContainEqual(
      expect.objectContaining({ kind: 'docstring' }),
    );
  });

  it('preserva imports na ordem', () => {
    const r = ok(fx.WITH_IMPORTS);
    const imports = r.model?.header.filter((h) => h.kind === 'import') ?? [];
    expect(imports).toHaveLength(2);
  });

  it('preserva comentário de variável', () => {
    const r = ok(fx.WITH_LEADING_COMMENT);
    expect(r.model?.variables[0]?.leadingComments).toEqual(['# leading comment']);
  });

  it('preserva múltiplas variáveis na ordem', () => {
    const r = ok(fx.TWO_VARS);
    expect(r.model?.variables.map((v) => v.name)).toEqual(['var1', 'var2']);
  });
});
