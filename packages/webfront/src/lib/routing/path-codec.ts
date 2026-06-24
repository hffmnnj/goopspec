const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

function binaryFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

function bytesFromBinary(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a filesystem path as unpadded base64url. */
export function encodeProjectPath(path: string): string {
  const bytes = new TextEncoder().encode(path);
  return btoa(binaryFromBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Decode an unpadded base64url route segment back into a filesystem path. */
export function decodeProjectPath(segment: string): string {
  if (!segment || !BASE64URL_PATTERN.test(segment) || segment.length % 4 === 1) {
    throw new TypeError('Invalid base64url project path');
  }

  const padded = `${segment.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - (segment.length % 4)) % 4)}`;

  try {
    const bytes = bytesFromBinary(atob(padded));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError('Invalid base64url project path', { cause: error });
  }
}
