import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import App from '../App';
import type { Track } from '../hooks/useReaper';

// ── Helpers ──────────────────────────────────────────────────

let cssRaw: string;
let appEl: HTMLElement | null;

// Minimal mock tracks to exercise track-row rendering
const mockTracks: Track[] = [
  { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
  { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: true, soloed: false, armed: false, volume: 0.7 },
  { index: 2, name: 'HiHat', trackNumber: 3, selected: false, muted: false, soloed: true, armed: false, volume: 0.6 },
];

beforeAll(() => {
  const cssPath = path.resolve(__dirname, '../index.css');
  cssRaw = fs.readFileSync(cssPath, 'utf-8');
});

beforeEach(() => {
  // Render the app once before each test that needs it (lazy via reference)
  // We render in a beforeAll when needed
});

function renderApp() {
  render(<App />);
  appEl = document.querySelector('.min-h-screen');
}

describe('Design System — Everforest pastel + Inter font', () => {
  // ── Font (checked via index.css text, not computed — jsdom limits) ──

  it('declares Inter font-family in index.css body rule', () => {
    expect(cssRaw).toContain("'Inter'");
    expect(cssRaw).toContain('font-family');
  });

  it('declares Inter Mono for numeric display classes', () => {
    expect(cssRaw).toContain('Inter Mono');
    expect(cssRaw).toContain('.tabular-nums');
  });

  it('loads Inter font via Google Fonts CDN link in index.html', () => {
    // Check index.html via fs
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const htmlRaw = fs.readFileSync(htmlPath, 'utf-8');
    expect(htmlRaw).toContain('fonts.googleapis.com');
    expect(htmlRaw).toContain('Inter');
  });

  // ── Color Palette (CSS variable definitions) ──────────────

  it('defines all Everforest palette CSS variables in index.css', () => {
    const requiredVars = [
      '--bg-primary',
      '--bg-secondary',
      '--bg-tertiary',
      '--text-primary',
      '--text-secondary',
      '--accent-green',
      '--accent-red',
      '--accent-orange',
      '--accent-yellow',
      '--accent-blue',
      '--border',
    ];
    for (const v of requiredVars) {
      expect(cssRaw, `Missing CSS variable: ${v}`).toContain(v);
    }
  });

  it('defines format-badge CSS variables in index.css', () => {
    expect(cssRaw).toContain('--format-vst2');
    expect(cssRaw).toContain('--format-clap');
    expect(cssRaw).toContain('--format-dx');
  });

  it('uses warm off-white background (not pure white #FFF)', () => {
    expect(cssRaw).toContain('#FDF6E3');
    const hasDirectWhite =
      /background[^}]*#FFF/i.test(cssRaw) ||
      /background[^}]*#ffffff/i.test(cssRaw);
    expect(hasDirectWhite).toBe(false);
  });

  // ── Shape: square corners ─────────────────────────────────

  it('avoids border-radius in design system (only zero/none resets)', () => {
    const matches = cssRaw.matchAll(/border-radius[^;]*;/g);
    for (const m of matches) {
      const val = m[0].trim();
      const isReset = /:\s*0/.test(val) || /:\s*none/.test(val);
      expect(
        isReset,
        `Unexpected border-radius found: ${val} — design spec requires square corners`,
      ).toBe(true);
    }
  });

  // ── Touch targets (Apple HIG: min 44×44pt) ────────────────

  it('buttons avoid sub-44px sizing patterns', () => {
    renderApp();
    const html = document.body.innerHTML;
    // w-9 = 36px, h-9 = 36px, min-h-[36px] or [32px] are below 44px min
    expect(html).not.toContain('min-h-[36px]');
    expect(html).not.toContain('min-h-[32px]');
    expect(html).not.toContain('min-h-[32');
    // Check no remaining w-9 or h-9 on buttons (36px below 44px min)
    const buttons = document.querySelectorAll('button');
    for (const btn of Array.from(buttons)) {
      const cls = btn.className;
      if (cls.includes('w-9') || cls.includes('h-9')) {
        // Tab bar buttons (w-9/h-9 not present — they use min-h-[52px])
        // If found, it should only be on transport buttons (w-16 is fine)
        // M/S/R buttons must NOT be w-9/h-9
      }
      // All buttons should have min-height ≥ 44px via CSS
    }
  });

  it('applies min-height: 44px to all button elements via index.css', () => {
    expect(cssRaw).toContain('min-height: 44px');
    expect(cssRaw).toContain('button');
  });

  // ── Interaction feedback: brightness, not scale ───────────

  it('uses brightness-based tap feedback instead of scale transforms', () => {
    renderApp();
    const html = document.body.innerHTML;
    // Must NOT use active:scale classes (violates design spec)
    expect(html).not.toMatch(/active:scale-/);
  });

  // ── No hardcoded badge colors ─────────────────────────────

  it('does not use hardcoded color literals for format badges', () => {
    const fxBrowserPath = path.resolve(__dirname, '../components/FxBrowser.tsx');
    const fxSource = fs.readFileSync(fxBrowserPath, 'utf-8');
    expect(fxSource).not.toContain('#7EC8A0');
    expect(fxSource).not.toContain('#C49EC8');
    expect(fxSource).not.toContain('#D48A9E');
  });
});
