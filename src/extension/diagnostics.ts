import * as vscode from 'vscode';
import { parse } from '../core/parser';
import { completionsAt, diagnosticsFor, hoverAt } from '../core/lsp-logic';
import type { SourcePosition } from '../core/model';

const SELECTOR: vscode.DocumentSelector = { pattern: '**/*.t.py' };

export function registerLanguageFeatures(
  context: vscode.ExtensionContext,
): void {
  const collection = vscode.languages.createDiagnosticCollection('tpy');
  context.subscriptions.push(collection);

  const refresh = (doc: vscode.TextDocument): void => {
    if (!doc.fileName.endsWith('.t.py')) return;
    const text = doc.getText();
    const r = parse(text);
    const diags = diagnosticsFor(r.errors, r.model, text);
    collection.set(
      doc.uri,
      diags.map((d) => {
        const start = new vscode.Position(d.range.start.line, d.range.start.column);
        const end = new vscode.Position(d.range.end.line, d.range.end.column);
        const severity =
          d.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
        const diag = new vscode.Diagnostic(new vscode.Range(start, end), d.message, severity);
        diag.source = 'tpy';
        diag.code = d.ruleId;
        return diag;
      }),
    );
  };

  for (const doc of vscode.workspace.textDocuments) refresh(doc);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        provideCompletionItems(doc, position) {
          const r = parse(doc.getText());
          if (r.model === null) return [];
          const pos: SourcePosition = { line: position.line, column: position.character };
          return completionsAt(r.model, doc.getText(), pos).map(
            (c) => new vscode.CompletionItem(c.label, vscode.CompletionItemKind.Field),
          );
        },
      },
      '"',
      "'",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTOR, {
      provideHover(doc, position) {
        const r = parse(doc.getText());
        if (r.model === null) return null;
        const pos: SourcePosition = { line: position.line, column: position.character };
        const h = hoverAt(r.model, doc.getText(), pos);
        if (h === null) return null;
        const start = new vscode.Position(h.range.start.line, h.range.start.column);
        const end = new vscode.Position(h.range.end.line, h.range.end.column);
        return new vscode.Hover(new vscode.MarkdownString(h.markdown), new vscode.Range(start, end));
      },
    }),
  );
}
