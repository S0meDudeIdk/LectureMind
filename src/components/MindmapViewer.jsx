import { useEffect, useRef, useCallback } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import * as d3 from 'd3';

const transformer = new Transformer();

const isDark = () => !document.documentElement.classList.contains('light');

const hexToRgba = (hex, alpha) => {
  if (!hex || !hex.startsWith('#')) return `rgba(99,102,241,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Curated harmonic palette families for main branches (depth 1) and their children (depth 2+)
const BRANCH_PALETTES = [
  {
    name: 'orange',
    main: '#F97316', // Vibrant Orange
    shades: ['#FB923C', '#EA580C', '#FDBA74', '#F97316', '#FF8C42', '#C2410C'],
  },
  {
    name: 'purple',
    main: '#A855F7', // Violet / Purple
    shades: ['#C084FC', '#9333EA', '#D8B4FE', '#A855F7', '#E879F9', '#7E22CE'],
  },
  {
    name: 'cyan',
    main: '#06B6D4', // Cyan / Teal
    shades: ['#22D3EE', '#0891B2', '#38BDF8', '#06B6D4', '#14B8A6', '#0E7490'],
  },
  {
    name: 'emerald',
    main: '#10B981', // Emerald / Mint
    shades: ['#34D399', '#059669', '#6EE7B7', '#10B981', '#4ADE80', '#047857'],
  },
  {
    name: 'rose',
    main: '#F43F5E', // Rose / Coral
    shades: ['#FB7185', '#E11D48', '#FDA4AF', '#F43F5E', '#F472B6', '#BE123C'],
  },
  {
    name: 'amber',
    main: '#F59E0B', // Amber / Gold
    shades: ['#FBBF24', '#D97706', '#FCD34D', '#F59E0B', '#FDE047', '#B45309'],
  },
  {
    name: 'blue',
    main: '#3B82F6', // Blue / Indigo
    shades: ['#60A5FA', '#2563EB', '#93C5FD', '#3B82F6', '#818CF8', '#1D4ED8'],
  },
];

// Color resolver: ensures each main branch and all its children share the same color family
const getNodeColor = (node) => {
  const depth = node?.state?.depth ?? 0;
  const path = node?.state?.path || '1';
  const parts = path.split('.').map(Number);

  // Depth 0: Central root node
  if (depth === 0 || parts.length <= 1) {
    return '#6366F1';
  }

  // Branch index (0-based)
  const branchIdx = Math.max(0, (parts[1] || 1) - 1) % BRANCH_PALETTES.length;
  const palette = BRANCH_PALETTES[branchIdx];

  // Depth 1: Main branch -> primary color of family
  if (depth === 1 || parts.length === 2) {
    return palette.main;
  }

  // Depth 2+: Subtopics & Details -> adjacent harmonious shades within the SAME family
  const shadeSeed = parts.slice(2).reduce((acc, num) => (acc * 3 + (num || 1)), 0);
  const childIdx = Math.max(0, shadeSeed - 1) % palette.shades.length;
  return palette.shades[childIdx];
};


const MARKMAP_OPTIONS = {
  spacingHorizontal: 110,
  spacingVertical: 14,
  paddingX: 8,
  duration: 350,
  color: getNodeColor,
};



// Styles the native HTML bubble cards inside foreignObject
const styleNodes = (svgEl) => {
  if (!svgEl) return;
  const dark = isDark();
  const textColor = dark ? '#F8FAFC' : '#0F172A';
  const svg = d3.select(svgEl);

  // Remove any legacy SVG rects
  svg.selectAll('.lm-bubble').remove();

  // Hide default bottom underline
  svg.selectAll('.markmap-node > line')
    .style('stroke-opacity', '0')
    .style('display', 'none');

  // Thicker connector links
  svg.selectAll('.markmap-link')
    .style('stroke-width', '2.5px')
    .style('stroke-opacity', dark ? '0.85' : '0.75');

  // Circle toggle dots
  svg.selectAll('.markmap-node > circle')
    .style('stroke-width', '2px')
    .style('r', '5px');

  // Style each node's HTML card directly
  svg.selectAll('g.markmap-node').each(function () {
    const g = d3.select(this);
    const datum = g.datum();
    const depth = datum?.state?.depth ?? datum?.depth ?? 0;
    const color = datum?.state?.color ?? datum?.color ?? '#6366F1';

    const isRoot = depth === 0;

    // Harmonic background tint & matching border
    const fillColor = dark
      ? isRoot ? hexToRgba(color, 0.45) : hexToRgba(color, 0.20)
      : isRoot ? hexToRgba(color, 0.28) : hexToRgba(color, 0.12);

    const strokeColor = dark
      ? isRoot ? hexToRgba(color, 0.95) : hexToRgba(color, 0.80)
      : isRoot ? hexToRgba(color, 0.85) : hexToRgba(color, 0.65);

    // Target the innermost div that holds the text
    const cardDiv = g.select('.markmap-foreign > div > div');
    const target = cardDiv.empty() ? g.select('.markmap-foreign div') : cardDiv;

    if (!target.empty()) {
      const el = target.node();
      el.style.setProperty('background-color', fillColor, 'important');
      el.style.setProperty('border', `${isRoot ? 2 : 1.5}px solid ${strokeColor}`, 'important');
      el.style.setProperty('color', textColor, 'important');
      el.style.setProperty('border-radius', isRoot ? '12px' : '8px', 'important');
      el.style.setProperty('box-shadow', dark ? `0 0 10px ${hexToRgba(color, 0.25)}` : '0 1px 3px rgba(0,0,0,0.08)', 'important');
    }
  });
};

export default function MindmapViewer({ markdown }) {
  const svgRef = useRef(null);
  const markmapRef = useRef(null);

  const applyStyles = useCallback(() => {
    if (!svgRef.current) return;
    requestAnimationFrame(() => {
      styleNodes(svgRef.current);
      setTimeout(() => styleNodes(svgRef.current), 350);
    });
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, MARKMAP_OPTIONS);
    }
    if (markdown) {
      const { root } = transformer.transform(markdown);
      markmapRef.current.setData(root, MARKMAP_OPTIONS);
      markmapRef.current.fit();
      applyStyles();
    }
  }, [markdown, applyStyles]);

  // Re-apply on theme toggle
  useEffect(() => {
    const obs = new MutationObserver(() => {
      if (markdown) applyStyles();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [markdown, applyStyles]);

  // Re-apply on branch toggle clicks
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const handleClick = () => {
      setTimeout(() => applyStyles(), 250);
    };
    svgEl.addEventListener('click', handleClick);
    return () => svgEl.removeEventListener('click', handleClick);
  }, [applyStyles]);

  return (
    <div className="w-full h-full min-h-[500px] bg-surface rounded-xl overflow-hidden relative border border-border shadow-sm">
      <svg
        ref={svgRef}
        className="w-full h-full absolute inset-0"
        style={{ overflow: 'visible' }}
      />
      {!markdown && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt/50">
          <p className="text-text-muted text-sm">No mindmap data</p>
        </div>
      )}
    </div>
  );
}
