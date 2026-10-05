import katex from 'katex';
import { apiFetch } from '../services/apiClient';

/** Equations become bounded PNGs with embedded fonts; clipboard retains readable TeX. */
export async function prepareDocsMathImages(markdown) {
  const source = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const formulas = new Map();
  const inline = source.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => { formulas.set(formula.trim(), true); return ''; });
  for (const match of inline.matchAll(/(?<!\\|\$)\$(?!\$)(.+?)(?<!\\|\$)\$(?!\$)/g)) if (!formulas.has(match[1].trim())) formulas.set(match[1].trim(), false);
  const images = Object.create(null);
  if (!formulas.size) return images;
  if (formulas.size > 100) throw new Error('Export at most 100 distinct equations per document. Split the notes into sections.');
  const { getKatexCssForExport } = await import('./exportUtils');
  const css = await getKatexCssForExport();
  for (const [formula, displayMode] of formulas) {
    const html = katex.renderToString(formula, { displayMode, throwOnError: true, trust: false, output: 'html' });
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-10000px;top:0;padding:8px;display:inline-block;width:max-content;background:white;color:black;font-size:20px;';
    const style = document.createElement('style'); style.textContent = css;
    const content = document.createElement('div'); content.innerHTML = html;
    probe.append(style, content); document.body.append(probe);
    try {
      await document.fonts.ready;
      const width = Math.ceil(probe.getBoundingClientRect().width), height = Math.ceil(probe.getBoundingClientRect().height);
      if (!width || !height || width > 2000 || height > 2000) throw new Error('An equation is too large to export. Split it into smaller equations.');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}"><foreignObject width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:8px;background:white;color:black;font-size:20px"><style>${css}</style>${html}</div></foreignObject></svg>`;
      // Chrome treats foreignObject in a blob URL as canvas-tainting. A fully
      // self-contained SVG data URL keeps the PNG readable, as in mindmap export.
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      let blob;
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
        canvas.getContext('2d').drawImage(image, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      } finally { /* All SVG assets are embedded; no object URL to release. */ }
      if (!blob) throw new Error('Could not render equation image.');
      const response = await apiFetch('/api/export-asset', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      const asset = await response.json();
      images[formula] = { url: asset.url, width, height };
    } finally { probe.remove(); }
  }
  return images;
}
