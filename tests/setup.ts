import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-expect-error Node 16 polyfill for globalThis.crypto
  globalThis.crypto = webcrypto;
}
