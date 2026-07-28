import { useEffect } from 'react';
import {
  chipStyleFor,
  contrastRatio,
  type HoverMode,
  type SensationValue,
} from './sensationRow';

// Post-trial: only Mode C ships. The PresetSelection shape is retained
// (rather than removed) so callers in CycleChartPage.tsx don't need
// invasive prop refactoring while Mode C iteration continues.
export type PresetSelection = {
  mode: HoverMode;
  accent: string | null;
  label: string;
  key: string;
};

const STORAGE_KEY = 'cp.sensation.preset';

const MODE_C_OPTION: PresetSelection = {
  key: 'deepen',
  mode: 'C',
  accent: null,
  label: 'Mode C · Deepen teal',
};

export const OPTIONS: readonly PresetSelection[] = [MODE_C_OPTION];
export const DEFAULT_SELECTION: PresetSelection = MODE_C_OPTION;

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

// Per-state contrast detail — exposes the exact letter-on-background ratios
// for every chip state of the currently selected preset, including the
// §6 exceptions, so the user can judge in-app.
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
// Mode C's hover tile is the deepened teal for all cells.
function effectiveTileBg(_mode: HoverMode, _value: SensationValue, hover: boolean): string {
  return hover ? '#aee5df' : '#d8f3f0';
}

function letterRatio(mode: HoverMode, accent: string | null, value: SensationValue, hover: boolean): number {
  const chip = chipStyleFor(value, { mode, accent, hover });
  const bg = chip.background === 'transparent'
    ? effectiveTileBg(mode, value, hover)
    : chip.background;
  return contrastRatio(chip.color, bg);
}

// §6 exception list — now empty. Dry moved to the muted teal-grey
// (#596b68 / #4d5f5c) and Wet moved to the Moist-style pale fill + deep frame
// (#c4e8e2 / #9bd3c9); all eight letter states now clear 4.5:1 on their own.
// Retained as a hook so a future Mode C tweak that dips below can be labelled
// rather than silently shipped.
function isException(): boolean {
  return false;
}

interface Props {
  selection: PresetSelection;
  onChange: (sel: PresetSelection) => void;
}

/**
 * Dev-only floating preset switcher.
 * Caller must gate on `import.meta.env.DEV`. Removed in final cleanup
 * commit (when Mode C iteration is fully locked).
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
      <div style={{ fontWeight: 700, color: '#002142', marginBottom: 6 }}>Sensation preset (dev) — Mode C iteration</div>
      <select
        value={selection.key}
        onChange={(e) => {
          const next = OPTIONS.find((o) => o.key === e.target.value);
          if (next) onChange(next);
        }}
        style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: '#002142', marginBottom: 4 }}>Per-state letter contrast</div>
        {STATES.map((s) => {
          const r = letterRatio(selection.mode, selection.accent, s.value, s.hover);
          const passes = r >= 4.5;
          const exception = isException();
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
