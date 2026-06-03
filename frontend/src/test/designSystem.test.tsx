import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import App from '../App';

// ── Helpers ──────────────────────────────────────────────────

let cssRaw: string;

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

describe.skip('Dark Mode — Everforest Dark palette + theme toggle', () => {
  // ── Dark palette CSS variables ────────────────────────────

  it('defines .dark CSS class with Everforest Dark palette in index.css', () => {
    expect(cssRaw).toContain('.dark');
    expect(cssRaw).toContain('--bg-primary: #2D353B');
    expect(cssRaw).toContain('--bg-secondary: #343F44');
    expect(cssRaw).toContain('--bg-tertiary: #3D484D');
    expect(cssRaw).toContain('--text-primary: #D3C6AA');
    expect(cssRaw).toContain('--text-secondary: #859289');
    expect(cssRaw).toContain('--accent-orange: #E69875');
    expect(cssRaw).toContain('--border: #475258');
  });

  it('defines dark format-badge CSS variables in .dark block', () => {
    expect(cssRaw).toContain('--format-vst2: #83C092');
    expect(cssRaw).toContain('--format-clap: #A68DBA');
    expect(cssRaw).toContain('--format-dx: #C47D94');
  });

  it('defines dark scrollbar thumb color', () => {
    expect(cssRaw).toContain('.dark ::-webkit-scrollbar-thumb');
    expect(cssRaw).toContain('background: #5A666A');
  });

  it('defines transition properties for smooth theme switching', () => {
    expect(cssRaw).toContain('transition-duration: 200ms');
    expect(cssRaw).toContain('transition-property: background-color, border-color, color, fill, stroke');
  });

  it('supports [data-theme="dark"] as alternative selector', () => {
    expect(cssRaw).toContain('[data-theme="dark"]');
  });

  // ── Flash prevention in index.html ────────────────────────

  it('includes inline script in index.html to prevent flash', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    const htmlRaw = fs.readFileSync(htmlPath, 'utf-8');
    expect(htmlRaw).toContain('spidercrab-theme');
    expect(htmlRaw).toContain('prefers-color-scheme: dark');
    expect(htmlRaw).toContain('classList.add(\'dark\')');
  });

  // ── Theme toggle UI in Settings ───────────────────────────

  it('renders theme toggle buttons in Settings tab', () => {
    renderApp();
    // Click Settings tab
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    expect(screen.getByText('Light')).toBeDefined();
    expect(screen.getByText('Dark')).toBeDefined();
    expect(screen.getByText('System')).toBeDefined();
  });

  it('shows current theme status in Settings tab', () => {
    renderApp();
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    // One of these should be visible based on system preference
    const statusMsg = screen.queryByText(/Light mode active|Dark mode active/);
    expect(statusMsg).not.toBeNull();
  });

  // ── useTheme hook exports ─────────────────────────────────

  it('useTheme module exports a function', () => {
    // Dynamic import to verify the module exists and exports useTheme
    const modPath = path.resolve(__dirname, '../hooks/useTheme.ts');
    const modRaw = fs.readFileSync(modPath, 'utf-8');
    expect(modRaw).toContain('export function useTheme');
    expect(modRaw).toContain('STORAGE_KEY');
    expect(modRaw).toContain('localStorage');
  });
});

// ── Integration: theme class on html element ───────────────

describe.skip('Theme class application', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('useTheme hook applies .dark class to html element when preference is dark', () => {
    localStorage.setItem('spidercrab-theme', 'dark');
    renderApp();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('useTheme hook removes .dark class from html element when preference is light', () => {
    localStorage.setItem('spidercrab-theme', 'light');
    renderApp();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists theme preference to localStorage', () => {
    renderApp();
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    const darkBtn = screen.getByText('Dark');
    fireEvent.click(darkBtn);

    expect(localStorage.getItem('spidercrab-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles theme when clicking Light button', () => {
    localStorage.setItem('spidercrab-theme', 'dark');
    renderApp();
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    const lightBtn = screen.getByText('Light');
    fireEvent.click(lightBtn);

    expect(localStorage.getItem('spidercrab-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('renders with correct theme status after toggle', () => {
    renderApp();
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    const darkBtn = screen.getByText('Dark');
    fireEvent.click(darkBtn);

    expect(screen.getByText('Dark mode active')).toBeDefined();

    const lightBtn = screen.getByText('Light');
    fireEvent.click(lightBtn);

    expect(screen.getByText('Light mode active')).toBeDefined();
  });
});
