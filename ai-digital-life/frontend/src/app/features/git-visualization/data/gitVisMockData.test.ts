import { describe, it, expect } from 'vitest'
import {
  toBklitAreaData,
  generateCodeLineEvolutionData,
  toClockHeatmapData,
  toCalendarHeatmapData,
  toContributorData,
  toBklitSankeyData,
} from './gitVisMockData'

describe('bklit data adapters', () => {
  it('toBklitAreaData converts evolution data', () => {
    const result = toBklitAreaData(generateCodeLineEvolutionData())
    expect(result.length).toBe(40)
    expect(result[0]).toHaveProperty('date')
    expect(result[0]).toHaveProperty('added')
    expect(result[0]).toHaveProperty('deleted')
  })

  it('toClockHeatmapData converts clock data', () => {
    const result = toClockHeatmapData()
    expect(result.length).toBe(168) // 7 * 24
    expect(result[0]).toHaveProperty('x')
    expect(result[0]).toHaveProperty('y')
    expect(result[0]).toHaveProperty('value')
  })

  it('toCalendarHeatmapData converts calendar data', () => {
    const result = toCalendarHeatmapData()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('x') // day of week
    expect(result[0]).toHaveProperty('y') // week number
  })

  it('toContributorData converts contributor arrays', () => {
    const result = toContributorData()
    expect(result.length).toBe(6)
    expect(result[0].name).toBe('Alex')
    expect(result[0]).toHaveProperty('commits')
    expect(result[0]).toHaveProperty('added')
    expect(result[0]).toHaveProperty('deleted')
  })

  it('toBklitSankeyData converts sankey data', () => {
    const result = toBklitSankeyData()
    expect(result.nodes.length).toBe(11)
    expect(result.links.length).toBe(13)
    expect(result.nodes[0]).toHaveProperty('id')
    expect(result.nodes[0]).toHaveProperty('label')
  })
})
