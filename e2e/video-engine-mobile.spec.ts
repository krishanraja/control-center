import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'
import { videoStudioReviewFixture, videoStudioSessionFixture } from './fixtures/video-studio'

type ReviewFixture = Record<string, any>
type CapturedRequest = { body: Record<string, any>; csrf: string | null; contentType: string | null }

const COMMAND_ID = '33333333-3333-4333-8333-333333333333'
const ACTIVATION_ID = '44444444-4444-4444-8444-444444444444'
const RECORD_ID = '55555555-5555-4555-8555-555555555555'
const RECOVERY_REVIEW_ID = '66666666-6666-4666-8666-666666666666'
const ALT_COMMAND_ID = '77777777-7777-4777-8777-777777777777'
const ALT_REVIEW_ID = '88888888-8888-4888-8888-888888888888'
const RECOVERY_BINDING_ID = '99999999-9999-4999-8999-999999999999'

function cloneReview(): ReviewFixture {
  return JSON.parse(JSON.stringify(videoStudioReviewFixture)) as ReviewFixture
}

function assignReviewId(review: ReviewFixture, id: string) {
  review.id = id
  review.preview.url = `/api/video-studio/reviews/${id}/comparison/after`
  review.comparison.before.url = `/api/video-studio/reviews/${id}/comparison/before`
  review.comparison.after.url = `/api/video-studio/reviews/${id}/comparison/after`
  return review
}

function resolveReview(
  review: ReviewFixture,
  status: 'approved' | 'rejected',
  commandStatus: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled' = 'succeeded',
) {
  review.status = status
  review.editorial_state = status === 'approved' ? 'approved' : review.editorial_state
  const activate = status === 'approved' && review.queues_activation
  review.decision_command = {
    id: activate ? ACTIVATION_ID : RECORD_ID,
    kind: activate ? 'magic_edit_activate' : 'review_decision_record',
    status: commandStatus,
    safe_code: commandStatus === 'failed' || commandStatus === 'attention' ? 'runner_unavailable' : null,
    parent_revision_hash: review.parent_revision_hash,
    parent_artifact_hash: review.parent_artifact_hash,
    created_at: '2026-09-04T09:15:01.000Z',
    completed_at: commandStatus === 'queued' || commandStatus === 'leased' ? null : '2026-09-04T09:15:02.000Z',
  }
  review.recovery = {
    available: false,
    of_command_id: null,
    current_generation: 0,
    max_generation: 3,
    recovery_review_id: null,
    recovered_review_id: null,
    binding_command: null,
  }
  return review
}

function recoverableResolvedReview(
  status: 'approved' | 'rejected',
  commandStatus: 'failed' | 'attention' = 'failed',
  generation: 0 | 1 | 2 | 3 = 0,
) {
  const review = resolveReview(cloneReview(), status, commandStatus)
  review.runner_state = 'attention'
  review.decision_command.safe_code = 'attempts_exhausted'
  review.recovery = {
    available: generation < 3,
    of_command_id: generation === 0 ? null : COMMAND_ID,
    current_generation: generation,
    max_generation: 3,
    recovery_review_id: null,
    recovered_review_id: null,
    binding_command: null,
  }
  return review
}

function withPrepareCommand(
  review: ReviewFixture,
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled',
  resultReviewId: string | null = null,
  commandId = COMMAND_ID,
) {
  review.prepare_command = {
    id: commandId,
    kind: 'magic_edit_prepare',
    status,
    safe_code: status === 'failed'
      ? 'render_failed'
      : status === 'attention'
        ? resultReviewId ? 'editorial_route_required' : 'attempts_exhausted'
        : status === 'cancelled'
          ? 'cancelled_by_operator'
          : status === 'succeeded'
            ? 'candidate_ready'
            : null,
    parent_revision_hash: review.parent_revision_hash,
    parent_artifact_hash: review.parent_artifact_hash,
    result_review_id: resultReviewId,
    created_at: '2026-09-04T09:15:01.000Z',
    completed_at: status === 'queued' || status === 'leased' ? null : '2026-09-04T09:15:04.000Z',
  }
  if (resultReviewId) review.status = 'superseded'
  return review
}

function prepareCommandReadback(
  review: ReviewFixture,
  commandId: string,
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled',
  resultReviewId: string | null = null,
) {
  return {
    ok: true,
    schema_version: 1,
    command: {
      id: commandId,
      job_id: review.job_id,
      platform: review.platform,
      kind: 'magic_edit_prepare',
      status,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      source_review_id: review.id,
      result_review_id: resultReviewId,
      safe_code: status === 'succeeded' ? 'candidate_ready' : null,
      created_at: '2026-09-04T09:15:01.000Z',
      completed_at: status === 'queued' || status === 'leased' ? null : '2026-09-04T09:15:04.000Z',
      recovery: {
        available: false,
        of_command_id: null,
        current_generation: 0,
        max_generation: 3,
        recovery_review_id: null,
        recovered_review_id: null,
        binding_command: null,
      },
    },
    server_time: '2026-09-04T09:15:05.000Z',
  }
}

function withRecoveryBinding(
  review: ReviewFixture,
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled',
  resultReviewId: string | null = null,
) {
  review.recovery = {
    available: false,
    of_command_id: null,
    current_generation: 0,
    max_generation: 3,
    recovery_review_id: RECOVERY_REVIEW_ID,
    recovered_review_id: status === 'succeeded' ? resultReviewId : null,
    binding_command: {
      id: RECOVERY_BINDING_ID,
      kind: 'review_recovery_record',
      status,
      safe_code: status === 'failed' || status === 'attention' ? 'attempts_exhausted' : null,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      source_review_id: review.id,
      result_review_id: status === 'succeeded' ? resultReviewId : null,
      created_at: '2026-09-04T09:16:00.000Z',
      completed_at: status === 'queued' || status === 'leased' ? null : '2026-09-04T09:16:03.000Z',
    },
  }
  return review
}

function recoveryBindingResponse(
  review: ReviewFixture,
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled' = 'queued',
  duplicate = false,
) {
  return {
    ok: true,
    schema_version: 1,
    duplicate,
    result_action: 'recovery_binding_requested',
    source_command_id: review.decision_command.id,
    source_review_id: review.id,
    recovery_review_id: RECOVERY_REVIEW_ID,
    recovery_generation: review.recovery.current_generation + 1,
    command: {
      id: RECOVERY_BINDING_ID,
      job_id: review.job_id,
      platform: review.platform,
      kind: 'review_recovery_record',
      status,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      source_review_id: review.id,
      result_review_id: status === 'succeeded' ? RECOVERY_REVIEW_ID : null,
      created_at: '2026-09-04T09:16:00.000Z',
    },
  }
}

function recoveryCommandReadback(
  review: ReviewFixture,
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled',
  resultReviewId: string | null = null,
) {
  return {
    ok: true,
    schema_version: 1,
    command: {
      id: RECOVERY_BINDING_ID,
      job_id: review.job_id,
      platform: review.platform,
      kind: 'review_recovery_record',
      status,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      source_review_id: review.id,
      result_review_id: status === 'succeeded' ? resultReviewId : null,
      safe_code: status === 'failed' || status === 'attention' ? 'attempts_exhausted' : null,
      created_at: '2026-09-04T09:16:00.000Z',
      completed_at: status === 'queued' || status === 'leased' ? null : '2026-09-04T09:16:03.000Z',
      recovery: {
        available: false,
        of_command_id: null,
        current_generation: 0,
        max_generation: 3,
        recovery_review_id: null,
        recovered_review_id: null,
        binding_command: null,
      },
    },
    server_time: '2026-09-04T09:16:04.000Z',
  }
}

function listItem(review: ReviewFixture) {
  const {
    editorial_state,
    runner_state,
    review_payload,
    preview,
    comparison,
    prepare_command,
    decision_command,
    recovery,
    ...item
  } = review
  return item
}

async function installVideoStudioMock(
  page: Page,
  review: ReviewFixture,
  commandError?: string,
  contentDecisions: Record<string, any>[] = [],
) {
  const commands: CapturedRequest[] = []
  const decisions: CapturedRequest[] = []

  await page.clock.setFixedTime(new Date('2026-09-04T09:15:00.000Z'))
  // Playwright resolves route handlers in reverse registration order.
  await page.route('**/api/**', (route: Route) => route.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (route: Route) => route.fulfill({ json: [] }))
  await page.route('**/realtime/**', (route: Route) => route.abort())
  await answerPilotGate(page)
  await page.route('**/rest/v1/content_decisions*', (route: Route) => route.fulfill({ json: contentDecisions }))

  await page.route('**/api/video-studio/reviews/*/comparison/*', (route: Route) => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: '',
  }))
  await page.route('**/api/video-studio/session', (route: Route) => route.fulfill({ json: videoStudioSessionFixture }))
  await page.route('**/api/video-studio/reviews?*', (route: Route) => route.fulfill({
    json: { ok: true, schema_version: 1, reviews: [listItem(review)], server_time: '2026-09-04T09:15:00.000Z' },
  }))
  await page.route('**/api/video-studio/jobs/*/active?*', (route: Route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.searchParams.get('platform') !== review.platform) {
      return route.fulfill({ status: 422, json: { ok: false, error: { code: 'invalid_platform' } } })
    }
    return route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      job: {
        job_id: review.job_id,
        platform: review.platform,
        active_revision_hash: review.revision_hash,
        active_artifact_hash: review.artifact_hash,
        active_candidate_hash: review.candidate_hash,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        updated_at: '2026-09-04T09:15:00.000Z',
      },
      server_time: '2026-09-04T09:15:00.000Z',
    } })
  })
  await page.route('**/api/video-studio/jobs/*/commands', async (route: Route) => {
    const request = route.request()
    const body = request.postDataJSON() as Record<string, any>
    commands.push({
      body,
      csrf: request.headers()['x-video-studio-csrf'] || null,
      contentType: request.headers()['content-type'] || null,
    })
    if (commandError) {
      return route.fulfill({
        status: 409,
        json: { ok: false, error: { code: commandError, current_revision_hash: 'f'.repeat(64), current_parent_artifact_hash: '9'.repeat(64) } },
      })
    }
    return route.fulfill({
      status: 202,
      json: {
        ok: true,
        schema_version: 1,
        duplicate: false,
        result_action: body.kind === 'magic_edit_return_to_parent' ? 'return_to_parent_queued' : 'edit_queued',
        command: {
          id: COMMAND_ID,
          job_id: review.job_id,
          platform: review.platform,
          kind: body.kind,
          status: 'queued',
          parent_revision_hash: body.parent_revision_hash,
          parent_artifact_hash: body.parent_artifact_hash,
          source_review_id: body.kind === 'magic_edit_prepare' ? body.source_review_id : null,
          created_at: '2026-09-04T09:15:01.000Z',
        },
      },
    })
  })
  await page.route('**/api/video-studio/commands/*?*', (route: Route) => {
    const captured = commands.at(-1)?.body
    return route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      command: {
        id: COMMAND_ID,
        job_id: review.job_id,
        platform: review.platform,
        kind: 'magic_edit_prepare',
        status: 'queued',
        parent_revision_hash: captured?.parent_revision_hash || review.parent_revision_hash,
        parent_artifact_hash: captured?.parent_artifact_hash || review.parent_artifact_hash,
        source_review_id: review.id,
        result_review_id: null,
        safe_code: null,
        created_at: '2026-09-04T09:15:01.000Z',
        completed_at: null,
        recovery: {
          available: false,
          of_command_id: null,
          current_generation: 0,
          max_generation: 3,
          recovery_review_id: null,
          recovered_review_id: null,
          binding_command: null,
        },
      },
      server_time: '2026-09-04T09:15:02.000Z',
    } })
  })
  await page.route('**/api/video-studio/reviews/*/decision', async (route: Route) => {
    const request = route.request()
    const body = request.postDataJSON() as Record<string, any>
    decisions.push({
      body,
      csrf: request.headers()['x-video-studio-csrf'] || null,
      contentType: request.headers()['content-type'] || null,
    })
    review.status = body.decision === 'use_candidate' ? 'approved' : 'rejected'
    review.runner_state = body.decision === 'use_candidate' ? 'queued' : 'idle'
    const decisionCommandId = body.decision === 'use_candidate' ? ACTIVATION_ID : RECORD_ID
    const decisionCommandKind = body.decision === 'use_candidate' && review.queues_activation
      ? 'magic_edit_activate'
      : 'review_decision_record'
    review.decision_command = {
      id: decisionCommandId,
      kind: decisionCommandKind,
      status: 'queued',
      safe_code: null,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      created_at: '2026-09-04T09:15:01.000Z',
      completed_at: null,
    }
    review.recovery = {
      available: false,
      of_command_id: null,
      current_generation: 0,
      max_generation: 3,
      recovery_review_id: null,
      recovered_review_id: null,
      binding_command: null,
    }
    return route.fulfill({
      status: body.decision === 'use_candidate' ? 202 : 200,
      json: {
        ok: true,
        schema_version: 1,
        duplicate: false,
        result_action: body.decision,
        review: {
          id: review.id,
          job_id: review.job_id,
          platform: review.platform,
          status: review.status,
          parent_revision_hash: review.parent_revision_hash,
          parent_artifact_hash: review.parent_artifact_hash,
          revision_hash: review.revision_hash,
          artifact_hash: review.artifact_hash,
          decided_at: '2026-09-04T09:15:01.000Z',
        },
        command: {
          id: decisionCommandId,
          job_id: review.job_id,
          platform: review.platform,
          kind: decisionCommandKind,
          status: 'queued',
          parent_revision_hash: review.parent_revision_hash,
          parent_artifact_hash: review.parent_artifact_hash,
          created_at: '2026-09-04T09:15:01.000Z',
        },
      },
    })
  })
  await page.route('**/api/video-studio/reviews/*', (route: Route) => route.fulfill({
    json: { ok: true, schema_version: 1, review },
  }))

  return { commands, decisions }
}

async function openReview(page: Page, review = cloneReview(), commandError?: string) {
  const captured = await installVideoStudioMock(page, review, commandError)
  await page.goto(`/#/content?video=${review.id}`)
  await expect(page.getByTestId('video-review-overlay')).toBeVisible()
  return { review, ...captured }
}

async function lockupGeometry(lockup: Locator) {
  return lockup.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const marks = [...node.querySelectorAll('img, svg')].map(mark => {
      const markRect = mark.getBoundingClientRect()
      return {
        left: markRect.left,
        right: markRect.right,
        top: markRect.top,
        bottom: markRect.bottom,
      }
    })
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      marks,
    }
  })
}

async function renderedSeriesMetrics(wordmark: Locator) {
  return wordmark.evaluate(async node => {
    const svg = node as SVGSVGElement
    const imageNode = svg.querySelector('image')
    const sourceHref = imageNode?.getAttribute('href') || ''
    const source = new Image()
    source.src = sourceHref
    await source.decode()

    const viewBox = svg.viewBox.baseVal
    // Find the wordmark independently from the crop under test. Both official
    // PNGs contain a symbol in an upper band and the full letter-bearing mark
    // in the bottom-most contiguous alpha band. Scanning the complete source
    // means a crop that already removed an outer letter cannot validate itself.
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = source.naturalWidth
    sourceCanvas.height = source.naturalHeight
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) throw new Error('source canvas unavailable')
    sourceContext.drawImage(source, 0, 0)
    const sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data
    const occupiedRows = new Array(sourceCanvas.height).fill(false) as boolean[]
    for (let index = 0; index < sourcePixels.length; index += 4) {
      if (sourcePixels[index + 3] < 1) continue
      occupiedRows[Math.floor(index / 4 / sourceCanvas.width)] = true
    }
    const rowBands: Array<{ start: number; end: number }> = []
    for (let y = 0; y < occupiedRows.length; y += 1) {
      if (!occupiedRows[y]) continue
      const start = y
      while (y + 1 < occupiedRows.length && occupiedRows[y + 1]) y += 1
      rowBands.push({ start, end: y })
    }
    const wordmarkBand = rowBands.at(-1)
    if (!wordmarkBand) throw new Error('official source has no letter-bearing band')
    let sourceMinX = sourceCanvas.width
    let sourceMaxX = -1
    for (let index = 0; index < sourcePixels.length; index += 4) {
      if (sourcePixels[index + 3] < 1) continue
      const pixelIndex = index / 4
      const x = pixelIndex % sourceCanvas.width
      const y = Math.floor(pixelIndex / sourceCanvas.width)
      if (y < wordmarkBand.start || y > wordmarkBand.end) continue
      sourceMinX = Math.min(sourceMinX, x)
      sourceMaxX = Math.max(sourceMaxX, x)
    }

    const markup = new XMLSerializer().serializeToString(svg)
    const objectUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
    const renderedImage = new Image()
    renderedImage.src = objectUrl
    await renderedImage.decode()
    const rect = svg.getBoundingClientRect()
    const scale = 8
    const renderedCanvas = document.createElement('canvas')
    renderedCanvas.width = Math.max(1, Math.round(rect.width * scale))
    renderedCanvas.height = Math.max(1, Math.round(rect.height * scale))
    const renderedContext = renderedCanvas.getContext('2d', { willReadFrequently: true })
    if (!renderedContext) throw new Error('rendered canvas unavailable')
    renderedContext.drawImage(renderedImage, 0, 0, renderedCanvas.width, renderedCanvas.height)
    URL.revokeObjectURL(objectUrl)

    const renderedPixels = renderedContext.getImageData(
      0,
      0,
      renderedCanvas.width,
      renderedCanvas.height,
    ).data
    const background = [9, 11, 15]
    const luminance = (channels: number[]) => {
      const linear = channels.map(value => {
        const normal = value / 255
        return normal <= 0.04045 ? normal / 12.92 : ((normal + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }
    const backgroundLuminance = luminance(background)
    let renderedMinX = renderedCanvas.width
    let renderedMinY = renderedCanvas.height
    let renderedMaxX = -1
    let renderedMaxY = -1
    let contrastPixels = 0
    let peakContrast = 0
    for (let index = 0; index < renderedPixels.length; index += 4) {
      const alpha = renderedPixels[index + 3] / 255
      if (alpha <= 0) continue
      const composite = [0, 1, 2].map(channel => (
        renderedPixels[index + channel] * alpha + background[channel] * (1 - alpha)
      ))
      const foregroundLuminance = luminance(composite)
      const contrast = (Math.max(backgroundLuminance, foregroundLuminance) + 0.05)
        / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05)
      peakContrast = Math.max(peakContrast, contrast)
      if (contrast < 4.5) continue
      const pixelIndex = index / 4
      const x = pixelIndex % renderedCanvas.width
      const y = Math.floor(pixelIndex / renderedCanvas.width)
      renderedMinX = Math.min(renderedMinX, x)
      renderedMaxX = Math.max(renderedMaxX, x)
      renderedMinY = Math.min(renderedMinY, y)
      renderedMaxY = Math.max(renderedMaxY, y)
      contrastPixels += 1
    }

    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      sourceWidth: source.naturalWidth,
      sourceHeight: source.naturalHeight,
      sourceCrop: [viewBox.x, viewBox.y, viewBox.width, viewBox.height],
      declaredLetterBox: (svg.dataset.sourceLetterBox || '').split(' ').map(Number),
      sourceInkBox: [
        sourceMinX,
        wordmarkBand.start,
        sourceMaxX - sourceMinX + 1,
        wordmarkBand.end - wordmarkBand.start + 1,
      ],
      cropAreaRatio: (viewBox.width * viewBox.height) / (source.naturalWidth * source.naturalHeight),
      inkWidth: renderedMaxX >= renderedMinX ? (renderedMaxX - renderedMinX + 1) / scale : 0,
      inkHeight: renderedMaxY >= renderedMinY ? (renderedMaxY - renderedMinY + 1) / scale : 0,
      contrastPixels,
      peakContrast,
      sourceHref,
    }
  })
}

async function expectContainedOfficialLockup(lockup: Locator, series: 'money_of_ai' | 'built_with_ai') {
  await expect(lockup).toHaveAttribute('data-official-asset-source', 'krishanraja/mindmake')
  expect(await lockup.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(9, 11, 15)')
  const geometry = await lockupGeometry(lockup)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5)
  expect(geometry.width).toBeLessThan(geometry.viewportWidth)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  expect(geometry.marks).toHaveLength(2)
  for (const mark of geometry.marks) {
    expect(mark.left).toBeGreaterThanOrEqual(geometry.left - 0.5)
    expect(mark.right).toBeLessThanOrEqual(geometry.right + 0.5)
    expect(mark.top).toBeGreaterThanOrEqual(geometry.top - 0.5)
    expect(mark.bottom).toBeLessThanOrEqual(geometry.bottom + 0.5)
  }
  expect(geometry.marks[0].right).toBeLessThan(geometry.marks[1].left)

  const wordmark = lockup.getByTestId(`video-series-wordmark-${series}`)
  await expect(wordmark).toHaveAttribute('data-min-letter-height', '16')
  const metrics = await renderedSeriesMetrics(wordmark)
  expect(metrics.sourceHref).toMatch(/^data:image\/png;base64,/)
  expect(metrics.sourceWidth).toBe(1200)
  expect(metrics.sourceHeight).toBe(630)
  expect(metrics.sourceInkBox).toEqual(metrics.declaredLetterBox)
  expect(metrics.sourceCrop).toEqual(metrics.declaredLetterBox)
  expect(metrics.cropAreaRatio).toBeLessThan(0.06)
  expect(metrics.cssHeight).toBeGreaterThanOrEqual(17.2)
  expect(metrics.inkHeight).toBeGreaterThanOrEqual(16)
  expect(metrics.inkWidth).toBeGreaterThan(145)
  expect(metrics.inkWidth).toBeGreaterThanOrEqual(metrics.cssWidth * 0.97)
  expect(metrics.contrastPixels).toBeGreaterThan(4_000)
  expect(metrics.peakContrast).toBeGreaterThanOrEqual(7)
  return { geometry, metrics }
}

async function expectNoGeometricOverlap(first: Locator, second: Locator) {
  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  const overlaps = Boolean(
    firstBox && secondBox
    && firstBox.x < secondBox.x + secondBox.width
    && firstBox.x + firstBox.width > secondBox.x
    && firstBox.y < secondBox.y + secondBox.height
    && firstBox.y + firstBox.height > secondBox.y,
  )
  expect(overlaps).toBe(false)
}

test.describe('Video Engine mobile reviewer', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('merges into Content Queue and opens a full-screen real preview', async ({ page }) => {
    const review = cloneReview()
    await installVideoStudioMock(page, review)
    await page.goto('/#/content')

    await expect(page.getByText('Proof lands sooner')).toBeVisible()
    await page.getByRole('button', { name: 'Open review' }).click()

    const overlay = page.getByTestId('video-review-overlay')
    await expect(overlay).toBeVisible()
    await expect(page.locator('nav.fixed.bottom-0')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create' })).toHaveCount(0)
    await expect(page.getByTestId('tab-chat-pill')).toHaveCount(0)
    await expect(page.getByLabel('Before edit preview for Proof lands sooner')).toHaveAttribute('src', `/api/video-studio/reviews/${review.id}/comparison/before`)
    await expect(page.getByLabel('After edit preview for Proof lands sooner')).toHaveAttribute('src', `/api/video-studio/reviews/${review.id}/comparison/after`)
    await expect(page.getByTestId('video-compare-before')).toBeVisible()
    await expect(page.getByTestId('video-compare-after')).toBeVisible()

    await page.getByTestId('video-gates-toggle').click()
    const gateList = page.getByTestId('video-blocking-gates')
    for (const label of ['Truth', 'Rights', 'Confidentiality', 'Transcript fidelity', 'Naming']) {
      await expect(gateList.getByText(label, { exact: true })).toBeVisible()
    }

    const box = await overlay.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(389)
    expect(box?.height).toBeGreaterThanOrEqual(843)
  })

  for (const series of ['money_of_ai', 'built_with_ai'] as const) {
    const label = series === 'money_of_ai' ? 'The Money of AI' : 'Built With AI'
    test(`${label} uses a contained high-contrast official wordmark in every responsive placement`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const review = cloneReview()
      review.series = series
      await installVideoStudioMock(page, review)
      await page.goto('/#/content')

      const cardLockup = page.getByTestId('video-brand-lockup-card')
      await expect(cardLockup).toHaveAttribute('aria-label', `${label} by Mindmake`)
      expect(await cardLockup.locator('img').getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
      await expectContainedOfficialLockup(cardLockup, series)

      await page.setViewportSize({ width: 390, height: 844 })
      await expectContainedOfficialLockup(cardLockup, series)
      await page.getByRole('button', { name: 'Open review' }).click()
      const headerLockup = page.getByTestId('video-brand-lockup-header')
      const previewLockup = page.getByTestId('video-brand-lockup-preview')
      await expectContainedOfficialLockup(headerLockup, series)
      await expectContainedOfficialLockup(previewLockup, series)

      const previewControls = page.getByTestId('video-preview-controls')
      await expectNoGeometricOverlap(previewControls, previewLockup)
      await page.screenshot({ path: testInfo.outputPath(`${series}-390.png`), fullPage: true })

      await page.setViewportSize({ width: 375, height: 667 })
      await expectContainedOfficialLockup(headerLockup, series)
      await expectContainedOfficialLockup(previewLockup, series)
      await expectNoGeometricOverlap(previewControls, previewLockup)

      await page.setViewportSize({ width: 375, height: 568 })
      const denseHeader = await expectContainedOfficialLockup(headerLockup, series)
      const densePreview = await expectContainedOfficialLockup(previewLockup, series)
      expect(denseHeader.metrics.inkHeight).toBeGreaterThanOrEqual(16)
      expect(densePreview.metrics.inkHeight).toBeGreaterThanOrEqual(16)
      await expectNoGeometricOverlap(previewControls, previewLockup)
      await page.screenshot({ path: testInfo.outputPath(`${series}-375-dense.png`), fullPage: true })

      await page.setViewportSize({ width: 1280, height: 800 })
      const desktopHeader = await expectContainedOfficialLockup(headerLockup, series)
      expect(desktopHeader.metrics.cssHeight).toBeGreaterThanOrEqual(18)
      expect(desktopHeader.metrics.inkHeight).toBeGreaterThanOrEqual(16)
    })
  }

  test('the actionable queue keeps a resolved failed decision discoverable as local sync attention', async ({ page }) => {
    const review = recoverableResolvedReview('approved')
    await installVideoStudioMock(page, review)
    const request = page.waitForRequest(value => {
      const url = new URL(value.url())
      return url.pathname === '/api/video-studio/reviews'
        && url.searchParams.get('status') === 'actionable'
        && url.searchParams.get('limit') === '20'
    })
    await page.goto('/#/content')
    await request

    await expect(page.getByText('Local sync attention', { exact: true })).toBeVisible()
    await expect(page.getByText(/accepted candidate is saved, but its local production-ledger sync needs attention/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open sync issue' })).toBeVisible()
  })

  test('an exact quarantine warning does not hide otherwise actionable reviews', async ({ page }) => {
    const review = cloneReview()
    await installVideoStudioMock(page, review)
    await page.route('**/api/video-studio/reviews?*', route => route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      reviews: [listItem(review)],
      warnings: [{ code: 'malformed_review_projection', count: 1 }],
      server_time: '2026-09-04T09:15:00.000Z',
    } }))
    await page.goto('/#/content')

    await expect(page.getByRole('heading', { name: review.safe_title, exact: true })).toBeVisible()
  })

  test('an invented quarantine warning field fails the actionable envelope closed', async ({ page }) => {
    const review = cloneReview()
    await installVideoStudioMock(page, review)
    await page.route('**/api/video-studio/reviews?*', route => route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      reviews: [listItem(review)],
      warnings: [{ code: 'malformed_review_projection', count: 1, hidden_ids: [review.id] }],
      server_time: '2026-09-04T09:15:00.000Z',
    } }))
    await page.goto('/#/content')

    await expect(page.getByText('Video reviews could not be checked')).toBeVisible()
    await expect(page.getByRole('heading', { name: review.safe_title, exact: true })).toHaveCount(0)
  })

  test('owns focus as a modal and Escape restores Content and its trigger', async ({ page }) => {
    const review = cloneReview()
    await installVideoStudioMock(page, review)
    await page.goto('/#/content')
    const trigger = page.getByRole('button', { name: 'Open review' })
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: `Video Engine review for ${review.safe_title}` })
    await expect(dialog).toBeVisible()
    await expect(page.locator('main')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('main')).toHaveAttribute('inert', '')
    await expect(page.getByRole('button', { name: 'Back to Content' })).toBeFocused()

    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/#\/content$/)
    await expect(page.locator('main')).not.toHaveAttribute('inert', '')
    await expect(trigger).toBeFocused()
  })

  test('keeps Keep and Use visible on a 375 by 667 screen and hides secondary direction', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await openReview(page)

    await expect(page.getByRole('button', { name: 'Keep current' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Use this version' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Direct another change' })).not.toBeVisible()
  })

  test('keeps the weekly anchor first, then ready video reviews, then other Content work', async ({ page }) => {
    const review = cloneReview()
    const decisions = [
      {
        id: 'content-later', kind: 'investigation', status: 'pending', week: '2026-W36', ref: 'later',
        created_at: '2026-09-04T08:00:00.000Z', payload: { anchor_headline: 'Later investigation' },
      },
      {
        id: 'content-brief', kind: 'brief_review', status: 'pending', week: '2026-W36', ref: 'brief',
        created_at: '2026-09-04T08:05:00.000Z', payload: { title: 'Weekly anchor' },
      },
    ]
    await installVideoStudioMock(page, review, undefined, decisions)
    await page.goto('/#/content')

    await expect(page.getByRole('heading', { name: 'Weekly anchor' })).toBeVisible()
    await page.getByRole('button', { name: 'Next card' }).click()
    await expect(page.getByRole('heading', { name: 'Proof lands sooner' })).toBeVisible()
    await page.getByRole('button', { name: 'Next card' }).click()
    await expect(page.getByRole('heading', { name: 'Investigation ready: Later investigation' })).toBeVisible()
  })

  test('reduced motion disables preview autoplay, preview fades and queue throws', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      ;(window as any).__videoPlayCalls = 0
      HTMLMediaElement.prototype.play = function () {
        ;(window as any).__videoPlayCalls += 1
        return Promise.resolve()
      }
      HTMLMediaElement.prototype.pause = function () {}
    })
    const review = cloneReview()
    const decisions = [{
      id: 'content-brief', kind: 'brief_review', status: 'pending', week: '2026-W36', ref: 'brief',
      created_at: '2026-09-04T08:05:00.000Z', payload: { title: 'Weekly anchor' },
    }]
    await installVideoStudioMock(page, review, undefined, decisions)
    await page.goto('/#/content')

    const card = page.getByTestId('mobile-decision-card')
    await expect(card).toHaveAttribute('style', /transform: none/)
    await expect(card).toHaveAttribute('style', /transition: none/)
    await page.getByRole('button', { name: 'Next card' }).click()
    await expect(page.getByRole('heading', { name: review.safe_title })).toBeVisible()
    await page.getByRole('button', { name: 'Open review' }).click()

    await expect(page.getByLabel(`Before edit preview for ${review.safe_title}`)).toHaveClass(/transition-none/)
    await expect(page.getByLabel(`After edit preview for ${review.safe_title}`)).toHaveClass(/transition-none/)
    expect(await page.evaluate(() => (window as any).__videoPlayCalls)).toBe(0)
  })

  test('a delayed review-list poll cannot overwrite a newer queue response', async ({ page }) => {
    const initial = cloneReview()
    await installVideoStudioMock(page, initial)
    await page.goto('/#/content')
    await expect(page.getByRole('heading', { name: initial.safe_title })).toBeVisible()

    await page.unroute('**/api/video-studio/reviews?*')
    const delayed = cloneReview()
    delayed.safe_title = 'Delayed old queue title'
    const newest = cloneReview()
    newest.safe_title = 'Newest queue title'
    let calls = 0
    let releaseDelayed: (() => void) | undefined
    await page.route('**/api/video-studio/reviews?*', async route => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>(resolve => { releaseDelayed = resolve })
        return route.fulfill({ json: { ok: true, schema_version: 1, reviews: [listItem(delayed)], server_time: '2026-09-04T09:15:30.000Z' } })
      }
      return route.fulfill({ json: { ok: true, schema_version: 1, reviews: [listItem(newest)], server_time: '2026-09-04T09:16:00.000Z' } })
    })

    await page.clock.runFor(30_100)
    await expect.poll(() => calls).toBe(1)
    await page.clock.runFor(30_100)
    await expect(page.getByRole('heading', { name: newest.safe_title, exact: true })).toBeVisible()
    releaseDelayed?.()
    await page.waitForTimeout(50)
    await expect(page.getByRole('heading', { name: newest.safe_title, exact: true })).toBeVisible()
  })

  test('sends one raw recipe with exact parent binding and no fake After', async ({ page }) => {
    const source = cloneReview()
    source.runner_state = 'offline'
    const { review, commands } = await openReview(page, source)
    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect.poll(() => commands.length).toBe(1)
    const request = commands[0]
    expect(request.csrf).toBe(videoStudioSessionFixture.csrf_token)
    expect(request.contentType).toContain('application/json')
    expect(request.body).toMatchObject({
      schema_version: 1,
      source_review_id: review.id,
      platform: 'youtube_shorts',
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      kind: 'magic_edit_prepare',
      intent: {
        instruction: 'Bring the strongest verified proof earlier without covering the speaker.',
        target: { kind: 'range', start_ms: 12_000, end_ms: 18_000 },
        semantic_target_map_hash: 'e'.repeat(64),
      },
    })
    expect(request.body.idempotency_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(request.body.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(request.body.intent.operations).toBeUndefined()
    await expect(page.getByText('Waiting for studio computer')).toBeVisible()
    await expect(page.getByTestId('video-compare-after')).toHaveCount(0)
  })

  test('follows the exact prepare command from immutable source review to child review', async ({ page }) => {
    const source = cloneReview()
    const child = assignReviewId(cloneReview(), '99999999-9999-4999-8999-999999999999')
    child.safe_title = 'Immutable child treatment'
    child.review_payload.change_title = child.safe_title
    child.revision_hash = '7'.repeat(64)
    child.artifact_hash = '8'.repeat(64)
    child.candidate_hash = '9'.repeat(64)
    const { commands } = await installVideoStudioMock(page, source)

    await page.route('**/api/video-studio/reviews/*', route => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({ json: { ok: true, schema_version: 1, review: id === child.id ? child : source } })
    })
    await page.route('**/api/video-studio/commands/*?*', route => {
      const body = commands.at(-1)?.body
      return route.fulfill({ json: {
        ok: true,
        schema_version: 1,
        command: {
          id: COMMAND_ID,
          job_id: source.job_id,
          platform: source.platform,
          kind: 'magic_edit_prepare',
          status: 'succeeded',
          parent_revision_hash: body?.parent_revision_hash,
          parent_artifact_hash: body?.parent_artifact_hash,
          source_review_id: source.id,
          result_review_id: child.id,
          safe_code: 'candidate_ready',
          created_at: '2026-09-04T09:15:01.000Z',
          completed_at: '2026-09-04T09:15:04.000Z',
          recovery: {
            available: false,
            of_command_id: null,
            current_generation: 0,
            max_generation: 3,
            recovery_review_id: null,
            recovered_review_id: null,
            binding_command: null,
          },
        },
        server_time: '2026-09-04T09:15:05.000Z',
      } })
    })
    await page.goto(`/#/content?video=${source.id}`)
    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect(page).toHaveURL(new RegExp(`video=${child.id}$`))
    await expect(page.getByRole('heading', { name: child.safe_title, exact: true })).toBeVisible()
    expect(commands).toHaveLength(1)
    expect(commands[0].body.source_review_id).toBe(source.id)
    expect(source.status).toBe('pending')
  })

  test('hard reload and a second-device readback resume the durable prepare and open its exact child', async ({ page }) => {
    const source = withPrepareCommand(cloneReview(), 'queued')
    source.runner_state = 'offline'
    const child = assignReviewId(cloneReview(), ALT_REVIEW_ID)
    child.safe_title = 'Durable child after reload'
    child.review_payload.change_title = child.safe_title
    let commandStatus: 'queued' | 'succeeded' = 'queued'
    await installVideoStudioMock(page, source)
    await page.route('**/api/video-studio/reviews/*', route => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({ json: { ok: true, schema_version: 1, review: id === child.id ? child : source } })
    })
    await page.route(`**/api/video-studio/commands/${COMMAND_ID}?*`, route => route.fulfill({
      json: prepareCommandReadback(source, COMMAND_ID, commandStatus, commandStatus === 'succeeded' ? child.id : null),
    }))
    await page.goto(`/#/content?video=${source.id}`)

    await expect(page.getByText('Waiting for studio computer')).toBeVisible()
    await expect(page.getByText(/^Direction:/)).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('The saved direction is queued safely. It will start when the Windows runner reconnects.')).toBeVisible()
    await expect(page.getByText(/^Direction:/)).toHaveCount(0)

    commandStatus = 'succeeded'
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page).toHaveURL(new RegExp(`video=${child.id}$`))
    await expect(page.getByRole('heading', { name: child.safe_title, exact: true })).toBeVisible()
  })

  test('a newer projected prepare beats a delayed browser-local command without opening the old child', async ({ page }) => {
    const source = cloneReview()
    const newer = withPrepareCommand(cloneReview(), 'queued', null, ALT_COMMAND_ID)
    newer.runner_state = 'queued'
    let projected = source
    let releaseOld: (() => void) | undefined
    const commandReads: string[] = []
    const { commands } = await installVideoStudioMock(page, source)
    await page.route(`**/api/video-studio/reviews/${source.id}`, route => route.fulfill({
      json: { ok: true, schema_version: 1, review: projected },
    }))
    await page.route('**/api/video-studio/commands/*?*', async route => {
      const commandId = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      commandReads.push(commandId)
      if (commandId === COMMAND_ID) {
        await new Promise<void>(resolve => { releaseOld = resolve })
        return route.fulfill({ json: prepareCommandReadback(source, COMMAND_ID, 'succeeded', RECOVERY_REVIEW_ID) })
      }
      return route.fulfill({ json: prepareCommandReadback(source, ALT_COMMAND_ID, 'queued') })
    })
    await page.goto(`/#/content?video=${source.id}`)
    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()
    await expect.poll(() => commands.length).toBe(1)
    await expect.poll(() => commandReads).toContain(COMMAND_ID)

    projected = newer
    await page.clock.runFor(8_100)
    await expect.poll(() => commandReads).toContain(ALT_COMMAND_ID)
    await expect(page.getByText(/^Direction:/)).toHaveCount(0)
    releaseOld?.()
    await page.waitForTimeout(100)
    expect(new URL(page.url()).hash).toContain(`video=${source.id}`)
    expect(new URL(page.url()).hash).not.toContain(RECOVERY_REVIEW_ID)
  })

  test('result-bound editorial attention opens the exact child route', async ({ page }) => {
    const source = withPrepareCommand(cloneReview(), 'attention', ALT_REVIEW_ID)
    const child = assignReviewId(cloneReview(), ALT_REVIEW_ID)
    child.route_state = 'requires_editorial_route'
    child.review_payload.editorial_note = 'Choose the proof beat manually.'
    await installVideoStudioMock(page, source)
    await page.route('**/api/video-studio/reviews/*', route => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({ json: { ok: true, schema_version: 1, review: id === child.id ? child : source } })
    })
    await page.goto(`/#/content?video=${source.id}`)

    await expect(page).toHaveURL(new RegExp(`video=${child.id}$`))
    await expect(page.getByTestId('video-editorial-route')).toBeVisible()
    await expect(page.getByText('Choose the proof beat manually.')).toBeVisible()
  })

  for (const [label, mutate] of [
    ['a malformed child UUID', (review: ReviewFixture) => {
      review.status = 'superseded'
      review.prepare_command = {
        ...withPrepareCommand(cloneReview(), 'succeeded', ALT_REVIEW_ID).prepare_command,
        result_review_id: 'not-a-review-id',
      }
    }],
    ['a child bound to a non-superseded source', (review: ReviewFixture) => {
      withPrepareCommand(review, 'succeeded', ALT_REVIEW_ID)
      review.status = 'pending'
    }],
  ] as const) {
    test(`prepare detail fails closed on ${label}`, async ({ page }) => {
      const review = cloneReview()
      mutate(review)
      await openReview(page, review)
      await expect(page.getByTestId('video-malformed-review')).toBeVisible()
      expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
    })
  }

  for (const status of ['failed', 'cancelled', 'attention'] as const) {
    test(`${status} prepare with no child preserves the review and allows a new direction`, async ({ page }) => {
      const review = withPrepareCommand(cloneReview(), status)
      await openReview(page, review)

      const prior = page.getByTestId('video-prior-prepare')
      await expect(prior).toHaveAttribute('role', 'status')
      await expect(prior).toContainText(`Previous direction ${status}`)
      await expect(prior).toContainText(review.prepare_command.id)
      await expect(page.getByRole('button', { name: 'Use this version' })).toBeEnabled()
      await page.getByRole('button', { name: 'Direct a new direction' }).click()
      await expect(page.getByRole('dialog', { name: 'Direct another video change' })).toBeVisible()
    })
  }

  test('a stopped durable prepare stays readable, touch-visible and named on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const review = withPrepareCommand(cloneReview(), 'attention')
    await openReview(page, review)

    const prior = page.getByTestId('video-prior-prepare')
    const action = page.getByRole('button', { name: 'Direct a new direction' })
    await expect(prior).toHaveAttribute('aria-live', 'polite')
    await expect(action).toBeInViewport()
    const box = await action.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    await action.focus()
    await expect(action).toBeFocused()
  })

  test('a terminal prepare leaves an audited path to direct a different change', async ({ page }) => {
    const source = cloneReview()
    const { commands } = await installVideoStudioMock(page, source)
    await page.route('**/api/video-studio/commands/*?*', route => {
      const body = commands.at(-1)?.body
      return route.fulfill({ json: {
        ok: true,
        schema_version: 1,
        command: {
          id: COMMAND_ID,
          job_id: source.job_id,
          platform: source.platform,
          kind: 'magic_edit_prepare',
          status: 'failed',
          parent_revision_hash: body?.parent_revision_hash,
          parent_artifact_hash: body?.parent_artifact_hash,
          source_review_id: source.id,
          result_review_id: null,
          safe_code: 'render_failed',
          created_at: '2026-09-04T09:15:01.000Z',
          completed_at: '2026-09-04T09:15:04.000Z',
          recovery: {
            available: false,
            of_command_id: null,
            current_generation: 0,
            max_generation: 3,
            recovery_review_id: null,
            recovered_review_id: null,
            binding_command: null,
          },
        },
        server_time: '2026-09-04T09:15:05.000Z',
      } })
    })
    await page.goto(`/#/content?video=${source.id}`)
    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect(page.getByRole('alert')).toContainText('runner needs attention')
    await page.getByRole('button', { name: 'Direct a different change' }).click()
    await expect(page.getByRole('dialog', { name: 'Direct another video change' })).toBeVisible()
    await expect(page.getByPlaceholder('Say or type what should change')).toHaveValue('Bring the strongest verified proof earlier without covering the speaker.')
  })

  test('a forged command readback cannot route the source review to a child', async ({ page }) => {
    const source = cloneReview()
    const childId = '99999999-9999-4999-8999-999999999999'
    await installVideoStudioMock(page, source)
    await page.route('**/api/video-studio/commands/*?*', route => route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      command: {
        id: COMMAND_ID,
        job_id: source.job_id,
        platform: source.platform,
        kind: 'magic_edit_prepare',
        status: 'succeeded',
        parent_revision_hash: 'f'.repeat(64),
        parent_artifact_hash: source.parent_artifact_hash,
        source_review_id: source.id,
        result_review_id: childId,
        safe_code: 'candidate_ready',
        created_at: '2026-09-04T09:15:01.000Z',
        completed_at: '2026-09-04T09:15:04.000Z',
        recovery: {
          available: false,
          of_command_id: null,
          current_generation: 0,
          max_generation: 3,
          recovery_review_id: null,
          recovered_review_id: null,
          binding_command: null,
        },
      },
      server_time: '2026-09-04T09:15:05.000Z',
    } }))
    await page.goto(`/#/content?video=${source.id}`)
    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect(page.getByRole('alert')).toContainText('exact edit status could not be read')
    await expect(page).toHaveURL(new RegExp(`video=${source.id}$`))
    await expect(page).not.toHaveURL(new RegExp(`video=${childId}$`))
  })

  for (const [label, recovery] of [
    ['missing recovery metadata', undefined],
    ['forged prepare recovery availability', {
      available: true,
      of_command_id: null,
      current_generation: 0,
      max_generation: 3,
      recovery_review_id: null,
      recovered_review_id: null,
      binding_command: null,
    }],
  ] as const) {
    test(`prepare readback fails closed on ${label}`, async ({ page }) => {
      const source = cloneReview()
      await installVideoStudioMock(page, source)
      await page.route('**/api/video-studio/commands/*?*', route => {
        const command: Record<string, unknown> = {
          id: COMMAND_ID,
          job_id: source.job_id,
          platform: source.platform,
          kind: 'magic_edit_prepare',
          status: 'queued',
          parent_revision_hash: source.parent_revision_hash,
          parent_artifact_hash: source.parent_artifact_hash,
          source_review_id: source.id,
          result_review_id: null,
          safe_code: null,
          created_at: '2026-09-04T09:15:01.000Z',
          completed_at: null,
        }
        if (recovery !== undefined) command.recovery = recovery
        return route.fulfill({ json: {
          ok: true,
          schema_version: 1,
          command,
          server_time: '2026-09-04T09:15:02.000Z',
        } })
      })
      await page.goto(`/#/content?video=${source.id}`)
      await page.getByRole('button', { name: 'Direct another change' }).click()
      await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
      await page.getByRole('button', { name: 'Send direction' }).click()

      await expect(page.getByRole('alert')).toContainText('exact edit status could not be read')
      expect(new URL(page.url()).hash).toContain(`video=${source.id}`)
    })
  }

  test('rejects a forged direct-edit 2xx before showing queued success', async ({ page }) => {
    const { review } = await openReview(page)
    await page.route('**/api/video-studio/jobs/*/commands', async route => {
      const body = route.request().postDataJSON() as Record<string, any>
      return route.fulfill({
        status: 202,
        json: {
          ok: true,
          schema_version: 1,
          duplicate: false,
          result_action: 'edit_queued',
          command: {
            id: '66666666-6666-4666-8666-666666666666',
            job_id: 'different-job',
            platform: review.platform,
            kind: body.kind,
            status: 'queued',
            parent_revision_hash: body.parent_revision_hash,
            parent_artifact_hash: body.parent_artifact_hash,
            source_review_id: body.source_review_id,
            created_at: '2026-09-04T09:15:01.000Z',
          },
        },
      })
    })

    await page.getByRole('button', { name: 'Direct another change' }).click()
    await page.getByRole('button', { name: 'Choose Proof sooner' }).click()
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect(page.getByRole('alert')).toContainText('did not match the exact requested video version')
    await expect(page.getByText('Waiting for studio computer')).toHaveCount(0)
  })

  for (const [status, commandStatus, heading, kind] of [
    ['approved', 'queued', 'Candidate accepted', 'magic_edit_activate'],
    ['rejected', 'leased', 'Current version kept', 'review_decision_record'],
  ] as const) {
    test(`${status} review exposes its exact ${commandStatus} ledger command`, async ({ page }) => {
      const review = resolveReview(cloneReview(), status, commandStatus)
      review.decision_command.safe_code = commandStatus === 'leased' ? 'lease_active' : null
      await openReview(page, review)

      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.getByText('Your decision is saved, but the local production ledger is still waiting for the studio computer to sync.')).toBeVisible()
      const sync = page.getByTestId('video-decision-sync')
      await expect(sync).toHaveAttribute('role', 'status')
      await expect(sync).toContainText(review.decision_command.id)
      await expect(sync).toContainText(kind)
      await expect(sync).toContainText(commandStatus)
      await expect(sync).toContainText(review.decision_command.safe_code || 'none')
    })
  }

  test('a lost recovery response reuses the exact submission and opens only after signed binding succeeds', async ({ page }) => {
    const review = recoverableResolvedReview('approved')
    const child = assignReviewId(cloneReview(), RECOVERY_REVIEW_ID)
    child.recovery = {
      available: false,
      of_command_id: review.decision_command.id,
      current_generation: 1,
      max_generation: 3,
      recovery_review_id: null,
      recovered_review_id: null,
      binding_command: null,
    }
    const requests: CapturedRequest[] = []
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/reviews/${RECOVERY_REVIEW_ID}`, route => route.fulfill({
      json: { ok: true, schema_version: 1, review: child },
    }))
    let attempts = 0
    let bindingStatus: 'queued' | 'succeeded' = 'queued'
    await page.route(`**/api/video-studio/commands/${review.decision_command.id}/recover`, async route => {
      const request = route.request()
      const body = request.postDataJSON() as Record<string, any>
      requests.push({
        body,
        csrf: request.headers()['x-video-studio-csrf'] || null,
        contentType: request.headers()['content-type'] || null,
      })
      attempts += 1
      if (attempts === 1) return route.abort('failed')
      return route.fulfill({
        status: 200,
        json: recoveryBindingResponse(review, 'queued', true),
      })
    })
    await page.route(`**/api/video-studio/commands/${RECOVERY_BINDING_ID}?*`, route => route.fulfill({
      json: recoveryCommandReadback(
        review,
        bindingStatus,
        bindingStatus === 'succeeded' ? RECOVERY_REVIEW_ID : null,
      ),
    }))
    await page.goto(`/#/content?video=${review.id}`)

    const create = page.getByRole('button', { name: 'Create fresh review' })
    await create.click()
    await expect(page.getByRole('alert')).toContainText('could not be confirmed')
    await create.click()

    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1].csrf).toBe(videoStudioSessionFixture.csrf_token)
    expect(requests[1].body).toEqual(requests[0].body)
    expect(requests[0].body).toEqual({
      schema_version: 1,
      idempotency_key: requests[0].body.idempotency_key,
      submitted_at: requests[0].body.submitted_at,
      job_id: review.job_id,
      platform: review.platform,
      parent_revision_hash: review.decision_command.parent_revision_hash,
      parent_artifact_hash: review.decision_command.parent_artifact_hash,
    })
    await expect(page.getByText('A fresh review has been reserved, but it will stay hidden until the studio computer signs its exact local ledger binding.')).toBeVisible()
    await expect(page.getByTestId('video-recovery-binding')).toContainText(RECOVERY_BINDING_ID)
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)

    bindingStatus = 'succeeded'
    await page.getByRole('button', { name: 'Refresh fresh review binding status' }).click()
    await expect.poll(() => new URL(page.url()).hash).toContain(`video=${RECOVERY_REVIEW_ID}`)
    await expect(page.getByRole('heading', { name: child.safe_title, exact: true })).toBeVisible()
  })

  test('a forged recovery 2xx cannot route to a replacement review', async ({ page }) => {
    const review = recoverableResolvedReview('rejected', 'attention')
    await openReview(page, review)
    await page.route(`**/api/video-studio/commands/${review.decision_command.id}/recover`, async route => {
      const body = route.request().postDataJSON() as Record<string, any>
      return route.fulfill({
        status: 202,
        json: {
          ...recoveryBindingResponse(review),
          command: {
            ...recoveryBindingResponse(review).command,
            platform: 'linkedin',
            parent_revision_hash: body.parent_revision_hash,
            parent_artifact_hash: body.parent_artifact_hash,
          },
        },
      })
    })

    await page.getByRole('button', { name: 'Create fresh review' }).click()
    await expect(page.getByRole('alert')).toContainText('did not match the exact failed decision command and parent version')
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
  })

  test('hard reload and a second device resume the projected recovery binding before opening its child', async ({ page }) => {
    const review = withRecoveryBinding(recoverableResolvedReview('rejected'), 'queued')
    const child = assignReviewId(cloneReview(), RECOVERY_REVIEW_ID)
    child.recovery = {
      available: false,
      of_command_id: review.decision_command.id,
      current_generation: 1,
      max_generation: 3,
      recovery_review_id: null,
      recovered_review_id: null,
      binding_command: null,
    }
    let bindingStatus: 'queued' | 'succeeded' = 'queued'
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/reviews/${RECOVERY_REVIEW_ID}`, route => route.fulfill({
      json: { ok: true, schema_version: 1, review: child },
    }))
    await page.route(`**/api/video-studio/commands/${RECOVERY_BINDING_ID}?*`, route => route.fulfill({
      json: recoveryCommandReadback(
        review,
        bindingStatus,
        bindingStatus === 'succeeded' ? RECOVERY_REVIEW_ID : null,
      ),
    }))
    await page.goto(`/#/content?video=${review.id}`)

    await expect(page.getByText('A fresh review has been reserved, but it will stay hidden until the studio computer signs its exact local ledger binding.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create fresh review' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('video-recovery-binding')).toContainText('queued')
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)

    bindingStatus = 'succeeded'
    await page.getByRole('button', { name: 'Refresh fresh review binding status' }).click()
    await expect.poll(() => new URL(page.url()).hash).toContain(`video=${RECOVERY_REVIEW_ID}`)
    await expect(page.getByRole('heading', { name: child.safe_title, exact: true })).toBeVisible()
  })

  test('a malformed signed-child readback cannot open an unbound replacement', async ({ page }) => {
    const review = withRecoveryBinding(recoverableResolvedReview('approved'), 'queued')
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/commands/${RECOVERY_BINDING_ID}?*`, route => {
      const forged = recoveryCommandReadback(review, 'succeeded', RECOVERY_REVIEW_ID)
      forged.command.result_review_id = 'not-a-review-id'
      return route.fulfill({ json: forged })
    })
    await page.goto(`/#/content?video=${review.id}`)

    await expect(page.getByTestId('video-recovery-binding')).toContainText(RECOVERY_BINDING_ID)
    await expect(page.getByRole('alert')).toContainText('The exact binding status could not be read')
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
  })

  test('a valid but wrong signed child fails closed after reload', async ({ page }) => {
    const review = withRecoveryBinding(recoverableResolvedReview('approved'), 'queued')
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/commands/${RECOVERY_BINDING_ID}?*`, route => route.fulfill({
      json: recoveryCommandReadback(review, 'succeeded', ALT_REVIEW_ID),
    }))
    await page.goto(`/#/content?video=${review.id}`)
    await page.reload()

    await expect(page.getByTestId('video-recovery-binding')).toContainText(RECOVERY_BINDING_ID)
    await expect(page.getByRole('alert')).toContainText('The exact binding status could not be read')
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
    expect(new URL(page.url()).hash).not.toContain(`video=${ALT_REVIEW_ID}`)
  })

  for (const [label, makeReview] of [
    ['queued binding without its reserved child identity', () => {
      const review = withRecoveryBinding(recoverableResolvedReview('approved'), 'queued')
      review.recovery.recovery_review_id = null
      return review
    }],
    ['queued binding that exposes a child early', () => {
      const review = withRecoveryBinding(recoverableResolvedReview('approved'), 'queued')
      review.recovery.binding_command.result_review_id = RECOVERY_REVIEW_ID
      return review
    }],
    ['succeeded binding whose child differs from the recovery lineage', () => {
      const review = withRecoveryBinding(recoverableResolvedReview('rejected'), 'succeeded', RECOVERY_REVIEW_ID)
      review.recovery.binding_command.result_review_id = ALT_REVIEW_ID
      return review
    }],
    ['binding attributed to a competing source review', () => {
      const review = withRecoveryBinding(recoverableResolvedReview('approved'), 'queued')
      review.recovery.binding_command.source_review_id = ALT_REVIEW_ID
      return review
    }],
    ['generation zero that claims a parent command', () => {
      const review = recoverableResolvedReview('approved')
      review.recovery.of_command_id = COMMAND_ID
      return review
    }],
    ['attention recovery exposed for an unsafe code', () => {
      const review = recoverableResolvedReview('rejected', 'attention')
      review.decision_command.safe_code = 'lease_expired'
      return review
    }],
  ] as const) {
    test(`recovery detail fails closed on ${label}`, async ({ page }) => {
      const review = makeReview()
      await openReview(page, review)
      await expect(page.getByTestId('video-malformed-review')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create fresh review' })).toHaveCount(0)
      expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
    })
  }

  test('a competing recovery source identity fails closed and never navigates', async ({ page }) => {
    const review = withRecoveryBinding(recoverableResolvedReview('rejected'), 'queued')
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/commands/${RECOVERY_BINDING_ID}?*`, route => {
      const forged = recoveryCommandReadback(review, 'succeeded', RECOVERY_REVIEW_ID)
      forged.command.source_review_id = ALT_REVIEW_ID
      return route.fulfill({ json: forged })
    })
    await page.goto(`/#/content?video=${review.id}`)

    await expect(page.getByRole('alert')).toContainText('The exact binding status could not be read')
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
  })

  test('stale-parent recovery creates nothing, refreshes, and stays on the immutable source review', async ({ page }) => {
    const review = recoverableResolvedReview('approved', 'attention')
    let detailReads = 0
    await installVideoStudioMock(page, review)
    await page.route(`**/api/video-studio/reviews/${review.id}`, route => {
      detailReads += 1
      return route.fulfill({ json: { ok: true, schema_version: 1, review } })
    })
    await page.route(`**/api/video-studio/commands/${review.decision_command.id}/recover`, route => route.fulfill({
      status: 409,
      json: { ok: false, error: { code: 'stale_parent' } },
    }))
    await page.goto(`/#/content?video=${review.id}`)
    await expect.poll(() => detailReads).toBeGreaterThanOrEqual(1)

    await page.getByRole('button', { name: 'Create fresh review' }).click()
    await expect(page.getByRole('alert')).toContainText('A newer parent version exists. No recovery binding was requested')
    await expect.poll(() => detailReads).toBeGreaterThanOrEqual(2)
    expect(new URL(page.url()).hash).toContain(`video=${review.id}`)
  })

  test('a third-generation failure exposes the immutable command but no further recovery action', async ({ page }) => {
    const review = recoverableResolvedReview('rejected', 'failed', 3)
    await openReview(page, review)

    await expect(page.getByTestId('video-decision-sync')).toContainText('attempts_exhausted')
    await expect(page.getByText('Fresh-review recovery has reached its three-generation safety limit.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create fresh review' })).toHaveCount(0)
  })

  test('recovery remains touch-visible and named on a 375 by 667 phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const review = recoverableResolvedReview('rejected', 'attention')
    await openReview(page, review)

    const sync = page.getByTestId('video-decision-sync')
    const action = page.getByRole('button', { name: 'Create fresh review' })
    await expect(sync).toBeVisible()
    await expect(sync).toHaveAttribute('aria-live', 'polite')
    await expect(action).toBeVisible()
    const box = await action.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.y || 0) + (box?.height || 0)).toBeLessThanOrEqual(667)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })

  test('blocked gates prevent activation but keep the safe current version available', async ({ page }) => {
    const review = cloneReview()
    review.review_payload.blocking_gates.truth.status = 'blocked'
    await openReview(page, review)

    await expect(page.getByRole('button', { name: 'Use this version' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Keep current' })).toBeEnabled()
    await expect(page.getByText('Every blocking check must pass before a candidate can be used.')).toBeVisible()
  })

  test('uses the candidate through an exact review decision', async ({ page }) => {
    const { review, decisions } = await openReview(page)
    await page.getByRole('button', { name: 'Use this version' }).click()

    await expect.poll(() => decisions.length).toBe(1)
    expect(decisions[0].csrf).toBe(videoStudioSessionFixture.csrf_token)
    expect(decisions[0].body).toEqual({
      schema_version: 1,
      idempotency_key: decisions[0].body.idempotency_key,
      submitted_at: decisions[0].body.submitted_at,
      revision_hash: review.revision_hash,
      parent_revision_hash: review.parent_revision_hash,
      parent_artifact_hash: review.parent_artifact_hash,
      artifact_hash: review.artifact_hash,
      decision: 'use_candidate',
    })
    expect(decisions[0].body.idempotency_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(decisions[0].body.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    await expect(page.getByText('Your decision is saved, but the local production ledger is still waiting for the studio computer to sync.')).toBeVisible()
  })

  for (const [button, decision, confirmation] of [
    ['Confirm learning', 'use_candidate', { action: 'confirm' }],
    ['Observe only', 'keep_current', { action: 'observe_only' }],
  ] as const) {
    test(`${button} records an explicit learning disposition`, async ({ page }) => {
      const review = cloneReview()
      review.gate = 'learning'
      review.editorial_state = 'needs_learning_confirmation'
      review.queues_activation = false
      const { decisions } = await openReview(page, review)

      await page.getByRole('button', { name: button }).click()
      await expect.poll(() => decisions.length).toBe(1)
      expect(decisions[0].body).toMatchObject({ decision, learning_confirmation: confirmation })
      expect(decisions[0].body.learning_confirmation).toEqual(confirmation)
    })
  }

  test('corrects an inferred learning before accepting it', async ({ page }) => {
    const review = cloneReview()
    review.gate = 'learning'
    review.editorial_state = 'needs_learning_confirmation'
    review.queues_activation = false
    const { decisions } = await openReview(page, review)

    await page.getByRole('button', { name: 'Correct the wording' }).click()
    await page.getByLabel('Correct the inferred learning').fill('Show evidence before explaining the mechanism.')
    await page.getByRole('button', { name: 'Use correction' }).click()
    await expect.poll(() => decisions.length).toBe(1)
    expect(decisions[0].body).toMatchObject({
      decision: 'use_candidate',
      learning_confirmation: {
        action: 'correct',
        correction: 'Show evidence before explaining the mechanism.',
      },
    })
  })

  test('rejects a forged decision 2xx with the wrong candidate artifact', async ({ page }) => {
    const { review } = await openReview(page)
    await page.route('**/api/video-studio/reviews/*/decision', async route => {
      const body = route.request().postDataJSON() as Record<string, any>
      return route.fulfill({
        status: 202,
        json: {
          ok: true,
          schema_version: 1,
          duplicate: false,
          result_action: body.decision,
          review: {
            id: review.id,
            job_id: review.job_id,
            platform: review.platform,
            status: 'approved',
            parent_revision_hash: review.parent_revision_hash,
            parent_artifact_hash: review.parent_artifact_hash,
            revision_hash: review.revision_hash,
            artifact_hash: 'f'.repeat(64),
            decided_at: '2026-09-04T09:15:01.000Z',
          },
          command: {
            id: '77777777-7777-4777-8777-777777777777',
            job_id: review.job_id,
            platform: review.platform,
            kind: 'magic_edit_activate',
            status: 'queued',
            parent_revision_hash: review.parent_revision_hash,
            parent_artifact_hash: review.parent_artifact_hash,
            created_at: '2026-09-04T09:15:01.000Z',
          },
        },
      })
    })

    await page.getByRole('button', { name: 'Use this version' }).click()
    await expect(page.getByText('The review receipt did not match the exact candidate and job that were decided.')).toBeVisible()
    await expect(page.getByText('Activation queued safely')).toHaveCount(0)
  })

  test('unknown gate projection fails closed', async ({ page }) => {
    const malformed = cloneReview()
    delete malformed.review_payload.blocking_gates.naming
    await openReview(page, malformed)
    await expect(page.getByTestId('video-malformed-review')).toBeVisible()
    await expect(page.getByText('This review projection is incomplete')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use this version' })).toHaveCount(0)
  })

  test('unknown platform projection fails closed', async ({ page }) => {
    const malformed = cloneReview()
    malformed.platform = 'shorts'
    await openReview(page, malformed)
    await expect(page.getByTestId('video-malformed-review')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'This review projection is incomplete' })).toBeVisible()
  })

  test('a timing-less moment target fails closed instead of inventing zero', async ({ page }) => {
    const malformed = cloneReview()
    malformed.review_payload.target = { kind: 'moment' }
    await openReview(page, malformed)
    await expect(page.getByTestId('video-malformed-review')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Direct another change' })).toHaveCount(0)
  })

  for (const [label, target] of [
    ['moment with an incompatible ref', { kind: 'moment', start_ms: 1_000, ref: 'speaker_1' }],
    ['range with an incompatible ref', { kind: 'range', start_ms: 1_000, end_ms: 2_000, ref: 'beat_1' }],
  ] as const) {
    test(`an exact target rejects ${label}`, async ({ page }) => {
      const malformed = cloneReview()
      malformed.review_payload.target = target
      await openReview(page, malformed)
      await expect(page.getByTestId('video-malformed-review')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Use this version' })).toHaveCount(0)
    })
  }

  for (const [label, mutate] of [
    ['an empty safe title', (review: ReviewFixture) => { review.safe_title = '' }],
    ['an empty safe summary', (review: ReviewFixture) => { review.safe_summary = '' }],
    ['an invalid creation timestamp', (review: ReviewFixture) => { review.created_at = 'not-a-date' }],
    ['an invalid expiry timestamp', (review: ReviewFixture) => { review.expires_at = 'tomorrow-ish' }],
    ['an unrelated same-origin preview proxy', (review: ReviewFixture) => {
      review.preview.url = '/api/video-studio/session'
      review.comparison.after.url = '/api/video-studio/session'
    }],
    ['an inconsistent comparison state', (review: ReviewFixture) => { review.comparison.state = 'processing' }],
  ] as const) {
    test(`the whole review projection rejects ${label}`, async ({ page }) => {
      const malformed = cloneReview()
      mutate(malformed)
      await openReview(page, malformed)
      await expect(page.getByTestId('video-malformed-review')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Use this version' })).toHaveCount(0)
    })
  }

  for (const [label, mutate] of [
    ['a non-UUID review id', (review: ReviewFixture) => { review.id = 'review-1' }],
    ['an uppercase content hash', (review: ReviewFixture) => { review.revision_hash = 'A'.repeat(64) }],
  ] as const) {
    test(`the secure projection rejects ${label}`, async ({ page }) => {
      const malformed = cloneReview()
      mutate(malformed)
      await openReview(page, malformed)
      await expect(page.getByTestId('video-malformed-review')).toBeVisible()
    })
  }

  test('a malformed review-list envelope cannot masquerade as an empty queue', async ({ page }) => {
    const review = cloneReview()
    await installVideoStudioMock(page, review)
    await page.route('**/api/video-studio/reviews?*', route => route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      reviews: [],
      server_time: 'not-a-time',
      unexpected: true,
    } }))
    await page.goto('/#/content')
    await expect(page.getByText('Video reviews could not be checked', { exact: true })).toBeVisible()
  })

  test('a malformed review row stays visible but cannot launch a decision', async ({ page }) => {
    const malformed = cloneReview()
    malformed.safe_title = ''
    await installVideoStudioMock(page, malformed)
    await page.goto('/#/content')

    await expect(page.getByRole('heading', { name: 'Video review needs repair' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review blocked' })).toBeDisabled()
    await expect(page.getByText('Decision blocked', { exact: true })).toBeVisible()
  })

  test('a delayed detail poll cannot regress a newer reviewed candidate', async ({ page }) => {
    const initial = cloneReview()
    initial.runner_state = 'working'
    await openReview(page, initial)
    await page.unroute('**/api/video-studio/reviews/*')
    const delayed = cloneReview()
    delayed.runner_state = 'working'
    delayed.safe_title = 'Delayed old candidate'
    delayed.review_payload.change_title = 'Delayed old candidate'
    const newest = cloneReview()
    newest.runner_state = 'working'
    newest.safe_title = 'Newest candidate'
    newest.review_payload.change_title = 'Newest candidate'
    newest.revision_hash = 'f'.repeat(64)
    newest.artifact_hash = '9'.repeat(64)
    let calls = 0
    let releaseDelayed: (() => void) | undefined
    await page.route('**/api/video-studio/reviews/*', async route => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>(resolve => { releaseDelayed = resolve })
        return route.fulfill({ json: { ok: true, schema_version: 1, review: delayed } })
      }
      return route.fulfill({ json: { ok: true, schema_version: 1, review: newest } })
    })

    await page.clock.runFor(8_100)
    await expect.poll(() => calls).toBe(1)
    await page.clock.runFor(8_100)
    await expect(page.getByRole('heading', { name: newest.safe_title, exact: true })).toBeVisible()
    releaseDelayed?.()
    await page.waitForTimeout(50)
    await expect(page.getByRole('heading', { name: newest.safe_title, exact: true })).toBeVisible()
  })

  test('editorial routing stops without inventing a treatment', async ({ page }) => {
    const editorial = cloneReview()
    editorial.route_state = 'requires_editorial_route'
    await openReview(page, editorial)
    await expect(page.getByTestId('video-editorial-route')).toBeVisible()
    await expect(page.getByText('No automatic treatment has been presented as a finished answer.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep current' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Direct it' })).toBeVisible()
  })

  test('stale command keeps the typed direction and offers refresh', async ({ page }) => {
    const { commands } = await openReview(page, cloneReview(), 'stale_parent')
    await page.getByRole('button', { name: 'Direct another change' }).click()
    const field = page.getByPlaceholder('Say or type what should change')
    await field.fill('Hold the evidence until my hand leaves the frame.')
    await page.getByRole('button', { name: 'Send direction' }).click()

    await expect(page.getByText('A newer version exists. Your direction is still here. Refresh the review before sending it.')).toBeVisible()
    await expect(field).toHaveValue('Hold the evidence until my hand leaves the frame.')
    await expect(page.getByRole('button', { name: 'Refresh this review' })).toBeVisible()
    await page.getByRole('button', { name: 'Send direction' }).click()
    await expect.poll(() => commands.length).toBe(2)
    expect(commands[1].body.idempotency_key).toBe(commands[0].body.idempotency_key)
    expect(commands[1].body.submitted_at).toBe(commands[0].body.submitted_at)
  })

  test('queues Return using a fresh post-activation revision while the runner is offline', async ({ page }) => {
    const review = resolveReview(cloneReview(), 'approved')
    review.runner_state = 'offline'
    const { commands } = await installVideoStudioMock(page, review)
    const activatedRevision = '1'.repeat(64)
    await page.route('**/api/video-studio/jobs/*/active?*', route => route.fulfill({ json: {
      ok: true,
      schema_version: 1,
      job: {
        job_id: review.job_id,
        platform: review.platform,
        active_revision_hash: activatedRevision,
        active_artifact_hash: review.artifact_hash,
        active_candidate_hash: review.candidate_hash,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        updated_at: '2026-09-04T09:15:00.000Z',
      },
      server_time: '2026-09-04T09:15:00.000Z',
    } }))
    await page.goto(`/#/content?video=${review.id}`)
    await expect(page.getByTestId('video-review-overlay')).toBeVisible()

    const button = page.getByRole('button', { name: 'Return to parent version' })
    await expect(button).toBeEnabled()
    await button.click()
    await expect.poll(() => commands.length).toBe(1)
    expect(commands[0].body).toMatchObject({
      schema_version: 1,
      platform: 'youtube_shorts',
      parent_revision_hash: activatedRevision,
      parent_artifact_hash: review.artifact_hash,
      kind: 'magic_edit_return_to_parent',
      intent: {
        target_parent_revision_hash: review.parent_revision_hash,
        target_parent_artifact_hash: review.parent_artifact_hash,
      },
    })
    await expect(page.getByText('Return queued safely. The active version will change only after server readback.')).toBeVisible()
  })

  test('rejects a forged Return 2xx with a different platform', async ({ page }) => {
    const review = resolveReview(cloneReview(), 'approved')
    review.runner_state = 'offline'
    await openReview(page, review)
    const returnButton = page.getByRole('button', { name: 'Return to parent version' })
    await expect(returnButton).toBeEnabled()
    await page.route('**/api/video-studio/jobs/*/commands', async route => {
      const body = route.request().postDataJSON() as Record<string, any>
      return route.fulfill({
        status: 202,
        json: {
          ok: true,
          schema_version: 1,
          duplicate: false,
          result_action: 'return_to_parent_queued',
          command: {
            id: '88888888-8888-4888-8888-888888888888',
            job_id: review.job_id,
            platform: 'linkedin',
            kind: body.kind,
            status: 'queued',
            parent_revision_hash: body.parent_revision_hash,
            parent_artifact_hash: body.parent_artifact_hash,
            source_review_id: null,
            created_at: '2026-09-04T09:15:01.000Z',
          },
        },
      })
    })

    await returnButton.click()
    await expect(page.getByRole('alert')).toContainText('did not match the exact requested video version')
    await expect(page.getByText('Return queued safely')).toHaveCount(0)
  })

  test('a delayed active-version poll cannot re-enable Return after newer readback', async ({ page }) => {
    const review = resolveReview(cloneReview(), 'approved')
    await openReview(page, review)
    const returnButton = page.getByRole('button', { name: 'Return to parent version' })
    await expect(returnButton).toBeEnabled()
    await page.unroute('**/api/video-studio/jobs/*/active?*')
    let calls = 0
    let releaseDelayed: (() => void) | undefined
    const response = (activeRevision: string, activeArtifact: string) => ({
      ok: true,
      schema_version: 1,
      job: {
        job_id: review.job_id,
        platform: review.platform,
        active_revision_hash: activeRevision,
        active_artifact_hash: activeArtifact,
        active_candidate_hash: activeArtifact,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        updated_at: '2026-09-04T09:16:00.000Z',
      },
      server_time: '2026-09-04T09:16:00.000Z',
    })
    await page.route('**/api/video-studio/jobs/*/active?*', async route => {
      calls += 1
      if (calls === 1) {
        await new Promise<void>(resolve => { releaseDelayed = resolve })
        return route.fulfill({ json: response(review.revision_hash, review.artifact_hash) })
      }
      return route.fulfill({ json: response('f'.repeat(64), '9'.repeat(64)) })
    })

    await page.clock.runFor(8_100)
    await expect.poll(() => calls).toBe(1)
    await page.clock.runFor(8_100)
    await expect(returnButton).toBeDisabled()
    releaseDelayed?.()
    await page.waitForTimeout(50)
    await expect(returnButton).toBeDisabled()
  })
})
