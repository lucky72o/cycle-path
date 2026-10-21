import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  ThermalShiftBackgroundLayer,
  ThermalShiftForegroundLayer,
} from '../components/ThermalShiftAnnotations';
import type { ThermalShiftLayerProps } from '../components/ThermalShiftAnnotations';

const data: ThermalShiftLayerProps['data'] = {
  anchorDay: 21,
  referenceDays: [12, 13, 14, 16, 19, 21],
  confirmingDays: [22, 23, 24],
  coverlineTemp: 36.5,
  usedFourthDayException: false,
};
const days = Array.from({ length: 60 }, (_, i) => ({
  dayNumber: i + 1,
  bbt: 36.5 + (i >= 21 ? 0.3 : 0),
  bbtTime: null,
  excludeFromInterpretation: false,
  disturbanceFactors: [],
  travelTimeDiff: null,
}));
const common = {
  data,
  days,
  temperatureUnit: 'CELSIUS' as const,
  plotAreaOffset: 100,
  plotAreaWidth: 880,
  plotAreaTop: 130,
  plotAreaHeight: 300,
  yAxisRange: { min: 36, max: 37.5 },
};

describe('thermal-shift layers respect the displayed day range', () => {
  it('draws chevrons only for in-range confirming days', () => {
    const inRange = render(<ThermalShiftForegroundLayer {...common} minDay={1} maxDay={40} />);
    const folded = render(<ThermalShiftForegroundLayer {...common} minDay={26} maxDay={60} />);
    expect(inRange.container.querySelectorAll('g[transform]').length).toBe(3);
    expect(folded.container.querySelectorAll('g[transform]').length).toBe(0);
  });

  it('draws no band or halos for days outside the range', () => {
    const inRange = render(<ThermalShiftBackgroundLayer {...common} minDay={1} maxDay={40} />);
    const folded = render(<ThermalShiftBackgroundLayer {...common} minDay={26} maxDay={60} />);
    expect(inRange.container.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(inRange.container.querySelectorAll('circle').length).toBe(6);
    expect(folded.container.querySelectorAll('rect').length).toBe(0);
    expect(folded.container.querySelectorAll('circle').length).toBe(0);
  });

  it('draws only the in-range part of a partially visible set', () => {
    const partial = render(<ThermalShiftForegroundLayer {...common} minDay={23} maxDay={60} />);
    expect(partial.container.querySelectorAll('g[transform]').length).toBe(2);
  });
});
