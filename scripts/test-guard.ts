import { createHash } from 'node:crypto'
import { guard } from '../api/_auth.js'

function mk(method: string, cookie?: string) {
  const res: any = { statusCode: 0, headers: {} as any, body: null as any,
    setHeader(k: string, v: string) { this.headers[k] = v },
    status(c: number) { this.statusCode = c; return this },
    json(b: any) { this.body = b; return this },
    end() { return this } }
  return [{ method, headers: cookie ? { cookie } : {} } as any, res] as const
}
const CODE = 'test-code-123'
process.env.ACCESS_CODE = CODE
const good = 'cc_access=' + createHash('sha256').update(CODE).digest('hex')

let pass = 0, fail = 0
const t = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`) }

let [q, r] = mk('POST'); let stopped = guard(q, r, ['POST'])
t('POST with no cookie is stopped with 401', stopped === true && r.statusCode === 401)

;[q, r] = mk('POST', good); stopped = guard(q, r, ['POST'])
t('POST with the right cookie passes through', stopped === false)

;[q, r] = mk('POST', 'cc_access=wrong'); stopped = guard(q, r, ['POST'])
t('POST with a wrong cookie is stopped with 401', stopped === true && r.statusCode === 401)

;[q, r] = mk('OPTIONS'); stopped = guard(q, r, ['POST'])
t('OPTIONS preflight is answered, not 401', stopped === true && r.statusCode === 200)

;[q, r] = mk('GET'); stopped = guard(q, r, ['POST'])
t('GET on a write-only route is 405, not data', stopped === true && r.statusCode === 405)

// the dual-method shape used on the 18 routes that also serve GET
const dual = (method: string, cookie?: string) => {
  const [a, b] = mk(method, cookie)
  return { stopped: a.method !== 'GET' && guard(a, b, ['POST']), res: b }
}
let d = dual('GET')
t('dual route: GET falls through unguarded (reads stay open)', d.stopped === false)
d = dual('POST')
t('dual route: POST with no cookie is stopped', d.stopped === true && d.res.statusCode === 401)

;[q, r] = mk('POST'); guard(q, r, ['POST'])
t('origin is pinned, not a wildcard', r.headers['Access-Control-Allow-Origin'] !== '*')

console.log(`\n${fail === 0 ? 'GUARD OK' : 'GUARD FAILURES'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
