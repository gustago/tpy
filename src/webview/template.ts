import * as vscode from 'vscode';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = makeNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css'),
  );
  const themeMode = vscode.workspace.getConfiguration('tpy').get<string>('theme', 'auto');

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${themeMode}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>tpy</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <header class="tpy-toolbar">
    <button data-cmd="addVariable">+ var</button>
    <button data-cmd="deleteVariable">– var</button>
    <button data-cmd="renameVariable">renomear var</button>
    <span class="sep"></span>
    <div id="varButtons"></div>
  </header>
  <main id="grid"></main>
  <div id="status"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  let out = '';
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
