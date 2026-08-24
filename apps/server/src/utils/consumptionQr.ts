import crypto from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import type { ClientSession } from "mongoose";
import Consumption from "../models/Consumption";

/**
 * Contrato compartido: QR + código manual de confirmación de consumos.
 * Dueño: LB-60. Consumidores: LB-60 (crear/regenerar), LB-61 (confirmar,
 * endpoint todavía no implementado) y, a futuro, LB-78 (canje).
 *
 *   generate(consumptionId) -> { qrData, qrToken, manualCode, expiresAt }
 *     Función pura (no persiste): firma un JWT corto ({consumptionId, exp},
 *     30 min) y genera un código numérico de 6 dígitos único entre los
 *     códigos vigentes. `qrToken` es el string embebido en el QR (lo que el
 *     líder decodifica al escanear); `qrData` es una imagen PNG en base64
 *     (data URI) de ese mismo token, lista para <img src>. El caller (el
 *     controller) es responsable de persistir estos valores en el
 *     Consumption correspondiente.
 *
 *   validate(tokenOrCode) -> { valid, consumptionId?, error? }
 *     Busca el Consumption por qrToken (verificando primero la firma/vigencia
 *     del JWT) o por manualCode exacto. Rechaza si no existe, si fue
 *     invalidado o si venció. NO valida ownership de grupo/líder — eso queda
 *     a cargo de quien llama (LB-61 debe cruzar el consumptionId devuelto
 *     contra el grupo dueño de la salida).
 *
 *   invalidate(consumptionId) -> void
 *     Marca `invalidatedAt` en el Consumption indicado. Pensado para que
 *     LB-61 (al confirmar) y LB-62 (al cerrar la salida) puedan invalidar
 *     credenciales vigentes sin tener que reimplementar la lógica. LB-60 no
 *     lo usa en su propio flujo de regeneración: ahí se sobreescriben
 *     qrToken/manualCode/expiresAt directamente en el mismo documento.
 *
 * Rate limiting de fuerza bruta contra el código manual (en memoria, por
 * proceso — sin Redis en el stack, aceptado para MVP por la spec):
 *   registerFailedAttempt(userId) -> void
 *   isBlocked(userId)             -> boolean
 *   resetAttempts(userId)         -> void
 * 5 intentos fallidos consecutivos de un mismo usuario -> bloqueo de 10
 * minutos. Lo consume LB-61 en el endpoint de confirmación (no implementado
 * en LB-60).
 */

const QR_TTL_MS = 30 * 60 * 1000;
const MANUAL_CODE_LENGTH = 6;
const MAX_MANUAL_CODE_RETRIES = 10;
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 10 * 60 * 1000;

interface DecodedQrPayload {
    consumptionId: string;
}

function generateNumericCode(): string {
    let code = "";
    for (let i = 0; i < MANUAL_CODE_LENGTH; i++) {
        code += crypto.randomInt(0, 10).toString();
    }
    return code;
}

async function getUniqueManualCode(): Promise<string> {
    let retries = 0;
    let code = "";
    let exists = true;

    while (exists && retries < MAX_MANUAL_CODE_RETRIES) {
        code = generateNumericCode();
        // Solo importa la unicidad contra códigos actualmente vigentes: uno
        // viejo, invalidado o vencido puede reutilizarse sin ambigüedad.
        const existing = await Consumption.findOne({
            manualCode: code,
            invalidatedAt: null,
            expiresAt: { $gt: new Date() },
        }).select('_id').lean();
        exists = !!existing;
        retries++;
    }

    if (exists) {
        throw new Error('No se pudo generar un código manual único después de múltiples intentos');
    }

    return code;
}

export async function generate(consumptionId: string): Promise<{
    qrData: string;
    qrToken: string;
    manualCode: string;
    expiresAt: Date;
}> {
    const expiresAt = new Date(Date.now() + QR_TTL_MS);

    const qrToken = jwt.sign({ consumptionId }, process.env.JWT_SECRET!, { expiresIn: '30m' });

    const qrBuffer = await QRCode.toBuffer(qrToken, {
        type: 'png',
        width: 512,
        margin: 2,
    });
    const qrData = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const manualCode = await getUniqueManualCode();

    return { qrData, qrToken, manualCode, expiresAt };
}

export async function validate(tokenOrCode: string): Promise<{
    valid: boolean;
    consumptionId?: string;
    error?: string;
}> {
    let consumption = null;

    try {
        const decoded = jwt.verify(tokenOrCode, process.env.JWT_SECRET!) as DecodedQrPayload;
        consumption = await Consumption.findOne({ _id: decoded.consumptionId, qrToken: tokenOrCode }).lean();
    } catch {
        // No es un JWT vigente/válido con nuestra firma: puede ser el código manual.
    }

    if (!consumption) {
        consumption = await Consumption.findOne({ manualCode: tokenOrCode }).lean();
    }

    if (!consumption) {
        return { valid: false, error: 'Código o QR inválido' };
    }

    if (consumption.invalidatedAt) {
        return { valid: false, error: 'Este código ya no es válido, pedí uno nuevo' };
    }

    if (consumption.expiresAt.getTime() < Date.now()) {
        return { valid: false, error: 'El código expiró, pedí uno nuevo' };
    }

    return { valid: true, consumptionId: consumption._id.toString() };
}

export async function invalidate(
    consumptionId: string,
    session?: ClientSession
): Promise<void> {
    if (session) {
        await Consumption.updateOne(
            { _id: consumptionId },
            { invalidatedAt: new Date() },
            { session }
        );
    } else {
        await Consumption.updateOne({ _id: consumptionId }, { invalidatedAt: new Date() });
    }
}

interface AttemptRecord {
    count: number;
    blockedUntil: Date | null;
}

const failedAttempts = new Map<string, AttemptRecord>();

export function isBlocked(userId: string): boolean {
    const record = failedAttempts.get(userId);
    if (!record || !record.blockedUntil) return false;

    if (record.blockedUntil.getTime() <= Date.now()) {
        failedAttempts.delete(userId);
        return false;
    }

    return true;
}

export function registerFailedAttempt(userId: string): void {
    const record = failedAttempts.get(userId) ?? { count: 0, blockedUntil: null };
    record.count += 1;

    if (record.count >= MAX_FAILED_ATTEMPTS) {
        record.blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
    }

    failedAttempts.set(userId, record);
}

export function resetAttempts(userId: string): void {
    failedAttempts.delete(userId);
}
