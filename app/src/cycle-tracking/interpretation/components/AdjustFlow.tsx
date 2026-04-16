import { useState } from 'react';
import type { ThermalShiftResult, UserOverrides, CycleDayInput } from '../types';
import { btn, card, header, footer } from './cardStyles';

type AdjustFlowProps = {
  currentResult: ThermalShiftResult;
  days: CycleDayInput[];
  existingOverrides?: UserOverrides;
  onSave: (overrides: UserOverrides) => Promise<void>;
  onCancel: () => void;
};

export function AdjustFlow({ currentResult, days, existingOverrides, onSave, onCancel }: AdjustFlowProps) {
  const defaultShiftDay = existingOverrides?.shiftDay ??
    (currentResult.status !== 'none' ? currentResult.shiftDay : 1);
  const defaultCoverline = existingOverrides?.coverlineTemp ??
    (currentResult.status !== 'none' ? currentResult.coverlineTemp : 0);

  const [shiftDay, setShiftDay] = useState(defaultShiftDay);
  const [coverlineTemp, setCoverlineTemp] = useState(defaultCoverline);
  const [showDetails, setShowDetails] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ shiftDay, coverlineTemp });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <span className="font-semibold text-sm text-violet-700">Adjust Interpretation</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Shift day picker */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Shift day</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={shiftDay}
              onChange={(e) => setShiftDay(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            <span className="text-xs text-gray-500">or tap a day on the chart</span>
          </div>
        </div>

        {/* Coverline input */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Coverline temperature (°C)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={coverlineTemp}
              onChange={(e) => setCoverlineTemp(Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            <span className="text-xs text-gray-500">or drag the line on the chart</span>
          </div>
        </div>

        {/* Collapsible details */}
        <details open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-violet-600 cursor-pointer font-medium">
            View reference & confirming temps
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-md text-xs text-gray-600">
            {currentResult.status !== 'none' && (
              <>
                <div className="font-semibold text-gray-500 mb-1">6 preceding low temps (reference):</div>
                <div>{currentResult.referenceDays.join(', ')}</div>
              </>
            )}
          </div>
        </details>

        <details open={showExplanation} onToggle={(e) => setShowExplanation((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-violet-600 cursor-pointer font-medium">
            How is the coverline calculated? (Sensiplan)
          </summary>
          <div className="mt-2 p-3 bg-violet-50 rounded-md border border-violet-200 text-xs text-gray-600 leading-relaxed">
            <strong>Step 1:</strong> Identify the 6 valid temps immediately before the apparent shift.<br />
            <strong>Step 2:</strong> Find the highest of those 6.<br />
            <strong>Step 3:</strong> The coverline is drawn at this highest value.<br />
            <strong>Step 4:</strong> 3 consecutive temps must be above the coverline, with the 3rd at least +0.2°C above it.<br />
            <strong>Exception:</strong> If the 3rd doesn't clear +0.2°C, a 4th consecutive temp above the coverline confirms the shift.
          </div>
        </details>

        {/* Engine comparison */}
        {currentResult.status !== 'none' && (
          <div className="p-2 bg-violet-50 rounded-md text-xs text-violet-600 border border-violet-200">
            Engine's suggestion: Day {currentResult.shiftDay}, coverline {currentResult.coverlineTemp.toFixed(2)}°C
          </div>
        )}
      </div>

      <div className={`${footer.base} bg-violet-50 border-violet-200`}>
        <button onClick={handleSave} disabled={saving} className={`${btn.base} ${btn.saveAdjust}`}>
          {saving ? 'Saving...' : 'Save Adjustment'}
        </button>
        <button onClick={onCancel} className={`${btn.base} ${btn.secondary}`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
