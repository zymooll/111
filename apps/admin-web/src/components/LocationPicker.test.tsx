import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CAMPUS_CENTER_WGS84 } from '../constants/campus';
import { LocationPicker } from './LocationPicker';

describe('LocationPicker', () => {
  it('converts a map click into WGS-84 coordinates', () => {
    const onChange = vi.fn();
    render(<LocationPicker latitude={CAMPUS_CENTER_WGS84.latitude} longitude={CAMPUS_CENTER_WGS84.longitude} onChange={onChange} />);
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

    expect(onChange).toHaveBeenCalledWith({ latitude: 28.136945, longitude: 112.992306 });
  });

  it('supports keyboard nudging and resetting to campus center', () => {
    const onChange = vi.fn();
    render(<LocationPicker latitude={28.1345} longitude={112.989} onChange={onChange} />);

    fireEvent.keyDown(
      screen.getByRole('button', { name: '在校园示意地图上选择商家位置' }),
      { key: 'ArrowRight' },
    );
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 28.1345, longitude: 112.98905 });

    fireEvent.click(screen.getByRole('button', { name: '回到校园中心' }));
    expect(onChange).toHaveBeenLastCalledWith(CAMPUS_CENTER_WGS84);
  });
});
