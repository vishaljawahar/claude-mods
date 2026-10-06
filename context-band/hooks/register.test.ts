import { describe, expect, test } from 'claude-code/testing'

import { bar, fmt, gradientCells, heat } from './register'

describe('formatting', () => {
  test('fmt abbreviates token counts', async () => {
    expect(fmt(null)).toBe('–')
    expect(fmt(950)).toBe('950')
    expect(fmt(42_100)).toBe('42.1k')
    expect(fmt(200_000)).toBe('200.0k')
    expect(fmt(1_000_000)).toBe('1M')
  })

  test('bar fills in proportion to percent', async () => {
    expect(bar(0, 10)).toBe('░░░░░░░░░░')
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(150, 10)).toBe('██████████')
  })
})

test('band shows model, context fill and cost', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
      cost: { usd: 1.234 },
    },
  }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('command.register', () => ({ value: { command: 'context-band' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Stands in for the engine's own (empty) band once ours yields.
  on('ui.render', () => ({ type: 'Box', children: [] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'context-band',
      surface,
      component: 'AbovePrompt',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns: 200,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /50\.0k\/200\.0k \(25%\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h 12%/ })).toBeDefined()
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('Less')
    await ui.press({ key: 'toggle' })
    if (surface === 'desktop') {
      await ui.press({ key: 'hide' })
      expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeUndefined()
    }
    await ui.unmount()
  }
})

test('heat ramps from green to red', async () => {
  expect(heat(0)).toBe('#00dc60')
  expect(heat(50)).toBe('#ffdc60')
  expect(heat(100)).toBe('#ff0060')
  expect(gradientCells(50, 4)).toEqual([heat(25), heat(50), '#3F3F46', '#3F3F46'])
})
