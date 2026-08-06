// Base64 conversion for image bytes sent to the model as inline data. Kept pure
// and unit tested; the side panel encodes the cropped PNG bytes with these.

export function bytesToBase64(bytes) {
  let binary = "";
  // Chunk the conversion so String.fromCharCode is not called with a huge
  // argument list, which throws on large images.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
