// Polyfill globalThis.crypto para Node 16 (requerido pelo Vite/Vitest)
if (!globalThis.crypto) {
  const { webcrypto } = require('node:crypto');
  globalThis.crypto = webcrypto;
}
