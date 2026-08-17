import crypto from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import Redemption from "../models/Redemption";

/**
 * Contrato QR + código manual de canje de recompensas (LB-68/LB-69).
 *
 * Módulo paralelo a utils/consumptionQr.ts (LB-60), NO una generalización de
 * ese archivo: consumptionQr.ts está acoplado al modelo Consumption en 3 de
 * sus 4 funciones núcleo (import estático + queries directas), así que
 * "reusarlo tal cual" no es viable sin tocar ese archivo fuera del alcance
 * de este ticket (ver progress/explorers/exp_LB-68.md §4). Se duplica acá la
 * misma lógica contra el modelo Redemption, con su PROPIO Map de rate
 * limiting — si compartiera el Map de consumptionQr.ts por userId, un
 * bloqueo por intentos fallidos de canje afectaría también los lookups de
 * consumo del mismo usuario y viceversa.
 *
 *   generate(redemptionId) -> { qrData, qrToken, manualCode, expiresAt }
 *     Función pura (no persiste): firma un JWT corto ({redemptionId, exp},
 *     20 min) y genera un código numérico de 6 dígitos único entre los
 *     códigos vigentes. El caller (RedemptionController) persiste estos
 *     valores en el Redemption correspondiente.
 *
 *   validate(tokenOrCode) -> { valid, redemptionId?, error? }
 *     Busca el Redemption por qrToken (verificando primero la firma/vigencia
 *     del JWT) o por manualCode exacto. Rechaza si no existe, si fue
 *     invalidado o si venció. NO valida ownership/estado del canje ni del
 *     bar — eso queda a cargo de quien llama (LB-69, todavía sin endpoint
 *     de validación; acá solo se deja el contrato listo).
 *
 *   invalidate(redemptionId) -> void
 *     Marca `invalidatedAt` en el Redemption indicado. Pensado para LB-69.
 *     RedemptionController de LB-68 no lo usa: cuando cancela o expira un
 *     canje ya tiene el documento cargado en memoria, así que alcanza con
 *     setear el campo directo y guardar una sola vez (mismo criterio que
 *     ConsumptionController.regenerateConsumption documenta para su propio
 *     invalidate()).
 *
 * Rate limiting de fuerza bruta contra el código manual (en memoria, por
 * proceso, mismo criterio que consumptionQr.ts — sin Redis en el stack):
 *   registerFailedAttempt(userId) -> void
 *   isBlocked(userId)             -> boolean
 *   resetAttempts(userId)         -> void
 * 5 intentos fallidos consecutivos de un mismo usuario -> bloqueo de 10
 * minutos. Lo consumirá LB-69 en el endpoint de validación del cajero (no
 * implementado todavía).
 */

const QR_TTL_MS = 20 * 60 * 1000;
const MANUAL_CODE_LENGTH = 6;
const MAX_MANUAL_CODE_RETRIES = 10;
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 10 * 60 * 1000;

interface DecodedQrPayload {
    redemptionId: string;
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
        const existing = await Redemption.findOne({
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

export async function generate(redemptionId: string): Promise<{
    qrData: string;
    qrToken: string;
    manualCode: string;
    expiresAt: Date;
}> {
    const expiresAt = new Date(Date.now() + QR_TTL_MS);

    const qrToken = jwt.sign({ redemptionId }, process.env.JWT_SECRET!, { expiresIn: '20m' });

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
    redemptionId?: string;
    error?: string;
}> {
    let redemption = null;

    try {
        const decoded = jwt.verify(tokenOrCode, process.env.JWT_SECRET!) as DecodedQrPayload;
        redemption = await Redemption.findOne({ _id: decoded.redemptionId, qrToken: tokenOrCode }).lean();
    } catch {
        // No es un JWT vigente/válido con nuestra firma: puede ser el código manual.
    }

    if (!redemption) {
        redemption = await Redemption.findOne({ manualCode: tokenOrCode }).lean();
    }

    if (!redemption) {
        return { valid: false, error: 'Código o QR inválido' };
    }

    if (redemption.invalidatedAt) {
        return { valid: false, error: 'Este código ya no es válido, pedí uno nuevo' };
    }

    if (redemption.expiresAt.getTime() < Date.now()) {
        return { valid: false, error: 'El código expiró, pedí uno nuevo' };
    }

    return { valid: true, redemptionId: redemption._id.toString() };
}

export async function invalidate(redemptionId: string): Promise<void> {
    await Redemption.updateOne({ _id: redemptionId }, { invalidatedAt: new Date() });
}

interface AttemptRecord {
    count: number;
    blockedUntil: Date | null;
}

// Map propio, deliberadamente separado del de consumptionQr.ts — ver
// comentario de cabecera del módulo.
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
