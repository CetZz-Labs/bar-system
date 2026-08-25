import express from 'express'
import http from 'node:http'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import reportRouter from '../reportRoute'

// La ruta usa `authenticate()` (auth normal) + `ReportController.getReport`
// (que ya tiene su propia suite). Acá se aísla la cadena de validación de
// express-validator: el middleware de auth solo deja pasar y el controller se
// neutraliza para verificar 400s y el flujo feliz.
const controllerMock = vi.hoisted(() => ({
  getReport: vi.fn(),
}))

vi.mock('../../middleware/auth', () => ({
  authenticate: () => (_req: unknown, _res: unknown, next: () => void) => {
    next()
  },
}))

vi.mock('../../controllers/ReportController', () => ({
  ReportController: controllerMock,
}))

let server: http.Server
let baseUrl: string

async function get(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${baseUrl}${path}`)
  return { status: res.status, body: await res.text() }
}

beforeAll(async () => {
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/bars/:barId/reports', reportRouter)

  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  }
})

const VALID_QUERY = 'kind=consumptions&format=csv&from=2026-08-01T00:00:00.000Z&to=2026-08-10T00:00:00.000Z'

describe('reportRoute validation (LB-78)', () => {
  it('rejects an invalid format (400)', async () => {
    const res = await get(`/api/bars/507f1f77bcf86cd799439011/reports?${VALID_QUERY.replace('format=csv', 'format=exe')}`)
    expect(res.status).toBe(400)
    expect(controllerMock.getReport).not.toHaveBeenCalled()
  })

  it('rejects an unknown report kind (400)', async () => {
    const res = await get(`/api/bars/507f1f77bcf86cd799439011/reports?${VALID_QUERY.replace('kind=consumptions', 'kind=foo')}`)
    expect(res.status).toBe(400)
    expect(controllerMock.getReport).not.toHaveBeenCalled()
  })

  it('rejects a non-MongoId barId (400)', async () => {
    const res = await get(`/api/bars/not-an-id/reports?${VALID_QUERY}`)
    expect(res.status).toBe(400)
    expect(controllerMock.getReport).not.toHaveBeenCalled()
  })

  it('rejects a non-ISO8601 from (400)', async () => {
    const res = await get(`/api/bars/507f1f77bcf86cd799439011/reports?${VALID_QUERY.replace('from=2026-08-01T00:00:00.000Z', 'from=not-a-date')}`)
    expect(res.status).toBe(400)
    expect(controllerMock.getReport).not.toHaveBeenCalled()
  })

  it('rejects a missing to (400)', async () => {
    const res = await get('/api/bars/507f1f77bcf86cd799439011/reports?kind=consumptions&format=csv&from=2026-08-01T00:00:00.000Z')
    expect(res.status).toBe(400)
    expect(controllerMock.getReport).not.toHaveBeenCalled()
  })

  it('passes validation and calls the controller for a valid request', async () => {
    controllerMock.getReport.mockImplementation((_req: unknown, res: { status: (n: number) => { end: () => void } }) => {
      res.status(200).end()
    })

    const res = await get(`/api/bars/507f1f77bcf86cd799439011/reports?${VALID_QUERY}`)
    expect(res.status).toBe(200)
    expect(controllerMock.getReport).toHaveBeenCalledTimes(1)
  })
})
