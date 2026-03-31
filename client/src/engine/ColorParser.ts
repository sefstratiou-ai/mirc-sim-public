import React from 'react';

interface ColorSpan {
  text: string;
  fg?: number;
  bg?: number;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  reverse?: boolean;
}

// mIRC control codes
const BOLD = '\x02';
const COLOR = '\x03';
const ITALIC = '\x1D';
const UNDERLINE = '\x1F';
const REVERSE = '\x16';
const RESET = '\x0F';

export function parseMircColors(text: string): ColorSpan[] {
  const spans: ColorSpan[] = [];
  let current: ColorSpan = { text: '' };
  let bold = false;
  let underline = false;
  let italic = false;
  let reverse = false;
  let fg: number | undefined;
  let bg: number | undefined;

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === BOLD) {
      if (current.text) spans.push({ ...current });
      bold = !bold;
      current = { text: '', fg, bg, bold: bold || undefined, underline: underline || undefined, italic: italic || undefined, reverse: reverse || undefined };
      i++;
    } else if (char === UNDERLINE) {
      if (current.text) spans.push({ ...current });
      underline = !underline;
      current = { text: '', fg, bg, bold: bold || undefined, underline: underline || undefined, italic: italic || undefined, reverse: reverse || undefined };
      i++;
    } else if (char === ITALIC) {
      if (current.text) spans.push({ ...current });
      italic = !italic;
      current = { text: '', fg, bg, bold: bold || undefined, underline: underline || undefined, italic: italic || undefined, reverse: reverse || undefined };
      i++;
    } else if (char === REVERSE) {
      if (current.text) spans.push({ ...current });
      reverse = !reverse;
      current = { text: '', fg, bg, bold: bold || undefined, underline: underline || undefined, italic: italic || undefined, reverse: reverse || undefined };
      i++;
    } else if (char === RESET) {
      if (current.text) spans.push({ ...current });
      bold = false;
      underline = false;
      italic = false;
      reverse = false;
      fg = undefined;
      bg = undefined;
      current = { text: '' };
      i++;
    } else if (char === COLOR) {
      if (current.text) spans.push({ ...current });
      i++;
      // Parse foreground color (1-2 digits)
      let fgStr = '';
      if (i < text.length && /\d/.test(text[i])) {
        fgStr += text[i]; i++;
        if (i < text.length && /\d/.test(text[i])) {
          fgStr += text[i]; i++;
        }
        fg = parseInt(fgStr, 10) % 16;

        // Check for background color
        if (i < text.length && text[i] === ',') {
          i++;
          let bgStr = '';
          if (i < text.length && /\d/.test(text[i])) {
            bgStr += text[i]; i++;
            if (i < text.length && /\d/.test(text[i])) {
              bgStr += text[i]; i++;
            }
            bg = parseInt(bgStr, 10) % 16;
          }
        }
      } else {
        // Color code without number = reset colors
        fg = undefined;
        bg = undefined;
      }
      current = { text: '', fg, bg, bold: bold || undefined, underline: underline || undefined, italic: italic || undefined, reverse: reverse || undefined };
    } else {
      current.text += char;
      i++;
    }
  }

  if (current.text) spans.push(current);
  return spans;
}

export function renderColoredText(text: string): React.ReactNode[] {
  const spans = parseMircColors(text);
  return spans.map((span, idx) => {
    const classes: string[] = [];
    const style: React.CSSProperties = {};

    if (span.fg !== undefined) classes.push(`mirc-color-${span.fg}`);
    if (span.bg !== undefined) classes.push(`mirc-bg-${span.bg}`);
    if (span.bold) classes.push('mirc-bold');
    if (span.underline) classes.push('mirc-underline');
    if (span.italic) classes.push('mirc-italic');

    if (span.reverse && span.fg !== undefined) {
      // Swap fg/bg visually
      style.filter = 'invert(1)';
    }

    if (classes.length === 0 && Object.keys(style).length === 0) {
      return React.createElement('span', { key: idx }, span.text);
    }

    return React.createElement('span', {
      key: idx,
      className: classes.join(' ') || undefined,
      style: Object.keys(style).length > 0 ? style : undefined,
    }, span.text);
  });
}

// Strip all mIRC color/formatting codes from text
export function stripColors(text: string): string {
  return text.replace(/[\x02\x1D\x1F\x16\x0F]|\x03(\d{1,2}(,\d{1,2})?)?/g, '');
}
