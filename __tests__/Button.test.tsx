import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/Button';

describe('<Button />', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="I Took This" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'I Took This' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks itself busy while loading', () => {
    const { getByRole } = render(<Button label="Save" onPress={() => {}} loading />);
    const button = getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});
