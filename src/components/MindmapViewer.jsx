import { useEffect, useRef, useCallback, useState } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { Plus, Minus, ArrowsOut } from '@phosphor-icons/react';
import * as d3 from 'd3';

const transformer = new Transformer();

const isDark = () => !document.documentElement.classList.contains('light');

const getCssToken = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const MARKMAP_OPTIONS = {
  spacingHorizontal: 110,
  spacingVertical: 14,
  paddingX: 8,
  duration: 300,
  // connector colour — set low-opacity; overridden in styleNodes too
  color: () => isDark()
    ? 'rgba(130, 120, 210, 0.22)'
    : 'rgba(100, 90, 180, 0.20)',
};

/* ── Style all SVG nodes after render ── */
const styleNodes = (svgEl) => {
  if (!svgEl) return;
  const dark = isDark();
  const svg = d3.select(svgEl);

  svg.selectAll('.lm-bubble').remove();

  // Hide default underline
  svg.selectAll('.markmap-node > line')
    .style('stroke-opacity', '0')
    .style('display', 'none');

  // Bezier connector lines — barely visible, matching NeetCode thinness
  svg.selectAll('.markmap-link')
    .style('stroke', dark ? 'rgba(120, 112, 200, 0.28)' : 'rgba(90, 80, 180, 0.22)')
    .style('stroke-width', '1px')
    .style('stroke-opacity', '1')
    .style('fill', 'none');

  // Circle toggle dots — small, subtle
  svg.selectAll('.markmap-node > circle')
    .style('fill', dark ? '#1e1e2e' : '#f0eeff')
    .style('stroke', dark ? 'rgba(130,120,210,0.5)' : 'rgba(100,90,180,0.4)')
    .style('stroke-width', '1px')
    .style('r', '3.5px');

  // Node cards
  svg.selectAll('g.markmap-node').each(function () {
    const g     = d3.select(this);
    const datum = g.datum();
    const depth = datum?.state?.depth ?? datum?.depth ?? 0;
    const isRoot = depth === 0;
    const isL1   = depth === 1;

    const cardDiv = g.select('.markmap-foreign > div > div');
    const target  = cardDiv.empty() ? g.select('.markmap-foreign div') : cardDiv;
    if (target.empty()) return;

    const el = target.node();

    // NeetCode palette:
    // Dark → periwinkle-slate: bg #2e2c5e→#35326e, border rgba(99,102,200,0.45)
    // Light → soft indigo tint: bg #eeeeff, border rgba(100,90,200,0.3)
    let bg, border;
    if (dark) {
      bg     = isRoot ? 'rgba(66,62,140,0.85)' : isL1 ? 'rgba(58,54,120,0.75)' : 'rgba(52,48,108,0.65)';
      border = isRoot ? 'rgba(130,120,240,0.60)' : 'rgba(110,100,210,0.40)';
    } else {
      bg     = isRoot ? 'rgba(200,195,255,0.85)' : isL1 ? 'rgba(215,210,255,0.80)' : 'rgba(225,220,255,0.75)';
      border = isRoot ? 'rgba(80,70,180,0.50)' : 'rgba(100,90,200,0.35)';
    }

    const textColor = dark ? '#ffffff' : '#1e1b4b';

    el.style.backgroundColor = bg;
    el.style.border = `1px solid ${border}`;
    el.style.color = textColor;
    el.style.borderRadius = isRoot ? '8px' : '5px';
    el.style.boxShadow = 'none';
    el.style.fontFamily = "'Inter', ui-sans-serif, system-ui, sans-serif";
    el.style.fontSize = isRoot ? '13px' : '11.5px';
    el.style.fontWeight = isRoot ? '700' : isL1 ? '600' : '500';
    el.style.padding = isRoot ? '5px 14px' : '3px 10px';
    el.style.lineHeight = '1.4';
    el.style.whiteSpace = 'nowrap';
    el.style.letterSpacing = isRoot ? '-0.01em' : '0';

    // Explicitly enforce textColor and typographic spacing on all KaTeX math text & symbols
    el.querySelectorAll('.katex').forEach((kEl) => {
      kEl.style.margin = '0 0.35em';
      kEl.style.display = 'inline-block';
    });
    el.querySelectorAll('.katex, .katex *').forEach((kEl) => {
      kEl.style.color = textColor;
    });
  });
};

/* ── Zoom control button ── */
function ZoomBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md transition-all cursor-pointer"
      style={{
        backgroundColor: 'var(--color-surface-alt)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
        e.currentTarget.style.color = 'var(--color-text)';
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
        e.currentTarget.style.color = 'var(--color-text-muted)';
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      {children}
    </button>
  );
}

export default function MindmapViewer({
  markdown,
}) {
  const svgRef      = useRef(null);
  const markmapRef  = useRef(null);

  const applyStyles = useCallback(() => {
    if (!svgRef.current) return;
    requestAnimationFrame(() => {
      styleNodes(svgRef.current);
      setTimeout(() => styleNodes(svgRef.current), 350);
    });
  }, []);

  /* Initial render & Global fit registration */
  useEffect(() => {
    window.__lecturemind_fit_mindmap = () => {
      markmapRef.current?.fit();
    };
    return () => {
      delete window.__lecturemind_fit_mindmap;
    };
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

  /* Re-style on theme toggle */
  useEffect(() => {
    const obs = new MutationObserver(() => { if (markdown) applyStyles(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [markdown, applyStyles]);

  /* Re-style on branch toggle click */
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const fn = () => setTimeout(applyStyles, 260);
    svgEl.addEventListener('click', fn);
    return () => svgEl.removeEventListener('click', fn);
  }, [applyStyles]);

  /* ── Zoom handlers ── */
  const handleZoomIn  = () => markmapRef.current?.rescale(1.3);
  const handleZoomOut = () => markmapRef.current?.rescale(0.75);
  const handleFit     = () => markmapRef.current?.fit();

  return (
    /* No border/card — mindmap floats directly on dot-grid canvas */
    <div id="mindmap-viewport-container" className="w-full h-full relative overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full markmap"
        style={{ overflow: 'visible', display: 'block' }}
      />

      {!markdown && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <p className="text-sm">No mindmap data</p>
        </div>
      )}

      {/* ── Zoom controls — bottom-left floating overlay ── */}
      {markdown && (
        <div
          className="markmap-zoom-controls absolute bottom-4 left-4 z-10 flex flex-col gap-1 p-1 rounded-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          <ZoomBtn onClick={handleZoomIn}  title="Zoom in">  <Plus   size={13} weight="bold" /></ZoomBtn>
          <div className="h-px mx-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <ZoomBtn onClick={handleZoomOut} title="Zoom out"> <Minus  size={13} weight="bold" /></ZoomBtn>
          <div className="h-px mx-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <ZoomBtn onClick={handleFit}     title="Fit view"> <ArrowsOut size={13} /></ZoomBtn>
        </div>
      )}
    </div>
  );
}
