import { ViewPlugin, Decoration, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import katex from 'katex';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Obsidian Live Preview / Hybrid Markdown Engine for CodeMirror 6
 * Faithfully replicates Obsidian & Logseq Live Preview mode:
 * 1. Rich interactive live rendering when cursor is outside a line/block
 * 2. Instant inline syntax unfolding when cursor enters
 * 3. Frontmatter Properties panel
 * 4. Interactive task checkboxes (click to toggle - [ ] <-> - [x])
 * 5. KaTeX Math rendering ($...$ inline, $$...$$ block, live preview when editing)
 * 6. Bullet lists & numbered lists with styled bullets, outliner fold chevrons, and indent guides
 * 7. Tables with inline formatting and KaTeX support
 * 8. Callouts with icons (> [!info], > [!warning], > [!tip], etc.)
 * 9. Highlights (==text==), Bold, Italic, Strikethrough, Inline Code
 * 10. Continuous multi-line blockquote nesting
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── 0. Outliner Fold State Field & Effect ──
export const toggleFoldEffect = StateEffect.define();

export const foldedLinesField = StateField.define({
  create() {
    return new Set();
  },
  update(folded, tr) {
    let next = new Set(folded);
    for (let e of tr.effects) {
      if (e.is(toggleFoldEffect)) {
        if (next.has(e.value)) next.delete(e.value);
        else next.add(e.value);
      }
    }
    return next;
  }
});

function toggleFoldLine(lineNum, view) {
  view.dispatch({
    effects: toggleFoldEffect.of(lineNum)
  });
}

// ── 1. Frontmatter Properties Widget ──
class PropertiesWidget extends WidgetType {
  constructor(yamlText, from, to) {
    super();
    this.yamlText = yamlText;
    this.from = from;
    this.to = to;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.yamlText === this.yamlText;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'obsidian-properties-card block w-full m-0 p-3.5 rounded-xl bg-surface-alt/90 border border-border/80 text-xs select-none shadow-xs';

    // Header with Obsidian properties icon
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between pb-2 mb-2.5 border-b border-border/60 text-text-muted font-semibold tracking-wide uppercase text-[10px]';
    header.innerHTML = `
      <div class="flex items-center gap-1.5 text-primary-light">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <span>Properties</span>
      </div>
      <span class="text-[10px] font-mono text-text-muted/60 lowercase">click to edit yaml</span>
    `;
    container.appendChild(header);

    // Parse simple YAML lines
    const lines = this.yamlText.split('\n').filter(l => l.trim() && !l.trim().startsWith('---'));
    const rows = document.createElement('div');
    rows.className = 'space-y-2';

    lines.forEach(line => {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (!match) return;

      const [, key, rawVal] = match;
      const row = document.createElement('div');
      row.className = 'flex items-start gap-3 text-xs';

      const keyLabel = document.createElement('div');
      keyLabel.className = 'w-20 shrink-0 text-text-muted flex items-center gap-1 font-medium capitalize';
      keyLabel.innerHTML = `
        <span class="opacity-70">🏷️</span>
        <span>${key}</span>
      `;
      row.appendChild(keyLabel);

      const valContainer = document.createElement('div');
      valContainer.className = 'flex-1 flex flex-wrap gap-1.5 items-center';

      let val = rawVal.trim();
      // Handle array format like [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        items.forEach(item => {
          const badge = document.createElement('span');
          if (key.toLowerCase() === 'tags') {
            badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/15 text-primary-light border border-primary/25';
            badge.innerHTML = `<span class="opacity-60">#</span>${item.replace(/^#/, '')}`;
          } else {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-overlay text-text border border-border/60';
            badge.textContent = item;
          }
          valContainer.appendChild(badge);
        });
      } else {
        const textSpan = document.createElement('span');
        textSpan.className = 'text-text font-mono text-[11px] px-1.5 py-0.5 bg-surface-overlay/60 rounded border border-border/40';
        textSpan.textContent = val || 'empty';
        valContainer.appendChild(textSpan);
      }

      row.appendChild(valContainer);
      rows.appendChild(row);
    });

    container.appendChild(rows);

    // Clicking properties card puts cursor into the YAML block for raw editing
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from + 4 }
      });
      view.focus();
    });

    return container;
  }
}

// ── 2. Interactive Task Checkbox Widget (with non-shifting fold arrow) ──
class TaskCheckboxWidget extends WidgetType {
  constructor(isChecked, isCanceled, isInProgress, pos, hasChildren = false, isFolded = false, lineNum = null) {
    super();
    this.isChecked = isChecked;
    this.isCanceled = isCanceled;
    this.isInProgress = isInProgress;
    this.pos = pos;
    this.hasChildren = hasChildren;
    this.isFolded = isFolded;
    this.lineNum = lineNum;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return (
      other.isChecked === this.isChecked &&
      other.isCanceled === this.isCanceled &&
      other.isInProgress === this.isInProgress &&
      other.pos === this.pos &&
      other.hasChildren === this.hasChildren &&
      other.isFolded === this.isFolded &&
      other.lineNum === this.lineNum
    );
  }

  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-task-checkbox-wrap relative inline-flex items-center cursor-pointer';
    wrap.contentEditable = 'false';
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.verticalAlign = '-0.14em';
    wrap.style.lineHeight = '1';
    wrap.style.width = '24px';
    wrap.style.minWidth = '24px';
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'flex-start';

    // If item has nested children, place fold chevron to the left without displacing checkbox
    if (this.hasChildren && this.lineNum !== null) {
      const foldBtn = document.createElement('span');
      foldBtn.className = 'cm-fold-indicator absolute -left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-text-muted/60 hover:text-primary cursor-pointer transition-colors z-10';
      foldBtn.title = this.isFolded ? 'Expand' : 'Collapse';
      foldBtn.innerHTML = `<svg class="w-3 h-3 transition-transform ${this.isFolded ? '-rotate-90 text-primary-light' : 'rotate-0'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

      foldBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFoldLine(this.lineNum, view);
      });

      wrap.appendChild(foldBtn);
    }

    const box = document.createElement('span');
    const stateClass = this.isChecked
      ? 'is-checked'
      : this.isCanceled
      ? 'is-canceled'
      : this.isInProgress
      ? 'is-in-progress'
      : '';
    box.className = `cm-task-checkbox-box ${stateClass}`;
    box.contentEditable = 'false';

    if (this.isChecked) {
      box.innerHTML = `<svg class="w-3 h-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (this.isCanceled) {
      box.innerHTML = `<svg class="w-3 h-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    } else if (this.isInProgress) {
      box.innerHTML = `<svg class="w-3 h-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line></svg>`;
    }

    wrap.appendChild(box);

    // Click toggles checked state in doc
    wrap.addEventListener('mousedown', (e) => {
      if (e.target.closest('.cm-fold-indicator')) return;
      e.preventDefault();
      e.stopPropagation();
      
      const line = view.state.doc.lineAt(this.pos);
      const taskMatch = line.text.match(/^(\s*[-*+]\s+\[)([ xX\-\/])(\]\s*)/);
      if (taskMatch) {
        const nextChar = this.isChecked ? ' ' : 'x';
        const statusPos = line.from + taskMatch[1].length;
        view.dispatch({
          changes: { from: statusPos, to: statusPos + 1, insert: nextChar }
        });
      }
    });

    return wrap;
  }
}

// ── 3. List Bullet Widget (Unordered & Numbered with non-shifting fold arrow) ──
class ListBulletWidget extends WidgetType {
  constructor(bulletSymbol, indent, hasChildren = false, isFolded = false, lineNum = null) {
    super();
    this.bulletSymbol = bulletSymbol;
    this.indent = indent;
    this.hasChildren = hasChildren;
    this.isFolded = isFolded;
    this.lineNum = lineNum;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return (
      other.bulletSymbol === this.bulletSymbol &&
      other.indent === this.indent &&
      other.hasChildren === this.hasChildren &&
      other.isFolded === this.isFolded &&
      other.lineNum === this.lineNum
    );
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet relative inline-flex items-center justify-center select-none align-middle';
    span.contentEditable = 'false';
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('aria-hidden', 'true');
    span.style.width = '1.2em';
    span.style.height = '1.2em';
    span.style.marginRight = '0.3em';

    // If item has nested children, place fold chevron to the left without displacing bullet
    if (this.hasChildren && this.lineNum !== null) {
      const foldBtn = document.createElement('span');
      foldBtn.className = 'cm-fold-indicator absolute -left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-text-muted/60 hover:text-primary cursor-pointer select-none transition-colors z-10';
      foldBtn.title = this.isFolded ? 'Expand' : 'Collapse';
      foldBtn.innerHTML = `<svg class="w-3 h-3 transition-transform ${this.isFolded ? '-rotate-90 text-primary-light' : 'rotate-0'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

      foldBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFoldLine(this.lineNum, view);
      });

      span.appendChild(foldBtn);
    }
    
    // Numbered list (e.g. "1.")
    if (/^\d+\.$/.test(this.bulletSymbol)) {
      const numSpan = document.createElement('span');
      numSpan.className = 'text-xs font-mono font-medium text-primary-light';
      numSpan.textContent = this.bulletSymbol;
      span.appendChild(numSpan);
    } else {
      // Unordered round bullet dot
      const dot = document.createElement('span');
      dot.className = 'w-[6px] h-[6px] rounded-full bg-text-muted opacity-80 inline-block';
      span.appendChild(dot);
    }
    return span;
  }
}

// ── 4. KaTeX Block Math Widget (Collapsed display) ──
class KatexBlockWidget extends WidgetType {
  constructor(latex, from, to) {
    super();
    this.latex = latex;
    this.from = from;
    this.to = to;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.latex === this.latex;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'obsidian-katex-block-widget block w-full p-4 rounded-xl bg-surface-alt/70 border border-border/60 text-center cursor-pointer hover:border-primary/50 transition-colors shadow-xs overflow-x-auto relative group select-none m-0';

    try {
      const rendered = katex.renderToString(this.latex, {
        displayMode: true,
        throwOnError: false,
        output: 'html'
      });
      container.innerHTML = rendered;
    } catch {
      container.textContent = this.latex;
    }

    // Hover badge
    const badge = document.createElement('div');
    badge.className = 'absolute top-1.5 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono text-text-muted/60 opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border/40 pointer-events-none';
    badge.textContent = 'Math';
    container.appendChild(badge);

    // Clicking math block puts cursor into LaTeX source for editing
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from + 3 }
      });
      view.focus();
    });

    return container;
  }
}

// ── 4b. KaTeX Live Edit Preview Widget (shows live preview below $$ block while editing) ──
class KatexLiveEditPreviewWidget extends WidgetType {
  constructor(latex) {
    super();
    this.latex = latex;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.latex === this.latex;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'obsidian-katex-live-preview w-full my-2 p-3 rounded-xl bg-surface-alt/90 border border-primary/40 text-center shadow-xs overflow-x-auto select-none relative';

    const label = document.createElement('div');
    label.className = 'text-[10px] font-mono text-primary-light font-bold text-left mb-1 opacity-80 select-none';
    label.textContent = 'Math Live Preview:';
    container.appendChild(label);

    const mathWrap = document.createElement('div');
    try {
      mathWrap.innerHTML = katex.renderToString(this.latex, {
        displayMode: true,
        throwOnError: false,
        output: 'html'
      });
    } catch {
      mathWrap.textContent = this.latex;
    }
    container.appendChild(mathWrap);

    return container;
  }
}

// ── 5. KaTeX Inline Math Widget ──
class KatexInlineWidget extends WidgetType {
  constructor(latex, from, to) {
    super();
    this.latex = latex;
    this.from = from;
    this.to = to;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.latex === this.latex;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'obsidian-katex-inline-widget inline-block px-1 align-baseline cursor-pointer hover:text-primary-light transition-colors';

    try {
      const rendered = katex.renderToString(this.latex, {
        displayMode: false,
        throwOnError: false,
        output: 'html'
      });
      span.innerHTML = rendered;
    } catch {
      span.textContent = `$${this.latex}$`;
    }

    span.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 1 } });
      view.focus();
    });

    return span;
  }
}

// ── 6. Callout Header Widget ──
class CalloutHeaderWidget extends WidgetType {
  constructor(type, title, isFoldable, isFolded, from) {
    super();
    this.type = type.toLowerCase();
    this.title = title || (type.charAt(0).toUpperCase() + type.slice(1));
    this.isFoldable = isFoldable;
    this.isFolded = isFolded;
    this.from = from;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.type === this.type && other.title === this.title && other.isFolded === this.isFolded && other.from === this.from;
  }

  toDOM(view) {
    const header = document.createElement('div');
    
    const calloutStyles = {
      info: { color: '#6366f1', icon: 'ℹ️', label: 'Info' },
      note: { color: '#0ea5e9', icon: '📝', label: 'Note' },
      tip: { color: '#10b981', icon: '💡', label: 'Tip' },
      success: { color: '#10b981', icon: '✅', label: 'Success' },
      warning: { color: '#f59e0b', icon: '⚠️', label: 'Warning' },
      danger: { color: '#ef4444', icon: '🔥', label: 'Danger' },
      failure: { color: '#ef4444', icon: '❌', label: 'Failure' },
      bug: { color: '#ec4899', icon: '🐛', label: 'Bug' },
      example: { color: '#8b5cf6', icon: '🔍', label: 'Example' },
      quote: { color: '#6b7280', icon: '💬', label: 'Quote' },
      question: { color: '#f97316', icon: '❓', label: 'Question' },
      todo: { color: '#06b6d4', icon: '📋', label: 'Todo' },
    };

    const cfg = calloutStyles[this.type] || { color: '#6366f1', icon: '📌', label: this.type };

    header.className = 'obsidian-callout-header flex w-full items-center gap-2 font-semibold text-xs py-2 px-3.5 rounded-t-xl select-none cursor-pointer';
    header.style.color = cfg.color;
    header.style.backgroundColor = `${cfg.color}15`;

    header.innerHTML = `
      <span class="text-sm select-none">${cfg.icon}</span>
      <span class="font-bold tracking-tight text-sm flex-1">${this.title}</span>
      ${this.isFoldable ? `<span class="callout-fold-toggle p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors text-xs opacity-70">${this.isFolded ? '▶' : '▼'}</span>` : ''}
    `;

    // Click handler: toggle fold if clicking fold button; otherwise focus cursor into title for live editing
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isFoldable && e.target.closest('.callout-fold-toggle')) {
        const line = view.state.doc.lineAt(this.from);
        const newFoldSign = this.isFolded ? '+' : '-';
        const updated = line.text.replace(/\[!([a-zA-Z0-9_-]+)\]([+-])?/, `[!$1]${newFoldSign}`);
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: updated }
        });
        return;
      }
      view.dispatch({ selection: { anchor: this.from + 2 } });
      view.focus();
    });

    return header;
  }
}

// ── 7. High-Contrast Horizontal Rule Divider Widget ──
class HrWidget extends WidgetType {
  constructor(from) {
    super();
    this.from = from;
  }

  eq(other) {
    return other.from === this.from;
  }

  ignoreEvent() {
    return true;
  }

  toDOM(view) {
    const hr = document.createElement('div');
    hr.className = 'obsidian-hr-divider';
    const line = document.createElement('div');
    line.className = 'obsidian-hr-divider-line';
    hr.appendChild(line);

    // Clicking the horizontal divider focuses cursor into raw `---` line for editing
    hr.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from }
      });
      view.focus();
    });

    return hr;
  }
}

// ── 8. Tag Badge Widget ──
class TagWidget extends WidgetType {
  constructor(tagText) {
    super();
    this.tagText = tagText;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.tagText === this.tagText;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'obsidian-tag-pill inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/15 text-primary-light border border-primary/25 mx-0.5 select-none align-middle';
    span.innerHTML = `<span class="opacity-60">#</span><span>${this.tagText.replace(/^#/, '')}</span>`;
    return span;
  }
}

// ── 8b. Wiki-Link Widget ([[Target|Alias]]) ──
class WikiLinkWidget extends WidgetType {
  constructor(raw, from) {
    super();
    this.raw = raw;
    this.from = from;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.raw === this.raw;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'obsidian-wikilink inline-flex items-center gap-1 text-primary-light font-semibold underline decoration-primary/40 underline-offset-2 hover:decoration-primary cursor-pointer select-none';

    let displayText = this.raw;
    if (this.raw.includes('|')) {
      const parts = this.raw.split('|');
      displayText = parts[1].trim() || parts[0].trim();
    } else if (this.raw.includes('#')) {
      const parts = this.raw.split('#');
      displayText = `${parts[0].trim()} > ${parts[1].trim()}`;
    }

    span.innerHTML = `<span class="opacity-60 text-xs">🔗</span><span>${displayText}</span>`;

    span.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 2 } });
      view.focus();
    });

    return span;
  }
}

// ── 8c. Embed Widget (![[file.png]]) ──
class EmbedWidget extends WidgetType {
  constructor(raw, from) {
    super();
    this.raw = raw;
    this.from = from;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.raw === this.raw;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'obsidian-embed-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-overlay border border-border/80 text-text cursor-pointer hover:border-primary/50 transition-colors select-none';
    
    let target = this.raw.trim();
    span.innerHTML = `<span class="opacity-70 text-xs">📎</span><span>${target}</span>`;

    span.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 3 } });
      view.focus();
    });

    return span;
  }
}

// ── 8d. Footnote Widgets ──
class FootnoteRefWidget extends WidgetType {
  constructor(id, from) {
    super();
    this.id = id;
    this.from = from;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.id === this.id;
  }

  toDOM(view) {
    const sup = document.createElement('sup');
    sup.className = 'cm-footnote-ref text-xs font-mono font-bold text-primary-light hover:underline cursor-pointer select-none px-0.5';
    sup.textContent = `[${this.id}]`;

    sup.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 2 } });
      view.focus();
    });

    return sup;
  }
}

class InlineFootnoteWidget extends WidgetType {
  constructor(note, from) {
    super();
    this.note = note;
    this.from = from;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.note === this.note;
  }

  toDOM(view) {
    const sup = document.createElement('sup');
    sup.className = 'cm-inline-footnote inline-flex items-center text-[10px] font-mono px-1 py-0.5 rounded bg-primary/15 text-primary-light border border-primary/30 cursor-pointer hover:bg-primary/25 transition-colors select-none';
    sup.title = this.note;
    sup.textContent = 'fn';

    sup.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 2 } });
      view.focus();
    });

    return sup;
  }
}

// ── 9. Table Widget ──
class TableWidget extends WidgetType {
  constructor(tableText, from, to) {
    super();
    this.tableText = tableText;
    this.from = from;
    this.to = to;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) { return other.tableText === this.tableText; }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'obsidian-table-widget block w-full overflow-x-auto rounded-lg border border-border/70 m-0 bg-surface-alt/30 shadow-xs';
    const table = document.createElement('table');
    table.className = 'w-full text-sm text-left border-collapse';
    
    const lines = this.tableText.trim().split('\n');
    let thead = document.createElement('thead');
    let tbody = document.createElement('tbody');
    
    lines.forEach((line, index) => {
      if (index === 1 && line.match(/^[\s\xA0|:-]+$/)) return;
      
      const row = document.createElement('tr');
      row.className = index === 0 
        ? 'border-b border-border/80 bg-surface-alt/80 font-semibold' 
        : 'border-b border-border/40 hover:bg-surface-overlay/30 transition-colors last:border-0';
      
      const rawCells = line.split('|');
      const cells = rawCells.filter((_, i, arr) => {
        if ((i === 0 || i === arr.length - 1) && !_.trim()) return false;
        return true;
      });

      cells.forEach(cell => {
        const cellTag = index === 0 ? 'th' : 'td';
        const el = document.createElement(cellTag);
        el.className = index === 0 
          ? 'px-4 py-2.5 font-bold text-text border-r border-border/60 last:border-0 text-xs tracking-wider uppercase' 
          : 'px-4 py-2.5 text-text/90 border-r border-border/40 last:border-0 text-sm';
        
        let content = cell.trim()
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/(?<!\*)\*([^\*\n]+?)\*(?!\*)/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code class="bg-surface-alt text-primary-light font-mono text-[11px] px-1.5 py-0.5 rounded border border-border/40 mx-0.5">$1</code>')
          .replace(/(?<!\\|\$)\$(?!\$)(.+?)(?<!\\|\$)\$(?!\$)/g, (_, math) => {
            try {
              return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, output: 'html' });
            } catch (e) {
              return `$${math}$`;
            }
          });

        el.innerHTML = content;
        row.appendChild(el);
      });
      
      if (index === 0) thead.appendChild(row);
      else tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
    
    // Clicking table puts cursor into raw table text for editing
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.from + 2 } });
      view.focus();
    });

    return container;
  }
}

// ── Helper: Lightweight Syntax Highlighter for CodeBlockWidget ──
function highlightCode(code, lang = '') {
  const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  let html = escapeHtml(code);

  const keywords = [
    'def', 'class', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'try', 'except', 'finally',
    'import', 'from', 'as', 'const', 'let', 'var', 'function', 'async', 'await', 'switch', 'case',
    'break', 'continue', 'export', 'default', 'new', 'this', 'typeof', 'instanceof', 'void', 'delete',
    'true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'self', 'lambda', 'with', 'yield',
    'public', 'private', 'protected', 'static', 'int', 'float', 'double', 'char', 'bool', 'struct'
  ];

  const comments = [];
  html = html.replace(/(#.*$|\/\/.*$|\/\*[\s\S]*?\*\/)/gm, (match) => {
    const id = `___COMMENT_${comments.length}___`;
    comments.push(`<span class="text-text-muted/80 italic">${match}</span>`);
    return id;
  });

  const strings = [];
  html = html.replace(/(&quot;[\s\S]*?&quot;|'[\s\S]*?'|`[\s\S]*?`|"""[\s\S]*?"""|'''[\s\S]*?''')/g, (match) => {
    const id = `___STR_${strings.length}___`;
    strings.push(`<span class="text-emerald-600 dark:text-emerald-400">${match}</span>`);
    return id;
  });

  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-purple-600 dark:text-purple-400">$1</span>');

  const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  html = html.replace(kwRegex, '<span class="text-rose-600 dark:text-rose-400 font-medium">$1</span>');

  html = html.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>');

  strings.forEach((str, i) => {
    html = html.replace(`___STR_${i}___`, str);
  });
  comments.forEach((cmt, i) => {
    html = html.replace(`___COMMENT_${i}___`, cmt);
  });

  return html;
}

// ── 9. Code Block Widget ──
class CodeBlockWidget extends WidgetType {
  constructor(lang, code, from, to) {
    super();
    this.lang = lang || '';
    this.code = code;
    this.from = from;
    this.to = to;
  }

  ignoreEvent() {
    return true;
  }

  eq(other) {
    return other.lang === this.lang && other.code === this.code;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'obsidian-code-block-widget block w-full rounded-xl border border-border/70 bg-surface-alt/90 text-sm font-mono m-0 overflow-hidden shadow-xs relative group select-none cursor-pointer';

    // Language badge on top right
    if (this.lang) {
      const langBadge = document.createElement('div');
      langBadge.className = 'absolute top-3 right-4 px-2 py-0.5 rounded text-xs font-sans text-text-muted capitalize select-none pointer-events-none opacity-80';
      langBadge.textContent = this.lang;
      container.appendChild(langBadge);
    }

    // Pre / Code container
    const pre = document.createElement('pre');
    pre.className = 'p-4 overflow-x-auto text-[13.5px] leading-relaxed text-text font-mono select-text';
    pre.innerHTML = highlightCode(this.code, this.lang);
    container.appendChild(pre);

    // Clicking code block puts cursor into code source for editing
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from + 3 + (this.lang ? this.lang.length : 0) + 1 }
      });
      view.focus();
    });

    return container;
  }
}

/**
 * Main Live Preview Engine
 * Uses a StateField to provide block replacements and processes document state.
 */
function buildDecorations(state) {
  const decorations = [];
  const doc = state.doc;
  const selection = state.selection.main;
  const cursorHead = selection.head;
  const cursorLine = doc.lineAt(cursorHead).number;
  const foldedLines = state.field(foldedLinesField, false) || new Set();

  const docText = doc.toString();

  // Helper: check if cursor is strictly inside line or range
  const isLineActive = (lineNum) => lineNum === cursorLine;
  const isRangeActive = (from, to) => cursorHead >= from && cursorHead <= to;

  // Track all replaced block ranges to prevent nested/conflicting decorations in Section D
  const replacedBlockRanges = [];

  // ── A. Frontmatter YAML Block (at start of doc) ──
  const frontmatterMatch = docText.match(/^---\n([\s\S]+?)\n---/);
  if (frontmatterMatch) {
    const from = 0;
    const to = frontmatterMatch[0].length;
    replacedBlockRanges.push({ from, to });
    if (!isRangeActive(from, to)) {
      decorations.push(Decoration.replace({
        widget: new PropertiesWidget(frontmatterMatch[1], from, to),
        block: true
      }).range(from, to));
    }
  }

  // ── A2. Fenced Code Blocks (``` ... ```) ──
  const codeBlockRegex = /(?:^|\n)```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)\r?\n```/g;
  let cbMatch;
  while ((cbMatch = codeBlockRegex.exec(docText)) !== null) {
    let from = cbMatch.index;
    let to = from + cbMatch[0].length;

    if (docText[from] === '\n') {
      from += 1;
    }
    if (to > 0 && (docText[to - 1] === '\n' || docText[to - 1] === '\r')) {
      to -= 1;
    }

    from = doc.lineAt(from).from;
    to = doc.lineAt(to).to;

    const lang = cbMatch[1].trim();
    const code = cbMatch[2];

    replacedBlockRanges.push({ from, to });
    if (!isRangeActive(from, to)) {
      decorations.push(Decoration.replace({
        widget: new CodeBlockWidget(lang, code, from, to),
        block: true
      }).range(from, to));
    }
  }

  // ── C. Block Math ($$...$$) across document ──
  const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
  let bMatch;
  while ((bMatch = blockMathRegex.exec(docText)) !== null) {
    let from = bMatch.index;
    let to = from + bMatch[0].length;
    
    const lineFrom = doc.lineAt(from).from;
    const lineTo = doc.lineAt(to > 0 && (docText[to - 1] === '\n' || docText[to - 1] === '\r') ? to - 1 : to).to;

    const mathContent = bMatch[1].trim();

    replacedBlockRanges.push({ from: lineFrom, to: lineTo });
    if (!isRangeActive(lineFrom, lineTo)) {
      decorations.push(Decoration.replace({
        widget: new KatexBlockWidget(mathContent, lineFrom, lineTo),
        block: true
      }).range(lineFrom, lineTo));
    } else {
      // While actively editing inside $$...$$, render live preview right below closing line
      decorations.push(Decoration.widget({
        widget: new KatexLiveEditPreviewWidget(mathContent),
        block: true,
        side: 1
      }).range(lineTo));
    }
  }

  // ── C2. Tables (GitHub Flavored Markdown) ──
  const tableRegex = /(?:^[ \t\xA0]*\|.*\|[ \t\xA0]*$\r?\n){1,}[ \t\xA0]*\|.*\|[ \t\xA0]*$/gm;
  let tbMatch;
  while ((tbMatch = tableRegex.exec(docText)) !== null) {
    let from = tbMatch.index;
    let to = from + tbMatch[0].length;
    
    from = doc.lineAt(from).from;
    if (to > 0 && docText[to - 1] === '\n') {
      to = to - 1;
    }
    if (to > 0 && docText[to - 1] === '\r') {
      to = to - 1;
    }
    to = doc.lineAt(to).to;

    replacedBlockRanges.push({ from, to });
    if (!isRangeActive(from, to)) {
      decorations.push(Decoration.replace({
        widget: new TableWidget(tbMatch[0], from, to),
        block: true
      }).range(from, to));
    }
  }

  // Helper: check if a range overlaps with any replaced block
  const isInsideReplacedBlock = (from, to) => {
    return replacedBlockRanges.some(r => !(to <= r.from || from >= r.to));
  };

  // Helper: calculate indent depth (4 spaces = 1 tab = 1 level)
  const getIndentDepth = (indentStr) => {
    let count = 0;
    for (let char of indentStr) {
      count += (char === '\t' ? 4 : 1);
    }
    if (count === 0) return 0;
    if (count >= 4) return Math.min(8, Math.floor(count / 4));
    return 1; // 2 or 3 spaces = level 1
  };

  // Helper: check if line i has child items nested below it
  const lineHasChildren = (i) => {
    if (i >= doc.lines) return false;
    const currentLine = doc.line(i);
    const currText = currentLine.text;
    const currMatch = currText.match(/^(\s*)([-*+]|\d+\.|#+)\s+/);
    if (!currMatch) return false;

    const currDepth = getIndentDepth(currMatch[1]);
    const isHeading = currText.startsWith('#');
    const headingLevel = isHeading ? currText.match(/^#+/)[0].length : 0;

    for (let j = i + 1; j <= doc.lines; j++) {
      const nextLine = doc.line(j);
      const nextText = nextLine.text;
      if (!nextText.trim()) continue; // skip blank line

      if (isHeading) {
        const nextHeading = nextText.match(/^(#+)\s+/);
        if (nextHeading) {
          return nextHeading[1].length > headingLevel;
        }
        return true; // text content under heading
      } else {
        const nextListMatch = nextText.match(/^(\s*)([-*+]|\d+\.)\s+/);
        if (nextListMatch) {
          const nextDepth = getIndentDepth(nextListMatch[1]);
          return nextDepth > currDepth;
        }
        return false;
      }
    }
    return false;
  };

  // State for folded callout tracking
  let currentFoldedCallout = false;
  let activeFoldDepth = -1;

  // ── B. Scan all lines for Headings, Checkboxes, Bullets, Callouts, Blockquotes, HR ──
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineNum = line.number;
    const text = line.text;
    const lineActive = isLineActive(lineNum);

    // Skip lines that are part of replaced blocks
    if (isInsideReplacedBlock(line.from, line.to)) {
      currentFoldedCallout = false;
      continue;
    }

    // Callout body folding
    if (text.startsWith('>') && currentFoldedCallout) {
      if (!lineActive) {
        decorations.push(Decoration.replace({ block: true }).range(line.from, line.to));
      }
      continue;
    } else if (!text.startsWith('>')) {
      currentFoldedCallout = false;
    }

    // Outliner hierarchy folding
    const listCheck = text.match(/^(\s*)([-*+]|\d+\.)\s+/);
    const lineDepth = listCheck ? getIndentDepth(listCheck[1]) : 0;

    if (activeFoldDepth !== -1) {
      if (listCheck && lineDepth > activeFoldDepth && !lineActive) {
        // Line is a collapsed child: hide it
        decorations.push(Decoration.replace({ block: true }).range(line.from, line.to));
        continue;
      } else {
        // Reached end of folded sub-tree
        activeFoldDepth = -1;
      }
    }

    const isFolded = foldedLines.has(lineNum);
    if (isFolded) {
      activeFoldDepth = lineDepth;
    }

    // 1. Headings (# H1, ## H2, ### H3, #### H4, ##### H5, ###### H6)
    const headingMatch = text.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const hClass = `cm-h${level} font-bold text-text`;
      decorations.push(Decoration.line({ class: hClass }).range(line.from));

      if (!lineActive) {
        const markerLen = headingMatch[1].length + 1;
        decorations.push(Decoration.replace({}).range(line.from, line.from + markerLen));
      }
      continue;
    }

    // 2. Interactive Task Checkboxes (- [x], - [ ], [-], [/], etc. with nested indent)
    const taskMatch = text.match(/^(\s*)([-*+]\s+\[([ xX\-\/])\]\s*)/);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const markerStart = line.from + indent;
      const markerEnd = line.from + taskMatch[0].length;
      const statusChar = taskMatch[3];

      const isChecked = statusChar.toLowerCase() === 'x';
      const isCanceled = statusChar === '-';
      const isInProgress = statusChar === '/';

      const depth = getIndentDepth(taskMatch[1]);
      if (depth > 0) {
        decorations.push(Decoration.line({ class: `cm-list-depth-${depth}` }).range(line.from));
      }

      const hasKids = lineHasChildren(i);

      decorations.push(Decoration.replace({
        widget: new TaskCheckboxWidget(isChecked, isCanceled, isInProgress, line.from, hasKids, isFolded, lineNum),
        inclusive: false,
        inclusiveStart: false,
        inclusiveEnd: false,
      }).range(markerStart, markerEnd));

      if (isChecked) {
        decorations.push(Decoration.mark({ class: 'cm-task-completed line-through text-text-muted opacity-60' }).range(markerEnd, line.to));
      }
      continue;
    }

    // 3. Bullet & Numbered Lists (- item, * item, + item, 1. item with 4-space indent)
    const listMatch = text.match(/^(\s*)([-*+]|\d+\.)\s+/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const bulletSymbol = listMatch[2];
      const markerStart = line.from + indent;
      const markerEnd = line.from + listMatch[0].length;

      const depth = getIndentDepth(listMatch[1]);
      if (depth > 0) {
        decorations.push(Decoration.line({ class: `cm-list-depth-${depth}` }).range(line.from));
      }

      const hasKids = lineHasChildren(i);

      if (!lineActive) {
        decorations.push(Decoration.widget({
          widget: new ListBulletWidget(bulletSymbol, indent, hasKids, isFolded, lineNum),
          side: -1
        }).range(markerStart));
        decorations.push(Decoration.replace({}).range(markerStart, markerEnd));
      }
      continue;
    }

    // 4. Callouts (> [!type] Title)
    const calloutMatch = text.match(/^>\s*\[!([a-zA-Z0-9_-]+)\]([+-])?\s*(.*)$/);
    if (calloutMatch) {
      const [, type, foldSign, title] = calloutMatch;
      const isFoldable = !!foldSign;
      const isFolded = foldSign === '-';

      currentFoldedCallout = isFolded;

      decorations.push(Decoration.line({ class: `obsidian-callout-line obsidian-callout-${type.toLowerCase()}` }).range(line.from));

      if (!lineActive) {
        decorations.push(Decoration.replace({
          widget: new CalloutHeaderWidget(type, title, isFoldable, isFolded, line.from),
          block: true
        }).range(line.from, line.to));
      }
      continue;
    } else if (text.startsWith('>')) {
      // 5. Blockquotes & Nested Blockquotes (> quote, >> nested, >>> deep)
      // Multi-border lines going continuous all the way down without indentation breaks
      const bqMatch = text.match(/^(>+)\s*(.*)$/);
      const depth = bqMatch ? bqMatch[1].length : 1;
      const dClass = `cm-blockquote-d${Math.min(depth, 6)}`;
      
      decorations.push(Decoration.line({
        class: `cm-blockquote-line ${dClass} italic text-text/90`
      }).range(line.from));

      if (!lineActive) {
        const markerLen = depth + (text[depth] === ' ' ? 1 : 0);
        decorations.push(Decoration.replace({}).range(line.from, line.from + markerLen));
      }
      continue;
    }

    // 6. Footnote definition lines ([^1]: footnote text)
    const fnDefMatch = text.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (fnDefMatch) {
      decorations.push(Decoration.line({ class: 'cm-footnote-def text-xs text-text-muted border-t border-border/40 pt-1 mt-2' }).range(line.from));
      continue;
    }

    // 7. Horizontal Rule (---, ***, ___)
    if (/^(\s*[-*_]\s*){3,}$/.test(text)) {
      const isFrontmatter = frontmatterMatch && line.from <= frontmatterMatch[0].length;
      if (!isFrontmatter && !lineActive) {
        decorations.push(Decoration.replace({
          widget: new HrWidget(line.from),
          block: true
        }).range(line.from, line.to));
      }
    }
  }

  // ── D. Collision-Free Inline Elements Scanner ──
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const chunkText = line.text;
    const from = line.from;

    if (isInsideReplacedBlock(line.from, line.to)) {
      continue;
    }

    // Track occupied byte slices in the line to guarantee zero decoration overlap
    const occupied = new Uint8Array(chunkText.length);
    const canOccupy = (start, end) => {
      for (let k = start; k < end; k++) {
        if (occupied[k]) return false;
      }
      return true;
    };
    const markOccupied = (start, end) => {
      for (let k = start; k < end; k++) occupied[k] = 1;
    };

    // Pre-occupy line prefixes (tasks, lists, headings) so inline matchers don't mangle prefix syntax
    const prefixTask = chunkText.match(/^(\s*[-*+]\s+\[[ xX\-\/]\]\s*)/);
    if (prefixTask) {
      markOccupied(0, prefixTask[0].length);
    }
    const prefixList = chunkText.match(/^(\s*[-*+]|\s*\d+\.)\s+/);
    if (prefixList) {
      markOccupied(0, prefixList[0].length);
    }
    const prefixHeading = chunkText.match(/^(\s*#{1,6}\s+)/);
    if (prefixHeading) {
      markOccupied(0, prefixHeading[0].length);
    }

    // 1. Comments (%% comment %%) - Visible in edit/live preview mode
    const commentRegex = /%%([\s\S]*?)%%/g;
    let cm;
    while ((cm = commentRegex.exec(chunkText)) !== null) {
      const cStart = cm.index;
      const cEnd = cStart + cm[0].length;
      if (canOccupy(cStart, cEnd)) {
        markOccupied(cStart, cEnd);
        const mFrom = from + cStart;
        const mTo = from + cEnd;
        decorations.push(Decoration.mark({
          class: 'cm-obsidian-comment italic text-text-muted/70 font-mono text-[13px] bg-surface-alt/40 px-1 py-0.5 rounded border border-border/30 select-text'
        }).range(mFrom, mTo));
      }
    }

    // 2. Embeds (![[image.png]])
    const embedRegex = /!\[\[(.+?)\]\]/g;
    let em;
    while ((em = embedRegex.exec(chunkText)) !== null) {
      const eStart = em.index;
      const eEnd = eStart + em[0].length;
      if (canOccupy(eStart, eEnd)) {
        markOccupied(eStart, eEnd);
        const mFrom = from + eStart;
        const mTo = from + eEnd;
        if (!isRangeActive(mFrom, mTo)) {
          decorations.push(Decoration.replace({ widget: new EmbedWidget(em[1], mFrom) }).range(mFrom, mTo));
        }
      }
    }

    // 3. Wiki-Links ([[Page Name]] or [[Page Name|Alias]])
    const wikiLinkRegex = /\[\[(.+?)\]\]/g;
    let wl;
    while ((wl = wikiLinkRegex.exec(chunkText)) !== null) {
      const wStart = wl.index;
      const wEnd = wStart + wl[0].length;
      if (canOccupy(wStart, wEnd)) {
        markOccupied(wStart, wEnd);
        const mFrom = from + wStart;
        const mTo = from + wEnd;
        if (!isRangeActive(mFrom, mTo)) {
          decorations.push(Decoration.replace({ widget: new WikiLinkWidget(wl[1], mFrom) }).range(mFrom, mTo));
        }
      }
    }

    // 4. Inline Footnotes (^[note text])
    const inlineFnRegex = /\^\[([^\]\n]+)\]/g;
    let ifn;
    while ((ifn = inlineFnRegex.exec(chunkText)) !== null) {
      const fnStart = ifn.index;
      const fnEnd = fnStart + ifn[0].length;
      if (canOccupy(fnStart, fnEnd)) {
        markOccupied(fnStart, fnEnd);
        const mFrom = from + fnStart;
        const mTo = from + fnEnd;
        if (!isRangeActive(mFrom, mTo)) {
          decorations.push(Decoration.replace({ widget: new InlineFootnoteWidget(ifn[1], mFrom) }).range(mFrom, mTo));
        }
      }
    }

    // 5. Footnote References ([^1])
    const fnRefRegex = /\[\^([^\]\n]+)\]/g;
    let fnr;
    while ((fnr = fnRefRegex.exec(chunkText)) !== null) {
      const fnStart = fnr.index;
      const fnEnd = fnStart + fnr[0].length;
      if (canOccupy(fnStart, fnEnd)) {
        markOccupied(fnStart, fnEnd);
        const mFrom = from + fnStart;
        const mTo = from + fnEnd;
        if (!isRangeActive(mFrom, mTo)) {
          decorations.push(Decoration.replace({ widget: new FootnoteRefWidget(fnr[1], mFrom) }).range(mFrom, mTo));
        }
      }
    }

    // 6. Standard External Links ([text](url))
    const linkRegex = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    let lnk;
    while ((lnk = linkRegex.exec(chunkText)) !== null) {
      const lStart = lnk.index;
      const lEnd = lStart + lnk[0].length;
      if (canOccupy(lStart, lEnd)) {
        markOccupied(lStart, lEnd);
        const lFrom = from + lStart;
        const lTo = from + lEnd;
        if (!isRangeActive(lFrom, lTo)) {
          const textLen = lnk[1].length;
          decorations.push(Decoration.replace({}).range(lFrom, lFrom + 1)); // '['
          decorations.push(Decoration.mark({ class: 'obsidian-link text-primary font-medium hover:underline cursor-pointer' }).range(lFrom + 1, lFrom + 1 + textLen));
          decorations.push(Decoration.replace({}).range(lFrom + 1 + textLen, lTo)); // '](url)'
        }
      }
    }

    // 7. Inline KaTeX ($...$)
    const inlineMathRegex = /(?<!\\|\$)\$(?!\$)(.+?)(?<!\\|\$)\$(?!\$)/g;
    let im;
    while ((im = inlineMathRegex.exec(chunkText)) !== null) {
      const mStart = im.index;
      const mEnd = mStart + im[0].length;
      if (canOccupy(mStart, mEnd)) {
        markOccupied(mStart, mEnd);
        const mFrom = from + mStart;
        const mTo = from + mEnd;
        if (!isRangeActive(mFrom, mTo)) {
          decorations.push(Decoration.replace({
            widget: new KatexInlineWidget(im[1].trim(), mFrom, mTo),
          }).range(mFrom, mTo));
        }
      }
    }

    // 8. Tags (#tag, #guide/syntax)
    const tagRegex = /(?<=\s|^)#([a-zA-Z0-9_\-\/]+)(?=\s|$)/g;
    let tr;
    while ((tr = tagRegex.exec(chunkText)) !== null) {
      const tStart = tr.index;
      const tEnd = tStart + tr[0].length;
      if (canOccupy(tStart, tEnd)) {
        markOccupied(tStart, tEnd);
        const tFrom = from + tStart;
        const tTo = from + tEnd;
        if (!isRangeActive(tFrom, tTo)) {
          decorations.push(Decoration.replace({
            widget: new TagWidget(tr[0]),
          }).range(tFrom, tTo));
        }
      }
    }

    // 9. Inline Code (`code`)
    const codeRegex = /`([^`\n]+)`/g;
    let cd;
    while ((cd = codeRegex.exec(chunkText)) !== null) {
      const cStart = cd.index;
      const cEnd = cStart + cd[0].length;
      if (canOccupy(cStart, cEnd)) {
        markOccupied(cStart, cEnd);
        const cFrom = from + cStart;
        const cTo = from + cEnd;
        if (!isRangeActive(cFrom, cTo)) {
          decorations.push(Decoration.replace({}).range(cFrom, cFrom + 1));
          decorations.push(Decoration.mark({ class: 'obsidian-inline-code bg-surface-alt text-primary-light font-mono text-[13px] px-1.5 py-0.5 rounded border border-border/40 mx-0.5' }).range(cFrom + 1, cTo - 1));
          decorations.push(Decoration.replace({}).range(cTo - 1, cTo));
        }
      }
    }

    // 10. Highlights (==text==)
    const highlightRegex = /==([^\n=]+?)==/g;
    let hl;
    while ((hl = highlightRegex.exec(chunkText)) !== null) {
      const hStart = hl.index;
      const hEnd = hStart + hl[0].length;
      if (canOccupy(hStart, hEnd)) {
        markOccupied(hStart, hEnd);
        const hFrom = from + hStart;
        const hTo = from + hEnd;
        if (!isRangeActive(hFrom, hTo)) {
          decorations.push(Decoration.replace({}).range(hFrom, hFrom + 2));
          decorations.push(Decoration.mark({ class: 'obsidian-highlight font-medium px-1 py-0.5 rounded bg-amber-400/25 text-amber-300' }).range(hFrom + 2, hTo - 2));
          decorations.push(Decoration.replace({}).range(hTo - 2, hTo));
        }
      }
    }

    // 11. Bold & Italic (***text***)
    const boldItalicRegex = /\*\*\*([^\*\n]+?)\*\*\*/g;
    let bi;
    while ((bi = boldItalicRegex.exec(chunkText)) !== null) {
      const biStart = bi.index;
      const biEnd = biStart + bi[0].length;
      if (canOccupy(biStart, biEnd)) {
        markOccupied(biStart, biEnd);
        const biFrom = from + biStart;
        const biTo = from + biEnd;
        if (!isRangeActive(biFrom, biTo)) {
          decorations.push(Decoration.replace({}).range(biFrom, biFrom + 3));
          decorations.push(Decoration.mark({ class: 'font-bold italic text-text' }).range(biFrom + 3, biTo - 3));
          decorations.push(Decoration.replace({}).range(biTo - 3, biTo));
        }
      }
    }

    // 12. Bold (**text**)
    const boldRegex = /\*\*([^\*\n]+?)\*\*/g;
    let b;
    while ((b = boldRegex.exec(chunkText)) !== null) {
      const bStart = b.index;
      const bEnd = bStart + b[0].length;
      if (canOccupy(bStart, bEnd)) {
        markOccupied(bStart, bEnd);
        const bFrom = from + bStart;
        const bTo = from + bEnd;
        if (!isRangeActive(bFrom, bTo)) {
          decorations.push(Decoration.replace({}).range(bFrom, bFrom + 2));
          decorations.push(Decoration.mark({ class: 'font-bold text-text' }).range(bFrom + 2, bTo - 2));
          decorations.push(Decoration.replace({}).range(bTo - 2, bTo));
        }
      }
    }

    // 13. Italics (*italic* or _italic_)
    const italicRegex = /(?<!\*|\w)\*(?!\s|\*)([^\*\n]+?)(?<!\s|\*)\*(?!\*|\w)|(?<!_|\w)_(?!\s|_)([^_\n]+?)(?<!\s|_|_)_(?!_|\w)/g;
    let it;
    while ((it = italicRegex.exec(chunkText)) !== null) {
      const iStart = it.index;
      const iEnd = iStart + it[0].length;
      if (canOccupy(iStart, iEnd)) {
        markOccupied(iStart, iEnd);
        const iFrom = from + iStart;
        const iTo = from + iEnd;
        if (!isRangeActive(iFrom, iTo)) {
          decorations.push(Decoration.replace({}).range(iFrom, iFrom + 1));
          decorations.push(Decoration.mark({ class: 'italic text-text' }).range(iFrom + 1, iTo - 1));
          decorations.push(Decoration.replace({}).range(iTo - 1, iTo));
        }
      }
    }

    // 14. Strikethrough (~~text~~)
    const strikeRegex = /~~([^\~\n]+?)~~/g;
    let st;
    while ((st = strikeRegex.exec(chunkText)) !== null) {
      const sStart = st.index;
      const sEnd = sStart + st[0].length;
      if (canOccupy(sStart, sEnd)) {
        markOccupied(sStart, sEnd);
        const sFrom = from + sStart;
        const sTo = from + sEnd;
        if (!isRangeActive(sFrom, sTo)) {
          decorations.push(Decoration.replace({}).range(sFrom, sFrom + 2));
          decorations.push(Decoration.mark({ class: 'line-through opacity-70 text-text-muted' }).range(sFrom + 2, sTo - 2));
          decorations.push(Decoration.replace({}).range(sTo - 2, sTo));
        }
      }
    }
  }

  // Sort carefully to avoid RangeSet overlap crashes
  decorations.sort((a, b) => a.from - b.from || a.startSide - b.startSide);

  try {
    return Decoration.set(decorations, true);
  } catch (e) {
    console.error("Live preview decoration error", e);
    return Decoration.none;
  }
}

export const obsidianLivePreviewPlugin = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(toggleFoldEffect))) {
      return buildDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

/**
 * Obsidian Theme Styles for CodeMirror (Typography, Spacing, Headers, Callouts)
 * Uses strict padding to preserve accurate CodeMirror coordinate/click calculations
 */
export const obsidianThemeExtension = EditorView.theme({
  '&': {
    height: '100%',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    fontSize: '14.5px',
    lineHeight: '1.7',
  },
  '.cm-scroller': {
    padding: '24px 32px',
  },
  '.cm-content': {
    caretColor: 'var(--color-primary-light)',
  },
  '.cm-line': {
    padding: '2px 0',
    position: 'relative',
  },
  '.cm-h1': {
    fontSize: '1.85em',
    lineHeight: '1.25',
    paddingTop: '18px',
    paddingBottom: '8px',
    color: 'var(--color-text) !important',
    fontWeight: '800',
    letterSpacing: '-0.025em',
  },
  '.cm-h2': {
    fontSize: '1.5em',
    lineHeight: '1.3',
    paddingTop: '14px',
    paddingBottom: '6px',
    color: 'var(--color-text) !important',
    fontWeight: '700',
    letterSpacing: '-0.02em',
  },
  '.cm-h3': {
    fontSize: '1.25em',
    lineHeight: '1.35',
    paddingTop: '10px',
    paddingBottom: '4px',
    color: 'var(--color-text) !important',
    fontWeight: '650',
  },
  '.cm-h4': {
    fontSize: '1.1em',
    paddingTop: '8px',
    paddingBottom: '2px',
    color: 'var(--color-text) !important',
    fontWeight: '600',
  },
  '.cm-h5, .cm-h6': {
    fontSize: '1.0em',
    fontWeight: '600',
    color: 'var(--color-text) !important',
  },
  '.cm-h1 *, .cm-h2 *, .cm-h3 *, .cm-h4 *, .cm-h5 *, .cm-h6 *': {
    color: 'inherit !important',
  },
  '.cm-task-checkbox-wrap': {
    verticalAlign: '-0.14em',
    lineHeight: '1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── 4-space nested indentation levels with vertical indent guide line ──
  '.cm-list-depth-1': {
    paddingLeft: '28px !important',
    position: 'relative',
  },
  '.cm-list-depth-1::before': {
    content: '""',
    position: 'absolute',
    left: '10px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-list-depth-2': {
    paddingLeft: '56px !important',
    position: 'relative',
  },
  '.cm-list-depth-2::before': {
    content: '""',
    position: 'absolute',
    left: '38px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-list-depth-3': {
    paddingLeft: '84px !important',
    position: 'relative',
  },
  '.cm-list-depth-3::before': {
    content: '""',
    position: 'absolute',
    left: '66px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-list-depth-4': {
    paddingLeft: '112px !important',
    position: 'relative',
  },
  '.cm-list-depth-4::before': {
    content: '""',
    position: 'absolute',
    left: '94px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-list-depth-5': {
    paddingLeft: '140px !important',
    position: 'relative',
  },
  '.cm-list-depth-5::before': {
    content: '""',
    position: 'absolute',
    left: '122px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  '.cm-list-depth-6': {
    paddingLeft: '168px !important',
    position: 'relative',
  },
  '.cm-list-depth-6::before': {
    content: '""',
    position: 'absolute',
    left: '150px',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  // ── Blockquote styling: crisp vertical lines with transparent spacing ──
  '.cm-blockquote-line': {
    borderLeft: '2.5px solid var(--color-primary, #6366f1)',
    backgroundColor: 'transparent',
    borderRadius: '0',
    marginLeft: '0px !important',
  },
  '.cm-blockquote-d1': {
    paddingLeft: '14px !important',
  },
  '.cm-blockquote-d2': {
    backgroundImage: 'linear-gradient(to right, transparent 8px, var(--color-primary, #6366f1) 8px, var(--color-primary, #6366f1) 10.5px, transparent 10.5px)',
    backgroundRepeat: 'no-repeat',
    paddingLeft: '22px !important',
  },
  '.cm-blockquote-d3': {
    backgroundImage: 'linear-gradient(to right, transparent 8px, var(--color-primary, #6366f1) 8px, var(--color-primary, #6366f1) 10.5px, transparent 10.5px, transparent 18px, var(--color-primary, #6366f1) 18px, var(--color-primary, #6366f1) 20.5px, transparent 20.5px)',
    backgroundRepeat: 'no-repeat',
    paddingLeft: '32px !important',
  },
  '.cm-blockquote-d4': {
    backgroundImage: 'linear-gradient(to right, transparent 8px, var(--color-primary, #6366f1) 8px, var(--color-primary, #6366f1) 10.5px, transparent 10.5px, transparent 18px, var(--color-primary, #6366f1) 18px, var(--color-primary, #6366f1) 20.5px, transparent 20.5px, transparent 28px, var(--color-primary, #6366f1) 28px, var(--color-primary, #6366f1) 30.5px, transparent 30.5px)',
    backgroundRepeat: 'no-repeat',
    paddingLeft: '42px !important',
  },
  '.cm-blockquote-d5': {
    backgroundImage: 'linear-gradient(to right, transparent 8px, var(--color-primary, #6366f1) 8px, var(--color-primary, #6366f1) 10.5px, transparent 10.5px, transparent 18px, var(--color-primary, #6366f1) 18px, var(--color-primary, #6366f1) 20.5px, transparent 20.5px, transparent 28px, var(--color-primary, #6366f1) 28px, var(--color-primary, #6366f1) 30.5px, transparent 30.5px, transparent 38px, var(--color-primary, #6366f1) 38px, var(--color-primary, #6366f1) 40.5px, transparent 40.5px)',
    backgroundRepeat: 'no-repeat',
    paddingLeft: '52px !important',
  },
  '.cm-blockquote-d6': {
    backgroundImage: 'linear-gradient(to right, transparent 8px, var(--color-primary, #6366f1) 8px, var(--color-primary, #6366f1) 10.5px, transparent 10.5px, transparent 18px, var(--color-primary, #6366f1) 18px, var(--color-primary, #6366f1) 20.5px, transparent 20.5px, transparent 28px, var(--color-primary, #6366f1) 28px, var(--color-primary, #6366f1) 30.5px, transparent 30.5px, transparent 38px, var(--color-primary, #6366f1) 38px, var(--color-primary, #6366f1) 40.5px, transparent 40.5px, transparent 48px, var(--color-primary, #6366f1) 48px, var(--color-primary, #6366f1) 50.5px, transparent 50.5px)',
    backgroundRepeat: 'no-repeat',
    paddingLeft: '62px !important',
  },
  '.obsidian-callout-line': {
    borderLeft: '3px solid var(--color-primary)',
    paddingLeft: '14px !important',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
});
