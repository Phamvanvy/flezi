'use strict';
// Approximate PPTX renderer for visual QA (no PowerPoint/LibreOffice on this machine).
// Parses slide XML in Edge (DOMParser also flags malformed XML), lays out shapes, text,
// pictures and tables with absolute positioning, and screenshots each slide.
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function loadDeck(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const order = [...pres.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => m[1]);
  const relTarget = Object.fromEntries([...presRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const slides = [];
  for (const rid of order) {
    const target = relTarget[rid].replace(/^\/?(ppt\/)?/, '');
    const slidePath = `ppt/${target}`;
    const xml = await zip.file(slidePath).async('string');
    const relsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
    const rels = zip.file(relsPath) ? await zip.file(relsPath).async('string') : '';
    const media = {};
    for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+\.(png|jpe?g))"/g)) {
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), m[2]));
      const buf = await zip.file(p).async('nodebuffer');
      media[m[1]] = `data:image/${m[3] === 'png' ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
    }
    slides.push({ xml, media });
  }
  return slides;
}

function renderInPage(slides) {
  const EMU = 9525; // per CSS px at 96 dpi
  const px = (v) => Number(v || 0) / EMU;
  const out = [];
  const errors = [];
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const first = (el, ns, name) => (el ? el.getElementsByTagNameNS(ns, name)[0] : undefined);
  const kids = (el, ns, name) => (el ? [...el.childNodes].filter((n) => n.localName === name && n.namespaceURI === ns) : []);
  const color = (el) => {
    const c = el && first(el, A, 'srgbClr');
    return c ? `#${c.getAttribute('val')}` : null;
  };

  function renderTxBody(tx, box) {
    const bodyPr = first(tx, A, 'bodyPr');
    const ins = (k, d) => (bodyPr && bodyPr.hasAttribute(k) ? px(bodyPr.getAttribute(k)) : d);
    const anchor = (bodyPr && bodyPr.getAttribute('anchor')) || 't';
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'absolute', inset: '0', padding: `${ins('tIns', 4.8)}px ${ins('rIns', 9.6)}px ${ins('bIns', 4.8)}px ${ins('lIns', 9.6)}px`,
      display: 'flex', flexDirection: 'column', justifyContent: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start',
    });
    const inner = document.createElement('div');
    for (const p of kids(tx, A, 'p')) {
      const pPr = first(p, A, 'pPr');
      const para = document.createElement('div');
      const algn = pPr && pPr.getAttribute('algn');
      para.style.textAlign = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left';
      para.style.lineHeight = '1.2';
      const aft = pPr && first(pPr, A, 'spcAft');
      const bef = pPr && first(pPr, A, 'spcBef');
      if (aft) para.style.marginBottom = `${Number(first(aft, A, 'spcPts').getAttribute('val')) / 100 * 1.333}px`;
      if (bef) para.style.marginTop = `${Number(first(bef, A, 'spcPts').getAttribute('val')) / 100 * 1.333}px`;
      const bu = pPr && first(pPr, A, 'buChar');
      if (bu) {
        para.style.paddingLeft = `${px(pPr.getAttribute('marL') || 342900)}px`;
        para.style.textIndent = `${px(pPr.getAttribute('indent') || -342900)}px`;
      }
      let firstRun = true;
      let maxSize = 18;
      for (const r of [...p.childNodes].filter((n) => n.localName === 'r' || n.localName === 'br')) {
        if (r.localName === 'br') {
          para.appendChild(document.createElement('br'));
          continue;
        }
        const rPr = first(r, A, 'rPr');
        const span = document.createElement('span');
        const sz = rPr && rPr.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : 18;
        maxSize = Math.max(maxSize, sz);
        const latin = rPr && first(rPr, A, 'latin');
        Object.assign(span.style, {
          fontSize: `${sz * 1.333}px`,
          fontWeight: rPr && rPr.getAttribute('b') === '1' ? '700' : '400',
          fontStyle: rPr && rPr.getAttribute('i') === '1' ? 'italic' : 'normal',
          color: color(rPr) || '#000',
          fontFamily: latin ? `"${latin.getAttribute('typeface')}", Calibri, sans-serif` : 'Calibri, sans-serif',
          whiteSpace: 'pre-wrap',
        });
        const t = first(r, A, 't');
        span.textContent = (bu && firstRun ? '•  ' : '') + (t ? t.textContent : '');
        firstRun = false;
        para.appendChild(span);
      }
      if (!para.childNodes.length) para.innerHTML = '&nbsp;';
      inner.appendChild(para);
    }
    wrap.appendChild(inner);
    box.appendChild(wrap);
    return { wrap, inner };
  }

  slides.forEach(({ xml, media }, idx) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) errors.push(`slide ${idx + 1}: XML parse error`);
    const slide = document.createElement('div');
    slide.className = 'slide';
    const bg = first(doc, P, 'bg');
    slide.style.background = color(bg) || '#fff';
    const tree = first(doc, P, 'spTree');
    for (const el of [...tree.childNodes]) {
      if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(el.localName)) continue;
      const off = first(el, A, 'off');
      const ext = first(el, A, 'ext');
      if (!off || !ext) continue;
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'absolute', left: `${px(off.getAttribute('x'))}px`, top: `${px(off.getAttribute('y'))}px`,
        width: `${px(ext.getAttribute('cx'))}px`, height: `${px(ext.getAttribute('cy'))}px`, boxSizing: 'border-box',
      });
      const spPr = first(el, P, 'spPr');
      if (el.localName === 'sp' && spPr) {
        const fill = [...spPr.childNodes].find((n) => n.localName === 'solidFill');
        if (fill) box.style.background = color(fill);
        const ln = first(spPr, A, 'ln');
        if (ln && first(ln, A, 'solidFill')) {
          const dash = first(ln, A, 'prstDash');
          box.style.border = `${Math.max(1, px(ln.getAttribute('w') || 9525))}px ${dash && dash.getAttribute('val') !== 'solid' ? 'dashed' : 'solid'} ${color(ln) || '#000'}`;
        }
        const geom = first(spPr, A, 'prstGeom');
        if (geom && geom.getAttribute('prst') === 'ellipse') box.style.borderRadius = '50%';
        if (geom && geom.getAttribute('prst') === 'rightArrow') {
          box.style.background = 'transparent';
          box.style.border = 'none';
          box.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none"><polygon points="0,3 6,3 6,0 10,5 6,10 6,7 0,7" fill="${color(fill) || '#000'}"/></svg>`;
        }
      }
      const tx = first(el, P, 'txBody');
      if (tx && el.localName === 'sp') {
        const { inner } = renderTxBody(tx, box);
        box.dataset.check = '1';
        box._inner = inner;
      }
      if (el.localName === 'pic') {
        const blip = first(el, A, 'blip');
        const img = document.createElement('img');
        img.src = media[blip.getAttributeNS(R, 'embed')];
        Object.assign(img.style, { width: '100%', height: '100%', display: 'block' });
        box.appendChild(img);
      }
      if (el.localName === 'graphicFrame') {
        const tbl = first(el, A, 'tbl');
        if (tbl) {
          const table = document.createElement('table');
          Object.assign(table.style, { borderCollapse: 'collapse', tableLayout: 'fixed', width: `${px(ext.getAttribute('cx'))}px` });
          const cols = [...tbl.getElementsByTagNameNS(A, 'gridCol')].map((g) => px(g.getAttribute('w')));
          const cg = document.createElement('colgroup');
          cols.forEach((w) => {
            const c = document.createElement('col');
            c.style.width = `${w}px`;
            cg.appendChild(c);
          });
          table.appendChild(cg);
          for (const tr of kids(tbl, A, 'tr')) {
            const row = document.createElement('tr');
            row.style.height = `${px(tr.getAttribute('h'))}px`;
            for (const tc of kids(tr, A, 'tc')) {
              const td = document.createElement('td');
              const tcPr = first(tc, A, 'tcPr');
              const fill = tcPr && [...tcPr.childNodes].find((n) => n.localName === 'solidFill');
              Object.assign(td.style, { position: 'relative', background: fill ? color(fill) : 'transparent', border: '1px solid #D9E2EC', verticalAlign: 'middle', padding: '0' });
              const holder = document.createElement('div');
              holder.style.position = 'relative';
              const txb = first(tc, A, 'txBody');
              if (txb) {
                const { wrap } = renderTxBody(txb, holder);
                wrap.style.position = 'static';
                wrap.style.padding = '4px 8px';
              }
              td.appendChild(holder);
              row.appendChild(td);
            }
            table.appendChild(row);
          }
          box.style.height = 'auto';
          box.appendChild(table);
          box.dataset.table = '1';
        }
      }
      slide.appendChild(box);
    }
    document.body.appendChild(slide);
    // Overflow checks: text taller than its box, anything past the slide edge.
    const sRect = slide.getBoundingClientRect();
    for (const b of slide.children) {
      const r = b.getBoundingClientRect();
      if (b._inner) {
        const needed = b._inner.scrollHeight;
        const avail = b.clientHeight - 6;
        if (needed > avail + 2) out.push(`slide ${idx + 1}: text overflows box by ${Math.round(needed - avail)}px: "${b.textContent.slice(0, 60)}"`);
      }
      if (r.bottom > sRect.bottom + 1 || r.right > sRect.right + 1) out.push(`slide ${idx + 1}: element past slide edge (${b.dataset.table ? 'table' : 'shape'}) bottom=${Math.round(r.bottom - sRect.top)}`);
    }
  });
  return { issues: out, errors };
}

(async () => {
  const [deck, outDir] = process.argv.slice(2);
  const slides = await loadDeck(deck);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    body{margin:0;background:#888}
    .slide{position:relative;width:1280px;height:720px;overflow:hidden;margin:0 0 20px}
  </style><body></body>`);
  const result = await page.evaluate(renderInPage, slides);
  fs.mkdirSync(outDir, { recursive: true });
  const handles = await page.$$('.slide');
  for (let i = 0; i < handles.length; i++) {
    await handles[i].screenshot({ path: path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
  }
  await browser.close();
  console.log(`${path.basename(deck)}: ${slides.length} slides rendered`);
  for (const e of result.errors) console.log('  ERROR', e);
  for (const i of result.issues) console.log('  ', i);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
