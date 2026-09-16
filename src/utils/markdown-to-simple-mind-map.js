import { Transformer } from 'markmap-lib';
import * as d3 from 'd3';

const transformer = new Transformer();

const BRANCH_PALETTE = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ef4444', // red
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
];

function htmlToText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').trim();
}

// Remove the hidden KaTeX MathML accessibility layer and any accidentally
// duplicated formula renders so each node shows exactly one formula.
function cleanRichText(html) {
  if (!html || !String(html).includes('<')) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;

  // Remove any nested .katex inside another .katex.
  root.querySelectorAll('.katex .katex').forEach((el) => el.remove());

  // Remove display-block formula renders; mindmap nodes should only use inline math.
  root.querySelectorAll('.katex-block').forEach((el) => el.remove());

  // Capture the original LaTeX source from the MathML layer, then remove it.
  root.querySelectorAll('.katex').forEach((el) => {
    const mathml = el.querySelector('.katex-mathml');
    if (mathml) {
      const annotation = mathml.querySelector('annotation');
      if (annotation) {
        el.dataset.latexSource = annotation.textContent.trim();
      }
      mathml.remove();
    }
  });

  // Remove stray annotations and mathml outside .katex as well.
  root.querySelectorAll('.katex-mathml, annotation').forEach((el) => el.remove());

  // Deduplicate by normalized LaTeX source.
  const normalize = (s) =>
    String(s)
      .replace(/\\displaystyle|\\inline/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const seen = new Set();
  root.querySelectorAll('.katex').forEach((el) => {
    const source = el.dataset.latexSource || el.textContent;
    const key = normalize(source);
    if (seen.has(key)) {
      el.remove();
    } else {
      seen.add(key);
    }
  });

  return root.innerHTML;
}

function isDark() {
  return !document.documentElement.classList.contains('light');
}

function deriveColor(baseHex, depth) {
  const hsl = d3.hsl(baseHex);
  hsl.l = Math.min(0.92, hsl.l + depth * 0.06);
  hsl.s = Math.max(0.35, hsl.s - depth * 0.04);

  const dark = isDark();
  // Dark mode: stronger, slightly lighter backgrounds so white text pops.
  // Light mode: soft pastel translucent backgrounds with dark text.
  const bgLightness = dark
    ? Math.min(58, hsl.l * 100 + 6)
    : Math.min(96, hsl.l * 100 + 28);
  const bgAlpha = dark ? (depth === 1 ? 0.92 : 0.82) : depth === 1 ? 0.7 : 0.45;
  const bg = `hsla(${hsl.h}, ${hsl.s * 100}%, ${bgLightness}%, ${bgAlpha})`;
  const border = `hsla(${hsl.h}, ${hsl.s * 100}%, ${hsl.l * 100}%, 0.85)`;
  // Use the actual background lightness to pick readable text.
  const text = dark ? '#ffffff' : '#1e1b4b';

  return { bg, border, text };
}

function buildSimpleNode(node, baseHex, depth) {
  const { bg, border, text } = deriveColor(baseHex, depth);
  const children = (node.children || []).map((child) =>
    buildSimpleNode(child, baseHex, depth + 1)
  );

  const data = {
    text: cleanRichText(node.content) || htmlToText(node.content),
    richText: true,
    fillColor: bg,
    color: text,
    borderColor: border,
    borderWidth: 1,
    borderRadius: depth <= 1 ? 8 : 5,
    shape: 'roundedRectangle',
    fontSize: depth === 0 ? 14 : depth === 1 ? 12 : 10,
    fontWeight: depth <= 1 ? 'bold' : '500',
    branchColor: baseHex,
  };

  return { data, children };
}

function buildRootNode(node) {
  const dark = isDark();
  const children = (node.children || []).map((child, index) => {
    const direction = index % 2 === 0 ? 'left' : 'right';
    const color = BRANCH_PALETTE[index % BRANCH_PALETTE.length];
    const branch = buildSimpleNode(child, color, 1);
    branch.data.dir = direction;
    return branch;
  });

  const rootData = {
    text: cleanRichText(node.content) || htmlToText(node.content) || 'Lecture Notes',
    richText: true,
    fillColor: dark ? 'rgba(130, 130, 190, 0.9)' : 'rgba(200, 195, 255, 0.9)',
    color: dark ? '#ffffff' : '#1e1b4b',
    borderColor: dark ? 'rgba(180,170,240,0.7)' : 'rgba(80,70,180,0.5)',
    borderWidth: 1,
    borderRadius: 10,
    shape: 'roundedRectangle',
    fontSize: 14,
    fontWeight: 'bold',
    branchColor: dark ? '#a5b4fc' : '#6c63ff',
  };

  return { data: rootData, children };
}

export function transformToSimpleMindMap(markdown) {
  if (!markdown) return { data: { text: '' }, children: [] };

  const { root } = transformer.transform(markdown);
  return buildRootNode(root);
}
