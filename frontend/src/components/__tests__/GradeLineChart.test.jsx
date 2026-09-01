import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import GradeLineChart from '../GradeLineChart.jsx';

describe('GradeLineChart', () => {
  test('shows the empty label when there are no points', () => {
    render(<GradeLineChart points={[]} emptyLabel="Nichts da" />);
    expect(screen.getByText('Nichts da')).toBeTruthy();
  });

  test('renders one grade label per point', () => {
    render(
      <GradeLineChart
        points={[
          { date: '01.09.', label: '2+', value: 1.7 },
          { date: '08.09.', label: '3-', value: 3.3 },
        ]}
      />
    );
    // Tendency labels (2+/3-) don't collide with the plain 1-6 y-axis labels.
    expect(screen.getByText('2+')).toBeTruthy();
    expect(screen.getByText('3-')).toBeTruthy();
  });

  test('marks points that carry remarks with a 💬 whose tooltip lists them', () => {
    render(
      <GradeLineChart
        points={[
          { date: '01.09.', label: '2', value: 2, remarks: [{ emoji: '⭐', text: 'stark mitgearbeitet' }] },
          { date: '08.09.', label: '3', value: 3, remarks: [] },
        ]}
      />
    );
    const markers = screen.getAllByText('💬');
    // Exactly the one point with a remark gets a marker.
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute('title')).toContain('stark mitgearbeitet');
    expect(markers[0].getAttribute('title')).toContain('⭐');
  });

  test('renders no marker when no point has remarks', () => {
    render(<GradeLineChart points={[{ date: '01.09.', label: '2', value: 2 }]} />);
    expect(screen.queryByText('💬')).toBeNull();
  });
});
