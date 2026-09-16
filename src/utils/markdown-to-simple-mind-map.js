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
  if (typeof document === 'undefined') return false;
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

function getNodeWeight(node) {
  if (!node) return 0;
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += getNodeWeight(child);
    }
  }
  return count;
}

function buildSimpleNode(node, baseHex, depth) {
  const { bg, border, text } = deriveColor(baseHex, depth);
  const children = (node.children || []).map((child) =>
    buildSimpleNode(child, baseHex, depth + 1)
  );

  const rawText = cleanRichText(node.content) || htmlToText(node.content);

  const data = {
    text: rawText,
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

function buildRootNode(initialNode) {
  const dark = isDark();

  let current = initialNode;
  const titleParts = [];
  if (current?.content) {
    titleParts.push(current.content);
  }

  // Unwrap single-child intermediate headers (e.g. # Document Title -> ## Single Topic -> ### Branches...)
  // so the main branches expand outward on both sides from the center root
  while (
    current?.children &&
    current.children.length === 1 &&
    current.children[0].children &&
    current.children[0].children.length > 0
  ) {
    const onlyChild = current.children[0];
    if (onlyChild.content) {
      titleParts.push(onlyChild.content);
    }
    current = {
      ...current,
      content: current.content,
      children: onlyChild.children,
    };
  }

  const rawChildren = current?.children || [];
  const totalChildren = rawChildren.length;

  // Calculate balanced left & right directions so the mindmap expands symmetrically on both sides
  const directions = [];
  let rightWeight = 0;
  let leftWeight = 0;
  const rightLimit = Math.ceil(totalChildren / 2);

  rawChildren.forEach((child, index) => {
    const w = getNodeWeight(child);
    let dir = 'right';
    if (totalChildren <= 1) {
      dir = 'right';
    } else if (index === 0) {
      dir = 'right';
      rightWeight += w;
    } else if (index === 1 && totalChildren === 2) {
      dir = 'left';
      leftWeight += w;
    } else {
      const rightBranches = directions.filter((d) => d === 'right').length;
      const leftBranches = directions.filter((d) => d === 'left').length;

      if (rightBranches >= rightLimit) {
        dir = 'left';
      } else if (leftBranches >= rightLimit) {
        dir = 'right';
      } else if (rightWeight <= leftWeight) {
        dir = 'right';
      } else {
        dir = 'left';
      }

      if (dir === 'right') rightWeight += w;
      else leftWeight += w;
    }
    directions.push(dir);
  });

  const children = rawChildren.map((child, index) => {
    const direction = directions[index] || (index % 2 === 0 ? 'right' : 'left');
    const color = BRANCH_PALETTE[index % BRANCH_PALETTE.length];
    const branch = buildSimpleNode(child, color, 1);
    branch.data.dir = direction;
    return branch;
  });

  const cleanTitles = titleParts
    .map((t) => cleanRichText(t) || htmlToText(t))
    .filter(Boolean);

  let rootDisplayText = 'Lecture Notes';
  if (cleanTitles.length === 1) {
    rootDisplayText = cleanTitles[0];
  } else if (cleanTitles.length > 1) {
    const mainTitle = cleanTitles[0];
    const subTitle = cleanTitles.slice(1).join(' • ');
    rootDisplayText = `<div style="font-weight:700;font-size:1.06em;line-height:1.3;">${mainTitle}</div><div style="font-weight:500;font-size:0.84em;opacity:0.85;margin-top:3px;line-height:1.25;">${subTitle}</div>`;
  }

  const rootData = {
    text: rootDisplayText,
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
