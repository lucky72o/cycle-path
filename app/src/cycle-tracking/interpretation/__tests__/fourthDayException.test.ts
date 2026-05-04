import { describe, it, expect } from 'vitest';
import { checkFourthDayException } from '../sensiplan/fourthDayException';

describe('checkFourthDayException', () => {
  const coverlineC = 36.4;

  it('confirms shift when 4th temp is above coverline', () => {
    const fourthDayTemp = 36.52;
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(true);
  });

  it('rejects when 4th temp is at or below coverline', () => {
    const fourthDayTemp = 36.4;
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(false);
  });

  it('rejects when 4th temp is below coverline', () => {
    const fourthDayTemp = 36.3;
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(false);
  });

  it('confirms when 4th temp is just barely above coverline', () => {
    const fourthDayTemp = 36.400001;
    const result = checkFourthDayException(fourthDayTemp, coverlineC);
    expect(result).toBe(true);
  });
});
