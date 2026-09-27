// @ts-ignore — crypto-js has no type declarations
import CryptoJS from "crypto-js";

function getKey(t: string): number[] {
  const e: number[] = [];
  for (let n = 0; n < t.length; n += 2) {
    const r = parseInt(t.slice(n, n + 2), 16);
    e.push(r);
  }
  return e;
}

function getKeyPair(keys: [string, string]) {
  const key = CryptoJS.enc.Utf8.parse(
    String.fromCharCode(...getKey(keys[0]))
  );
  const iv = CryptoJS.enc.Utf8.parse(
    String.fromCharCode(...getKey(keys[1]))
  );
  return { key, iv };
}

export function decrypt(encrypted: string, keys: [string, string]): string {
  const { key, iv } = getKeyPair(keys);
  const decrypted = CryptoJS.AES.decrypt(encrypted, key, { iv });
  return decrypted.toString(CryptoJS.enc.Utf8);
}
