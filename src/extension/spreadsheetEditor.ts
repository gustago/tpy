import * as vscode from 'vscode';
import type { FileModel } from '../core/model';
import { parse } from '../core/parser';
import { serialize } from '../core/serializer';
import {
  addColumn,
  addRow,
  addVariable,
  deleteVariable,
  removeColumn,
  removeRow,
  renameColumn,
  renameVariable,
  setCell,
} from '../core/operations';
import { applyPaste, parseTsv } from '../core/paste';
import { getWebviewHtml } from '../webview/template';

type RequestMessage =
  | { kind: 'requestAddVariable' }
  | { kind: 'requestDeleteVariable'; varName: string }
  | { kind: 'requestRenameVariable'; varName: string }
  | { kind: 'requestAddColumn'; varName: string }
  | { kind: 'requestRemoveColumn'; varName: string }
  | { kind: 'requestRenameColumn'; varName: string }
  | { kind: 'requestRemoveRow'; varName: string };

type DirectMutation =
  | { kind: 'addRow'; varName: string }
  | { kind: 'setCell'; varName: string; rowIdx: number; columnName: string; expression: string }
  | { kind: 'paste'; varName: string; row: number; col: number; tsv: string };

type IncomingMessage = RequestMessage | DirectMutation;

const REQUEST_KINDS = new Set([
  'requestAddVariable',
  'requestDeleteVariable',
  'requestRenameVariable',
  'requestAddColumn',
  'requestRemoveColumn',
  'requestRenameColumn',
  'requestRemoveRow',
]);

function isRequest(msg: IncomingMessage): msg is RequestMessage {
  return REQUEST_KINDS.has(msg.kind);
}

export class SpreadsheetEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'tpy.spreadsheet';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      SpreadsheetEditorProvider.viewType,
      new SpreadsheetEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    panel.webview.options = { enableScripts: true };
    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);

    const initial = parse(document.getText());
    if (initial.model === null) {
      const first = initial.errors[0];
      vscode.window.showErrorMessage(
        `tpy:arquivo inválido — ${first?.message ?? 'erro desconhecido'}`,
      );
      return;
    }

    const send = (model: FileModel): void => {
      panel.webview.postMessage({ kind: 'state', model });
    };

    send(initial.model);

    const docSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const r = parse(document.getText());
      if (r.model !== null) send(r.model);
    });

    const msgSub = panel.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
      if (isRequest(msg)) {
        const next = await resolveRequest(msg, document);
        if (next !== null) await applyEdit(document, next);
        return;
      }

      const r = parse(document.getText());
      if (r.model === null) return;
      let next: FileModel;
      try {
        next = applyMutation(r.model, msg);
      } catch (err) {
        vscode.window.showErrorMessage(
          `tpy:${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      await applyEdit(document, next);
    });

    panel.onDidDispose(() => {
      docSub.dispose();
      msgSub.dispose();
    });
  }
}

async function resolveRequest(
  msg: RequestMessage,
  document: vscode.TextDocument,
): Promise<FileModel | null> {
  const r = parse(document.getText());
  if (r.model === null) return null;
  const model = r.model;

  try {
    switch (msg.kind) {
      case 'requestAddVariable': {
        const name = await vscode.window.showInputBox({
          prompt: 'Nome da nova variável',
          validateInput: (v) => (v.trim() ? null : 'Nome não pode ser vazio'),
        });
        if (!name) return null;
        return addVariable(model, name.trim());
      }
      case 'requestDeleteVariable': {
        const answer = await vscode.window.showWarningMessage(
          `Deletar variável "${msg.varName}"?`,
          { modal: true },
          'Deletar',
        );
        if (answer !== 'Deletar') return null;
        return deleteVariable(model, msg.varName);
      }
      case 'requestRenameVariable': {
        const newName = await vscode.window.showInputBox({
          prompt: `Novo nome para "${msg.varName}"`,
          value: msg.varName,
          validateInput: (v) => (v.trim() ? null : 'Nome não pode ser vazio'),
        });
        if (!newName || newName.trim() === msg.varName) return null;
        return renameVariable(model, msg.varName, newName.trim());
      }
      case 'requestAddColumn': {
        const columnName = await vscode.window.showInputBox({
          prompt: 'Nome da nova coluna',
          validateInput: (v) => (v.trim() ? null : 'Nome não pode ser vazio'),
        });
        if (!columnName) return null;
        return addColumn(model, msg.varName, columnName.trim());
      }
      case 'requestRemoveColumn': {
        const v = model.variables.find((v) => v.name === msg.varName);
        if (!v || v.schema.length === 0) return null;
        const col = await vscode.window.showQuickPick(v.schema, {
          placeHolder: 'Selecione a coluna a remover',
        });
        if (!col) return null;
        return removeColumn(model, msg.varName, col);
      }
      case 'requestRenameColumn': {
        const v = model.variables.find((v) => v.name === msg.varName);
        if (!v || v.schema.length === 0) return null;
        const oldName = await vscode.window.showQuickPick(v.schema, {
          placeHolder: 'Selecione a coluna a renomear',
        });
        if (!oldName) return null;
        const newName = await vscode.window.showInputBox({
          prompt: `Novo nome para "${oldName}"`,
          value: oldName,
          validateInput: (val) => (val.trim() ? null : 'Nome não pode ser vazio'),
        });
        if (!newName || newName.trim() === oldName) return null;
        return renameColumn(model, msg.varName, oldName, newName.trim());
      }
      case 'requestRemoveRow': {
        const v = model.variables.find((v) => v.name === msg.varName);
        if (!v || v.rows.length === 0) return null;
        const input = await vscode.window.showInputBox({
          prompt: `Número da linha a remover (1–${v.rows.length})`,
          validateInput: (val) => {
            const n = parseInt(val, 10);
            return n >= 1 && n <= v.rows.length
              ? null
              : `Insira um número entre 1 e ${v.rows.length}`;
          },
        });
        if (!input) return null;
        return removeRow(model, msg.varName, parseInt(input, 10) - 1);
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `tpy:${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function applyMutation(model: FileModel, msg: DirectMutation): FileModel {
  switch (msg.kind) {
    case 'addRow':
      return addRow(model, msg.varName);
    case 'setCell':
      return setCell(model, msg.varName, msg.rowIdx, msg.columnName, msg.expression);
    case 'paste':
      return applyPaste(model, msg.varName, msg.row, msg.col, parseTsv(msg.tsv));
  }
}

async function applyEdit(document: vscode.TextDocument, next: FileModel): Promise<void> {
  const newSource = serialize(next);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newSource);
  await vscode.workspace.applyEdit(edit);
}
