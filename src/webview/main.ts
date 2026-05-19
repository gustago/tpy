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
  selectedVars: string[];
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
    selectedVars: [],
  };

  function $(id: string): HTMLElement {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`element not found: ${id}`);
    return el;
  }

  function getActiveVarName(): string | null {
    return state.selectedVars[0] ?? null;
  }

  function syncVarButtonsActive(): void {
    const container = doc.getElementById('varButtons');
    if (!container) return;
    container.querySelectorAll<HTMLButtonElement>('[data-var-toggle]').forEach((btn) => {
      btn.classList.toggle('active', state.selectedVars.includes(btn.dataset.varToggle!));
    });
  }

  function onVarToggle(varName: string): void {
    if (state.selectedVars.includes(varName)) {
      state.selectedVars = state.selectedVars.filter((n) => n !== varName);
    } else {
      state.selectedVars = [...state.selectedVars, varName];
    }
    syncVarButtonsActive();
    renderGrid();
  }

  function renderVarButtons(): void {
    const container = doc.getElementById('varButtons');
    if (!container) return;
    container.innerHTML = '';
    const existingNames = state.model.variables.map((v) => v.name);
    state.selectedVars = state.selectedVars.filter((name) => existingNames.includes(name));
    if (state.selectedVars.length === 0 && state.model.variables.length > 0) {
      state.selectedVars = [state.model.variables[0]!.name];
    }
    for (const v of state.model.variables) {
      const btn = doc.createElement('button');
      btn.textContent = v.name;
      btn.dataset.varToggle = v.name;
      btn.classList.toggle('active', state.selectedVars.includes(v.name));
      btn.addEventListener('click', () => onVarToggle(v.name));
      container.appendChild(btn);
    }
  }

  function renderVarSection(v: Variable): HTMLElement {
    const section = doc.createElement('section');
    section.className = 'var-section';

    const sectionToolbar = doc.createElement('div');
    sectionToolbar.className = 'var-section-toolbar';

    const title = doc.createElement('span');
    title.className = 'var-section-title';
    title.textContent = v.name;
    sectionToolbar.appendChild(title);

    const miniButtons: [string, string, object][] = [
      ['+ linha',  'addRow',         { kind: 'addRow',              varName: v.name }],
      ['– linha',  'removeRow',      { kind: 'requestRemoveRow',    varName: v.name }],
      ['+ coluna', 'addColumn',      { kind: 'requestAddColumn',    varName: v.name }],
      ['– coluna', 'removeColumn',   { kind: 'requestRemoveColumn', varName: v.name }],
    ];
    for (const [label, cmd, msg] of miniButtons) {
      const btn = doc.createElement('button');
      btn.textContent = label;
      btn.dataset.cmd = cmd;
      btn.addEventListener('click', () => vscode.postMessage(msg));
      sectionToolbar.appendChild(btn);
    }
    section.appendChild(sectionToolbar);

    if (v.schema.length === 0 && v.rows.length === 0) {
      const msg = doc.createElement('p');
      msg.textContent = 'Adicione uma coluna pra começar.';
      section.appendChild(msg);
      return section;
    }

    const table = doc.createElement('table');
    table.className = 'dictab-grid';

    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    headRow.appendChild(doc.createElement('th'));
    for (const col of v.schema) {
      const th = doc.createElement('th');
      th.textContent = col;
      th.addEventListener('dblclick', () => {
        vscode.postMessage({ kind: 'requestRenameColumn', varName: v.name, columnName: col });
      });
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
          td.tabIndex = 0;
          td.dataset.row = String(r);
          td.dataset.col = v.schema[c]!;
          td.dataset.varName = v.name;
          td.addEventListener('click', onCellClick);
          td.addEventListener('dblclick', onCellDblClick);
          td.addEventListener('keydown', onCellKey);
          td.addEventListener('paste', onCellPaste);
          td.addEventListener('blur', onCellBlur);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function renderGrid(): void {
    const grid = $('grid');
    grid.innerHTML = '';

    if (state.selectedVars.length === 0) {
      grid.textContent = 'Nenhuma variável. Clique em "+ var" para começar.';
      return;
    }

    for (const varName of state.selectedVars) {
      const v = state.model.variables.find((v) => v.name === varName);
      if (!v) continue;
      grid.appendChild(renderVarSection(v));
    }
  }

  function enterEditMode(td: HTMLTableCellElement): void {
    td.contentEditable = 'true';
    td.focus();
  }

  function onCellClick(e: MouseEvent): void {
    const td = e.target as HTMLTableCellElement;
    if (td.contentEditable === 'true') return;
    doc.querySelectorAll<HTMLElement>('.cell-selected').forEach((el) =>
      el.classList.remove('cell-selected'),
    );
    td.classList.add('cell-selected');
    td.focus();
  }

  function onCellDblClick(e: MouseEvent): void {
    const td = e.target as HTMLTableCellElement;
    if (td.contentEditable === 'true') return;
    enterEditMode(td);
  }

  function onCellBlur(e: FocusEvent): void {
    const td = e.target as HTMLTableCellElement;
    if (td.contentEditable !== 'true') return;
    td.contentEditable = 'false';
    const row = parseInt(td.dataset.row ?? '0', 10);
    const col = td.dataset.col ?? '';
    const varName = td.dataset.varName ?? '';
    const expression = td.textContent ?? '';
    const v = state.model.variables.find((v) => v.name === varName);
    if (!v) return;
    const colIdx = v.schema.indexOf(col);
    const original = colIdx >= 0 ? (v.rows[row]?.[colIdx]?.source ?? '') : '';
    if (expression === original) return;
    vscode.postMessage({ kind: 'setCell', varName, rowIdx: row, columnName: col, expression });
  }

  function onCellPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const td = e.target as HTMLTableCellElement;
    const varName = td.dataset.varName ?? '';
    const v = state.model.variables.find((v) => v.name === varName);
    if (!v) return;
    const row = parseInt(td.dataset['row'] ?? '0', 10);
    const colName = td.dataset['col'] ?? '';
    const colIdx = v.schema.indexOf(colName);
    if (colIdx === -1) return;
    vscode.postMessage({ kind: 'paste', varName, row, col: colIdx, tsv: text });
  }

  function onCellKey(e: KeyboardEvent): void {
    const td = e.target as HTMLTableCellElement;
    const isEditing = td.contentEditable === 'true';

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEditing) {
        td.blur();
      } else {
        enterEditMode(td);
      }
    } else if (e.key === 'Escape' && isEditing) {
      e.preventDefault();
      td.contentEditable = 'false';
      renderGrid();
    }
  }

  function onCommand(cmd: string): void {
    const activeVarName = getActiveVarName();
    switch (cmd) {
      case 'addVariable':
        vscode.postMessage({ kind: 'requestAddVariable' });
        break;
      case 'deleteVariable':
        if (activeVarName === null) return;
        vscode.postMessage({ kind: 'requestDeleteVariable', varName: activeVarName });
        break;
      case 'renameVariable':
        if (activeVarName === null) return;
        vscode.postMessage({ kind: 'requestRenameVariable', varName: activeVarName });
        break;
    }
  }

  function handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg['kind'] === 'state' && msg['model']) {
      state.model = msg['model'] as FileModel;
      renderVarButtons();
      renderGrid();
      const status = doc.getElementById('status');
      if (status) status.textContent = `${state.model.variables.length} variável(eis)`;
    }
  }

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
