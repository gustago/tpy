import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parser';
import { serialize } from '../../src/core/serializer';
import type { FileModel } from '../../src/core/model';
import * as fx from '../helpers/fixtures';

const roundTrip = (src: string): string => {
  const { model } = parse(src);
  if (!model) throw new Error('expected valid model');
  return serialize(model);
};

describe('serialize() — §6 round-trip', () => {
  describe('R6.1 — determinismo', () => {
    it('mesma model produz mesmos bytes em chamadas distintas', () => {
      const { model } = parse(fx.SIMPLE_VAR_WITH_ROWS);
      expect(model).not.toBeNull();
      const a = serialize(model as FileModel);
      const b = serialize(model as FileModel);
      expect(a).toBe(b);
    });
  });

  describe('R6.2 — imports preservam ordem', () => {
    it('imports saem na mesma ordem da leitura', () => {
      const out = roundTrip(fx.WITH_IMPORTS);
      const importLines = out.split('\n').filter((l) => l.startsWith('import') || l.startsWith('from'));
      expect(importLines).toEqual(['import pandas as pd', 'from datetime import date']);
    });
  });

  describe('R6.3 — variáveis preservam ordem', () => {
    it('var1 antes de var2 conforme leitura', () => {
      const out = roundTrip(fx.TWO_VARS);
      expect(out.indexOf('var1')).toBeLessThan(out.indexOf('var2'));
    });
  });

  describe('R6.4 — Black-compat: inline ≤88 chars, expandido se >88 ou multi-linha', () => {
    it('dict curto fica inline com magic trailing comma na lista', () => {
      const out = roundTrip(fx.SIMPLE_VAR_WITH_ROWS);
      expect(out).toContain('var = [\n    {"a": 1, "b": 2},\n    {"a": 3, "b": 4},\n]\n');
    });

    it('dict longo é expandido verticalmente', () => {
      const longValue = '"a string value long enough to push the dict line past eighty-eight characters"';
      const longSrc = `var = [{"a": 1, "b": ${longValue}}]\n`;
      const out = roundTrip(longSrc);
      expect(out).toContain('var = [\n    {\n        "a": 1,\n');
      expect(out).toContain(`        "b": ${longValue},\n    },\n]\n`);
    });
  });

  describe('R6.5 — var vazia sem schema', () => {
    it('serializa como `var = []`', () => {
      const out = roundTrip('var = []\n');
      expect(out).toContain('var = []\n');
      expect(out).not.toContain('# tpy:cols');
    });
  });

  describe('R6.6 — var vazia com schema (sentinela)', () => {
    it('serializa com sentinela JSON-like, dois espaços antes do `#`', () => {
      const out = roundTrip(fx.VAR_WITH_SENTINEL);
      expect(out).toContain('var = []  # tpy:cols=["a","b"]\n');
    });

    it('aspas duplas para chaves no sentinela mesmo se source usava simples', () => {
      const out = roundTrip(`var = []  # tpy:cols=["a","b"]\n`);
      expect(out).toContain('"a","b"');
    });
  });

  describe('R6.7 — comentários antes da variável preservados', () => {
    it('mantém comentário imediatamente antes', () => {
      const out = roundTrip(fx.WITH_LEADING_COMMENT);
      expect(out).toContain('# leading comment\nvar = [\n');
    });
  });

  describe('R6.9 — docstring de módulo preservada no topo', () => {
    it('docstring fica no topo após round-trip', () => {
      const out = roundTrip(fx.WITH_DOCSTRING);
      expect(out.startsWith('"""my module docstring"""')).toBe(true);
    });
  });

  describe('R6.10 — encoding UTF-8, LF, newline final', () => {
    it('arquivo termina com newline', () => {
      const out = roundTrip(fx.SIMPLE_VAR_WITH_ROWS);
      expect(out.endsWith('\n')).toBe(true);
    });

    it('não usa CRLF', () => {
      const out = roundTrip('var = []\r\n');
      expect(out).not.toContain('\r');
    });
  });

  describe('R6.11 — output Black-compatible (no-op se rodar Black)', () => {
    it('lista usa magic trailing comma', () => {
      const out = roundTrip(fx.SIMPLE_VAR_WITH_ROWS);
      // último dict antes de `]` tem vírgula
      expect(out).toMatch(/},\n\]/);
    });

    it('chaves saem com aspas duplas mesmo se source usava simples', () => {
      const out = roundTrip(`var = [{'a': 1}]\n`);
      expect(out).toContain('"a"');
      expect(out).not.toContain("'a'");
    });

    it('valores stringy preservam aspas verbatim (R5.3)', () => {
      const out = roundTrip(`var = [{"a": 'x'}]\n`);
      // R5.3: source da célula é verbatim; quem normaliza aspas é Black
      expect(out).toContain("'x'");
    });
  });

  describe('round-trip — parse(serialize(parse(s))) é idempotente', () => {
    it.each([
      [fx.EMPTY],
      [fx.SIMPLE_EMPTY_VAR],
      [fx.SIMPLE_VAR_WITH_ROWS],
      [fx.VAR_WITH_SENTINEL],
      [fx.WITH_IMPORTS],
      [fx.WITH_DOCSTRING],
      [fx.TWO_VARS],
    ])('estável: %s', (src) => {
      const out1 = roundTrip(src);
      const out2 = roundTrip(out1);
      expect(out2).toBe(out1);
    });
  });
});
