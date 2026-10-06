import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snapshot = atom({ plugin: 'context-band', key: 'snapshot' } as const, null)
const isExpanded = atom({ plugin: 'context-band', key: 'isExpanded' } as const, false)
const isHidden = atom({ plugin: 'context-band', key: 'isHidden' } as const, false)

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export function bar(percent: number, width = 12): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const C = {
  model: '#D97757',
  label: '#E5E7EB',
  sep: '#6B7280',
  empty: '#3F3F46',
  input: '#38BDF8',
  output: '#A78BFA',
  cacheRead: '#34D399',
  cacheWrite: '#F472B6',
  cost: '#FBBF24',
  free: '#A3E635',
}

const ROW_COLORS = ['#F472B6', '#A78BFA', '#38BDF8', '#2DD4BF', '#FBBF24', '#FB923C', '#F87171', '#A3E635']

// Green → yellow → red as usage climbs.
export function heat(percent: number): string {
  const p = Math.max(0, Math.min(100, percent)) / 100
  const [r, g] = p < 0.5 ? [Math.round(510 * p), 220] : [255, Math.round(220 * (2 - 2 * p))]
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}60`
}

// One color per bar cell: filled cells shade along the heat ramp, empty ones stay dim.
export function gradientCells(percent: number, width = 12): string[] {
  const filled = bar(percent, width).indexOf('░')
  const n = filled === -1 ? width : filled
  return Array.from({ length: width }, (_, i) => (i < n ? heat(((i + 1) / width) * 100) : C.empty))
}

async function measure($: EngineInterface): Promise<void> {
  // 'summary' estimates the breakdown locally: no extra API calls.
  let usage
  try {
    usage = await $.session.usage({ breakdown: 'summary' })
  } catch {
    usage = await $.session.usage()
  }
  const model = await $.session.model()
  const { context, rateLimits, cost } = usage
  const breakdown = context.breakdown
  const api = breakdown?.apiUsage ?? null

  const next: Snapshot = {
    model,
    tokens: context.tokens ?? null,
    window: context.window,
    percent: context.percent ?? null,
    input: api?.input_tokens ?? null,
    output: api?.output_tokens ?? null,
    cacheRead: api?.cache_read_input_tokens ?? null,
    cacheWrite: api?.cache_creation_input_tokens ?? null,
    costUsd: cost?.usd ?? null,
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt ?? null })),
    rows: (breakdown?.categories ?? [])
      .filter(c => c.kind === 'used' && c.tokens > 0)
      .map(c => ({ name: c.name, tokens: c.tokens })),
    free: breakdown?.categories.find(c => c.kind === 'free')?.tokens ?? null,
    compactAt: breakdown?.autoCompactThreshold ?? null,
  }
  await update($, snapshot, () => next)
  // Mirror a one-line summary in the status line, for surfaces that do not draw the band.
  $.ui.status(
    `${model} · ctx ${fmt(next.tokens)}/${fmt(next.window)}${next.percent === null ? '' : ` (${next.percent}%)`}` +
      (next.costUsd === null ? '' : ` · $${next.costUsd.toFixed(2)}`),
  )
}

let renders = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-band',
      description: 'Toggle the context and usage band above the prompt',
    })
    const result = await next(e)
    await measure($)
    return result
  })

  on('command.run', { command: 'context-band' }, async ($, e) => {
    if (e.args.trim() === 'status') {
      let error = 'none'
      try {
        await measure($)
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      const snap = await read($, snapshot)
      return {
        text: [
          `surfaces: ${(await $.session.surfaces()).join(', ') || '(none)'}`,
          `hidden: ${await read($, isHidden)}`,
          `measure error: ${error}`,
          `snapshot: ${snap ? `${snap.model}, ${fmt(snap.tokens)}/${fmt(snap.window)}` : 'none'}`,
          `renders: ${renders}`,
        ].join('\n'),
      }
    }
    const hidden = await read($, isHidden)
    await update($, isHidden, () => !hidden)
    if (hidden) await measure($)
    return { text: hidden ? 'Context band shown.' : 'Context band hidden. Run /context-band to bring it back.' }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await measure($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    renders += 1
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) {
      return next(e)
    }
    const expanded = await read($, isExpanded)
    const { Box, Button, Text } = $.ui.resolve(e)
    const pct = snap.percent

    const sep = (k: string) => (
      <Text key={k} color={C.sep}>
        {'  ┃  '}
      </Text>
    )

    return (
      <Box flexDirection="column">
        <Box key="summary">
          <Text key="gem" color={C.model}>
            {'✦ '}
          </Text>
          <Text key="model" color={C.model} bold>
            {snap.model}
          </Text>
          {sep('s1')}
          <Text key="ctxl" color={C.label} bold>
            {'ctx '}
          </Text>
          {gradientCells(pct ?? 0).map((c, i) => (
            <Text key={`cell-${i}`} color={c}>
              {c === C.empty ? '░' : '█'}
            </Text>
          ))}
          <Text key="ctx" color={heat(pct ?? 0)} bold>
            {` ${fmt(snap.tokens)}/${fmt(snap.window)} (${pct === null ? '–' : `${pct}%`})`}
          </Text>
          {snap.input !== null ? sep('s2') : null}
          {snap.input !== null ? (
            <Box key="tok">
              <Text key="in" color={C.input}>{`↑ ${fmt(snap.input)} `}</Text>
              <Text key="out" color={C.output}>{`↓ ${fmt(snap.output)} `}</Text>
              <Text key="cr" color={C.cacheRead}>{`⟲ ${fmt(snap.cacheRead)} `}</Text>
              <Text key="cw" color={C.cacheWrite}>{`✎ ${fmt(snap.cacheWrite)}`}</Text>
            </Box>
          ) : null}
          {snap.costUsd !== null ? sep('s3') : null}
          {snap.costUsd !== null ? (
            <Text key="cost" color={C.cost} bold>{`$${snap.costUsd.toFixed(2)}`}</Text>
          ) : null}
          {snap.limits.length > 0 ? sep('s4') : null}
          {snap.limits.map((l, i) => (
            <Text key={`lim-${l.kind}`} color={heat(l.percentUsed)}>
              {`${i > 0 ? ' · ' : ''}${LIMIT_LABELS[l.kind] ?? l.kind} ${l.percentUsed}%`}
            </Text>
          ))}
          <Text key="sp"> </Text>
          <Button
            key="toggle"
            label={expanded ? 'Less' : 'Details'}
            onPress={() => update($, isExpanded, v => !v)}
          />
          <Text key="sp2"> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {expanded ? (
          <Box key="details" flexDirection="column" paddingLeft={2}>
            {snap.rows.map((r, i) => {
              const color = ROW_COLORS[i % ROW_COLORS.length] ?? C.label
              const share = (r.tokens / snap.window) * 100
              return (
                <Box key={`row-${r.name}`}>
                  <Text key="dot" color={color}>
                    {'● '}
                  </Text>
                  <Text key="name" color={color} bold>
                    {r.name.padEnd(22)}
                  </Text>
                  <Text key="tok" color={C.label}>
                    {fmt(r.tokens).padStart(7)}
                  </Text>
                  <Text key="bar" color={color}>
                    {`  ${'▇'.repeat(Math.max(1, Math.round(share / 4)))} `}
                  </Text>
                  <Text key="pct" color={C.sep}>{`${share.toFixed(1)}%`}</Text>
                </Box>
              )
            })}
            {snap.free !== null ? (
              <Box key="free">
                <Text key="dot" color={C.empty}>
                  {'○ '}
                </Text>
                <Text key="name" color={C.free}>
                  {'Free space'.padEnd(22)}
                </Text>
                <Text key="tok" color={C.free}>
                  {fmt(snap.free).padStart(7)}
                </Text>
              </Box>
            ) : null}
            {snap.compactAt !== null ? (
              <Text key="compact" color={C.cost}>{`⚡ Auto-compact at ${fmt(snap.compactAt)} tokens`}</Text>
            ) : null}
            {snap.limits
              .filter(l => l.resetsAt)
              .map(l => (
                <Text key={`reset-${l.kind}`} color={C.input}>
                  {`⏱ ${LIMIT_LABELS[l.kind] ?? l.kind} window resets ${l.resetsAt}`}
                </Text>
              ))}
          </Box>
        ) : null}
      </Box>
    )
  })
}
