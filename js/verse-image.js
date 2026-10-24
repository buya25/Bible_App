// Turn a verse into a shareable square image (canvas → PNG).
import { escapeHtml, toast } from './util.js';

export const THEMES = [
  { id: 'dawn', label: 'Dawn', bg: ['#f6d365', '#fda085'], text: '#2b1d0e' },
  { id: 'sea', label: 'Sea', bg: ['#0f2027', '#2c5364'], text: '#f4f1ea' },
  { id: 'olive', label: 'Olive', bg: ['#3a4a2a', '#7d8f4e'], text: '#f7f3e3' },
  { id: 'parchment', label: 'Parchment', bg: ['#f4ecd8', '#e6d5b0'], text: '#3d3020' },
  { id: 'night', label: 'Night', bg: ['#141e30', '#243b55'], text: '#ffffff' },
];

/** Break text into lines that fit `maxWidth` using the context's current font. */
export function wrapLines(measure, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (measure(test) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw the verse on a canvas. Font size shrinks until the text fits. */
export function drawVerseImage(canvas, { text, reference, theme = THEMES[0], size = 1080 }) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, theme.bg[0]);
  gradient.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const margin = size * 0.11;
  const maxWidth = size - margin * 2;
  const quote = `“${text}”`;
  let fontSize = 76;
  let lines;
  do {
    ctx.font = `${fontSize}px Georgia, 'Times New Roman', serif`;
    lines = wrapLines((s) => ctx.measureText(s).width, quote, maxWidth);
    fontSize -= 2;
  } while (lines.length * fontSize * 1.4 > size * 0.62 && fontSize > 24);
  const lineHeight = (fontSize + 2) * 1.4;
  const blockHeight = lines.length * lineHeight;
  let y = (size - blockHeight) / 2 - size * 0.04 + lineHeight * 0.8;
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillText(line, size / 2, y);
    y += lineHeight;
  }
  ctx.font = `600 ${Math.round(size * 0.034)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(reference, size / 2, Math.min(y + size * 0.05, size - margin * 0.6));
  ctx.globalAlpha = 1;
}

/** Dialog with a live preview, theme choice, download and share. */
export function openImageDialog(dialog, { text, reference }) {
  let theme = THEMES[0];
  dialog.innerHTML = `
    <div class="dialog-head"><h2>Verse image</h2><button class="btn btn-small" data-close>Close</button></div>
    <div class="dialog-body">
      <canvas id="verse-canvas" class="verse-canvas" aria-label="${escapeHtml(reference)}"></canvas>
      <div class="segmented theme-choice" role="group" aria-label="Style">${THEMES.map((t) => `<button data-theme-id="${t.id}" aria-pressed="${t.id === theme.id}">${t.label}</button>`).join('')}</div>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" id="img-download">Download</button><button class="btn btn-primary" id="img-share">Share</button></div>
    </div>`;
  const canvas = document.getElementById('verse-canvas');
  const draw = () => drawVerseImage(canvas, { text, reference, theme });
  draw();
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();
    const t = e.target.closest('[data-theme-id]');
    if (t) {
      theme = THEMES.find((x) => x.id === t.dataset.themeId);
      dialog.querySelectorAll('[data-theme-id]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
      draw();
    }
  };
  dialog.oninput = dialog.onchange = null;
  const fileName = `${reference.replace(/[^\w]+/g, '-').replace(/-+$/, '')}.png`;
  const blob = () => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  document.getElementById('img-download').onclick = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await blob());
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  document.getElementById('img-share').onclick = async () => {
    const file = new File([await blob()], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: reference });
      } catch {
        // cancelled
      }
    } else {
      toast('Sharing images is not supported here. Use Download instead.');
    }
  };
  if (!dialog.open) dialog.showModal();
}
