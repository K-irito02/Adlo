import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CodeLineEvo } from './CodeLineEvo'

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', text: '#1e293b', muted: '#94a3b8', grid: '#e2e8f0',
    tooltipBg: '#1e293b', tooltipText: '#f8fafc', background: '#ffffff',
    seriesColors: ['#3b82f6', '#ef4444'], heatmapColors: [],
  }),
}))

describe('CodeLineEvo', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CodeLineEvo />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
