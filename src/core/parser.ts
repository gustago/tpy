import type {
  CellValue,
  ContractError,
  FileModel,
  HeaderItem,
  ParseResult,
  SourceRange,
  Variable,
} from './model';
import { RULES, type RuleId } from './rules';

// =============================================================================
// TOKENIZER
// =============================================================================

type TokenType = 'NEWLINE' | 'COMMENT' | 'STRING' | 'NAME' | 'NUMBER' | 'OP' | 'EOF';
type StringFlavor = 'plain' | 'fstring' | 'bytes';

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  flavor?: StringFlavor;
  parsedString?: string;
}

const KEYWORDS_FORBIDDEN = new Set([
  'def', 'class', 'if', 'elif', 'else',
  'for', 'while', 'try', 'except', 'finally',
  'with', 'match', 'case',
  'del', 'global', 'nonlocal',
  'return', 'raise', 'yield', 'pass', 'break', 'continue',
  'assert', 'async', 'await',
]);

const KEYWORDS_IMPORT = new Set(['import', 'from']);

const PYTHON_BUILTINS = new Set([
  'True', 'False', 'None', 'NotImplemented', 'Ellipsis',
  'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes',
  'callable', 'chr', 'classmethod', 'complex', 'dict', 'dir', 'divmod',
  'enumerate', 'filter', 'float', 'format', 'frozenset', 'getattr',
  'hasattr', 'hash', 'hex', 'id', 'int', 'isinstance', 'issubclass',
  'iter', 'len', 'list', 'map', 'max', 'memoryview', 'min', 'next',
  'object', 'oct', 'ord', 'pow', 'range', 'repr', 'reversed', 'round',
  'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum',
  'super', 'tuple', 'type', 'vars', 'zip', 'lambda',
]);

class Tokenizer {
  private pos = 0;
  private line = 0;
  private col = 0;
  private bracketDepth = 0;
  private tokens: Token[] = [];
  private errors: ContractError[] = [];

  constructor(private readonly source: string) {}

  tokenize(): { tokens: Token[]; errors: ContractError[] } {
    while (this.pos < this.source.length) {
      this.scanOne();
    }
    if (this.bracketDepth > 0) {
      this.errors.push({
        ruleId: RULES.R2_1,
        message: `[${RULES.R2_1}] bracket não fechado`,
        range: {
          start: { line: this.line, column: this.col },
          end: { line: this.line, column: this.col },
        },
      });
    }
    this.tokens.push({
      type: 'EOF',
      value: '',
      start: this.pos,
      end: this.pos,
      line: this.line,
      column: this.col,
      endLine: this.line,
      endColumn: this.col,
    });
    return { tokens: this.tokens, errors: this.errors };
  }

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? '';
  }

  private advance(n = 1): void {
    for (let i = 0; i < n; i++) {
      const ch = this.source[this.pos];
      if (ch === '\n') {
        this.line++;
        this.col = 0;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private startToken() {
    return { start: this.pos, line: this.line, column: this.col };
  }

  private finishToken(
    type: TokenType,
    value: string,
    startInfo: { start: number; line: number; column: number },
    extra: Partial<Token> = {},
  ): Token {
    return {
      type,
      value,
      start: startInfo.start,
      end: this.pos,
      line: startInfo.line,
      column: startInfo.column,
      endLine: this.line,
      endColumn: this.col,
      ...extra,
    };
  }

  private addError(
    ruleId: RuleId,
    message: string,
    start: { line: number; column: number },
  ): void {
    this.errors.push({
      ruleId,
      message: `[${ruleId}] ${message}`,
      range: {
        start: { line: start.line, column: start.column },
        end: { line: this.line, column: this.col },
      },
    });
  }

  private scanOne(): void {
    const ch = this.peek();

    if (ch === '\n' || ch === '\r') {
      const startInfo = this.startToken();
      if (ch === '\r' && this.peek(1) === '\n') {
        this.advance(2);
      } else {
        this.advance();
      }
      if (this.bracketDepth === 0) {
        this.tokens.push(this.finishToken('NEWLINE', '\n', startInfo));
      }
      return;
    }

    if (ch === ' ' || ch === '\t') {
      this.advance();
      return;
    }

    if (ch === '\\' && (this.peek(1) === '\n' || this.peek(1) === '\r')) {
      this.advance();
      if (this.peek() === '\r' && this.peek(1) === '\n') {
        this.advance(2);
      } else {
        this.advance();
      }
      return;
    }

    if (ch === '#') {
      const startInfo = this.startToken();
      let value = '';
      while (
        this.pos < this.source.length &&
        this.peek() !== '\n' &&
        this.peek() !== '\r'
      ) {
        value += this.peek();
        this.advance();
      }
      this.tokens.push(this.finishToken('COMMENT', value, startInfo));
      return;
    }

    if (this.tryString()) return;

    if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
      this.scanNumber();
      return;
    }

    if (this.isIdentStart(ch)) {
      this.scanName();
      return;
    }

    this.scanOp();
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isIdentStart(ch: string): boolean {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_'
    );
  }

  private isIdentCont(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  private scanNumber(): void {
    const startInfo = this.startToken();
    let value = '';
    while (this.pos < this.source.length) {
      const c = this.peek();
      if (/[0-9a-zA-Z_.]/.test(c)) {
        value += c;
        this.advance();
      } else if ((c === '+' || c === '-') && /[eE]$/.test(value)) {
        value += c;
        this.advance();
      } else {
        break;
      }
    }
    this.tokens.push(this.finishToken('NUMBER', value, startInfo));
  }

  private scanName(): void {
    const startInfo = this.startToken();
    let value = '';
    while (this.pos < this.source.length && this.isIdentCont(this.peek())) {
      value += this.peek();
      this.advance();
    }
    this.tokens.push(this.finishToken('NAME', value, startInfo));
  }

  private tryString(): boolean {
    let prefixEnd = this.pos;
    let prefix = '';
    while (
      prefix.length < 2 &&
      /[rRbBfFuU]/.test(this.source[prefixEnd] ?? '')
    ) {
      prefix += this.source[prefixEnd]!;
      prefixEnd++;
    }
    const quoteChar = this.source[prefixEnd];
    if (quoteChar !== '"' && quoteChar !== "'") return false;
    const startInfo = this.startToken();
    this.advance(prefix.length);
    return this.scanString(startInfo, prefix);
  }

  private scanString(
    startInfo: { start: number; line: number; column: number },
    prefix: string,
  ): boolean {
    const quoteChar = this.peek();
    const isTriple = this.peek(1) === quoteChar && this.peek(2) === quoteChar;
    const flavor: StringFlavor =
      /[fF]/.test(prefix) ? 'fstring' : /[bB]/.test(prefix) ? 'bytes' : 'plain';
    const isRaw = /[rR]/.test(prefix);
    let buffer = '';

    if (isTriple) {
      this.advance(3);
      while (this.pos < this.source.length) {
        if (
          this.peek() === quoteChar &&
          this.peek(1) === quoteChar &&
          this.peek(2) === quoteChar
        ) {
          this.advance(3);
          this.tokens.push(
            this.finishToken('STRING', this.source.slice(startInfo.start, this.pos), startInfo, {
              flavor,
              parsedString: flavor === 'plain' ? this.decodeStringContent(buffer, isRaw) : undefined,
            }),
          );
          return true;
        }
        if (!isRaw && this.peek() === '\\' && this.pos + 1 < this.source.length) {
          buffer += this.peek() + this.peek(1);
          this.advance(2);
          continue;
        }
        buffer += this.peek();
        this.advance();
      }
      this.addError(RULES.R2_1, 'string triplo não terminado', startInfo);
      return true;
    }

    this.advance();
    while (this.pos < this.source.length) {
      if (this.peek() === quoteChar) {
        this.advance();
        this.tokens.push(
          this.finishToken('STRING', this.source.slice(startInfo.start, this.pos), startInfo, {
            flavor,
            parsedString: flavor === 'plain' ? this.decodeStringContent(buffer, isRaw) : undefined,
          }),
        );
        return true;
      }
      if (!isRaw && this.peek() === '\\' && this.pos + 1 < this.source.length) {
        buffer += this.peek() + this.peek(1);
        this.advance(2);
        continue;
      }
      if (this.peek() === '\n' || this.peek() === '\r') {
        this.addError(RULES.R2_1, 'string não terminada (newline antes de fechar)', startInfo);
        return true;
      }
      buffer += this.peek();
      this.advance();
    }
    this.addError(RULES.R2_1, 'string não terminada (EOF)', startInfo);
    return true;
  }

  private decodeStringContent(buffer: string, isRaw: boolean): string {
    if (isRaw) return buffer;
    let out = '';
    let i = 0;
    while (i < buffer.length) {
      const ch = buffer[i]!;
      if (ch === '\\' && i + 1 < buffer.length) {
        const next = buffer[i + 1]!;
        switch (next) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case '\\': out += '\\'; break;
          case "'": out += "'"; break;
          case '"': out += '"'; break;
          case 'a': out += '\x07'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '0': out += '\0'; break;
          case '\n': break;
          default: out += '\\' + next; break;
        }
        i += 2;
      } else {
        out += ch;
        i++;
      }
    }
    return out;
  }

  private scanOp(): void {
    const startInfo = this.startToken();
    const ch = this.peek();
    let len = 1;
    let value = ch;

    const m2 = (a: string, b: string): boolean => this.peek() === a && this.peek(1) === b;
    const m3 = (a: string, b: string, c: string): boolean =>
      this.peek() === a && this.peek(1) === b && this.peek(2) === c;

    if (m3('*', '*', '=') || m3('/', '/', '=') || m3('<', '<', '=') || m3('>', '>', '=') || m3('.', '.', '.')) {
      len = 3;
      value = this.peek() + this.peek(1) + this.peek(2);
    } else if (
      m2('=', '=') || m2('!', '=') || m2('<', '=') || m2('>', '=') ||
      m2('+', '=') || m2('-', '=') || m2('*', '=') || m2('/', '=') ||
      m2('%', '=') || m2('&', '=') || m2('|', '=') || m2('^', '=') ||
      m2('@', '=') || m2(':', '=') ||
      m2('*', '*') || m2('/', '/') || m2('<', '<') || m2('>', '>') ||
      m2('-', '>')
    ) {
      len = 2;
      value = ch + this.peek(1);
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      this.bracketDepth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (this.bracketDepth === 0) {
        this.addError(RULES.R2_1, `bracket '${ch}' inesperado`, startInfo);
      } else {
        this.bracketDepth--;
      }
    }

    this.advance(len);
    this.tokens.push(this.finishToken('OP', value, startInfo));
  }
}

// =============================================================================
// HELPERS
// =============================================================================

interface Statement {
  tokens: Token[];
  inlineComment: Token | null;
  startLine: number;
}

function buildStmt(toks: Token[], startLine: number): Statement {
  if (toks.length > 1 && toks[toks.length - 1]!.type === 'COMMENT') {
    return {
      tokens: toks.slice(0, -1),
      inlineComment: toks[toks.length - 1]!,
      startLine,
    };
  }
  return { tokens: toks, inlineComment: null, startLine };
}

function splitStatements(tokens: Token[]): Statement[] {
  const stmts: Statement[] = [];
  let current: Token[] = [];
  let startLine = 0;
  for (const tok of tokens) {
    if (tok.type === 'EOF') {
      if (current.length > 0) stmts.push(buildStmt(current, startLine));
      break;
    }
    if (tok.type === 'NEWLINE') {
      if (current.length > 0) {
        stmts.push(buildStmt(current, startLine));
        current = [];
      }
      continue;
    }
    if (current.length === 0) startLine = tok.line;
    current.push(tok);
  }
  return stmts;
}

function tokenRange(tok: Token): SourceRange {
  return {
    start: { line: tok.line, column: tok.column },
    end: { line: tok.endLine, column: tok.endColumn },
  };
}

function rangeOfStmt(stmt: Statement): SourceRange {
  const first = stmt.tokens[0]!;
  const last = stmt.tokens[stmt.tokens.length - 1]!;
  return {
    start: { line: first.line, column: first.column },
    end: { line: last.endLine, column: last.endColumn },
  };
}

function err(ruleId: RuleId, message: string, range: SourceRange): ContractError {
  return { ruleId, message: `[${ruleId}] ${message}`, range };
}

function isDocstring(stmt: Statement): boolean {
  return (
    stmt.tokens.length === 1 &&
    stmt.tokens[0]!.type === 'STRING' &&
    stmt.tokens[0]!.flavor === 'plain'
  );
}

function isImportStatement(stmt: Statement): boolean {
  const first = stmt.tokens[0];
  return first?.type === 'NAME' && KEYWORDS_IMPORT.has(first.value);
}

function isAnnotatedWithoutValue(stmt: Statement): boolean {
  const ts = stmt.tokens;
  if (ts.length < 3) return false;
  if (ts[0]?.type !== 'NAME') return false;
  if (KEYWORDS_FORBIDDEN.has(ts[0].value) || KEYWORDS_IMPORT.has(ts[0].value)) return false;
  if (ts[1]?.type !== 'OP' || ts[1].value !== ':') return false;
  let depth = 0;
  for (const t of ts) {
    if (t.type === 'OP') {
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
      else if (t.value === '=' && depth === 0) return false;
    }
  }
  return true;
}

interface AssignmentSplit {
  nameTok: Token;
  annotation: Token[] | null;
  rhs: Token[];
  equalsTok: Token;
}

function tryParseAssignment(stmt: Statement): AssignmentSplit | null {
  const ts = stmt.tokens;
  if (ts.length < 3) return null;
  if (ts[0]?.type !== 'NAME') return null;
  if (KEYWORDS_FORBIDDEN.has(ts[0].value) || KEYWORDS_IMPORT.has(ts[0].value)) return null;

  let depth = 0;
  let equalsIdx = -1;
  let secondEqualsIdx = -1;
  let colonIdx = -1;
  let commaAtTop = false;

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    if (t.type !== 'OP') continue;
    const v = t.value;
    if (v === '(' || v === '[' || v === '{') depth++;
    else if (v === ')' || v === ']' || v === '}') depth--;
    else if (v === '=' && depth === 0) {
      if (equalsIdx === -1) equalsIdx = i;
      else if (secondEqualsIdx === -1) secondEqualsIdx = i;
    } else if (v === ':' && depth === 0 && equalsIdx === -1 && colonIdx === -1) {
      colonIdx = i;
    } else if (v === ',' && depth === 0 && equalsIdx === -1) {
      commaAtTop = true;
    }
  }

  if (equalsIdx === -1) return null;
  if (commaAtTop) return null;
  if (secondEqualsIdx !== -1) return null;

  if (colonIdx === -1) {
    if (equalsIdx !== 1) return null;
    return {
      nameTok: ts[0]!,
      annotation: null,
      rhs: ts.slice(equalsIdx + 1),
      equalsTok: ts[equalsIdx]!,
    };
  }
  if (colonIdx !== 1) return null;
  const annotation = ts.slice(colonIdx + 1, equalsIdx);
  if (annotation.length === 0) return null;
  return {
    nameTok: ts[0]!,
    annotation,
    rhs: ts.slice(equalsIdx + 1),
    equalsTok: ts[equalsIdx]!,
  };
}

interface ParsedDict {
  schema: string[];
  values: CellValue[];
  range: SourceRange;
}

interface ListParseResult {
  dicts: ParsedDict[];
  errors: ContractError[];
}

function parseListOfDicts(source: string, rhs: Token[]): ListParseResult | null {
  if (rhs.length === 0) return null;
  const first = rhs[0]!;
  const last = rhs[rhs.length - 1]!;
  if (first.type !== 'OP' || first.value !== '[') return null;
  if (last.type !== 'OP' || last.value !== ']') return null;
  if (rhs.length > 2) {
    let extraDepth = 0;
    for (let i = 0; i < rhs.length; i++) {
      const t = rhs[i]!;
      if (t.type === 'OP') {
        if (t.value === '(' || t.value === '[' || t.value === '{') extraDepth++;
        else if (t.value === ')' || t.value === ']' || t.value === '}') {
          extraDepth--;
          if (extraDepth === 0 && i !== rhs.length - 1) return null;
        }
      }
    }
  }

  const inner = rhs.slice(1, rhs.length - 1);
  const items: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const t of inner) {
    if (t.type === 'COMMENT') continue;
    if (t.type === 'OP') {
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
      else if (t.value === ',' && depth === 0) {
        if (current.length > 0) items.push(current);
        current = [];
        continue;
      }
    }
    current.push(t);
  }
  if (current.length > 0) items.push(current);

  const errors: ContractError[] = [];
  const dicts: ParsedDict[] = [];

  for (const item of items) {
    const head = item[0]!;
    if (head.type === 'OP' && (head.value === '*' || head.value === '**')) {
      errors.push(err(RULES.R3_3, 'splat não permitido em lista de dicts', tokenRange(head)));
      continue;
    }
    if (item.some((t) => t.type === 'NAME' && t.value === 'for')) {
      errors.push(err(RULES.R3_3, 'comprehension não permitida', tokenRange(head)));
      continue;
    }
    const tail = item[item.length - 1]!;
    if (head.type !== 'OP' || head.value !== '{' || tail.type !== 'OP' || tail.value !== '}') {
      errors.push(err(RULES.R3_2, 'item da lista não é dict literal', tokenRange(head)));
      continue;
    }
    const parsed = parseDictLiteral(source, item, head, tail);
    if (parsed.errors.length > 0) errors.push(...parsed.errors);
    else dicts.push(parsed.dict);
  }

  return { dicts, errors };
}

interface DictParseResult {
  dict: ParsedDict;
  errors: ContractError[];
}

function parseDictLiteral(
  source: string,
  tokens: Token[],
  dfirst: Token,
  dlast: Token,
): DictParseResult {
  const errors: ContractError[] = [];
  const range: SourceRange = {
    start: { line: dfirst.line, column: dfirst.column },
    end: { line: dlast.endLine, column: dlast.endColumn },
  };
  const inner = tokens.slice(1, tokens.length - 1);
  const entries: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const t of inner) {
    if (t.type === 'COMMENT') continue;
    if (t.type === 'OP') {
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
      else if (t.value === ',' && depth === 0) {
        if (current.length > 0) entries.push(current);
        current = [];
        continue;
      }
    }
    current.push(t);
  }
  if (current.length > 0) entries.push(current);

  for (const entry of entries) {
    if (entry[0]?.type === 'OP' && entry[0].value === '**') {
      errors.push(err(RULES.R3_3, '**unpack não permitido em dict', tokenRange(entry[0])));
    }
  }
  if (errors.length > 0) {
    return { dict: { schema: [], values: [], range }, errors };
  }

  const schema: string[] = [];
  const values: CellValue[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    let edepth = 0;
    let colonIdx = -1;
    for (let i = 0; i < entry.length; i++) {
      const t = entry[i]!;
      if (t.type === 'OP') {
        if (t.value === '(' || t.value === '[' || t.value === '{') edepth++;
        else if (t.value === ')' || t.value === ']' || t.value === '}') edepth--;
        else if (t.value === ':' && edepth === 0) { colonIdx = i; break; }
      }
    }
    if (colonIdx === -1) {
      errors.push(err(RULES.R3_5, 'entrada de dict sem `:`', tokenRange(entry[0]!)));
      continue;
    }
    const keyToks = entry.slice(0, colonIdx);
    const valueToks = entry.slice(colonIdx + 1);
    if (keyToks.length === 0) {
      errors.push(err(RULES.R3_5, 'chave vazia', tokenRange(entry[colonIdx]!)));
      continue;
    }
    const allPlain = keyToks.every((t) => t.type === 'STRING' && t.flavor === 'plain');
    if (!allPlain) {
      errors.push(err(RULES.R3_5, 'chave deve ser string literal', tokenRange(keyToks[0]!)));
      continue;
    }
    const keyValue = keyToks.map((t) => t.parsedString ?? '').join('');
    if (seen.has(keyValue)) {
      errors.push(err(RULES.R3_6, `chave duplicada: ${JSON.stringify(keyValue)}`, tokenRange(keyToks[0]!)));
      continue;
    }
    seen.add(keyValue);
    schema.push(keyValue);

    if (valueToks.length === 0) {
      errors.push(err(RULES.R3_7, 'valor vazio', tokenRange(entry[colonIdx]!)));
      continue;
    }
    const vfirst = valueToks[0]!;
    const vlast = valueToks[valueToks.length - 1]!;
    values.push({ source: source.slice(vfirst.start, vlast.end) });
  }

  return { dict: { schema, values, range }, errors };
}

interface SentinelResult {
  schema: string[] | null;
  malformed: boolean;
}

function parseSentinel(commentValue: string): SentinelResult {
  const m = /^#\s*dictab:cols=(.+)$/.exec(commentValue);
  if (!m) return { schema: null, malformed: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]!.trim());
  } catch {
    return { schema: null, malformed: true };
  }
  if (!Array.isArray(parsed)) return { schema: null, malformed: true };
  if (!parsed.every((x) => typeof x === 'string')) return { schema: null, malformed: true };
  return { schema: parsed, malformed: false };
}

function findInlineComment(stmt: Statement): string | null {
  return stmt.inlineComment?.value ?? null;
}

// =============================================================================
// PUBLIC parse()
// =============================================================================

export function parse(source: string): ParseResult {
  const tokenizer = new Tokenizer(source);
  const { tokens, errors: tokenErrors } = tokenizer.tokenize();
  if (tokenErrors.length > 0) {
    return { errors: tokenErrors, model: null };
  }

  const statements = splitStatements(tokens);
  const errors: ContractError[] = [];
  const header: HeaderItem[] = [];
  const variables: Variable[] = [];
  const trailer: HeaderItem[] = [];
  let pendingComments: string[] = [];
  let pendingBlanks = 0;
  let firstVarSeen = false;
  let docstringConsumed = false;
  let prevEndLine = -1;

  const flushPendingHeader = () => {
    for (let b = 0; b < pendingBlanks; b++) header.push({ kind: 'blank' });
    pendingBlanks = 0;
    for (const c of pendingComments) header.push({ kind: 'comment', source: c });
    pendingComments = [];
  };

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx]!;
    const ts = stmt.tokens;
    if (prevEndLine !== -1 && stmt.startLine > prevEndLine + 1) {
      pendingBlanks += stmt.startLine - prevEndLine - 1;
    }
    const lastTok = ts[ts.length - 1]!;

    if (ts.length === 1 && ts[0]!.type === 'COMMENT') {
      pendingComments.push(ts[0]!.value);
      prevEndLine = lastTok.endLine;
      continue;
    }

    if (
      !docstringConsumed &&
      !firstVarSeen &&
      header.length === 0 &&
      isDocstring(stmt)
    ) {
      flushPendingHeader();
      header.push({ kind: 'docstring', source: ts[0]!.value });
      docstringConsumed = true;
      prevEndLine = lastTok.endLine;
      continue;
    }

    if (isImportStatement(stmt)) {
      if (firstVarSeen) {
        errors.push(err(RULES.R2_2, 'imports devem aparecer antes da primeira variável', rangeOfStmt(stmt)));
        prevEndLine = lastTok.endLine;
        continue;
      }
      flushPendingHeader();
      const first = ts[0]!;
      const importSource = source.slice(first.start, lastTok.end);
      header.push({ kind: 'import', source: importSource });
      prevEndLine = lastTok.endLine;
      continue;
    }

    if (isAnnotatedWithoutValue(stmt)) {
      errors.push(err(RULES.R2_6, 'anotação sem valor não é permitida', rangeOfStmt(stmt)));
      prevEndLine = lastTok.endLine;
      continue;
    }

    const split = tryParseAssignment(stmt);
    if (split) {
      const parsed = parseListOfDicts(source, split.rhs);
      if (parsed === null) {
        const at = split.rhs[0] ?? split.equalsTok;
        errors.push(err(RULES.R3_1, 'valor deve ser list literal', tokenRange(at)));
        prevEndLine = lastTok.endLine;
        continue;
      }
      if (parsed.errors.length > 0) {
        errors.push(...parsed.errors);
        prevEndLine = lastTok.endLine;
        continue;
      }

      let schema: string[];
      let rows: CellValue[][];
      if (parsed.dicts.length === 0) {
        const inlineComment = findInlineComment(stmt);
        if (inlineComment !== null) {
          const sentinel = parseSentinel(inlineComment);
          if (sentinel.malformed) {
            errors.push(err(RULES.R4_2, 'sentinela mal-formado', tokenRange(lastTok)));
            prevEndLine = lastTok.endLine;
            continue;
          }
          schema = sentinel.schema ?? [];
        } else {
          schema = [];
        }
        rows = [];
      } else {
        schema = parsed.dicts[0]!.schema;
        let homogFailed = false;
        for (const d of parsed.dicts.slice(1)) {
          const same = d.schema.length === schema.length && d.schema.every((k, i) => k === schema[i]);
          if (!same) {
            errors.push(err(
              RULES.R3_4,
              `dicts com chaves divergentes (esperava ${JSON.stringify(schema)}, achou ${JSON.stringify(d.schema)})`,
              d.range,
            ));
            homogFailed = true;
            break;
          }
        }
        if (homogFailed) {
          prevEndLine = lastTok.endLine;
          continue;
        }
        rows = parsed.dicts.map((d) => d.values);
      }

      const annotation = split.annotation
        ? ': ' + source.slice(split.annotation[0]!.start, split.annotation[split.annotation.length - 1]!.end)
        : null;

      if (!firstVarSeen) {
        for (let b = 0; b < pendingBlanks; b++) header.push({ kind: 'blank' });
        pendingBlanks = 0;
        firstVarSeen = true;
      } else {
        pendingBlanks = 0;
      }
      const leadingComments = pendingComments;
      pendingComments = [];

      variables.push({
        name: split.nameTok.value,
        annotation,
        schema,
        rows,
        leadingComments,
      });
      prevEndLine = lastTok.endLine;
      continue;
    }

    errors.push(err(RULES.R2_2, 'statement não permitida no toplevel', rangeOfStmt(stmt)));
    prevEndLine = lastTok.endLine;
  }

  if (firstVarSeen) {
    for (let b = 0; b < pendingBlanks; b++) trailer.push({ kind: 'blank' });
    for (const c of pendingComments) trailer.push({ kind: 'comment', source: c });
  } else {
    flushPendingHeader();
  }

  if (errors.length === 0) {
    const seen = new Map<string, number>();
    for (const v of variables) {
      if (seen.has(v.name)) {
        errors.push(err(
          RULES.R2_7,
          `variável '${v.name}' atribuída mais de uma vez`,
          { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
        ));
        break;
      }
      seen.set(v.name, 1);
    }
  }

  if (errors.length > 0) {
    return { errors, model: null };
  }
  return { errors: [], model: { header, variables, trailer } };
}

export const __INTERNAL__ = { PYTHON_BUILTINS };

export type { Token as _Token };
export function _tokenize(source: string): { tokens: Token[]; errors: ContractError[] } {
  return new Tokenizer(source).tokenize();
}
