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

// §6 exception list, narrowed after the in-app trial. Resting Wet at #357d72
// (when wet-only / paired variant active) and a future Mode C Wet hover fix
// (Open #1) move out of this list as they pass 4.5:1; the only remaining
// trial-time exception is resting Dry. Mode C Dry hover (~2.78) stays as a
// known open gate (Open #2) until resolved.
function isException(_mode: HoverMode, value: SensationValue, hover: boolean): boolean {
  if (!hover && value === 'DRY') return true;  // resting Dry letter ~3.32:1
  return false;
}

export type WetVariant = 'baseline' | 'wet-only' | 'paired';

interface Props {
  selection: PresetSelection;
  onChange: (sel: PresetSelection) => void;
  // TRIAL — Wet/Slippery resting variant. Kept for continued Mode C iteration.
  wetVariant?: WetVariant;
  onWetVariantChange?: (v: WetVariant) => void;
}

/**
 * Dev-only floating preset switcher.
 * Caller must gate on `import.meta.env.DEV`. Removed in final cleanup
 * commit (when Mode C iteration is fully locked).
 */
export function SensationPresetSwitcher({ selection, onChange, wetVariant, onWetVariantChange }: Props) {
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
      {wetVariant !== undefined && onWetVariantChange && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#002142', marginBottom: 4 }}>
            Wet resting variant
          </div>
          <select
            value={wetVariant}
            onChange={(e) => onWetVariantChange(e.target.value as WetVariant)}
            style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
          >
            <option value="baseline">baseline — Wet #62bdb1 (trial-time default)</option>
            <option value="wet-only">wet-only — Wet #357d72, Slip resting unchanged</option>
            <option value="paired">paired — Wet #357d72, Mode C Slip = #357d72 + white S</option>
          </select>
        </div>
      )}
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
