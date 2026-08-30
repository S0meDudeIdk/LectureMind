import { marked } from 'marked';
import katex from 'katex';

/**
 * Convert Obsidian / Standard Markdown note into rich, semantic HTML
 * specially formatted with inline styles for Google Docs importing and clipboard pasting.
 */
export function markdownToGoogleDocsHtml(markdown, title = 'Lecture Notes') {
  if (!markdown) return '';

  let processed = markdown;

  // 1. Process Frontmatter YAML (--- ... ---)
  processed = processed.replace(/^---\n([\s\S]+?)\n---/g, (_, yaml) => {
    const lines = yaml.split('\n').filter((l) => l.trim());
    let tableRows = '';
    lines.forEach((line) => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim();
        tableRows += `<tr><td style="padding: 4px 8px; font-weight: 600; color: #4b5563; border: 1px solid #e5e7eb; background: #f9fafb;">${key}</td><td style="padding: 4px 8px; color: #1f2937; border: 1px solid #e5e7eb;">${val}</td></tr>`;
      }
    });
    return `<div style="margin-bottom: 20px;"><table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11pt; border: 1px solid #e5e7eb;">${tableRows}</table></div>\n\n`;
  });

  // 2. Process Block Math ($$...$$)
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const trimmed = math.trim();
    try {
      const rendered = katex.renderToString(trimmed, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      return `<div style="text-align: center; margin: 16px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: 'Times New Roman', Times, serif; font-size: 13pt;">${rendered}</div>`;
    } catch {
      return `<div style="text-align: center; margin: 16px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-family: 'Courier New', Courier, monospace; font-size: 12pt;">${trimmed}</div>`;
    }
  });

  // 3. Process Inline Math ($...$)
  processed = processed.replace(/(?<!\\|\$)\$(?!\$)(.+?)(?<!\\|\$)\$(?!\$)/g, (_, math) => {
    const trimmed = math.trim();
    try {
      const rendered = katex.renderToString(trimmed, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      return `<span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 11.5pt;">${rendered}</span>`;
    } catch {
      return `<code style="font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px;">${trimmed}</code>`;
    }
  });

  // 4. Process Callouts (> [!type] Title)
  const calloutColors = {
    info: { border: '#3b82f6', bg: '#eff6ff', title: 'ℹ️ Note' },
    tip: { border: '#10b981', bg: '#ecfdf5', title: '💡 Tip' },
    warning: { border: '#f59e0b', bg: '#fffbeb', title: '⚠️ Warning' },
    danger: { border: '#ef4444', bg: '#fef2f2', title: '🚨 Important' },
    success: { border: '#10b981', bg: '#ecfdf5', title: '✅ Success' },
    quote: { border: '#6b7280', bg: '#f9fafb', title: '💬 Quote' },
  };

  processed = processed.replace(/^>\s*\[!([a-zA-Z0-9_-]+)\]\s*(.*?)$((?:\n>.*)*)/gm, (_, type, cTitle, body) => {
    const t = type.toLowerCase();
    const config = calloutColors[t] || { border: '#6366f1', bg: '#eef2ff', title: '📌 Callout' };
    const headerTitle = cTitle.trim() || config.title;
    const bodyText = body.replace(/^\s*>\s?/gm, '').trim();

    return `<div style="border-left: 4px solid ${config.border}; background-color: ${config.bg}; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; font-family: Arial, sans-serif;">
      <div style="font-weight: 700; color: #1e293b; margin-bottom: 6px; font-size: 11pt;">${headerTitle}</div>
      <div style="color: #334155; font-size: 10.5pt; line-height: 1.6;">${bodyText}</div>
    </div>\n\n`;
  });

  // 5. Process Checkboxes (- [ ] item, - [x] item)
  processed = processed.replace(/^(\s*)[-*+]\s+\[ \]\s+(.*)$/gm, '$1<p style="margin: 4px 0; font-family: Arial, sans-serif;">☐ $2</p>');
  processed = processed.replace(/^(\s*)[-*+]\s+\[[xX]\]\s+(.*)$/gm, '$1<p style="margin: 4px 0; font-family: Arial, sans-serif; color: #64748b;">☑ <span style="text-decoration: line-through;">$2</span></p>');

  // 6. Process Highlight (==text==)
  processed = processed.replace(/==([^=]+)==/g, '<mark style="background-color: #fef08a; padding: 1px 3px; border-radius: 2px;">$1</mark>');

  // 7. Process Wiki-links ([[Page|Alias]])
  processed = processed.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    return `<span style="color: #4f46e5; text-decoration: underline; font-weight: 500;">${alias || target}</span>`;
  });

  // 8. Convert remaining standard Markdown to HTML with Marked
  const parsedBody = marked.parse(processed);

  // 9. Return complete, self-contained Google Docs styled HTML document
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
  }
  h1 { font-size: 20pt; font-weight: 700; color: #111827; margin-top: 24px; margin-bottom: 12px; }
  h2 { font-size: 16pt; font-weight: 700; color: #1f2937; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 13pt; font-weight: 600; color: #374151; margin-top: 16px; margin-bottom: 8px; }
  h4 { font-size: 11.5pt; font-weight: 600; color: #4b5563; margin-top: 14px; margin-bottom: 6px; }
  p { margin-top: 0; margin-bottom: 10px; }
  ul, ol { margin-top: 0; margin-bottom: 12px; padding-left: 28px; }
  li { margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
  th { background-color: #f3f4f6; font-weight: 700; }
  code { font-family: 'Courier New', Courier, monospace; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 10pt; }
  pre { background-color: #1e293b; color: #f8fafc; padding: 14px; border-radius: 8px; overflow-x: auto; font-family: 'Courier New', Courier, monospace; font-size: 10pt; line-height: 1.5; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #94a3b8; margin: 14px 0; padding-left: 14px; color: #475569; font-style: italic; }
  hr { border: none; border-top: 1.5px solid #d1d5db; margin: 24px 0; }
</style>
</head>
<body>
${parsedBody}
</body>
</html>`;
}
