// Minimal payload stored server-side — no full Course catalog data
export type ScheduleItem = {
  id: string
  selectedTerm?: string
  selectedSectionId?: number
  selectedUnits?: number
  color?: string
  optionalMeetings?: string[]
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Derives a deterministic AES-GCM-256 key from the user's email + id via PBKDF2.
 * Same user on any device → same key. Key is never stored or exported.
 */
export async function deriveKey(email: string, userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(email),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const salt = enc.encode(userId + 'stanford-root-v1')
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Encrypts schedule items. Returns Base64 ciphertext + Base64 IV (fresh random per call). */
export async function encryptSchedule(
  items: ScheduleItem[],
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const plaintext = enc.encode(JSON.stringify(items))
  const cipherbuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return {
    ciphertext: uint8ToBase64(new Uint8Array(cipherbuf)),
    iv: uint8ToBase64(iv),
  }
}

/** Decrypts schedule items. Throws on corrupt/tampered data (AES-GCM auth tag). */
export async function decryptSchedule(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<ScheduleItem[]> {
  const ivBytes = base64ToUint8(iv)
  const cipherbytes = base64ToUint8(ciphertext)
  const plainbuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherbytes)
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(plainbuf)) as ScheduleItem[]
}
