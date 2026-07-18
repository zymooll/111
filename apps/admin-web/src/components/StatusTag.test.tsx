import '../test/setup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  it('shows the localized label for moderation states', () => {
    render(<StatusTag status="pending_manual" />);
    expect(screen.getByText('待人工审核')).toBeInTheDocument();
  });

  it('shows the localized label for publishing states', () => {
    render(<StatusTag status="online" />);
    expect(screen.getByText('已上架')).toBeInTheDocument();
  });

  it('distinguishes machine review from the manual queue', () => {
    render(<StatusTag status="pending_machine" />);
    expect(screen.getByText('机器审核中')).toBeInTheDocument();
  });
});
