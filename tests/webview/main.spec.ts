import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../src/webview/main';
import type { VscodeApi } from '../../src/webview/main';

function buildHtml(): void {
  document.body.innerHTML = `
    <header class="dictab-toolbar">
      <button data-cmd="addVariable">+ var</button>
      <button data-cmd="deleteVariable">– var</button>
      <button data-cmd="renameVariable">renomear var</button>
      <span class="sep"></span>
      <div id="varButtons"></div>
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

// ── Toggle buttons de seleção de variável ─────────────────────────────────

describe('toggle buttons — seleção de variável', () => {
  beforeEach(buildHtml);

  it('renderiza um botão de toggle por variável', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const buttons = document.querySelectorAll('[data-var-toggle]');
    expect(buttons.length).toBe(2);
    expect(buttons[0]!.textContent).toBe('pessoas');
    expect(buttons[1]!.textContent).toBe('cidades');
  });

  it('primeira variável aparece ativa por padrão', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    expect(document.querySelector('[data-var-toggle="pessoas"]')!.classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-var-toggle="cidades"]')!.classList.contains('active')).toBe(false);
  });

  it('clique num botão inativo ativa a variável', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const btn = document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!;
    btn.click();

    expect(app.getState().selectedVars).toContain('cidades');
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('clique num botão ativo desativa a variável', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const btn = document.querySelector<HTMLButtonElement>('[data-var-toggle="pessoas"]')!;
    btn.click();

    expect(app.getState().selectedVars).not.toContain('pessoas');
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('múltiplos toggles podem estar ativos simultaneamente', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    expect(app.getState().selectedVars).toEqual(['pessoas', 'cidades']);
  });

  it('seleciona apenas a primeira variável por padrão', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    expect(app.getState().selectedVars).toEqual(['pessoas']);
  });

  it('mantém variáveis selecionadas que ainda existem após atualização de estado', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();
    expect(app.getState().selectedVars).toContain('cidades');

    dispatchState(app, MODEL_TWO_VARS);
    expect(app.getState().selectedVars).toContain('cidades');
  });

  it('reseta selectedVars para [] quando não há variáveis', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, { variables: [] });
    expect(app.getState().selectedVars).toHaveLength(0);
  });

  it('atualiza o status com o total de variáveis', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    expect(document.getElementById('status')!.textContent).toBe('2 variável(eis)');
  });

  it('múltiplas mensagens de state atualizam os botões corretamente', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    dispatchState(app, MODEL_EMPTY_VAR);

    const buttons = document.querySelectorAll('[data-var-toggle]');
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.textContent).toBe('dados');
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
    expect(ths.length).toBe(3);
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
    expect(Array.from(cells).map((c) => c.textContent)).toEqual(['"Alice"', '30', '"Bob"', '25']);
  });

  it('células NÃO têm contentEditable por padrão (modo seleção)', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cells = document.querySelectorAll<HTMLTableCellElement>('td[data-col]');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => expect(c.contentEditable).not.toBe('true'));
  });

  it('células têm tabIndex para receber foco e eventos', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cells = document.querySelectorAll<HTMLTableCellElement>('td[data-col]');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => expect(c.tabIndex).toBe(0));
  });

  it('renderiza índice das linhas (1-based)', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const idxCells = document.querySelectorAll('.row-idx');
    expect(Array.from(idxCells).map((c) => c.textContent)).toEqual(['1', '2']);
  });

  it('múltiplas variáveis selecionadas renderiza múltiplas seções', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    expect(document.querySelectorAll('.var-section').length).toBe(2);
  });

  it('cada seção exibe o nome da variável no título', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    const titles = document.querySelectorAll('.var-section-title');
    expect(Array.from(titles).map((t) => t.textContent)).toEqual(['pessoas', 'cidades']);
  });

  it('cada seção renderiza a tabela correta da sua variável', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    const sections = document.querySelectorAll('.var-section');
    const firstThs = Array.from(sections[0]!.querySelectorAll('th')).map((t) => t.textContent);
    const secondThs = Array.from(sections[1]!.querySelectorAll('th')).map((t) => t.textContent);
    expect(firstThs).toEqual(['', 'nome', 'idade']);
    expect(secondThs).toEqual(['', 'cidade']);
  });

  it('desativar toggle remove a seção do grid', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    expect(document.querySelectorAll('.var-section').length).toBe(1);
    document.querySelector<HTMLButtonElement>('[data-var-toggle="pessoas"]')!.click();
    expect(document.querySelectorAll('.var-section').length).toBe(0);
  });
});

// ── Toolbar global — apenas operações de variável ─────────────────────────

describe('toolbar global — operações de variável', () => {
  beforeEach(buildHtml);

  it('+ var → requestAddVariable', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);
    click('addVariable');
    expect(vs.calls).toContainEqual({ kind: 'requestAddVariable' });
  });

  it('– var → requestDeleteVariable com varName (primeira selecionada)', () => {
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

  it('deleteVariable não posta mensagem se não há variáveis', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, { variables: [] });
    click('deleteVariable');
    expect(vs.calls).toHaveLength(0);
  });

  it('toolbar NÃO tem botões de linha nem de coluna', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    const toolbar = document.querySelector('.dictab-toolbar')!;
    expect(toolbar.querySelector('[data-cmd="addRow"]')).toBeNull();
    expect(toolbar.querySelector('[data-cmd="removeRow"]')).toBeNull();
    expect(toolbar.querySelector('[data-cmd="addColumn"]')).toBeNull();
    expect(toolbar.querySelector('[data-cmd="removeColumn"]')).toBeNull();
  });

  it('toolbar NÃO tem botão renomear coluna', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    const toolbar = document.querySelector('.dictab-toolbar')!;
    expect(toolbar.querySelector('[data-cmd="renameColumn"]')).toBeNull();
  });
});

// ── Mini-toolbar por seção ─────────────────────────────────────────────────

describe('mini-toolbar por seção — linha e coluna', () => {
  beforeEach(buildHtml);

  it('cada seção tem mini-toolbar com os quatro botões', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const toolbar = document.querySelector('.var-section-toolbar')!;
    const cmds = Array.from(toolbar.querySelectorAll('[data-cmd]')).map((b) =>
      b.getAttribute('data-cmd'),
    );
    expect(cmds).toContain('addRow');
    expect(cmds).toContain('removeRow');
    expect(cmds).toContain('addColumn');
    expect(cmds).toContain('removeColumn');
  });

  it('+ linha na seção "pessoas" posta addRow para pessoas', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const section = document.querySelector('.var-section')!;
    section.querySelector<HTMLButtonElement>('[data-cmd="addRow"]')!.click();
    expect(vs.calls).toContainEqual({ kind: 'addRow', varName: 'pessoas' });
  });

  it('– linha na seção posta requestRemoveRow para a variável correta', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const section = document.querySelector('.var-section')!;
    section.querySelector<HTMLButtonElement>('[data-cmd="removeRow"]')!.click();
    expect(vs.calls).toContainEqual({ kind: 'requestRemoveRow', varName: 'pessoas' });
  });

  it('+ coluna na seção posta requestAddColumn para a variável correta', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const section = document.querySelector('.var-section')!;
    section.querySelector<HTMLButtonElement>('[data-cmd="addColumn"]')!.click();
    expect(vs.calls).toContainEqual({ kind: 'requestAddColumn', varName: 'pessoas' });
  });

  it('– coluna na seção posta requestRemoveColumn para a variável correta', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const section = document.querySelector('.var-section')!;
    section.querySelector<HTMLButtonElement>('[data-cmd="removeColumn"]')!.click();
    expect(vs.calls).toContainEqual({ kind: 'requestRemoveColumn', varName: 'pessoas' });
  });

  it('com duas seções, cada mini-toolbar afeta a própria variável', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    const sections = document.querySelectorAll('.var-section');
    sections[1]!.querySelector<HTMLButtonElement>('[data-cmd="addRow"]')!.click();
    expect(vs.calls).toContainEqual({ kind: 'addRow', varName: 'cidades' });
  });
});

// ── Renomear coluna — duplo clique no header ──────────────────────────────

describe('renomear coluna — duplo clique no <th>', () => {
  beforeEach(buildHtml);

  it('duplo clique num header posta requestRenameColumn com varName e columnName', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const ths = document.querySelectorAll<HTMLElement>('th');
    // ths[0] = vazio (row-idx), ths[1] = 'nome'
    ths[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(vs.calls).toContainEqual({
      kind: 'requestRenameColumn',
      varName: 'pessoas',
      columnName: 'nome',
    });
  });

  it('duplo clique em coluna diferente usa o columnName correto', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const ths = document.querySelectorAll<HTMLElement>('th');
    // ths[2] = 'idade'
    ths[2]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(vs.calls).toContainEqual({
      kind: 'requestRenameColumn',
      varName: 'pessoas',
      columnName: 'idade',
    });
  });

  it('com duas seções, dblclick no header da segunda seção usa o varName correto', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    document.querySelector<HTMLButtonElement>('[data-var-toggle="cidades"]')!.click();

    const sections = document.querySelectorAll('.var-section');
    const cidadesThs = sections[1]!.querySelectorAll<HTMLElement>('th');
    // cidadesThs[0] = vazio, cidadesThs[1] = 'cidade'
    cidadesThs[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(vs.calls).toContainEqual({
      kind: 'requestRenameColumn',
      varName: 'cidades',
      columnName: 'cidade',
    });
  });

  it('NÃO existe botão renomear coluna em nenhum lugar da UI', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);
    expect(document.querySelector('[data-cmd="renameColumn"]')).toBeNull();
  });
});

// ── Seleção de célula (clique único seleciona, não edita) ─────────────────

describe('seleção de célula — clique único seleciona, não edita', () => {
  beforeEach(buildHtml);

  it('clique simples adiciona classe cell-selected à célula', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(cell.classList.contains('cell-selected')).toBe(true);
  });

  it('clique simples NÃO ativa contentEditable', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(cell.contentEditable).not.toBe('true');
  });

  it('clicar em outra célula transfere seleção', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell1 = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    const cell2 = document.querySelector<HTMLTableCellElement>('td[data-col="idade"]')!;

    cell1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cell2.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(cell1.classList.contains('cell-selected')).toBe(false);
    expect(cell2.classList.contains('cell-selected')).toBe(true);
  });

  it('clique simples não posta mensagem nenhuma', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(vs.calls).toHaveLength(0);
  });
});

// ── Modo de edição — duplo clique ─────────────────────────────────────────

describe('modo de edição — duplo clique', () => {
  beforeEach(buildHtml);

  it('duplo clique ativa contentEditable na célula', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(cell.contentEditable).toBe('true');
  });

  it('blur com valor alterado posta setCell', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    cell.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(vs.calls).toHaveLength(0);
  });

  it('blur sem modo de edição não posta nada', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(vs.calls).toHaveLength(0);
  });

  it('Enter em modo de edição dispara blur (commit)', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    cell.textContent = '"Delta"';
    const blurSpy = vi.spyOn(cell, 'blur');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(blurSpy).toHaveBeenCalled();
  });

  it('Enter em célula selecionada (sem edição) entra no modo de edição', () => {
    const app = createApp(makeVscode(), document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(cell.contentEditable).toBe('true');
  });

  it('Escape re-renderiza grid sem postar mensagem', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-col="nome"]')!;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    cell.textContent = '"Alterado"';
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

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

    const cell = document.querySelector<HTMLTableCellElement>('td[data-row="0"][data-col="nome"]')!;
    pasteOn(cell, 'a\tb\nc\td');

    expect(vs.calls).toContainEqual({ kind: 'paste', varName: 'pessoas', row: 0, col: 0, tsv: 'a\tb\nc\td' });
  });

  it('paste em célula da segunda coluna usa col=1', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-row="1"][data-col="idade"]')!;
    pasteOn(cell, 'x\ty\n');

    expect(vs.calls).toContainEqual({ kind: 'paste', varName: 'pessoas', row: 1, col: 1, tsv: 'x\ty\n' });
  });

  it('paste de string sem TAB nem newline NÃO envia mensagem', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-row="0"][data-col="nome"]')!;
    const ev = pasteOn(cell, 'apenas uma string');
    expect(vs.calls).toHaveLength(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('paste com newline envia mensagem (TSV de coluna única)', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-row="0"][data-col="nome"]')!;
    pasteOn(cell, 'a\nb\nc');

    expect(vs.calls).toContainEqual({ kind: 'paste', varName: 'pessoas', row: 0, col: 0, tsv: 'a\nb\nc' });
  });

  it('paste de TSV chama preventDefault', () => {
    const vs = makeVscode();
    const app = createApp(vs, document);
    dispatchState(app, MODEL_TWO_VARS);

    const cell = document.querySelector<HTMLTableCellElement>('td[data-row="0"][data-col="nome"]')!;
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
});
