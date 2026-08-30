import { useEffect, useState, useMemo, useRef } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import CodeMirror from '@uiw/react-codemirror';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, indentUnit } from '@codemirror/language';
import { EditorState, EditorSelection, Prec } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { useTheme } from '../context/ThemeContext';
import {
  obsidianLivePreviewPlugin,
  obsidianThemeExtension,
  foldedLinesField
} from '../services/obsidianLivePreview';
import { 
  TextB, 
  TextItalic, 
  TextStrikethrough, 
  TextHOne, 
  TextHTwo, 
  TextHThree, 
  ListBullets, 
  ListNumbers, 
  Quotes, 
  Code, 
  CodeBlock,
  CheckSquare,
  Highlighter,
  Function as FunctionIcon,
  Info,
  Copy,
  Check,
  DownloadSimple,
  Sparkle,
  FileDoc,
  Eraser
} from '@phosphor-icons/react';

// ── Modern Dark Syntax Highlighting (Slate & Indigo) ──
const modernDarkEditorTheme = EditorView.theme({
  '&': {
    color: '#e2e8f0 !important',
    backgroundColor: '#13131a !important',
    height: '100%',
  },
  '.cm-scroller': {
    backgroundColor: '#13131a !important',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  '.cm-content': {
    color: '#e2e8f0 !important',
    caretColor: '#818cf8',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '14.5px',
    lineHeight: '1.7',
    padding: '24px 32px',
    maxWidth: '860px',
    margin: '0 auto',
  },
  '.cm-line': {
    color: '#e2e8f0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#818cf8',
    borderLeftWidth: '2px',
  },
  '::selection, .cm-content ::selection, .cm-line ::selection, .cm-editor ::selection': {
    backgroundColor: 'rgba(99, 102, 241, 0.35) !important',
  },
  '.cm-gutters': {
    backgroundColor: '#1a1a25 !important',
    color: '#64748b !important',
    borderRight: '1px solid rgba(255, 255, 255, 0.08) !important',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.025) !important',
  },
}, { dark: true });

const modernDarkHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading2, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading3, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading4, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading5, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading6, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.heading, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.strong, color: '#ffffff', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#cbd5e1', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#64748b', textDecoration: 'line-through' },
  { tag: t.keyword, color: '#818cf8' },
  { tag: t.atom, color: '#a78bfa' },
  { tag: t.bool, color: '#a78bfa' },
  { tag: t.url, color: '#818cf8', textDecoration: 'underline' },
  { tag: t.labelName, color: '#818cf8' },
  { tag: t.link, color: '#818cf8', textDecoration: 'underline' },
  { tag: t.monospace, color: '#38bdf8' },
  { tag: t.quote, color: '#94a3b8' },
  { tag: t.list, color: '#818cf8' },
  { tag: t.content, color: '#e2e8f0' },
  { tag: t.meta, color: '#64748b' },
  { tag: t.punctuation, color: '#94a3b8' },
]);

// ── Modern Light Syntax Highlighting (Crisp White & Slate) ──
const modernLightEditorTheme = EditorView.theme({
  '&': {
    color: '#0f172a !important',
    backgroundColor: '#ffffff !important',
    height: '100%',
  },
  '.cm-scroller': {
    backgroundColor: '#ffffff !important',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  '.cm-content': {
    color: '#0f172a !important',
    caretColor: '#6366f1',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: '14.5px',
    lineHeight: '1.7',
    padding: '24px 32px',
    maxWidth: '860px',
    margin: '0 auto',
  },
  '.cm-line': {
    color: '#0f172a',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#6366f1',
    borderLeftWidth: '2px',
  },
  '::selection, .cm-content ::selection, .cm-line ::selection, .cm-editor ::selection': {
    backgroundColor: 'rgba(99, 102, 241, 0.20) !important',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc !important',
    color: '#94a3b8 !important',
    borderRight: '1px solid #e2e8f0 !important',
  },
  '.cm-activeLine': {
    backgroundColor: '#f8fafc !important',
  },
}, { dark: false });

const modernLightHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: '#0f172a', fontWeight: 'bold' },
  { tag: t.heading2, color: '#1e293b', fontWeight: 'bold' },
  { tag: t.heading3, color: '#334155', fontWeight: 'bold' },
  { tag: t.heading4, color: '#475569', fontWeight: 'bold' },
  { tag: t.heading5, color: '#64748b', fontWeight: 'bold' },
  { tag: t.heading6, color: '#64748b', fontWeight: 'bold' },
  { tag: t.heading, color: '#0f172a', fontWeight: 'bold' },
  { tag: t.strong, color: '#0f172a', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#334155', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#94a3b8', textDecoration: 'line-through' },
  { tag: t.keyword, color: '#4f46e5' },
  { tag: t.atom, color: '#7c3aed' },
  { tag: t.bool, color: '#7c3aed' },
  { tag: t.url, color: '#4f46e5', textDecoration: 'underline' },
  { tag: t.labelName, color: '#4f46e5' },
  { tag: t.link, color: '#4f46e5', textDecoration: 'underline' },
  { tag: t.monospace, color: '#0284c7' },
  { tag: t.quote, color: '#475569' },
  { tag: t.list, color: '#6366f1' },
  { tag: t.content, color: '#0f172a' },
  { tag: t.meta, color: '#64748b' },
  { tag: t.punctuation, color: '#64748b' },
]);

// ── Pure HTML Renderer with KaTeX & Placeholder Protection ──
export const renderMarkdownWithLatex = (markdownText) => {
  if (!markdownText) return "";

  const mathBlocks = [];
  const mathInlines = [];

  // 1. Stash block math $$...$$
  let processed = markdownText.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const placeholder = `%%KATEX_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(math.trim());
    return `\n\n${placeholder}\n\n`;
  });

  // 2. Stash inline math $...$
  processed = processed.replace(/(?<!\\|\$)\$(?!\$)(.+?)(?<!\\|\$)\$(?!\$)/g, (_, math) => {
    const placeholder = `%%KATEX_INLINE_${mathInlines.length}%%`;
    mathInlines.push(math.trim());
    return placeholder;
  });

  // 3. Parse Markdown structure safely with marked
  let html = marked.parse(processed, { gfm: true, breaks: true });

  // 4. Restore block math with KaTeX
  html = html.replace(/<p>\s*%%KATEX_BLOCK_(\d+)%%\s*<\/p>|%%KATEX_BLOCK_(\d+)%%/g, (_, pIndex, rawIndex) => {
    const idx = parseInt(pIndex !== undefined ? pIndex : rawIndex, 10);
    const rawMath = mathBlocks[idx] || "";
    try {
      const rendered = katex.renderToString(rawMath, { 
        displayMode: true, 
        throwOnError: false, 
        output: 'html' 
      });
      return `<div class="katex-block my-4 text-center overflow-x-auto py-2.5 px-4 rounded-lg bg-surface-alt/70 border border-border/60">${rendered}</div>`;
    } catch {
      return `<div class="katex-block my-4 text-center font-mono text-sm text-red-400">$$\n${rawMath}\n$$</div>`;
    }
  });

  // 5. Restore inline math with KaTeX
  html = html.replace(/%%KATEX_INLINE_(\d+)%%/g, (_, index) => {
    const idx = parseInt(index, 10);
    const rawMath = mathInlines[idx] || "";
    try {
      const rendered = katex.renderToString(rawMath, { 
        displayMode: false, 
        throwOnError: false, 
        output: 'html' 
      });
      return `<span class="katex-inline px-0.5 inline-block align-middle">${rendered}</span>`;
    } catch {
      return `<span class="katex-inline px-0.5 inline-block font-mono text-xs text-red-400">$${rawMath}$</span>`;
    }
  });

  return html;
};

export default function MarkdownEditor({ 
  markdown = "", 
  notes = null, 
  onContentChange,
  onSave
}) {
  const initialContent = notes !== null && notes !== undefined 
    ? notes 
    : (markdown || "# Untitled Note\n\nStart typing detailed lecture notes here...");

  const [rawMarkdown, setRawMarkdown] = useState(initialContent);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  const editorViewRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Sync when external lecture selection changes
  useEffect(() => {
    const nextContent = notes !== null && notes !== undefined ? notes : markdown;
    if (nextContent !== null && nextContent !== undefined && nextContent !== rawMarkdown) {
      setRawMarkdown(nextContent);
      setSaveStatus('saved');
    }
  }, [notes, markdown]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Rendered HTML for Docs / Export
  const renderedHtml = useMemo(() => {
    return renderMarkdownWithLatex(rawMarkdown);
  }, [rawMarkdown]);

  // Trigger Save function
  const triggerSave = (contentToSave) => {
    setSaveStatus('saving');
    onSave?.(contentToSave);
    setTimeout(() => {
      setSaveStatus('saved');
    }, 350);
  };

  // CodeMirror update handler with auto-save debounce
  const handleCodeMirrorChange = (val) => {
    setRawMarkdown(val);
    setSaveStatus('unsaved');
    onContentChange?.(renderMarkdownWithLatex(val), val);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      triggerSave(val);
    }, 600);
  };

  // Capture CodeMirror EditorView instance
  const handleEditorCreate = (view) => {
    editorViewRef.current = view;
  };

  // Universal formatting ribbon action
  const applyFormatting = (type) => {
    const view = editorViewRef.current;
    if (!view) return;

    const state = view.state;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    let insertText = '';
    let cursorOffset = 0;

    switch (type) {
      case 'clear':
        if (selectedText) {
          insertText = selectedText
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/==([^=]+)==/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s+\[[ xX\-\/]\]\s+/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/^\s*>\s*\[!.*?\]\s*.*$/gm, '')
            .replace(/^\s*>\s*/gm, '')
            .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
            .replace(/\$([^$]+)\$/g, '$1');
          cursorOffset = insertText.length;
        } else {
          const currentLine = state.doc.lineAt(from);
          const cleanLine = currentLine.text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/==([^=]+)==/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/, '')
            .replace(/^\s*[-*+]\s+\[[ xX\-\/]\]\s+/, '')
            .replace(/^\s*[-*+]\s+/, '')
            .replace(/^\s*\d+\.\s+/, '')
            .replace(/^\s*>\s*\[!.*?\]\s*.*$/, '')
            .replace(/^\s*>\s*/, '')
            .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
            .replace(/\$([^$]+)\$/g, '$1');

          view.dispatch({
            changes: { from: currentLine.from, to: currentLine.to, insert: cleanLine },
            selection: { anchor: currentLine.from + cleanLine.length },
          });
          view.focus();
          return;
        }
        break;
      case 'bold':
        insertText = `**${selectedText || 'bold text'}**`;
        cursorOffset = selectedText ? insertText.length : 2;
        break;
      case 'italic':
        insertText = `*${selectedText || 'italic text'}*`;
        cursorOffset = selectedText ? insertText.length : 1;
        break;
      case 'strike':
        insertText = `~~${selectedText || 'strikethrough'}~~`;
        cursorOffset = selectedText ? insertText.length : 2;
        break;
      case 'highlight':
        insertText = `==${selectedText || 'highlight'}==`;
        cursorOffset = selectedText ? insertText.length : 2;
        break;
      case 'h1':
        insertText = `# ${selectedText || 'Heading 1'}`;
        cursorOffset = insertText.length;
        break;
      case 'h2':
        insertText = `## ${selectedText || 'Heading 2'}`;
        cursorOffset = insertText.length;
        break;
      case 'h3':
        insertText = `### ${selectedText || 'Heading 3'}`;
        cursorOffset = insertText.length;
        break;
      case 'task':
        insertText = selectedText ? `- [ ] ${selectedText}` : `- [ ] `;
        cursorOffset = insertText.length;
        break;
      case 'bullet':
        insertText = `- ${selectedText || 'List item'}`;
        cursorOffset = insertText.length;
        break;
      case 'number':
        insertText = `1. ${selectedText || 'Numbered item'}`;
        cursorOffset = insertText.length;
        break;
      case 'callout':
        insertText = `> [!info] ${selectedText || 'Important Note'}\n> This is a callout note.`;
        cursorOffset = insertText.length;
        break;
      case 'math':
        insertText = selectedText ? `$$${selectedText}$$` : `$$\n\\frac{a}{b} = c\n$$`;
        cursorOffset = selectedText ? insertText.length : 3;
        break;
      case 'quote':
        insertText = `> ${selectedText || 'Quote text'}`;
        cursorOffset = insertText.length;
        break;
      case 'code':
        insertText = `\`\`\`code\n${selectedText || ''}\n\`\`\``;
        cursorOffset = selectedText ? insertText.length : 8;
        break;
      default:
        break;
    }

    if (insertText) {
      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: { anchor: from + cursorOffset },
      });
      view.focus();
    }
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(rawMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([rawMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lecture-notes.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportToDocs = () => {
    console.log('[LectureMind] Exporting active Markdown/HTML to Google Docs:\n', renderedHtml);
    alert('Export to Google Docs triggered! (Rendered HTML logged to developer console)');
  };

  // Extensions for Hybrid Live Preview
  const livePreviewExtensions = useMemo(() => {
    return [
      markdownLang(),
      foldedLinesField,
      obsidianThemeExtension,
      obsidianLivePreviewPlugin,
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged && !tr.selection) return tr;
        const sel = tr.newSelection.main;
        if (sel.empty) {
          const line = tr.newDoc.lineAt(sel.head);
          const taskMatch = line.text.match(/^(\s*[-*+]\s+\[[ xX\-\/]\]\s*)/);
          if (taskMatch) {
            const prefixEnd = line.from + taskMatch[0].length;
            if (sel.head === prefixEnd && sel.assoc <= 0) {
              return [tr, { selection: EditorSelection.cursor(prefixEnd, 1) }];
            }
          }
        }
        return tr;
      }),
      EditorView.inputHandler.of((view, from, to, text) => {
        const line = view.state.doc.lineAt(from);
        const taskMatch = line.text.match(/^(\s*[-*+]\s+\[[ xX\-\/]\]\s*)/);
        if (taskMatch) {
          const prefixEnd = line.from + taskMatch[0].length;
          if (from >= prefixEnd) {
            view.dispatch({
              changes: { from, to, insert: text },
              selection: EditorSelection.cursor(from + text.length, 1),
              userEvent: 'input.type',
              scrollIntoView: true
            });
            return true;
          }
        }
        return false;
      }),
      isLight ? modernLightEditorTheme : modernDarkEditorTheme,
      syntaxHighlighting(isLight ? modernLightHighlightStyle : modernDarkHighlightStyle),
      Prec.highest(keymap.of([
        indentWithTab,
        {
          key: 'Enter',
          run: (view) => {
            const { state, dispatch } = view;
            const { from, to } = state.selection.main;
            if (from !== to) return false;

            const line = state.doc.lineAt(from);
            const text = line.text;
            const col = from - line.from;

            // Check if current line is a task list item: ^(\s*[-*+]\s+)\[[ xX\-\/]\]\s*(.*)$
            const taskMatch = text.match(/^(\s*[-*+]\s+)\[([ xX\-\/])\](\s*)(.*)$/);
            if (taskMatch) {
              const indentAndBullet = taskMatch[1]; // e.g. "- " or "    - "
              const content = taskMatch[4]; // text after "- [ ] "
              const prefixLen = taskMatch[1].length + 3 + taskMatch[3].length; // length of "- [ ] "

              // If line has empty task content (or only whitespace) and cursor is at end
              if (!content.trim() && col >= prefixLen) {
                // Clear empty checkbox line on Enter
                dispatch({
                  changes: { from: line.from, to: line.to, insert: '' },
                  selection: { anchor: line.from }
                });
                return true;
              }

              if (col >= prefixLen) {
                // Split line content at cursor
                const afterCursor = text.slice(col);
                const nextTaskPrefix = `${indentAndBullet}[ ] `;
                const insertText = '\n' + nextTaskPrefix + afterCursor;
                const newPos = from + 1 + nextTaskPrefix.length;
                dispatch({
                  changes: { from, to: line.to, insert: insertText },
                  selection: EditorSelection.cursor(newPos, 1),
                  scrollIntoView: true
                });
                return true;
              }
            }

            return false;
          }
        },
        {
          key: 'Mod-s',
          run: (view) => {
            const docStr = view.state.doc.toString();
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            triggerSave(docStr);
            return true;
          },
        }
      ])),
      EditorView.lineWrapping,
    ];
  }, [isLight, onSave]);

  return (
    <div className="flex flex-col h-full bg-surface border border-black/10 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
      {/* ── Top Ribbon Header: Live Preview Pill | Centered Ribbon | Actions ── */}
      <div className="relative flex items-center justify-between p-2 border-b border-black/10 dark:border-white/10 bg-surface/90 backdrop-blur-sm min-h-[46px] gap-2 overflow-x-auto">
        {/* Left: Hybrid Live Preview indicator + Auto-save badge */}
        <div className="flex items-center gap-2 shrink-0 z-10">
          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-primary/15 text-primary-light border border-black/10 dark:border-white/10 select-none shadow-xs">
            <Sparkle size={14} weight="fill" className="text-amber-400" />
            <span>Live Preview</span>
          </div>

          {/* Auto-save status */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 text-[11.5px] font-medium text-text-muted select-none">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-primary-light">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-light animate-pulse" />
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check size={12} weight="bold" />
                <span>Saved</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="flex items-center gap-1 text-amber-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Unsaved</span>
              </span>
            )}
          </div>
        </div>

        {/* Center: Formatting Ribbon (Precisely Centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface-alt/70 p-0.5 rounded-lg border border-black/10 dark:border-white/10 shadow-xs z-10">
          {/* Clear Notation Button */}
          <button
            onClick={() => applyFormatting('clear')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
            title="Clear Notation / Formatting"
          >
            <Eraser size={14} />
          </button>

          <div className="h-3.5 w-px bg-black/10 dark:bg-white/10 mx-0.5" />

          <button
            onClick={() => applyFormatting('bold')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Bold (**text**)"
          >
            <TextB size={14} weight="bold" />
          </button>

          <button
            onClick={() => applyFormatting('italic')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Italic (*text*)"
          >
            <TextItalic size={14} />
          </button>

          <button
            onClick={() => applyFormatting('strike')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Strikethrough (~~text~~)"
          >
            <TextStrikethrough size={14} />
          </button>

          <button
            onClick={() => applyFormatting('highlight')}
            className="p-1.5 rounded hover:bg-surface-overlay text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            title="Highlight (==text==)"
          >
            <Highlighter size={14} weight="duotone" />
          </button>

          <div className="h-3.5 w-px bg-black/10 dark:bg-white/10 mx-0.5" />

          <button
            onClick={() => applyFormatting('h1')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Heading 1 (# Heading)"
          >
            <TextHOne size={14} />
          </button>

          <button
            onClick={() => applyFormatting('h2')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Heading 2 (## Heading)"
          >
            <TextHTwo size={14} />
          </button>

          <button
            onClick={() => applyFormatting('h3')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Heading 3 (### Heading)"
          >
            <TextHThree size={14} />
          </button>

          <div className="h-3.5 w-px bg-black/10 dark:bg-white/10 mx-0.5" />

          <button
            onClick={() => applyFormatting('task')}
            className="p-1.5 rounded hover:bg-surface-overlay text-primary-light hover:text-primary transition-colors cursor-pointer"
            title="Interactive Task List (- [ ] task)"
          >
            <CheckSquare size={14} weight="duotone" />
          </button>

          <button
            onClick={() => applyFormatting('bullet')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Bullet List (- item)"
          >
            <ListBullets size={14} />
          </button>

          <button
            onClick={() => applyFormatting('number')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Numbered List (1. item)"
          >
            <ListNumbers size={14} />
          </button>

          <div className="h-3.5 w-px bg-black/10 dark:bg-white/10 mx-0.5" />

          <button
            onClick={() => applyFormatting('callout')}
            className="p-1.5 rounded hover:bg-surface-overlay text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            title="Callout (> [!info])"
          >
            <Info size={14} weight="duotone" />
          </button>

          <button
            onClick={() => applyFormatting('math')}
            className="p-1.5 rounded hover:bg-surface-overlay text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            title="Math Block ($$ ... $$)"
          >
            <FunctionIcon size={14} weight="bold" />
          </button>

          <button
            onClick={() => applyFormatting('quote')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Blockquote (> quote)"
          >
            <Quotes size={14} />
          </button>

          <button
            onClick={() => applyFormatting('code')}
            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors cursor-pointer"
            title="Code Block (```code)"
          >
            <CodeBlock size={14} />
          </button>
        </div>

        {/* Right Corner: Copy MD, Download, Export */}
        <div className="flex items-center gap-1.5 shrink-0 z-10 ml-auto">
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-text bg-surface border border-black/10 dark:border-white/10 hover:bg-surface-overlay rounded-lg transition-colors cursor-pointer"
            title="Copy Markdown Source"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-400" weight="bold" />
                <span className="text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} className="text-text-muted" />
                <span>Copy MD</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadMd}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-text bg-surface border border-black/10 dark:border-white/10 hover:bg-surface-overlay rounded-lg transition-colors cursor-pointer"
            title="Download .md file"
          >
            <DownloadSimple size={13} className="text-text-muted" />
            <span>Download</span>
          </button>

          <button
            onClick={handleExportToDocs}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all hover:shadow-blue-500/20 cursor-pointer"
            title="Export content to Google Docs"
          >
            <FileDoc size={14} weight="bold" />
            <span>Docs</span>
          </button>
        </div>
      </div>

      {/* ── Editor Viewport Body: Pure Interactive Hybrid Live Preview ── */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-auto bg-surface">
          <CodeMirror
            value={rawMarkdown}
            height="100%"
            theme={isLight ? 'light' : 'dark'}
            onCreateEditor={handleEditorCreate}
            extensions={livePreviewExtensions}
            onChange={handleCodeMirrorChange}
            basicSetup={{
              lineNumbers: false,
              highlightActiveLineGutter: false,
              highlightSpecialChars: true,
              history: true,
              foldGutter: false,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightActiveLine: false,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              searchKeymap: true,
            }}
            className="h-full font-sans text-[14.5px]"
          />
        </div>
      </div>
    </div>
  );
}
