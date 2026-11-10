/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Renders the reference sheets for drawing the duck as the chat pet: every state
// of Buddy, the pet the duck replaces, frame by frame on the duck's 24 x 24 grid, with
// the size, timing and use from docs/duck-pet-sprites.md. Needs Playwright's
// Chromium (`npx playwright install chromium`).
//
//   node build/ddo/duckPetReference.ts [output folder]   (default docs/duck-pet)

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(import.meta.dirname, '..', '..');
const spriteDir = path.join(root, 'src/vs/workbench/contrib/chat/browser/widget/media/chatPet');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'docs', 'duck-pet'));

interface State {
	readonly name: string;
	/** Buddy's sheet (or still picture), without `.spritesheet.png` / `.png` */
	readonly file: string;
	/** Width of one frame in Buddy's sheet, in app pixels */
	readonly frameWidth: number;
	readonly size: string;
	readonly frames: string;
	readonly timing: string;
	readonly plays: string;
	readonly when: string;
}

const firstVersion: State[] = [
	{ name: 'idle', file: 'buddy-idle-stable-96', frameWidth: 96, size: '24 × 24', frames: '2: standing, then 1-2 pixels lower', timing: '800, 1200', plays: 'loop', when: 'nothing happening' },
	{ name: 'rendering', file: 'buddy-rendering-stable-tracking-96', frameWidth: 96, size: '24 × 24', frames: '2: like idle, but busy', timing: '800, 1200', plays: 'loop', when: 'Copilot is working on an answer' },
	{ name: 'typing', file: 'buddy-typing-stable-96', frameWidth: 168, size: '42 × 24', frames: '2', timing: '320, 480', plays: 'loop', when: 'you are typing in the chat' },
	{ name: 'sleep', file: 'buddy-sleep-stable-96', frameWidth: 120, size: '30 × 24', frames: '8: eyes closed, "Z"s rising', timing: '300 each', plays: 'loop', when: '20 s without activity' },
	{ name: 'waking', file: 'buddy-waking-stable-96', frameWidth: 120, size: '30 × 24', frames: '8: from asleep to awake', timing: '160, 100, 80, 90, 90, 90, 100, 170', plays: 'once', when: 'woken by a click or a message' },
	{ name: 'worry', file: 'buddy-worry-stable-96', frameWidth: 96, size: '24 × 24', frames: '2', timing: '600, 600', plays: 'loop', when: 'something went wrong' },
];

const later: State[] = [
	{ name: 'clapping', file: 'buddy-clapping-stable-tracking-96', frameWidth: 96, size: '24 × 24', frames: '13', timing: '80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80', plays: 'loop, about 2 s', when: 'an action waits for your approval' },
	{ name: 'love', file: 'buddy-love-stable-96', frameWidth: 96, size: '24 × 24', frames: '6', timing: '200, 200, 380, 100, 80, 1980', plays: 'loop', when: 'you pet it (click)' },
	{ name: 'press-button', file: 'buddy-press-button-stable-96', frameWidth: 160, size: '40 × 24', frames: '6', timing: '500, 300, 350, 250, 450, 1000', plays: 'once', when: 'it confirms something' },
	{ name: 'painting', file: 'buddy-painting-stable-96', frameWidth: 192, size: '48 × 24', frames: '8', timing: '240, 160, 180, 220, 180, 160, 240, 320', plays: 'loop', when: 'an image is being made' },
	{ name: 'search', file: 'buddy-search-stable-96', frameWidth: 96, size: '24 × 24', frames: '4', timing: '500 each', plays: 'once', when: 'it searches' },
	{ name: 'speech', file: 'buddy-speech-stable-96', frameWidth: 96, size: '24 × 24', frames: '6', timing: '220, 220, 220, 100, 160, 180', plays: 'loop', when: 'it says something (with a bubble)' },
	{ name: 'speechless', file: 'buddy-speechless-stable-96', frameWidth: 96, size: '24 × 24', frames: '5', timing: '400, 120, 1000, 120, 1080', plays: 'loop', when: 'rare reaction' },
	{ name: 'yapping', file: 'buddy-yapping-stable-96', frameWidth: 96, size: '24 × 24', frames: '5', timing: 'still frames', plays: '—', when: 'rare reaction (beak open)' },
	{ name: 'cool', file: 'buddy-cool-stable-96', frameWidth: 96, size: '24 × 24', frames: '9', timing: '600, 120, 120, 120, 160, 80, 80, 80, 1640', plays: 'once', when: 'rare transformation (sunglasses)' },
	{ name: 'sing', file: 'buddy-sing-stable-124', frameWidth: 164, size: '41 × 31', frames: '4', timing: '180 each', plays: 'loop', when: 'rare reaction' },
	{ name: 'dizzy', file: 'buddy-dizzy-stable-128', frameWidth: 96, size: '24 × 32', frames: '8', timing: '120 each', plays: 'loop', when: 'turned around too fast' },
	{ name: 'jump', file: 'buddy-jump-stable-96', frameWidth: 96, size: '24 × 24', frames: '6', timing: '70, 80, 90, 160, 100, 100', plays: 'once', when: 'thrown upwards' },
	{ name: 'falling', file: 'buddy-falling-stable-96', frameWidth: 96, size: '24 × 24', frames: '6', timing: '120, 80, 80, 120, 80, 80', plays: 'loop', when: 'falling after a throw' },
	{ name: 'splat', file: 'buddy-splat-stable-96', frameWidth: 96, size: '24 × 24', frames: '4', timing: '120, 100, 100, 200', plays: 'once', when: 'lands on the floor' },
	{ name: 'wall-impact', file: 'buddy-wall-impact-stable-96', frameWidth: 96, size: '24 × 24', frames: '1', timing: '—', plays: 'still', when: 'hits the side' },
	{ name: 'respawn', file: 'buddy-respawn-stable-96', frameWidth: 96, size: '24 × 24', frames: '6', timing: '120, 100, 120, 240, 100, 120', plays: 'once, also backwards', when: 'disappears and comes back' },
];

const palette: [string, string, string][] = [
	['Yellow', '#FFD23F', 'head and body'],
	['Yellow shade', '#E0A800', 'shaded side, under the beak'],
	['Orange', '#FF8C1A', 'beak, feet'],
	['Orange shade', '#D96A00', 'beak opening, shaded feet'],
	['Navy', '#1B2A5C', 'headset band, hoodie'],
	['Navy shade', '#121C3D', 'hoodie folds, ear cups'],
	['Cyan', '#35C8F5', 'headset rings, the >_ on the hoodie'],
	['Dark', '#191A1B', 'eyes, outlines'],
	['White', '#FFFFFF', 'eye highlight, Z, stars, speech'],
	['Red', '#E6536F', 'hearts (love) only'],
];

function dataUrl(file: string): string | undefined {
	const p = path.join(spriteDir, file);
	return fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` : undefined;
}

function escape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(title: string, intro: string, states: State[]): string {
	const data = states.map(s => ({
		...s,
		sheet: dataUrl(`${s.file}.spritesheet.png`) ?? dataUrl(`${s.file}.png`),
		still: dataUrl(`${s.file}.png`),
	}));
	return `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; padding: 24px 28px; background: #fff; color: #1f2328; font: 14px/1.4 "Segoe UI", system-ui, sans-serif; width: max-content; min-width: 1100px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.intro { color: #57606a; margin: 0 0 16px; max-width: 1050px; }
.palette { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
.swatch { display: flex; align-items: center; gap: 6px; font-size: 12px; border: 1px solid #d0d7de; border-radius: 6px; padding: 4px 8px 4px 4px; }
.swatch i { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #0002; display: inline-block; }
section { border-top: 1px solid #d0d7de; padding: 12px 0 16px; }
h2 { font-size: 17px; margin: 0; }
h2 small { font-weight: normal; color: #57606a; font-size: 13px; margin-left: 8px; }
.meta { color: #57606a; font-size: 12.5px; margin: 2px 0 10px; }
.frames { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
figure { margin: 0; text-align: center; font-size: 12px; color: #57606a; }
figure.still figcaption { color: #0969da; font-weight: 600; }
canvas { display: block; border: 1px solid #d0d7de; image-rendering: pixelated; }
</style></head><body>
<h1>${escape(title)}</h1>
<p class="intro">${escape(intro)}</p>
<div class="palette">${palette.map(([n, hex, use]) => `<span class="swatch"><i style="background:${hex}"></i><b>${n}</b>&nbsp;${hex}&nbsp;· ${escape(use)}</span>`).join('')}</div>
<div id="states"></div>
<script>
const states = ${JSON.stringify(data)};
const CELL = 6; // screen pixels per pet pixel (a 4 x 4 block in the app)
function load(src) { return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; }); }
function grid(img, x0, w, h) {
	const c = document.createElement('canvas'); c.width = w; c.height = h;
	const ctx = c.getContext('2d'); ctx.drawImage(img, x0, 0, w, h, 0, 0, w, h);
	const d = ctx.getImageData(0, 0, w, h).data;
	const cols = Math.round(w / 4), rows = Math.round(h / 4), cells = [];
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
		const px = Math.min(w - 1, x * 4 + 2), py = Math.min(h - 1, y * 4 + 2), i = (py * w + px) * 4;
		cells.push(d[i + 3] < 128 ? null : 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')');
	}
	return { cols, rows, cells, key: cells.join('|') };
}
function draw(g) {
	const c = document.createElement('canvas'); c.width = g.cols * CELL + 1; c.height = g.rows * CELL + 1;
	const ctx = c.getContext('2d');
	for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
		ctx.fillStyle = (x + y) % 2 ? '#f6f8fa' : '#ffffff'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
		const v = g.cells[y * g.cols + x]; if (v) { ctx.fillStyle = v; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
	}
	ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
	for (let x = 0; x <= g.cols; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, g.rows * CELL); ctx.stroke(); }
	for (let y = 0; y <= g.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(g.cols * CELL, y * CELL + 0.5); ctx.stroke(); }
	ctx.strokeStyle = 'rgba(9,105,218,0.7)'; // the duck's 24 x 24 square
	ctx.strokeRect(0.5, (g.rows - 24) * CELL + 0.5, 24 * CELL, 24 * CELL);
	return c;
}
(async () => {
	const host = document.getElementById('states');
	for (const s of states) {
		const sec = document.createElement('section');
		sec.innerHTML = '<h2>' + s.name + '<small>' + s.when + '</small></h2><div class="meta">Duck: <b>' + s.size + '</b> · ' + s.frames + ' frame(s) · ' + s.timing + ' ms · ' + s.plays + '</div>';
		const row = document.createElement('div'); row.className = 'frames'; sec.appendChild(row); host.appendChild(sec);
		if (!s.sheet) { row.textContent = '(no sheet)'; continue; }
		const img = await load(s.sheet);
		const still = s.still ? grid(await load(s.still), 0, s.frameWidth, img.height) : undefined;
		const count = Math.max(1, Math.round(img.width / s.frameWidth));
		const groups = [];
		for (let f = 0; f < count; f++) {
			const g = grid(img, f * s.frameWidth, s.frameWidth, img.height);
			const last = groups[groups.length - 1];
			if (last && last.g.key === g.key) { last.n++; } else { groups.push({ g, n: 1, first: f + 1 }); }
		}
		for (const { g, n, first } of groups) {
			const fig = document.createElement('figure');
			const isStill = still && still.key === g.key;
			if (isStill) { fig.className = 'still'; }
			fig.appendChild(draw(g));
			const cap = document.createElement('figcaption');
			cap.textContent = (n > 1 ? 'frames ' + first + '-' + (first + n - 1) : 'frame ' + first) + (isStill ? ' · still picture' : '');
			fig.appendChild(cap); row.appendChild(fig);
		}
	}
	document.body.dataset.ready = '1';
})();
</script></body></html>`;
}

const intro = `Buddy, the pet the duck replaces, on the duck's 24 x 24 grid (each of Buddy's pixels covers 2 x 2): draw the duck on the same grid, frame by frame, in the same pose and timing, transparent background, no glow. The blue square is where the duck stands in wider or taller frames. Buddy's eyes are drawn by the app in most states; the duck's eyes are drawn in. The still picture is shown when animations are off. Details: docs/duck-pet-sprites.md.`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
	for (const [file, title, states] of [
		['reference-1-first-version.png', 'Duck pet reference: the first 6 states', firstVersion],
		['reference-2-later.png', 'Duck pet reference: the other 16 states', later],
	] as const) {
		const tab = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
		tab.on('pageerror', error => console.error(error));
		await tab.setContent(page(title, intro, states));
		await tab.waitForSelector('body[data-ready="1"]');
		await tab.screenshot({ path: path.join(outDir, file), fullPage: true });
		console.log(path.join(outDir, file));
	}
} finally {
	await browser.close();
}
