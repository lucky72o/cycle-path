import { useEffect } from 'react';
import {
  ACCENT_PRESETS,
  chipStyleFor,
  contrastRatio,
  autoDarkenFor45,
  type HoverMode,
  type SensationValue,
} from './sensationRow';

export type PresetSelection = {
  mode: HoverMode;
  accent: string | null;
  label: string;
  key: string;
};

const STORAGE_KEY = 'cp.sensation.preset';

// The full list shown in the switcher: every accent × {A, B}, plus Mode C.
function buildOptions(): PresetSelection[] {
  const out: PresetSelection[] = [];
  for (const p of ACCENT_PRESETS) {
    out.push({ key: p.key + '-A', mode: 'A', accent: p.fill, label: p.name + ' · v1 (fill)' });
    out.push({ key: p.key + '-B', mode: 'B', accent: p.fill, label: p.name + ' · v2 (outline)' });
  }
  out.push({ key: 'deepen', mode: 'C', accent: null, label: 'Mode C · Deepen teal' });
  return out;
}

export const OPTIONS = buildOptions();
export const DEFAULT_SELECTION: PresetSelection = OPTIONS.find((o) => o.key === 'deepen')!;

export function readStoredSelection(): PresetSelection {
  if (typeof window === 'undefined') return DEFAULT_SELECTION;
  const key = window.localStorage.getItem(STORAGE_KEY);
  if (!key) return DEFAULT_SELECTION;
  return OPTIONS.find((o) => o.key === key) ?? DEFAULT_SELECTION;
}

export function writeStoredSelection(sel: PresetSelection) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, sel.key);
}

// Live contrast (white-on-fill) post-auto-darken, for the switcher's per-option label.
function describeContrast(sel: PresetSelection): string {
  if (sel.mode === 'C' || !sel.accent) return ''; // Mode C ships its own hexes
  const used = autoDarkenFor45(sel.accent);
  const r = contrastRatio('#ffffff', used).toFixed(2);
  const note = used === sel.accent ? '' : ' (auto-darkened)';
  return `${r}:1${note}`;
}

// Per-state contrast detail — exposes the exact letter-on-background ratios
// for every chip state of the currently selected preset+mode, including the
// three product-approved §6 exceptions, so the user can judge in-app.
const STATES: { value: SensationValue; hover: boolean; label: string }[] = [
  { value: 'DRY',      hover: false, label: 'Dry · resting' },
  { value: 'DAMP',     hover: false, label: 'Moist · resting' },
  { value: 'WET',      hover: false, label: 'Wet · resting' },
  { value: 'SLIPPERY', hover: false, label: 'Slip · resting' },
  { value: 'DRY',      hover: true,  label: 'Dry · hover' },
  { value: 'DAMP',     hover: true,  label: 'Moist · hover' },
  { value: 'WET',      hover: true,  label: 'Wet · hover' },
  { value: 'SLIPPERY', hover: true,  label: 'Slip · hover' },
];

// Tile-bg the letter actually sits on when the chip background is transparent.
function effectiveTileBg(mode: HoverMode, value: SensationValue, hover: boolean): string {
  if (!hover) return '#d8f3f0';
  if (mode === 'B' && value !== 'SLIPPERY') return '#d8f3f0';
  return '#aee5df';
}

function letterRatio(mode: HoverMode, accent: string | null, value: SensationValue, hover: boolean): number {
  const chip = chipStyleFor(value, { mode, accent, hover });
  const bg = chip.background === 'transparent'
    ? effectiveTileBg(mode, value, hover)
    : chip.background;
  return contrastRatio(chip.color, bg);
}

// The three product-approved exceptions per spec §6 (closed list).
function isException(mode: HoverMode, value: SensationValue, hover: boolean): boolean {
  if (!hover && value === 'DRY') return true;                 // resting Dry letter
  if (!hover && value === 'WET') return true;                 // resting Wet white
  if (hover && mode === 'C' && value === 'WET') return true;  // Mode C Wet hover
  return false;
}

interface Props {
  selection: PresetSelection;
  onChange: (sel: PresetSelection) => void;
}

/**
 * Dev-only floating preset switcher.
 * Caller must gate on `import.meta.env.DEV`. Deleted before opening the PR
 * (spec §7 cleanup).
 */
export function SensationPresetSwitcher({ selection, onChange }: Props) {
  useEffect(() => { writeStoredSelection(selection); }, [selection]);

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      right: 12,
      zIndex: 9999,
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: 8,
      padding: '8px 10px',
      fontFamily: 'Montserrat, system-ui, sans-serif',
      fontSize: 11,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth: 320,
    }}>
      <div style={{ fontWeight: 700, color: '#002142', marginBottom: 6 }}>Sensation preset (dev)</div>
      <select
        value={selection.key}
        onChange={(e) => {
          const next = OPTIONS.find((o) => o.key === e.target.value);
          if (next) onChange(next);
        }}
        style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}{o.mode !== 'C' ? `  [${describeContrast(o)}]` : ''}
          </option>
        ))}
      </select>
      <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: '#002142', marginBottom: 4 }}>Per-state letter contrast</div>
        {STATES.map((s) => {
          const r = letterRatio(selection.mode, selection.accent, s.value, s.hover);
          const passes = r >= 4.5;
          const exception = isException(selection.mode, s.value, s.hover);
          const status = passes ? '✓' : (exception ? '§6 exception' : '⚠ violation');
          const color = passes ? '#0f766e' : (exception ? '#9a6700' : '#9d2b53');
          return (
            <div
              key={s.value + '/' + (s.hover ? 'h' : 'r')}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
            >
              <span style={{ color: '#5b6b7a', flex: 1 }}>{s.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#002142', minWidth: 40, textAlign: 'right' }}>
                {r.toFixed(2)}:1
              </span>
              <span style={{ color, fontWeight: 600, minWidth: 86, textAlign: 'right' }}>{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
