import { fireEvent, render, screen } from '@testing-library/react-native';

import { DoseRow } from '@/features/pill-tracker/components/DoseRow';
import type { DoseWithMedication } from '@/types';

const item: DoseWithMedication = {
  dose: {
    id: 'dose_1',
    medicationId: 'med_1',
    scheduledAt: '2026-07-22T08:00:00.000Z',
    status: 'pending',
  },
  medication: {
    id: 'med_1',
    name: 'Amlodipine',
    dosage: '5',
    unit: 'mg',
    form: 'tablet',
    appearance: { color: 'White', colorHex: '#fff', shape: 'round' },
    schedule: { frequency: 'once_daily', times: ['08:00'], startDate: '2026-07-22' },
    createdAt: '2026-07-22T00:00:00.000Z',
  },
};

describe('<DoseRow />', () => {
  it('shows "I Took This" for a pending dose and fires the callback', () => {
    const onMarkTaken = jest.fn();
    render(
      <DoseRow
        item={item}
        status="pending"
        onMarkTaken={onMarkTaken}
        onUndo={jest.fn()}
        onOpen={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('I Took This'));
    expect(onMarkTaken).toHaveBeenCalledWith(item);
  });

  it('shows an Undo action once taken', () => {
    const onUndo = jest.fn();
    render(
      <DoseRow
        item={item}
        status="taken"
        onMarkTaken={jest.fn()}
        onUndo={onUndo}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.queryByText('I Took This')).toBeNull();
    fireEvent.press(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledWith(item);
  });
});
