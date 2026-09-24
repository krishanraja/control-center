import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAxes, clamp, WEIGHTS, NAMED_ATTENDEE_BONUS_CAP, SCORE_VERSION } from '../../api/_eventScore.js'

// The attend lane was re-pointed on 2026-09-24. These tests are the acceptance
// criteria for Krish's actual complaint, written as arithmetic so a future weight
// change cannot quietly undo it:
//
//   "the events I should be attending are not very well researched, do not change
//    based on my city and are stale - and I want to meet successful entrepreneurs
//    and those running successful businesses, not AI developers or adtech people"
//
// The density figures below are the ones the rubric in api/_eventScore.ts asks a
// judge to produce for these real rows, which were the live top of the lane when
// he complained. What is under test is the MATH: given an honest read of the
// room, does the ordering come out the way he asked. The model's own judgement is
// tested by running it, not here.

/** London PyTorch #28 — the room the old Draw definition promoted. */
const PYTORCH = { peer_density: 5, buyer_density: 5, practitioner_density: 95, vendor_density: 10, seniority: 25 }
/** AWS AI In Practice #7 — a cloud vendor's free practitioner evening. */
const AWS_PRACTICE = { peer_density: 8, buyer_density: 20, practitioner_density: 85, vendor_density: 70, seniority: 30 }
/** The Harness Engineering & Model Wrangling Hackathon. */
const HACKATHON = { peer_density: 10, buyer_density: 5, practitioner_density: 98, vendor_density: 15, seniority: 20 }
/** Retail Media Leadership Summit — adtech, but a room of CMOs and P&L owners. */
const RETAIL_MEDIA = { peer_density: 30, buyer_density: 80, practitioner_density: 10, vendor_density: 45, seniority: 80 }
/** Entrepreneurs Organization — members must run a business over $1m revenue. */
const EO = { peer_density: 92, buyer_density: 45, practitioner_density: 5, vendor_density: 10, seniority: 85 }
/** A paid general mixer advertising "founders and investors" with no bar. */
const GENERIC_MIXER = { peer_density: 45, buyer_density: 35, practitioner_density: 15, vendor_density: 40, seniority: 40 }

function draw(e: Parameters<typeof computeAxes>[0]) { return computeAxes(e).draw_score }
function demand(e: Parameters<typeof computeAxes>[0]) { return computeAxes(e).demand_score }
function rank(e: Parameters<typeof computeAxes>[0]) {
  const { draw_score, demand_score } = computeAxes(e)
  return draw_score * 0.55 + demand_score * 0.45
}

test('a room of founders beats a room of developers, which is the whole point', () => {
  // This assertion is the inversion. Under the old definition of Draw
  // ("technical-leader density, where Krish wants to be") PyTorch scored ABOVE
  // the owner-managed rooms, and that is why the lane read the way it did.
  assert.ok(draw(EO) > draw(PYTORCH), `EO ${draw(EO)} should beat PyTorch ${draw(PYTORCH)}`)
  assert.ok(draw(EO) > draw(HACKATHON))
  assert.ok(draw(EO) > draw(AWS_PRACTICE))
})

test('a practitioner room is driven to zero on Draw, not merely ranked lower', () => {
  // Ranked-lower was the option that was explicitly rejected: a developer meetup
  // appearing at position nine is still a developer meetup in the attend lane.
  assert.equal(draw(PYTORCH), 0)
  assert.equal(draw(HACKATHON), 0)
  assert.equal(draw(AWS_PRACTICE), 0)
})

test('adtech BUYERS keep their Demand score: they are the face, not the problem', () => {
  // api/_mission.ts locks FACE as "leaders of PE and VC backed media, adtech and
  // data businesses Krish already knows" and DOOR as the pilot sold to them.
  // Scoring these down would aim the lane away from the one thing being sold, so
  // "not adtech people" is read as journalists, vendors and practitioners - never
  // as the buyers themselves. If this test ever fails, the axes have drifted from
  // the north star.
  assert.ok(demand(RETAIL_MEDIA) >= 50, `retail media demand ${demand(RETAIL_MEDIA)} should stay strong`)
  assert.ok(demand(RETAIL_MEDIA) > demand(PYTORCH))
})

test('a peer room still outranks a buyer room overall, because he asked to meet peers first', () => {
  assert.ok(rank(EO) > rank(RETAIL_MEDIA), `EO ${rank(EO)} vs retail media ${rank(RETAIL_MEDIA)}`)
})

test('a paid mixer that advertises founders with no bar does not beat a real peer room', () => {
  // "The London Network Event, Startup Founders, Tech Entrepreneurs, Investors"
  // appeared three times in the live lane. Anyone can buy that ticket, and the
  // word in the brief was successful.
  assert.ok(draw(EO) > draw(GENERIC_MIXER))
})

test('the practitioner penalty is heavier on Draw than on Demand, on purpose', () => {
  // A room of engineers is not a room of peers under any reading. It might still
  // hold someone who could buy, so Demand is dented rather than erased.
  assert.ok(Math.abs(WEIGHTS.draw.practitioner) > Math.abs(WEIGHTS.demand.practitioner))
})

test('a vendor HOST with a room full of its own customers is not penalised as a vendor room', () => {
  // The asymmetry the rubric asks the judge to respect. Same host kind, different
  // room, and the scores have to be able to tell them apart or the vendor penalty
  // would throw away real buyer rooms.
  const vendorRoom = { peer_density: 10, buyer_density: 30, practitioner_density: 20, vendor_density: 85, seniority: 40 }
  const customerRoom = { peer_density: 25, buyer_density: 85, practitioner_density: 15, vendor_density: 15, seniority: 75 }
  assert.ok(demand(customerRoom) > demand(vendorRoom) + 30)
})

test('a named attendee is worth a bounded bonus, and only in a room already reading as peers', () => {
  const base = { peer_density: 70, buyer_density: 40, practitioner_density: 10, vendor_density: 10, seniority: 70 }
  const withNames = { ...base, named_attendees: ['Jane Doe, CEO at Acme', 'John Roe, Founder at Beta'] }
  assert.ok(draw(withNames) > draw(base))
  assert.ok(draw(withNames) - draw(base) <= NAMED_ATTENDEE_BONUS_CAP)

  // Below the peer bar the bonus does not apply: a famous speaker at a developer
  // conference does not make it a room of peers, and letting one name carry a
  // row would reopen the exact hole this change closed.
  const lowPeer = { ...PYTORCH, named_attendees: ['Someone Famous, CTO at BigCo'] }
  assert.equal(draw(lowPeer), draw(PYTORCH))
})

test('one name does not make a room: the bonus is capped', () => {
  const base = { peer_density: 60, buyer_density: 30, practitioner_density: 5, vendor_density: 5, seniority: 60 }
  const many = { ...base, named_attendees: Array.from({ length: 12 }, (_, i) => `Person ${i}, CEO`) }
  assert.ok(draw(many) - draw(base) <= NAMED_ATTENDEE_BONUS_CAP)
})

test('scores stay inside 0-100 whatever the model returns', () => {
  // The penalties can drive a raw figure below zero and the bonus can push one
  // above a hundred. Either would violate the CHECK constraints on events and
  // fail the write, turning a bad judgement into a lost row.
  const worst = { peer_density: 0, buyer_density: 0, practitioner_density: 100, vendor_density: 100, seniority: 0 }
  const best = { peer_density: 100, buyer_density: 100, practitioner_density: 0, vendor_density: 0, seniority: 100, named_attendees: ['A, CEO', 'B, CEO'] }
  for (const e of [worst, best]) {
    const { draw_score, demand_score } = computeAxes(e)
    assert.ok(draw_score >= 0 && draw_score <= 100, `draw ${draw_score}`)
    assert.ok(demand_score >= 0 && demand_score <= 100, `demand ${demand_score}`)
  }
})

test('a missing or junk density reads as zero, never as NaN', () => {
  // A NaN would pass the range CHECK as null and silently blank an axis, which
  // reads on the card as "this room scored nothing" rather than "we did not know".
  assert.equal(clamp(Number(undefined)), 0)
  assert.equal(clamp(Number('not a number')), 0)
  assert.equal(clamp(Number.POSITIVE_INFINITY), 0)
  const { draw_score } = computeAxes({
    peer_density: Number('x'), buyer_density: 50, practitioner_density: 0, vendor_density: 0, seniority: 50,
  })
  assert.ok(Number.isInteger(draw_score))
})

test('the score version is stamped, so a mixed corpus is visible', () => {
  // 328 rows carried scores produced under the old Draw definition. They are
  // marked scored_source='vps_legacy' and re-scored; the version is what makes a
  // half-migrated corpus detectable instead of quietly incomparable.
  assert.ok(Number.isInteger(SCORE_VERSION) && SCORE_VERSION >= 1)
})
