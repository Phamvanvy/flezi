'use strict';
// Builds one Flow-2 report deck per option, styled after the provided template
// (navy title bar, light background, Trebuchet titles, Calibri body, running footer).
const fs = require('node:fs');
const path = require('node:path');
const pptxgen = require('pptxgenjs');
const { OPTIONS, SHARED_CORRECTIONS } = require('./options-data');

const ACCOUNT = 'vypv';
const PROGRAM = 'Flezi-E1-Dev';
const DATE_LONG = '01 Oct 2026';
const DATE_SHORT = '1 Oct';
const EVIDENCE = 'E:/repos/flezi/evidence';
const OUT_DIR = 'E:/repos/flezi/deliverables';

const W = 13.333;
const NAVY = '0B2545';
const TEAL = '028090';
const BG = 'F7FAFC';
const MUTED = '5B6B7C';
const LINE = 'D9E2EC';
const WHITE = 'FFFFFF';
const OK = '1A7F37';
const AMBER_BG = 'FFF4E5';
const AMBER_LINE = 'E8A33D';
const AMBER_TEXT = '9A4A00';
const BODY = 'Calibri';
const HEAD = 'Trebuchet MS';

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function buildDeck(n) {
  const o = OPTIONS[n];
  const evidence = (name) => path.join(EVIDENCE, `option-${n}`, `${name}.png`);
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = ACCOUNT;
  pres.company = PROGRAM;
  pres.title = `Flow-2 AI Execution Report - Option ${n}`;

  let page = 0;
  const footerText = `Flow-2 AI Execution Report  ·  ${ACCOUNT}  ·  ${PROGRAM}  ·  Option ${n}`;

  function frame(title, sub, notes) {
    page += 1;
    const s = pres.addSlide();
    s.background = { color: BG };
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.95, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText(title, { x: 0.5, y: 0, w: W - 1, h: 0.95, fontFace: HEAD, fontSize: 26, bold: true, color: WHITE, valign: 'middle', margin: 0, isTextBox: true });
    if (sub) {
      s.addText(sub, { x: 0.5, y: 1.08, w: W - 1, h: 0.36, fontFace: BODY, fontSize: 14, italic: true, color: TEAL, margin: 0, isTextBox: true });
    }
    s.addText(footerText, { x: 0.5, y: 7.08, w: 10.2, h: 0.28, fontFace: BODY, fontSize: 10, color: MUTED, margin: 0, isTextBox: true });
    s.addText(String(page), { x: 11.63, y: 7.08, w: 1.2, h: 0.28, fontFace: BODY, fontSize: 10, color: MUTED, align: 'right', margin: 0, isTextBox: true });
    if (notes) s.addNotes(notes);
    return s;
  }

  function card(s, x, y, w, h, fill = WHITE) {
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { color: fill },
      line: { color: LINE, width: 0.75 },
      shadow: { type: 'outer', color: '0B2545', opacity: 0.08, blur: 3, offset: 1, angle: 90 },
    });
  }

  function heading(s, text, x, y, w, color = NAVY, size = 16) {
    s.addText(text, { x, y, w, h: 0.38, fontFace: BODY, fontSize: size, bold: true, color, margin: 0, isTextBox: true });
  }

  function bullets(s, items, box, size = 13, gap = 6) {
    s.addText(
      items.map((t, i) => {
        if (Array.isArray(t)) {
          // [boldLabel, rest]
          return [
            { text: t[0], options: { bold: true, bullet: true, color: NAVY } },
            { text: ` ${t[1]}`, options: { color: NAVY, breakLine: i < items.length - 1, paraSpaceAfter: gap } },
          ];
        }
        return [{ text: t, options: { bullet: true, color: NAVY, breakLine: i < items.length - 1, paraSpaceAfter: gap } }];
      }).flat(),
      { ...box, fontFace: BODY, fontSize: size, valign: 'top', margin: 0, isTextBox: true },
    );
  }

  function todo(s, box, title, lines) {
    s.addShape(pres.shapes.RECTANGLE, { ...box, fill: { color: AMBER_BG }, line: { color: AMBER_LINE, width: 1.5, dashType: 'dash' } });
    const runs = [
      { text: 'ADD BEFORE SUBMITTING', options: { bold: true, fontSize: 11, color: AMBER_TEXT, charSpacing: 1, breakLine: true } },
      { text: title, options: { bold: true, fontSize: 15, color: NAVY, breakLine: true, paraSpaceBefore: 4, paraSpaceAfter: 6 } },
      ...lines.map((l, i) => ({ text: l, options: { bullet: true, fontSize: 12, color: NAVY, breakLine: i < lines.length - 1, paraSpaceAfter: 4 } })),
    ];
    s.addText(runs, { x: box.x + 0.2, y: box.y + 0.15, w: box.w - 0.4, h: box.h - 0.3, fontFace: BODY, valign: 'top', margin: 0, isTextBox: true });
  }

  function imageFit(s, file, box, caption) {
    const { w, h } = pngSize(file);
    const capH = caption ? 0.42 : 0;
    const avail = { w: box.w, h: box.h - capH };
    const r = Math.min(avail.w / w, avail.h / h);
    const iw = w * r;
    const ih = h * r;
    const x = box.x + (box.w - iw) / 2;
    const y = box.y;
    s.addShape(pres.shapes.RECTANGLE, { x: x - 0.03, y: y - 0.03, w: iw + 0.06, h: ih + 0.06, fill: { color: WHITE }, line: { color: LINE, width: 0.75 } });
    s.addImage({ path: file, x, y, w: iw, h: ih, altText: caption || path.basename(file) });
    if (caption) {
      s.addText(caption, { x: box.x, y: y + ih + 0.1, w: box.w, h: 0.36, fontFace: BODY, fontSize: 12, italic: true, color: MUTED, align: 'center', margin: 0, isTextBox: true });
    }
  }

  function table(s, header, rows, { x, y, w, colW, fontSize = 12, rowH = 0.38, highlight } = {}) {
    const head = header.map((t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: fontSize + 0.5 } }));
    const body = rows.map((r, i) =>
      r.map((cell) => {
        const isObj = typeof cell === 'object' && cell !== null;
        const text = isObj ? cell.text : cell;
        const extra = isObj ? cell.options || {} : {};
        const fill = highlight && highlight(r) ? 'E6F4F1' : i % 2 ? 'F1F5F9' : WHITE;
        return { text, options: { color: NAVY, fill: { color: fill }, fontSize, ...extra } };
      }),
    );
    s.addTable([head, ...body], {
      x, y, w, colW,
      fontFace: BODY,
      valign: 'middle',
      border: { type: 'solid', pt: 0.5, color: LINE },
      margin: [3, 6, 3, 6],
      rowH,
    });
  }

  // 1 — Title
  {
    page += 1;
    const s = pres.addSlide();
    s.background = { color: BG };
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: TEAL }, line: { color: TEAL } });
    s.addText('Flow-2 AI Execution Report', { x: 0.8, y: 1.05, w: 11.8, h: 0.9, fontFace: HEAD, fontSize: 40, bold: true, color: TEAL, margin: 0, isTextBox: true });
    s.addText(`Option ${n} — ${o.title}`, { x: 0.8, y: 2.0, w: 11.8, h: 0.7, fontFace: HEAD, fontSize: 28, bold: true, color: NAVY, margin: 0, isTextBox: true });
    s.addText(`${ACCOUNT}  ·  Developer (${PROGRAM})  ·  ${DATE_LONG}`, { x: 0.8, y: 2.78, w: 11.8, h: 0.45, fontFace: BODY, fontSize: 20, color: NAVY, margin: 0, isTextBox: true });
    s.addText('Direct the AI. Prove your judgement. Evidence everything.', { x: 0.8, y: 3.4, w: 11.8, h: 0.45, fontFace: BODY, fontSize: 20, bold: true, color: TEAL, margin: 0, isTextBox: true });
    const stats = [
      [`${o.tests}/${o.tests}`, 'automated tests passing'],
      [`${o.scenarios}/${o.scenarios}`, 'spec Given/When/Then scenarios covered'],
      ['0', 'npm dependencies (Node.js built-ins only)'],
    ];
    stats.forEach(([big, label], i) => {
      const x = 0.8 + i * 4.0;
      card(s, x, 4.5, 3.7, 1.7);
      s.addText(big, { x: x + 0.25, y: 4.6, w: 3.2, h: 0.75, fontFace: BODY, fontSize: 36, bold: true, color: TEAL, margin: 0, isTextBox: true });
      s.addText(label, { x: x + 0.25, y: 5.35, w: 3.2, h: 0.72, fontFace: BODY, fontSize: 14, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
    });
    s.addText(`Report deck  ·  Flow2_${ACCOUNT}_${PROGRAM}_Option_${n}.pptx`, { x: 0.8, y: 6.75, w: 11.8, h: 0.35, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0, isTextBox: true });
    s.addNotes(`Flow-2 report for Option ${n} (${o.title}). Account ${ACCOUNT}, program ${PROGRAM}.`);
  }

  // 2 — Executive summary
  {
    const s = frame('Executive summary', null, 'Summarize the project and final results.');
    bullets(
      s,
      [
        ['Task:', `Option ${n} — ${o.title}. ${o.objective}`],
        ['Outcome:', o.outcome],
        ['Tooling:', 'Claude Code agent in VS Code (model: Claude Opus 5.5) · Node.js 24 built-ins · no npm packages.'],
        ['Credits used:', 'Not yet recorded — add the actual figure from your usage page (see slide 20).'],
        ['Key learning:', 'The first draft is not the evidence. Running the tests and reviewing real screenshots exposed defects (lost 413 response, toast pile-up, layout bugs) that reading the code missed.'],
      ],
      { x: 0.5, y: 1.4, w: 7.6, h: 5.4 },
      16.5,
      16,
    );
    const stats = [
      [`${o.tests}/${o.tests}`, 'tests passing (npm test)'],
      [`${o.acCount}/${o.acCount}`, 'acceptance criteria traced to code + tests'],
      [`${SHARED_CORRECTIONS.length + o.corrections.length}`, 'AI outputs corrected or rejected (slide 10)'],
    ];
    stats.forEach(([big, label], i) => {
      const y = 1.35 + i * 1.8;
      card(s, 8.6, y, 4.2, 1.55);
      s.addText(big, { x: 8.85, y: y + 0.12, w: 3.8, h: 0.75, fontFace: BODY, fontSize: 36, bold: true, color: TEAL, margin: 0, isTextBox: true });
      s.addText(label, { x: 8.85, y: y + 0.9, w: 3.8, h: 0.45, fontFace: BODY, fontSize: 14, color: NAVY, margin: 0, isTextBox: true });
    });
  }

  // 3 — Requirement understanding
  {
    const s = frame('Requirement understanding', 'What the story asks for, and the decisions made where the spec left room', 'Show you understood the requirement before building.');
    card(s, 0.5, 1.6, 6.1, 1.25, 'EEF6F8');
    s.addText(o.story, { x: 0.7, y: 1.68, w: 5.7, h: 1.1, fontFace: BODY, fontSize: 14, italic: true, color: NAVY, valign: 'middle', margin: 0, isTextBox: true });
    heading(s, 'Acceptance criteria (from the spec)', 0.5, 3.02, 6.1);
    bullets(s, o.trace.map((t) => t[0]), { x: 0.5, y: 3.45, w: 6.1, h: 3.4 }, 12.5, 5);
    card(s, 6.95, 1.6, 5.9, 5.25);
    heading(s, 'Interpretations & decisions', 7.2, 1.75, 5.4, TEAL);
    bullets(s, o.interpretations, { x: 7.2, y: 2.2, w: 5.45, h: 4.55 }, 12.5, 8);
  }

  // 4 — Story point estimation
  {
    const s = frame('Story point estimation', 'Fibonacci scale: complexity, effort and risk', 'Explain how the estimate was reached.');
    table(
      s,
      ['Factor', 'Assessment'],
      o.estimation.map(([f, a]) => [{ text: f, options: { bold: true } }, f === 'Estimate' ? { text: a, options: { bold: true, fontSize: 18, color: TEAL } } : a]),
      { x: 0.5, y: 1.65, w: 12.33, colW: [3.0, 9.33], fontSize: 15, rowH: 0.62, highlight: (r) => r[0] === 'Estimate' },
    );
    s.addText('Estimate proposed with the AI from the spec and what was actually built; the final number is the learner\'s judgement — adjust it if your team calibrates differently.', {
      x: 0.5, y: 5.75, w: 12.33, h: 0.6, fontFace: BODY, fontSize: 13, italic: true, color: MUTED, margin: 0, isTextBox: true,
    });
  }

  // 5 — Tool, mode & model selection
  {
    const s = frame('AI tool, mode & model selection', 'Which mode did which job, and why', 'Justify each mode/model choice.');
    table(
      s,
      ['Activity', 'Mode', 'Tool / model', 'Why this choice'],
      [
        ['Read spec, guideline, template', 'Agent: file reading', 'Claude Code · Claude Opus 5.5', 'Reads the local PDFs/PPTX directly, no copy-paste'],
        ['Plan & design decisions', 'Agent planning (≈ Chat)', 'Claude Code · Claude Opus 5.5', 'Weighed 403 vs 404, cookie vs storage, snapshot pricing'],
        ['Implement API + UI', 'Agent coding (≈ Codex)', 'Claude Code · Claude Opus 5.5', 'Multi-file repo changes: the coding-agent use case'],
        ['Run tests & debug', 'Agent coding (≈ Codex)', 'node --test (local)', 'Real failures fixed in the loop, no model cost'],
        ['Capture evidence', 'Script', 'playwright-core + local Edge', 'Repeatable, real screenshots of the running app'],
        ['Build report deck', 'Agent (≈ Work)', 'pptxgenjs script', 'Deck generated from the real artifacts'],
      ],
      { x: 0.5, y: 1.6, w: 12.33, colW: [2.9, 2.35, 2.9, 4.18], fontSize: 12, rowH: 0.48 },
    );
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 5.45, w: 12.33, h: 1.35, fill: { color: AMBER_BG }, line: { color: AMBER_LINE, width: 1.25 } });
    s.addText(
      [
        { text: 'Licence & model-tier check  ', options: { bold: true, color: AMBER_TEXT } },
        { text: 'The guideline default is ChatGPT Enterprise + Codex (GPT Luna, step up to Terra; Sol+ is out of scope). Claude may be used only if your FSU/BU/client provides the licence. Confirm that licence, and that the model tier is in scope for Flow-2, before submitting.', options: { color: NAVY } },
      ],
      { x: 0.75, y: 5.55, w: 11.85, h: 1.15, fontFace: BODY, fontSize: 13, valign: 'middle', margin: 0, isTextBox: true },
    );
  }

  // 6 — Architecture & design
  {
    const s = frame('Architecture & key design decisions', 'Thin layers, rules enforced twice: in code and in the database', 'Walk through the structure of the solution.');
    const boxes = [
      ['Browser UI', 'Vanilla JS, no framework; same-origin fetch'],
      ['node:http router', 'JSON parsing, 16 KB limit, security headers, error shape'],
      ['Service layer', 'Validation + business rules (pure functions)'],
      ['SQLite (node:sqlite)', 'UNIQUE / CHECK constraints, indexes'],
    ];
    boxes.forEach(([t, d], i) => {
      const x = 0.5 + i * 3.17;
      card(s, x, 1.6, 2.75, 1.45, i === 3 ? 'EEF6F8' : WHITE);
      s.addText(t, { x: x + 0.15, y: 1.7, w: 2.45, h: 0.45, fontFace: BODY, fontSize: 15, bold: true, color: TEAL, margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.15, y: 2.15, w: 2.45, h: 0.8, fontFace: BODY, fontSize: 12, color: NAVY, margin: 0, valign: 'top', isTextBox: true });
      if (i < boxes.length - 1) {
        s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.8, y: 2.15, w: 0.32, h: 0.34, fill: { color: TEAL }, line: { color: TEAL } });
      }
    });
    table(
      s,
      ['Decision', 'Why'],
      [...o.decisions, ['Zero npm dependencies', 'Nothing to install; no supply-chain risk; runs on any Node ≥ 22.5']],
      { x: 0.5, y: 3.4, w: 12.33, colW: [4.2, 8.13], fontSize: 13, rowH: 0.5 },
    );
  }

  // 7 — Prompting
  {
    const s = frame('Prompting & engineering', 'The prompt as actually sent, an honest critique, and the structure to reuse', 'Paste one representative prompt verbatim and explain its structure.');
    card(s, 0.5, 1.6, 5.6, 2.35, '1E1E1E');
    s.addText('Prompt as sent (verbatim, with the two attached screenshots)', { x: 0.7, y: 1.68, w: 5.2, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: '9CDCFE', margin: 0, isTextBox: true });
    s.addText('"do all this tassk and zip for me\nmy name is vypv"\n\nFollow-up mid-run:\n"sorry not the zip file\npptx file"', {
      x: 0.7, y: 2.05, w: 5.2, h: 1.8, fontFace: 'Consolas', fontSize: 13, color: 'E5E5E5', valign: 'top', margin: 0, isTextBox: true,
    });
    card(s, 0.5, 4.15, 5.6, 2.7);
    heading(s, 'Honest critique', 0.7, 4.25, 5.2, TEAL, 15);
    bullets(
      s,
      [
        'Under-specified: no role, constraints or output format.',
        'The agent compensated by reading the guideline (13 pages), the template and the spec PDF before writing code.',
        'A stated output format would have avoided the zip → pptx correction.',
      ],
      { x: 0.7, y: 4.68, w: 5.2, h: 2.1 },
      12.5,
      6,
    );
    card(s, 6.4, 1.6, 6.43, 5.25);
    heading(s, 'Structured prompt to reuse (Role · Context · Task · Constraints · Output)', 6.6, 1.7, 6.05, TEAL, 14);
    const parts = [
      ['ROLE', 'Senior full-stack Node.js developer.'],
      ['CONTEXT', `Flow-2 Option ${n} spec (${o.title}) PDF, report template PPTX, guideline v1.3.`],
      ['TASK', 'Implement back end + front end + one unit test per Given/When/Then row; README with run steps and the estimation table.'],
      ['CONSTRAINTS', 'Public sample data only; no new dependencies; parameterised SQL; no writes outside ./options; ask before deciding ambiguous rules.'],
      ['OUTPUT', 'Files changed, test results, open questions; then one PPTX report deck.'],
    ];
    s.addText(
      parts.flatMap(([k, v], i) => [
        { text: `${k}  `, options: { bold: true, color: TEAL } },
        { text: v, options: { color: NAVY, breakLine: i < parts.length - 1, paraSpaceAfter: 9 } },
      ]),
      { x: 6.6, y: 2.2, w: 6.05, h: 3.0, fontFace: BODY, fontSize: 13, valign: 'top', margin: 0, isTextBox: true },
    );
    s.addShape(pres.shapes.LINE, { x: 6.6, y: 5.3, w: 6.05, h: 0, line: { color: LINE, width: 0.75 } });
    s.addText(
      [
        { text: 'Why this structure  ', options: { bold: true, color: TEAL } },
        { text: 'Role sets the quality bar. Context points at files instead of pasting them. Constraints encode the guideline\'s red flags (data, dependencies, unapproved writes). Output makes the result easy to review.', options: { color: NAVY } },
      ],
      { x: 6.6, y: 5.42, w: 6.05, h: 1.3, fontFace: BODY, fontSize: 12.5, valign: 'top', margin: 0, isTextBox: true },
    );
  }

  // 8 — AI session evidence
  {
    const s = frame('AI chat session', `Agent — Option ${n} API + UI + tests + deck — ${DATE_SHORT}`, 'Map each chat session to a slide; do not tidy it.');
    heading(s, 'What happened in the session (in order)', 0.5, 1.6, 6.4);
    const steps = [
      'Read the Flow-2 guideline, the template deck and the Option spec PDF.',
      'Chose a zero-dependency Node 24 stack (node:http, node:sqlite, node:crypto, node:test).',
      'Built the shared HTTP and token modules, then this option\'s service, API and UI.',
      'Ran npm test, fixed real failures, re-ran until green.',
      'Drove the app in headless Edge, reviewed every screenshot, fixed UI defects, re-captured.',
      'Wrote the README; learner redirected the output from zip to PPTX; deck generated.',
    ];
    steps.forEach((t, i) => {
      const y = 2.08 + i * 0.78;
      s.addShape(pres.shapes.OVAL, { x: 0.55, y, w: 0.46, h: 0.46, fill: { color: TEAL }, line: { color: TEAL } });
      s.addText(String(i + 1), { x: 0.55, y, w: 0.46, h: 0.46, fontFace: BODY, fontSize: 14, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(t, { x: 1.2, y: y - 0.06, w: 5.7, h: 0.6, fontFace: BODY, fontSize: 13, color: NAVY, valign: 'middle', margin: 0, isTextBox: true });
    });
    todo(s, { x: 7.25, y: 1.6, w: 5.58, h: 5.25 }, 'Screenshot or export of this Claude Code session', [
      'Export the VS Code Claude Code conversation (or screenshot its key turns) and place it on this slide; add more slides if needed.',
      `Label it: "Agent — Option ${n} API + UI + tests + deck — ${DATE_SHORT}".`,
      'Do not tidy it: the weak first prompt and the zip → pptx correction are the evidence.',
      'Redact anything confidential first.',
    ]);
  }

  // 9 — HITL review gates
  {
    const s = frame('Human-in-the-loop: review gates', 'Where a human (or a hard check) had to say yes before work moved on', 'Make your sign-off visible.');
    const gates = [
      ['No external writes', 'Agent worked only in local folders: no git push, PR, Jira or upload. Nothing left the machine without the learner.'],
      ['Tests gate the evidence', `Screenshots captured only after npm test was green (${o.tests}/${o.tests} for this option, 74/74 across all five).`],
      ['Screenshot review', 'Every captured screenshot was inspected; UI defects found there were fixed and re-captured (slide 10).'],
      ['Learner sign-off', 'Learner reviews the code, runs the app and approves this deck before uploading it to the PowerApps form.'],
    ];
    gates.forEach(([t, d], i) => {
      const y = 1.6 + i * 1.32;
      card(s, 0.5, y, 6.9, 1.15);
      s.addShape(pres.shapes.OVAL, { x: 0.68, y: y + 0.3, w: 0.55, h: 0.55, fill: { color: i === 3 ? AMBER_LINE : TEAL }, line: { color: i === 3 ? AMBER_LINE : TEAL } });
      s.addText(String(i + 1), { x: 0.68, y: y + 0.3, w: 0.55, h: 0.55, fontFace: BODY, fontSize: 15, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(t, { x: 1.45, y: y + 0.1, w: 5.8, h: 0.35, fontFace: BODY, fontSize: 15, bold: true, color: NAVY, margin: 0, isTextBox: true });
      s.addText(d, { x: 1.45, y: y + 0.45, w: 5.8, h: 0.62, fontFace: BODY, fontSize: 12, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
    });
    todo(s, { x: 7.7, y: 1.6, w: 5.13, h: 5.15 }, 'Your approval evidence', [
      'Add a screenshot showing you reviewing or approving the agent\'s work, e.g. a permission prompt, a diff review, or you running npm test.',
      'One line on what you checked and what you would have rejected.',
    ]);
  }

  // 10 — Corrections & rejections
  {
    const s = frame('Corrections & rejections of AI output', 'Each row really happened in this session; "found by" says who or what caught it', 'Show 3+ places where AI output was corrected or rejected.');
    const rows = [...o.corrections, ...SHARED_CORRECTIONS].map((c) => [c.what, c.problem, c.found, c.fix]);
    table(s, ['AI output', 'Problem', 'Found by', 'Fix / decision'], rows, {
      x: 0.5, y: 1.6, w: 12.33, colW: [3.1, 3.2, 2.83, 3.2], fontSize: 11, rowH: 0.62,
    });
    todo(s, { x: 0.5, y: 5.85, w: 12.33, h: 1.0 }, 'Add at least one correction from your own review', []);
  }

  // 11 — Output evidence: code
  {
    const s = frame('Output evidence: source code', null, 'Walk through the real artifact.');
    imageFit(s, evidence('code'), { x: 0.5, y: 1.3, w: 8.6, h: 5.6 });
    card(s, 9.45, 1.3, 3.38, 5.55);
    heading(s, 'What this shows', 9.65, 1.45, 3.0, TEAL, 15);
    s.addText(o.codeCaption, { x: 9.65, y: 1.9, w: 3.0, h: 2.3, fontFace: BODY, fontSize: 13, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
    heading(s, 'Where the code lives', 9.65, 4.3, 3.0, TEAL, 15);
    s.addText(`options/${o.dir}/\n  src/  (server, services, db)\n  public/  (UI)\n  test/  (node:test)\n  README.md`, {
      x: 9.65, y: 4.75, w: 3.0, h: 1.9, fontFace: 'Consolas', fontSize: 11, color: NAVY, valign: 'top', margin: 0, isTextBox: true,
    });
  }

  // 12-15 — Output evidence: UI, one legible screenshot per slide
  o.ui.forEach(([file, caption], k) => {
    const s = frame(`Output evidence: app UI (${k + 1}/${o.ui.length})`, `Real screenshot of the running app (headless Edge, ${DATE_LONG})`, 'Walk through the real artifact.');
    imageFit(s, evidence(file), { x: 0.5, y: 1.62, w: 9.2, h: 5.25 });
    card(s, 9.95, 1.62, 2.88, 5.2);
    heading(s, 'What this shows', 10.12, 1.78, 2.55, TEAL, 15);
    s.addText(caption, { x: 10.12, y: 2.25, w: 2.55, h: 4.4, fontFace: BODY, fontSize: 14, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
  });

  // 14 — Test evidence
  {
    const s = frame('Test evidence: spec scenarios', `npm test → ${o.tests} passed, 0 failed (captured run output)`, 'Show the tests actually ran and passed.');
    imageFit(s, evidence('tests'), { x: 0.5, y: 1.6, w: 6.6, h: 5.3 });
    table(
      s,
      ['#', 'Given / When / Then (spec table)', 'Result'],
      o.scenarioRows.map(([num, txt, res]) => [num, txt, { text: res, options: { bold: true, color: OK } }]),
      { x: 7.4, y: 1.6, w: 5.43, colW: [0.45, 4.03, 0.95], fontSize: 12, rowH: 0.5 },
    );
    s.addText(`Plus ${o.tests - o.scenarios} extra tests for acceptance criteria and edge cases (slides 17–18). Each run uses a fresh in-memory database, so results are repeatable.`, {
      x: 7.4, y: 5.6, w: 5.43, h: 1.1, fontFace: BODY, fontSize: 12, italic: true, color: MUTED, valign: 'top', margin: 0, isTextBox: true,
    });
  }

  // 15 — Traceability
  {
    const s = frame('Acceptance criteria → code → tests', 'Every criterion is implemented and verified', 'Prove each requirement is covered.');
    table(s, ['Acceptance criterion', 'Implemented in', 'Verified by'], o.trace, {
      x: 0.5, y: 1.6, w: 12.33, colW: [4.9, 3.9, 3.53], fontSize: 12.5, rowH: 0.62,
    });
  }

  // 16 — Edge cases
  {
    const s = frame('Edge cases, security & non-functional', 'The spec\'s edge-case list, handled and checked', 'Show negative paths were handled.');
    table(s, ['Edge case', 'Handling', 'Verified by'], o.edges, {
      x: 0.5, y: 1.6, w: 12.33, colW: [3.3, 6.0, 3.03], fontSize: 12.5, rowH: 0.62,
    });
  }

  // 17 — MCP
  {
    const s = frame('MCP selection & justification', 'Which server fits this task, and what was actually used', 'Selecting the right server and saying why is required; using it is a bonus.');
    table(
      s,
      ['MCP server', 'What it would give the agent', 'Fit for this task', 'Decision'],
      [
        ['Playwright', 'A real browser the agent can drive', 'Verify UI flows, capture evidence', { text: 'Selected', options: { bold: true, color: OK } }],
        ['Context7', 'Up-to-date library docs', 'node:sqlite is a newer API; avoid stale examples', { text: 'Selected', options: { bold: true, color: OK } }],
        ['GitHub', 'Repos, PRs, CI status', 'Useful once code is pushed for review', 'Later'],
        ['Filesystem', 'Read/write a local folder', 'Agent already has local file access', 'Not needed'],
        ['Database', 'Queries against a test DB', 'Embedded SQLite, inspected by tests', 'Not needed'],
      ],
      { x: 0.5, y: 1.6, w: 12.33, colW: [2.1, 3.9, 4.6, 1.73], fontSize: 12.5, rowH: 0.5 },
    );
    card(s, 0.5, 4.95, 12.33, 1.85, 'EEF6F8');
    s.addText(
      [
        { text: 'Actual use in this run  ', options: { bold: true, color: TEAL } },
        { text: 'No MCP server was connected. The same browser automation was done with a playwright-core script driving the local Edge browser (the UI screenshots in this deck). So the MCP usage bonus (+5) is ', options: { color: NAVY } },
        { text: 'not claimed', options: { bold: true, color: NAVY } },
        { text: '. Next step: connect the Playwright MCP so the agent can verify flows itself, with tool-call evidence.', options: { color: NAVY } },
      ],
      { x: 0.75, y: 5.05, w: 11.85, h: 1.65, fontFace: BODY, fontSize: 13.5, valign: 'middle', margin: 0, isTextBox: true },
    );
  }

  // 18 — Credits
  {
    const s = frame('Credit / token consumption', 'Report actual consumption and the spending decisions behind it', 'Report actual consumption and meaningful spending decisions.');
    todo(s, { x: 0.5, y: 1.6, w: 6.4, h: 5.2 }, 'Usage screenshot + credits used (actual / 250)', [
      'Screenshot your usage page after the task (redact anything private).',
      'Copy the number to slide 2 ("Credits used").',
      'If Claude usage is billed separately from the 250 ChatGPT credits, say so here.',
    ]);
    card(s, 7.2, 1.6, 5.63, 5.2);
    heading(s, 'Spending decisions in this run', 7.45, 1.75, 5.2, TEAL, 15);
    bullets(
      s,
      [
        'One agent session built all five options; no re-runs "to see if it\'s better".',
        'Shared modules (HTTP, token, UI helpers) were written once and reused, cutting repeated generation.',
        'Tests and screenshots ran locally: verification cost no model tokens.',
        'Zero-dependency stack: no install or dependency-debugging cycles.',
        'Deck generated by a script from real artifacts, not drafted slide by slide in chat.',
      ],
      { x: 7.45, y: 2.25, w: 5.2, h: 4.4 },
      13,
      9,
    );
  }

  // 19 — Reusable workflow
  {
    const s = frame('Reusable workflow', 'A governed loop that works for any spec-driven story', 'Turn the work into a repeatable governed workflow.');
    const steps = [
      ['Trigger / input', 'Story spec with Given/When/Then, guideline, report template.'],
      ['Prompt & context', 'Role · Context · Task · Constraints · Output; point the agent at the spec files.'],
      ['AI action', 'Agent coding mode: service → API → UI → tests, in small verified increments.'],
      ['Human review gate', 'Read the diff, run npm test, review screenshots; reject or adjust. No external writes without preview.'],
      ['Verify & hand off', 'Scripted evidence capture, README, report deck generated from real artifacts.'],
    ];
    steps.forEach(([t, d], i) => {
      const x = 0.5 + i * 2.5;
      card(s, x, 1.7, 2.3, 3.6, i === 3 ? AMBER_BG : WHITE);
      s.addShape(pres.shapes.OVAL, { x: x + 0.15, y: 1.85, w: 0.55, h: 0.55, fill: { color: i === 3 ? AMBER_LINE : TEAL }, line: { color: i === 3 ? AMBER_LINE : TEAL } });
      s.addText(String(i + 1), { x: x + 0.15, y: 1.85, w: 0.55, h: 0.55, fontFace: BODY, fontSize: 15, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(t, { x: x + 0.15, y: 2.55, w: 2.0, h: 0.6, fontFace: BODY, fontSize: 15, bold: true, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
      s.addText(d, { x: x + 0.15, y: 3.2, w: 2.0, h: 2.0, fontFace: BODY, fontSize: 12, color: NAVY, valign: 'top', margin: 0, isTextBox: true });
    });
    card(s, 0.5, 5.55, 12.33, 1.25, 'EEF6F8');
    s.addText(
      [
        { text: 'Reuse conditions  ', options: { bold: true, color: TEAL } },
        { text: 'Any story with explicit acceptance criteria and test scenarios. The stack can change; the gates cannot: tests before evidence, human review before anything leaves the machine, and public or sample data only.', options: { color: NAVY } },
      ],
      { x: 0.75, y: 5.6, w: 11.85, h: 1.15, fontFace: BODY, fontSize: 13.5, valign: 'middle', margin: 0, isTextBox: true },
    );
  }

  // 20 — Final self-check
  {
    const s = frame('Final self-check', 'Status before upload: green items are done, amber items need the learner', 'A pass requires 80+ and no Level 1 criterion.');
    const done = { text: 'Done', options: { bold: true, color: OK } };
    const todoCell = { text: 'Learner to do', options: { bold: true, color: AMBER_TEXT } };
    table(
      s,
      ['Check', 'Status', 'Evidence'],
      [
        ['Every option requirement is satisfied and evidenced', done, 'Slides 11–18, README'],
        ['3+ visible examples of AI output corrected or rejected', done, 'Slide 10 (+ add your own)'],
        ['Mode, model tier and MCP choice are justified', done, 'Slides 5, 19 (confirm licence)'],
        ['Every substantive chat session is labelled and submitted', todoCell, 'Slide 8: add session export'],
        ['Screenshots readable; sensitive data redacted', done, 'Sample data only; no client data'],
        ['Credit use reported; no out-of-scope model used', todoCell, 'Slide 20 + licence check, slide 5'],
      ],
      { x: 0.5, y: 1.6, w: 12.33, colW: [6.4, 2.0, 3.93], fontSize: 13.5, rowH: 0.62 },
    );
    s.addText('Pass rule: 80+ overall and no criterion at Level 1.', {
      x: 0.5, y: 6.2, w: 12.33, h: 0.45, fontFace: BODY, fontSize: 14, bold: true, color: TEAL, margin: 0, isTextBox: true,
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `Flow2_${ACCOUNT}_${PROGRAM}_Option_${n}.pptx`);
  return pres.writeFile({ fileName: file }).then(() => ({ file, slides: page }));
}

(async () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const { file, slides } = await buildDeck(n);
    console.log(`${path.basename(file)}: ${slides} slides`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
