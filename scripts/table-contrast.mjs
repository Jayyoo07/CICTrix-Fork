/**
 * WCAG 2.1 contrast ratios for table text, before and after the shared
 * .abyan-table layer (docs/plans/2026-10-26-uniform-tables.md, Step A).
 *
 * Usage: node scripts/table-contrast.mjs
 */

const AA_BODY = 4.5;

const luminance = (hex) => {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export const contrast = (fg, bg) => {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const PAIRS = [
  // [label, foreground, background, when]
  ['Secondary text, text-slate-400 / #94a3b8 (emails, dates, positions)', '#94A3B8', '#FFFFFF', 'before'],
  ['Null-score dash, text-slate-300', '#CBD5E1', '#FFFFFF', 'before'],
  ['Secondary text, text-gray-400', '#9CA3AF', '#FFFFFF', 'before'],
  ['Header, text-slate-400 on bg-slate-50 (PM IPCR tables)', '#94A3B8', '#F8FAFC', 'before'],
  ['Header, text-slate-500 on bg-slate-50 (Succession, most tables)', '#64748B', '#F8FAFC', 'before'],
  ['Header, text-gray-500 on bg-gray-50 (L&D tables)', '#6B7280', '#F9FAFB', 'before'],
  ['Body, text-slate-500 on white', '#64748B', '#FFFFFF', 'before'],
  ['Muted text, --neutral-600 on white', '#515F69', '#FFFFFF', 'after'],
  ['Header, --neutral-600 on --bg-page', '#515F69', '#F1F5F9', 'after'],
  ['Muted text on row hover, --neutral-600 on --bg-row-hover', '#515F69', '#F8FAFF', 'after'],
  ['Muted text on top-scorer row, --neutral-600 on --color-primary-50', '#515F69', '#EEF0FF', 'after'],
  ['Body, --neutral-800 on white', '#28343D', '#FFFFFF', 'after'],
  ['Body on top-scorer row, --neutral-800 on --color-primary-50', '#28343D', '#EEF0FF', 'after'],
  ['Primary text, --color-primary-900 on top-scorer row', '#040E6B', '#EEF0FF', 'after'],
  ['Top scorer badge, white on --color-primary', '#FFFFFF', '#363EE8', 'after'],
  ['Error title, --error-700 on white', '#B42323', '#FFFFFF', 'after'],
];

const rows = PAIRS.map(([label, fg, bg, when]) => {
  const ratio = contrast(fg, bg);
  return { when, label, fg, bg, ratio: ratio.toFixed(2), aa: ratio >= AA_BODY ? 'pass' : 'FAIL' };
});

console.log('| When | Text | Foreground | Background | Ratio | AA body (4.5:1) |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.when} | ${r.label} | \`${r.fg}\` | \`${r.bg}\` | ${r.ratio}:1 | ${r.aa} |`);

const failingAfter = rows.filter((r) => r.when === 'after' && r.aa === 'FAIL');
if (failingAfter.length) {
  console.error(`\n${failingAfter.length} "after" pair(s) fail AA.`);
  process.exit(1);
}
