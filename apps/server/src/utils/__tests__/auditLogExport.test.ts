import { describe, it, expect } from 'vitest'
import { Types } from 'mongoose'
import { buildAuditLogCsv, formatMetadataForCsv, type AuditLogRow } from '../auditLogExport'

function buildRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'a1b2',
    bar: 'bar-1',
    actorType: 'CASHIER',
    actorId: 'user-1',
    actorName: 'Juan Cajero',
    eventType: 'consumo.registered',
    entityType: 'Consumo',
    entityId: 'cons-1',
    metadata: { amount: 12000, groupId: 'g-1' },
    deviceInfo: 'POS-1',
    ip: '127.0.0.1',
    createdAt: new Date('2026-08-24T20:00:00.000Z'),
    ...overrides,
  }
}

describe('buildAuditLogCsv (LB-77)', () => {
  it('emits a header row plus one row per audit entry', () => {
    const csv = buildAuditLogCsv([buildRow()])
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe(
      'ID,Fecha,Tipo de Actor,ID del Actor,Nombre del Actor,Tipo de Evento,Tipo de Entidad,ID de Entidad,Detalle,Dispositivo,IP'
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('consumo.registered')
    expect(lines[1]).toContain('Juan Cajero')
    expect(lines[1]).toContain('2026-08-24T20:00:00.000Z')
    // Metadata is now formatted as readable labels, not raw JSON
    expect(lines[1]).toContain('Monto: $12.000')
    expect(lines[1]).toContain('Grupo: ')
  })

  it('escapes commas, quotes and newlines in cell values', () => {
    const row = buildRow({ actorName: 'García, "el cajero"\n(no) disculpe' })
    const csv = buildAuditLogCsv([row])
    // El nombre escapado debe quedar entre comillas dobles con las internas duplicadas.
    expect(csv).toContain('"García, ""el cajero""\n(no) disculpe"')
  })

  it('renders empty cells for null/undefined optional fields and null metadata', () => {
    const row = buildRow({
      actorId: null,
      actorName: null,
      entityId: null,
      deviceInfo: null,
      ip: null,
      metadata: null,
    })
    const csv = buildAuditLogCsv([row])
    const fields = csv.trim().split('\n')[1].split(',')
    // metadata, deviceInfo, ip quedan vacíos
    expect(fields[8]).toBe('')
    expect(fields[9]).toBe('')
    expect(fields[10]).toBe('')
  })

  it('ends with a trailing newline', () => {
    const csv = buildAuditLogCsv([buildRow()])
    expect(csv.endsWith('\n')).toBe(true)
  })
})

describe('formatMetadataForCsv', () => {
  it('returns empty string for null metadata', () => {
    expect(formatMetadataForCsv(null)).toBe('')
  })

  it('returns empty string for empty metadata', () => {
    expect(formatMetadataForCsv({})).toBe('')
  })

  it('formats known fields with Spanish labels', () => {
    const result = formatMetadataForCsv({ amount: 12000, shiftId: 'abc123def' })
    expect(result).toBe('Monto: $12.000 | Turno: 123def')
  })

  it('formats unknown keys with camelCase to Spaced Case', () => {
    const result = formatMetadataForCsv({ customField: 'hello' })
    expect(result).toBe('Custom Field: hello')
  })
})
