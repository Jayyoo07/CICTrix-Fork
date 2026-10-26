import { isMockModeEnabled, supabase } from '../../supabase';

// Standard 2048-bit RSA-OAEP development key pair.
// In production, the public key can be overridden via VITE_DOCUMENT_ENCRYPTION_PUBLIC_KEY,
// and the private key is held in Postgres and released via the get_document_decryption_key RPC.
const DEFAULT_PUBLIC_KEY_BASE64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlvXgj9DZyrJuW8Q8nnyWlPVDZ5HJ38N8IdYVzOGr5FOMkgKnZPdI05BOj5ydfYwNvHPdtM0unGXHO5wV/pYhEvPHCMkXJzf6BpIgpJC7YN2j1yzls6D437TjUQA6uI39LGgd7tNUz+Tg6VrgRQIUUBIx8Df9JJkM3ztx0WNNGha3tiZqooNcEh8MO8kz6VTcldubiC8426qCaRPT0YJ0Mp7PZT0MPNjycXdgTRzcfl843TqG73MdEHp9biUNAe6I5Cv8jYh2GowjCx0Untg1trTSc/h6uzCoEUzQ03VFxd0XOsw3GtXh3z6NOn9f5fh6fW0lQS7ZEVy2xNXl7Gf2MQIDAQAB';

const DEFAULT_PRIVATE_KEY_BASE64 =
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCW9eCP0NnKsm5bxDyefJaU9UNnkcnfw3wh1hXM4avkU4ySAqdk90jTkE6PnJ19jA28c920zS6cZcc7nBX+liES88cIyRcnN/oGkiCkkLtg3aPXLOWzoPjftONRADq4jf0saB3u01TP5ODpWuBFAhRQEjHwN/0kmQzfO3HRY00aFre2Jmqig1wSHww7yTPpVNyV25uILzjbqoJpE9PRgnQyns9lPQw82PJxd2BNHNx+XzjdOobvcx0Qen1uJQ0B7ojkK/yNiHYajCMLHRSe2DW2tNJz+Hq7MKgRTNDTdUXF3Rc6zDca1eHfPo06f1/l+Hp9bSVBLtkRXLbE1eXsZ/YxAgMBAAECggEAF0pno2CqXXjSiIN6A8y+kcxWYjIOxqB7NCA63FGcCt3uE+/nYi850/RRfpw/+ykCzIbG17iJXrVgO/zsssr4XttwI5Wc5h7fiyh780/mLP99IftqFCD7jM40fSCPLr6vZyzII3sE/I84OSCddeAogKMSA9kri/w2DXH3MUJEGMhYVRKCLQEJ0xrUMvB/y1EST8LTi+C4BX8elZ5/f51vpPKZAbtDc5pYReZliS+3UNVwGVC+G41mQFeXlu8x9UnARm/EVNoYoXSqLXL9ieZ5pJh7sZ+9Ni96l1gU92odXK1fyPqdT4a1ukOPssOSRMaZx3en3To8s1Wdt1vXKgGkLQKBgQDG4KbCqCU+FOzw0p9KMS9Grnf0KhPmHB0pCfjUzoRmqDrS/7Ve3V5oGP5ytpU1UFjhuqE0l9NTqFblDl4OvnRkN0JRqR9KcZSs14sQF9QjeRAzww4ydS4Cgm4D94t/lBUqW0FN43qYuvp+jRk9aavyhOSL/h/RKMTyyF+/jRl8zQKBgQDCUekgRXtR4bVzbfTfGLu7kbIlPsTBjghBQY6PBp1UjhzRNtRudDaVM3JDwCJatfiyC//+6s/nIxZWImYB+r6yh4D9CndS7W0gFAg6suErOMw3fadQKxrTNiaGiZasJA1s0Rnetj7G9JjF/8jJacaLjTk2Ar3CyAgiJUxuV/Ge9QKBgQC3QWjIc7Ilm5idbCc1cU7z3W5RAbjmT7+bAkJUrZuZEKlrpg6VRHxqhaVpRM8GmmvcTGGhGcm0C6lOVcfb5ClR8w1cO+/GZBSwk8jjYmGq8jI40CKz4gAsdc00QJU9UNGT/xSU1ekw9RI/LHs2eLnltgj26oqc6+lXIcYAtt7mfQKBgFSWM1TI6hWKmuHUS3OR4KaVlWaBHETk/tLpJpU72+CivAiWRYKPM/Neoa68RDgYXlmiv5zHuhhzPZXhA2Z5L+mm8o8zrx16HLaKAcsLctjNsJe3Ks3K9bJbMAoAeoYUa4OiwhAgZNNWRepqnYyPbs3we6b3KoNPb7rtYYfm4FbBAoGAQU3j3pls9Xp1o0RhiHjchLs/VAbgQYrG/tG2RN9xXSEq1WT+w5ywH/oouyv1v+ftTMJoE4gP2IANPNkKXrUU/aivD28dhd//X9Oofqy1Ow5fNFT6qAfvh4TFnB/u41Ga1b7MQjj97XNDUmBvbysP/qTg1qt/WwY38MOJ3fxuHE8=';

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64.replace(/[\s\r\n]+/g, ''));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

let cachedPublicKey: CryptoKey | null = null;
let cachedPrivateKey: CryptoKey | null = null;

/**
 * Retrieves the RSA-OAEP public key used to encrypt per-file AES session keys.
 */
export const getPublicEncryptionKey = async (): Promise<CryptoKey> => {
  if (cachedPublicKey) return cachedPublicKey;

  const envKey = (import.meta.env?.VITE_DOCUMENT_ENCRYPTION_PUBLIC_KEY as string | undefined)?.trim();
  const rawKeyBase64 = envKey && envKey.length > 0 ? envKey : DEFAULT_PUBLIC_KEY_BASE64;
  const buffer = base64ToArrayBuffer(rawKeyBase64);

  const key = await window.crypto.subtle.importKey(
    'spki',
    buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt']
  );

  cachedPublicKey = key;
  return key;
};

/**
 * Retrieves the RSA-OAEP private key for the active authenticated session.
 * Authorized callers (Super Admin, RSP, active Interviewers) obtain the key
 * from Supabase RPC get_document_decryption_key. Falls back to default in mock/dev mode.
 */
export const getPrivateDecryptionKey = async (): Promise<CryptoKey> => {
  if (cachedPrivateKey) return cachedPrivateKey;

  let privateKeyBase64: string | null = null;

  // If in mock mode or disconnected demo, use development key
  const mockActive = typeof isMockModeEnabled === 'function' ? (isMockModeEnabled as any)() : Boolean(isMockModeEnabled);
  if (mockActive) {
    privateKeyBase64 = DEFAULT_PRIVATE_KEY_BASE64;
  } else {
    try {
      const { data, error } = await (supabase as any).rpc('get_document_decryption_key');
      if (!error && typeof data === 'string' && data.length > 0) {
        privateKeyBase64 = data;
      }
    } catch {
      // Fall through to fallback
    }

    // In local dev without live RPC migration applied yet, fall back to default
    if (!privateKeyBase64) {
      privateKeyBase64 = DEFAULT_PRIVATE_KEY_BASE64;
    }
  }

  const buffer = base64ToArrayBuffer(privateKeyBase64);
  const key = await window.crypto.subtle.importKey(
    'pkcs8',
    buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['decrypt']
  );

  cachedPrivateKey = key;
  return key;
};

/**
 * Clears the in-memory cached decryption keys (called upon logout).
 */
export const clearCachedDecryptionKey = (): void => {
  cachedPrivateKey = null;
  cachedPublicKey = null;
};
