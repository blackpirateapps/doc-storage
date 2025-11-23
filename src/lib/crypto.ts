// Identical to previous version, now in src/lib
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(dataBuffer: ArrayBuffer, password: string) {
  const salt = "static-salt-production"; 
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    dataBuffer
  );

  return {
    iv: Array.from(iv),
    content: new Uint8Array(encryptedContent)
  };
}

export async function decryptData(encryptedData: ArrayBuffer, ivArray: number[], password: string) {
  const salt = "static-salt-production";
  const key = await deriveKey(password, salt);
  const iv = new Uint8Array(ivArray);
  
  return window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encryptedData
  );
}

export const generateId = () => Math.random().toString(36).substr(2, 9);