import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocationPicker } from './LocationPicker';

describe('LocationPicker', () => {
  it('converts a map click into WGS-84 coordinates', () => {
    const onChange = vi.fn();
    render(<LocationPicker latitude={31.2304} longitude={121.4737} onChange={onChange} />);
    const map = screen.getByRole('button', { name: '在校园示意地图上选择商家位置' });
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(map, { clientX: 160, clientY: 45 });

    expect(onChange).toHaveBeenCalledWith({ latitude: 31.2324, longitude: 121.4767 });
  });

  it('supports keyboard nudging and resetting to campus center', () => {
    const onChange = vi.fn();
    render(<LocationPicker latitude={31.23} longitude={121.47} onChange={onChange} />);

    fireEvent.keyDown(
      screen.getByRole('button', { name: '在校园示意地图上选择商家位置' }),
      { key: 'ArrowRight' },
    );
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 31.23, longitude: 121.47005 });

    fireEvent.click(screen.getByRole('button', { name: '回到校园中心' }));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 31.2304, longitude: 121.4737 });
  });
});
