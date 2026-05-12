/**
 * Webview-side script. Runs in the VSCode webview iframe.
 * Receives state from the extension; posts mutation messages back.
 */

export interface VscodeApi {
  postMessage(msg: unknown): void;
}

interface CellValue {
  source: string;
}

interface Variable {
  name: string;
  schema: string[];
  rows: CellValue[][];
}

interface FileModel {
  variables: Variable[];
}

interface AppState {
  model: FileModel;
  selectedVar: string | null;
}

export function createApp(
  vscode: VscodeApi,
  doc: Document,
): {
  handleMessage(data: unknown): void;
  getState(): Readonly<AppState>;
} {
  const state: AppState = {
    model: { variables: [] },
    selectedVar: null,
  };

  function $(id: string): HTMLElement {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`element not found: ${id}`);
    return el;
  }

  function getCurrentVar(): Variable | null {
    if (state.selectedVar === null) return null;
    return state.model.variables.find((v) => v.name === state.selectedVar) ?? null;
  }

  function renderVarSelect(): void {
    const select = $('varSelect') as HTMLSelectElement;
    select.innerHTML = '';
    for (const v of state.model.variables) {
      const opt = doc.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name;
      select.appendChild(opt);
    }
    if (
      state.selectedVar !== null &&
      state.model.variables.some((v) => v.name === state.selectedVar)
    ) {
      select.value = state.selectedVar;
    } else if (state.model.variables.length > 0) {
      state.selectedVar = state.model.variables[0]!.name;
      select.value = state.selectedVar;
    } else {
      state.selectedVar = null;
    }
  }

  function renderGrid(): void {
    const grid = $('grid');
    grid.innerHTML = '';
    const v = getCurrentVar();
    if (v === null) {
      grid.textContent = 'Nenhuma variável. Clique em "+ var" para começar.';
      return;
    }
    if (v.schema.length === 0 && v.rows.length === 0) {
      grid.textContent = 'Adicione uma coluna pra começar.';
      return;
    }
    const table = doc.createElement('table');
    table.className = 'dictab-grid';

    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    headRow.appendChild(doc.createElement('th'));
    for (const col of v.schema) {
      const th = doc.createElement('th');
      th.textContent = col;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    if (v.rows.length === 0) {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.colSpan = v.schema.length + 1;
      td.textContent = 'Sem linhas';
      td.className = 'empty-rows';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (let r = 0; r < v.rows.length; r++) {
        const row = v.rows[r]!;
        const tr = doc.createElement('tr');
        const idx = doc.createElement('td');
        idx.textContent = String(r + 1);
        idx.className = 'row-idx';
        tr.appendChild(idx);
        for (let c = 0; c < v.schema.length; c++) {
          const td = doc.createElement('td');
          td.textContent = row[c]?.source ?? '';
          td.contentEditable = 'true';
          td.dataset.row = String(r);
          td.dataset.col = v.schema[c]!;
          td.addEventListener('blur', onCellBlur);
          td.addEventListener('keydown', onCellKey);
          td.addEventListener('paste', onCellPaste);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    grid.appendChild(table);
  }

  function onCellBlur(e: FocusEvent): void {
    const td = e.target as HTMLTableCellElement;
    const row = parseInt(td.dataset.row ?? '0', 10);
    const col = td.dataset.col ?? '';
    const expression = td.textContent ?? '';
    const v = getCurrentVar();
    if (!v) return;
    const original = v.rows[row]?.find((_, i) => v.schema[i] === col)?.source ?? '';
    if (expression === original) return;
    vscode.postMessage({
      kind: 'setCell',
      varName: state.selectedVar,
      rowIdx: row,
      columnName: col,
      expression,
    });
  }

  function onCellPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // Detecta TSV: tem TAB (multi-coluna) ou \n (multi-linha). Senão deixa o
    // comportamento padrão (cola string única na célula).
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const td = e.target as HTMLTableCellElement;
    const v = getCurrentVar();
    if (!v) return;
    const row = parseInt(td.dataset['row'] ?? '0', 10);
    const colName = td.dataset['col'] ?? '';
    const colIdx = v.schema.indexOf(colName);
    if (colIdx === -1) return;
    vscode.postMessage({
      kind: 'paste',
      varName: state.selectedVar,
      row,
      col: colIdx,
      tsv: text,
    });
  }

  function onCellKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      renderGrid();
    }
  }

  function onCommand(cmd: string): void {
    switch (cmd) {
      case 'addVariable':
        vscode.postMessage({ kind: 'requestAddVariable' });
        break;
      case 'deleteVariable':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestDeleteVariable', varName: state.selectedVar });
        break;
      case 'renameVariable':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestRenameVariable', varName: state.selectedVar });
        break;
      case 'addColumn':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestAddColumn', varName: state.selectedVar });
        break;
      case 'removeColumn':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestRemoveColumn', varName: state.selectedVar });
        break;
      case 'renameColumn':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestRenameColumn', varName: state.selectedVar });
        break;
      case 'addRow':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'addRow', varName: state.selectedVar });
        break;
      case 'removeRow':
        if (state.selectedVar === null) return;
        vscode.postMessage({ kind: 'requestRemoveRow', varName: state.selectedVar });
        break;
    }
  }

  function handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg['kind'] === 'state' && msg['model']) {
      state.model = msg['model'] as FileModel;
      renderVarSelect();
      renderGrid();
      const status = doc.getElementById('status');
      if (status) status.textContent = `${state.model.variables.length} variável(eis)`;
    }
  }

  // Bind toolbar events
  const selectEl = doc.getElementById('varSelect') as HTMLSelectElement | null;
  selectEl?.addEventListener('change', () => {
    state.selectedVar = selectEl.value;
    renderGrid();
  });

  doc.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => onCommand(btn.dataset.cmd!));
  });

  return {
    handleMessage,
    getState: () => ({ ...state }),
  };
}

// Entry point — only runs inside actual VSCode webview
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any)['acquireVsCodeApi'] === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vsApi = (globalThis as any)['acquireVsCodeApi']() as VscodeApi;
  const app = createApp(vsApi, document);
  window.addEventListener('message', (e: MessageEvent) => app.handleMessage(e.data));
}
