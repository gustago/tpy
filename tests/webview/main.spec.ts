import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../src/webview/main';
import type { VscodeApi } from '../../src/webview/main';

// Monta a estrutura HTML que o template.ts gera no webview real
function buildHtml(): void {
  document.body.innerHTML = `
    <header class="dictab-toolbar">
      <select id="varSelect" aria-label="Variável"></select>
      <button data-cmd="addVariable">+ var</button>
      <button data-cmd="deleteVariable">– var</button>
      <button data-cmd="renameVariable">renomear var</button>
      <button data-cmd="addRow">+ linha</button>
      <button data-cmd="removeRow">– linha</button>
      <button data-cmd="addColumn">+ coluna</button>
      <button data-cmd="removeColumn">– coluna</button>
      <button data-cmd="renameColumn">renomear coluna</button>
    </header>
    <main id="grid"></main>
    <div id="status"></div>
  `;
}

function makeVscode(): VscodeApi & { calls: unknown[] } {
  const calls: unknown[] = [];
  return { postMessage: (msg) => calls.push(msg), calls };
}

function click(cmd: string): void {
  const btn = document.querySelector<HTMLButtonElement>(`[data-cmd="${cmd}"]`);
  if (!btn) throw new Error(`button [data-cmd="${cmd}"] not found`);
  btn.click();
}

function dispatchState(app: ReturnType<typeof createApp>, model: object): void {
  app.handleMessage({ kind: 'state', model });
}

const MODEL_TWO_VARS = {
  variables: [
    {
      name: 'pessoas',
      schema: ['nome', 'idade'],
      rows: [
        [{ source: '"Alice"' }, { source: '30' }],
        [{ source: '"Bob"' }, { source: '25' }],
      ],
    },
    {
      name: 'cidades',
      schema: ['cidade'],
      rows: [[{ source: '"SP"' }]],
    },
  ],
};

const MODEL_EMPTY_VAR = {
  variables: [{ name: 'dados', schema: [], rows: [] }],
};

const MODEL_ZERO_ROWS = {
  variables: [{ name: 'tab', schema: ['a', 'b'], rows: [] }],
};

// ── Renderização inicial ───────────────────────────────────────────────────

describe('renderização — varSelect', () => {
  beforeEach(buildHtml);

  it('popula o dropdown com os nomes das variáveis', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const select = document.getElementById('varSelect') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0]!.value).toBe('pessoas');
    expect(select.options[1]!.value).toBe('cidades');
  });

  it('seleciona a primeira variável por padrão', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    expect(app.getState().selectedVar).toBe('pessoas');
  });

  it('mantém a variável selecionada se ainda existir após atualização de estado', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const select = document.getElementById('varSelect') as HTMLSelectElement;
    select.value = 'cidades';
    select.dispatchEvent(new Event('change'));

    dispatchState(app, MODEL_TWO_VARS);
    expect(app.getState().selectedVar).toBe('cidades');
  });

  it('reseta selectedVar para null quando não há variáveis', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, { variables: [] });
    expect(app.getState().selectedVar).toBeNull();
  });

  it('atualiza o status com o total de variáveis', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    expect(document.getElementById('status')!.textContent).toBe('2 variável(eis)');
  });
});

// ── Renderização do grid ───────────────────────────────────────────────────

describe('renderização — grid', () => {
  beforeEach(buildHtml);

  it('sem variáveis: mostra mensagem padrão', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, { variables: [] });
    expect(document.getElementById('grid')!.textContent).toContain('Nenhuma variável');
  });

  it('variável 0×0: mostra "Adicione uma coluna"', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_EMPTY_VAR);
    expect(document.getElementById('grid')!.textContent).toContain('Adicione uma coluna');
  });

  it('variável com colunas mas 0 linhas: mostra header + "Sem linhas"', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_ZERO_ROWS);

    const ths = document.querySelectorAll('th');
    // primeira th vazia (row-idx), depois as colunas
    expect(ths.length).toBe(3); // vazio + "a" + "b"
    expect(ths[1]!.textContent).toBe('a');
    expect(ths[2]!.textContent).toBe('b');
    expect(document.querySelector('.empty-rows')!.textContent).toBe('Sem linhas');
  });

  it('renderiza cabeçalhos corretos para variável com dados', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const ths = document.querySelectorAll('th');
    expect(Array.from(ths).map((t) => t.textContent)).toEqual(['', 'nome', 'idade']);
  });

  it('renderiza conteúdo das células corretamente', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cells = document.querySelectorAll<HTMLTableCellElement>('td[data-col]');
    const values = Array.from(cells).map((c) => c.textContent);
    expect(values).toEqual(['"Alice"', '30', '"Bob"', '25']);
  });

  it('células têm contentEditable="true"', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cells = document.querySelectorAll<HTMLTableCellElement>('td[data-col]');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => expect(c.contentEditable).toBe('true'));
  });

  it('renderiza índice das linhas (1-based)', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const idxCells = document.querySelectorAll('.row-idx');
    expect(Array.from(idxCells).map((c) => c.textContent)).toEqual(['1', '2']);
  });
});

// ── Botões da toolbar → mensagens request* ────────────────────────────────

describe('toolbar — mensagens enviadas ao extension', () => {
  beforeEach(buildHtml);

  it('+ var → requestAddVariable', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('addVariable');
    expect(vs.calls).toContainEqual({ kind: 'requestAddVariable' });
  });

  it('– var → requestDeleteVariable com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('deleteVariable');
    expect(vs.calls).toContainEqual({ kind: 'requestDeleteVariable', varName: 'pessoas' });
  });

  it('renomear var → requestRenameVariable com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('renameVariable');
    expect(vs.calls).toContainEqual({ kind: 'requestRenameVariable', varName: 'pessoas' });
  });

  it('+ coluna → requestAddColumn com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('addColumn');
    expect(vs.calls).toContainEqual({ kind: 'requestAddColumn', varName: 'pessoas' });
  });

  it('– coluna → requestRemoveColumn com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('removeColumn');
    expect(vs.calls).toContainEqual({ kind: 'requestRemoveColumn', varName: 'pessoas' });
  });

  it('renomear coluna → requestRenameColumn com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('renameColumn');
    expect(vs.calls).toContainEqual({ kind: 'requestRenameColumn', varName: 'pessoas' });
  });

  it('+ linha → addRow direto (sem request)', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('addRow');
    expect(vs.calls).toContainEqual({ kind: 'addRow', varName: 'pessoas' });
  });

  it('– linha → requestRemoveRow com varName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('removeRow');
    expect(vs.calls).toContainEqual({ kind: 'requestRemoveRow', varName: 'pessoas' });
  });

  it('botões não postam se selectedVar for null', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, { variables: [] }); // selectedVar = null
    click('deleteVariable');
    click('addRow');
    click('addColumn');
    expect(vs.calls).toHaveLength(0);
  });

  it('troca de variável no select atualiza selectedVar e re-renderiza grid', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const select = document.getElementById('varSelect') as HTMLSelectElement;
    select.value = 'cidades';
    select.dispatchEvent(new Event('change'));

    expect(app.getState().selectedVar).toBe('cidades');
    const ths = document.querySelectorAll('th');
    expect(Array.from(ths).map((t) => t.textContent)).toEqual(['', 'cidade']);
  });
});

// ── Edição de célula ───────────────────────────────────────────────────────

describe('edição de célula', () => {
  beforeEach(buildHtml);

  it('blur com valor alterado posta setCell', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.textContent = '"Carlos"';
    cell.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(vs.calls).toContainEqual({
      kind: 'setCell',
      varName: 'pessoas',
      rowIdx: 0,
      columnName: 'nome',
      expression: '"Carlos"',
    });
  });

  it('blur sem alteração não posta nada', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    // textContent já é '"Alice"' — não altera
    cell.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(vs.calls).toHaveLength(0);
  });

  it('Enter dispara blur (commit)', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.textContent = '"Delta"';
    const blurSpy = vi.spyOn(cell, 'blur');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(blurSpy).toHaveBeenCalled();
  });

  it('Escape re-renderiza grid sem postar mensagem', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.textContent = '"Alterado"';
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Grid re-renderizado: célula volta ao valor original
    const freshCell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    expect(freshCell.textContent).toBe('"Alice"');
    expect(vs.calls).toHaveLength(0);
  });
});

// ── Paste TSV ──────────────────────────────────────────────────────────────

describe('paste TSV', () => {
  beforeEach(buildHtml);

  function pasteOn(cell: HTMLTableCellElement, text: string): ClipboardEvent {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
    });
    cell.dispatchEvent(event);
    return event;
  }

  it('paste com TAB envia mensagem paste com row/col/tsv', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>(
      'td[data-row="0"][data-col="nome"]',
    )!;
    pasteOn(cell, 'a\tb\nc\td');

    expect(vs.calls).toContainEqual({
      kind: 'paste',
      varName: 'pessoas',
      row: 0,
      col: 0,
      tsv: 'a\tb\nc\td',
    });
  });

  it('paste em célula da segunda coluna usa col=1', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>(
      'td[data-row="1"][data-col="idade"]',
    )!;
    pasteOn(cell, 'x\ty\n');

    expect(vs.calls).toContainEqual({
      kind: 'paste',
      varName: 'pessoas',
      row: 1,
      col: 1,
      tsv: 'x\ty\n',
    });
  });

  it('paste de string sem TAB nem newline NÃO envia mensagem (comportamento padrão)', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>(
      'td[data-row="0"][data-col="nome"]',
    )!;
    const ev = pasteOn(cell, 'apenas uma string');
    expect(vs.calls).toHaveLength(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('paste com newline (mas sem TAB) envia mensagem — TSV de coluna única', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>(
      'td[data-row="0"][data-col="nome"]',
    )!;
    pasteOn(cell, 'a\nb\nc');

    expect(vs.calls).toContainEqual({
      kind: 'paste',
      varName: 'pessoas',
      row: 0,
      col: 0,
      tsv: 'a\nb\nc',
    });
  });

  it('paste de TSV chama preventDefault', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>(
      'td[data-row="0"][data-col="nome"]',
    )!;
    const ev = pasteOn(cell, 'a\tb');
    expect(ev.defaultPrevented).toBe(true);
  });
});

// ── handleMessage — casos de borda ────────────────────────────────────────

describe('handleMessage — robustez', () => {
  beforeEach(buildHtml);

  it('ignora mensagem null', () => {
    const app = createApp(makeVscode(), document);
    expect(() => app.handleMessage(null)).not.toThrow();
  });

  it('ignora mensagem com kind desconhecido', () => {
    const app = createApp(makeVscode(), document);
    expect(() => app.handleMessage({ kind: 'unknown' })).not.toThrow();
  });

  it('múltiplas mensagens de state acumulam corretamente o último', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    dispatchState(app, MODEL_EMPTY_VAR);

    const select = document.getElementById('varSelect') as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.options[0]!.value).toBe('dados');
  });
});
