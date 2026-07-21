import { validateMedicationForm, isLikelyPhone } from '@/utils/validation';

describe('validateMedicationForm', () => {
  const valid = { name: 'Amlodipine', dosage: '5', unit: 'mg', times: ['08:00'] };

  it('accepts a complete, valid form', () => {
    expect(validateMedicationForm(valid)).toEqual({});
  });

  it('requires a medicine name', () => {
    expect(validateMedicationForm({ ...valid, name: '  ' }).name).toBeDefined();
  });

  it('rejects non-numeric dosage', () => {
    expect(validateMedicationForm({ ...valid, dosage: 'abc' }).dosage).toBeDefined();
  });

  it('requires at least one reminder time', () => {
    expect(validateMedicationForm({ ...valid, times: [] }).times).toBeDefined();
  });

  it('rejects an invalid time format', () => {
    expect(validateMedicationForm({ ...valid, times: ['25:99'] }).times).toBeDefined();
  });
});

describe('isLikelyPhone', () => {
  it('accepts common phone formats', () => {
    expect(isLikelyPhone('+63 917 555 0134')).toBe(true);
    expect(isLikelyPhone('0917-555-0134')).toBe(true);
  });

  it('rejects clearly invalid input', () => {
    expect(isLikelyPhone('call me')).toBe(false);
    expect(isLikelyPhone('12')).toBe(false);
  });
});
