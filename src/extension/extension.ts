import * as vscode from 'vscode';
import { registerLanguageFeatures } from './diagnostics';
import { SpreadsheetEditorProvider } from './spreadsheetEditor';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(SpreadsheetEditorProvider.register(context));
  registerLanguageFeatures(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('tpy.openSpreadsheet', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.fileName.endsWith('.t.py')) {
        vscode.window.showErrorMessage(
          'tpy: este comando só funciona em arquivos .t.py',
        );
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        editor.document.uri,
        'tpy.spreadsheet',
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tpy.openSource', async () => {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (
        tab?.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === 'tpy.spreadsheet'
      ) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          tab.input.uri,
          'default',
        );
      }
    }),
  );
}

export function deactivate(): void {
  // nada
}
