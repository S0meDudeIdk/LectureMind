import { useEffect, useRef, useCallback } from 'react';
import MindMap from 'simple-mind-map';
import Export from 'simple-mind-map/src/plugins/Export.js';
import { getNodeRichTextStyles, addXmlns } from 'simple-mind-map/src/utils/index.js';
import katex from 'katex';
import { transformToSimpleMindMap } from '../utils/markdown-to-simple-mind-map';
import { useSidebar } from '../context/SidebarContext';
import { Plus, Minus, ArrowsOut } from '@phosphor-icons/react';

const registerExportPlugin = MindMap.usePlugin.bind(MindMap);
registerExportPlugin(Export);

const isDark = () => !document.documentElement.classList.contains('light');

function buildBaseTheme(dark) {
  return {
    backgroundColor: 'transparent',
    lineColor: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
    lineWidth: 2,
    lineStyle: 'curve',
    root: {
      fillColor: dark ? 'rgba(80, 80, 120, 0.9)' : 'rgba(200, 195, 255, 0.9)',
      color: dark ? '#ffffff' : '#1e1b4b',
      fontSize: 14,
      fontWeight: 'bold',
      borderRadius: 10,
      shape: 'roundedRectangle',
      paddingX: 0,
      paddingY: 0,
    },
    second: {
      fillColor: dark ? 'rgba(120, 120, 180, 0.75)' : 'rgba(220, 225, 255, 0.85)',
      color: dark ? '#ffffff' : '#1e1b4b',
      fontSize: 12,
      fontWeight: 'bold',
      borderRadius: 8,
      shape: 'roundedRectangle',
      paddingX: 0,
      paddingY: 0,
    },
    node: {
      fillColor: dark ? 'rgba(80, 80, 110, 0.55)' : 'rgba(230, 235, 255, 0.65)',
      color: dark ? '#ffffff' : '#1e1b4b',
      fontSize: 10,
      borderRadius: 5,
      shape: 'roundedRectangle',
      paddingX: 0,
      paddingY: 0,
    },
  };
}

MindMap.defineTheme('lecturemind-light', buildBaseTheme(false));
MindMap.defineTheme('lecturemind-dark', buildBaseTheme(true));

function getBranchLineColor(node, fallback) {
  return node?.getData?.('branchColor') || fallback;
}

function runAfterRender(instance, fn) {
  if (!instance) return;
  const wrapper = () => {
    try {
      instance.off('node_tree_render_end', wrapper);
    } catch {}
    try {
      fn();
    } catch (err) {
      console.warn('[MindmapViewer] Error in afterRender callback:', err);
    }
  };
  try {
    instance.on('node_tree_render_end', wrapper);
  } catch {}
}

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
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
        e.currentTarget.style.color = 'var(--color-text)';
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
        e.currentTarget.style.color = 'var(--color-text-muted)';
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      {children}
    </button>
  );
}

export default function MindmapViewer({ markdown }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const { sidebarOpen } = useSidebar();

  const createMap = useCallback(() => {
    if (!containerRef.current) return null;

    const instance = new MindMap({
      el: containerRef.current,
      layout: 'mindMap',
      theme: isDark() ? 'lecturemind-dark' : 'lecturemind-light',
      readonly: true,
      fit: false,
      fitPadding: 40,
      mousewheelAction: 'zoom',
      minZoomRatio: 20,
      maxZoomRatio: 400,
      scaleRatio: 0.1,
      textAutoWrapWidth: 1800,
      initRootNodePosition: ['center', 'center'],
      alwaysShowExpandBtn: false,
      isUseCustomNodeContent: true,
      customCreateNodeContent: (node) => {
        if (!node.getData('richText')) return null;
        const text = node.getData('text');
        if (!text) return null;

        const MAX_WIDTH = 1400;

        const buildWrapper = () => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = `<div>${text}</div>`;
          const el = wrapper.children[0];
          el.classList.add('smm-richtext-node-wrap');

          const styles = getNodeRichTextStyles(node);
          Object.entries(styles).forEach(([prop, value]) => {
            if (value != null) el.style[prop] = value;
          });

          el.style.display = 'inline-block';
          el.style.textAlign = 'center';
          el.style.verticalAlign = 'middle';
          el.style.lineHeight = '1.7';
          el.style.boxSizing = 'border-box';
          // All spacing is handled here; theme padding is set to 0
          el.style.padding = '0.4em 0.7em';
          return el;
        };

        // Measure the natural (max-content) width so math isn't squeezed.
        // We render after fonts are ready, so this measurement is accurate.
        const measureEl = buildWrapper();
        measureEl.style.width = 'max-content';
        measureEl.style.whiteSpace = 'normal';
        const measureContainer = document.createElement('div');
        measureContainer.style.cssText = 'position:fixed;left:-99999px;top:-99999px;';
        measureContainer.appendChild(measureEl);
        document.body.appendChild(measureContainer);
        const naturalWidth = measureEl.getBoundingClientRect().width;
        if (measureContainer.parentNode) {
          try {
            measureContainer.parentNode.removeChild(measureContainer);
          } catch {}
        }

        const el = buildWrapper();
        el.style.width = `${Math.min(naturalWidth, MAX_WIDTH)}px`;
        el.style.maxWidth = `${MAX_WIDTH}px`;
        el.style.whiteSpace = 'normal';
        el.style.wordBreak = 'break-word';
        el.style.overflowWrap = 'break-word';

        addXmlns(el);
        return el;
      },
      customHandleLine: (node, line, { width, color, dasharray }) => {
        line.stroke({
          color: getBranchLineColor(node, color),
          width,
          dasharray,
        });
      },
    });

    // Guard SVG element rbox calculations against detached DOM element errors
    if (instance.draw) {
      try {
        const proto = Object.getPrototypeOf(instance.draw);
        if (proto && proto.rbox && !proto.__rbox_guarded__) {
          const origProtoRbox = proto.rbox;
          proto.rbox = function (el) {
            try {
              return origProtoRbox.call(this, el);
            } catch {
              const rect = this.node?.getBoundingClientRect?.() || {
                left: 0,
                top: 0,
                width: 0,
                height: 0,
              };
              return {
                x: rect.left || 0,
                y: rect.top || 0,
                width: Math.max(0, rect.width || 0),
                height: Math.max(0, rect.height || 0),
                addOffset() {
                  return this;
                },
                transform() {
                  return this;
                },
              };
            }
          };
          proto.__rbox_guarded__ = true;
        }
      } catch {}
    }

    // Guard fit method against detached container / unmounted state
    const origFit = instance.view.fit.bind(instance.view);
    instance.view.fit = (...args) => {
      if (!containerRef.current || !document.body.contains(containerRef.current)) return;
      if (!instance.draw?.node || !document.body.contains(instance.draw.node)) return;
      if (containerRef.current.clientWidth <= 0 || containerRef.current.clientHeight <= 0) return;
      try {
        return origFit(...args);
      } catch {
        // Suppress benign rbox or layout errors during DOM transitions
      }
    };

    window.__lecturemind_markmap = instance;
    window.__lecturemind_fit_mindmap = () => {
      try {
        instance.view.fit();
      } catch {}
    };

    return instance;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const instance = createMap();
    mapRef.current = instance;

    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (
          mapRef.current &&
          containerRef.current &&
          document.body.contains(containerRef.current) &&
          containerRef.current.clientWidth > 0
        ) {
          try {
            instance.resize();
          } catch {}
        }
      }, 120);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      try {
        mapRef.current?.destroy();
      } catch {}
      mapRef.current = null;
      delete window.__lecturemind_markmap;
      delete window.__lecturemind_fit_mindmap;
    };
  }, [createMap]);

  useEffect(() => {
    let isCancelled = false;
    let fallbackTimeout = null;
    let probe = null;

    if (!markdown) return undefined;

    // Render a hidden probe so KaTeX fonts start loading before we measure nodes.
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;';
    probe.innerHTML = katex.renderToString(
      'f(z) = \\sum_{k=1}^{\\infty} z^{2^k} \\approx \\frac{1}{2\\pi\\sigma^2} \\iint_{\\Omega} e^{-(x^2+y^2)/(2\\sigma^2)} dx\\,dy',
      { throwOnError: false }
    );
    document.body.appendChild(probe);

    const safeRemoveProbe = () => {
      if (probe && probe.parentNode) {
        try {
          probe.parentNode.removeChild(probe);
        } catch {}
      }
      probe = null;
    };

    const doRender = () => {
      if (isCancelled || !mapRef.current || !markdown) return;
      try {
        const data = transformToSimpleMindMap(markdown);
        if (isCancelled || !mapRef.current) return;
        mapRef.current.setData(data);
        runAfterRender(mapRef.current, () => {
          if (!isCancelled && mapRef.current) {
            try {
              mapRef.current.view?.fit();
            } catch {}
          }
        });
      } catch (err) {
        console.error('Failed to transform markdown for simple-mind-map:', err);
      }
    };

    const start = async () => {
      try {
        await document.fonts.ready;
      } catch {}
      safeRemoveProbe();
      if (isCancelled) return;
      doRender();
      fallbackTimeout = setTimeout(() => {
        if (!isCancelled) doRender();
      }, 400);
    };

    start();

    return () => {
      isCancelled = true;
      clearTimeout(fallbackTimeout);
      safeRemoveProbe();
    };
  }, [markdown]);

  useEffect(() => {
    let isCancelled = false;
    const observer = new MutationObserver(() => {
      if (isCancelled) return;
      const instance = mapRef.current;
      if (!instance || !markdown) return;
      if (!containerRef.current || !document.body.contains(containerRef.current)) return;

      try {
        const transform = instance.view.getTransformData();
        instance.setTheme(isDark() ? 'lecturemind-dark' : 'lecturemind-light');
        instance.setData(transformToSimpleMindMap(markdown));
        runAfterRender(instance, () => {
          if (!isCancelled && mapRef.current) {
            try {
              instance.view.setTransformData(transform);
            } catch {}
          }
        });
      } catch (err) {
        console.error('Failed to update mindmap theme:', err);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      isCancelled = true;
      observer.disconnect();
    };
  }, [markdown]);

  const handleZoomIn = () => mapRef.current?.view?.enlarge();
  const handleZoomOut = () => mapRef.current?.view?.narrow();
  const handleFit = () => {
    try {
      mapRef.current?.view?.fit();
    } catch {}
  };

  return (
    <div id="mindmap-viewport-container" className="w-full h-full relative overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '100%', height: '100%', position: 'relative' }}
      />

      {!markdown && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <p className="text-sm">No mindmap data</p>
        </div>
      )}

      {markdown && (
        <div
          className={`markmap-zoom-controls absolute bottom-4 z-30 flex flex-col gap-1 p-1 rounded-lg transition-all duration-250 ease-in-out ${
            sidebarOpen ? 'left-[248px]' : 'left-4'
          }`}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          <ZoomBtn onClick={handleZoomIn} title="Zoom in">
            <Plus size={13} weight="bold" />
          </ZoomBtn>
          <div className="h-px mx-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <ZoomBtn onClick={handleZoomOut} title="Zoom out">
            <Minus size={13} weight="bold" />
          </ZoomBtn>
          <div className="h-px mx-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <ZoomBtn onClick={handleFit} title="Fit view">
            <ArrowsOut size={13} />
          </ZoomBtn>
        </div>
      )}
    </div>
  );
}
