export async function copyText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard is unavailable. Select the text and copy it manually.');
  }
  await navigator.clipboard.writeText(String(text ?? ''));
}
