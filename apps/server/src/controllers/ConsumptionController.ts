import { Request, Response } from "express";
import { Types } from "mongoose";
import Consumption, { ConsumptionStatus } from "../models/Consumption";
import Outing, { OutingStatus } from "../models/Outing";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { generate } from "../utils/consumptionQr";

function getOutingStatusError(status: OutingStatus): string | null {
    if (status === OutingStatus.ACTIVE) return null;
    if (status === OutingStatus.COMPLETED || status === OutingStatus.NO_SHOW) {
        return 'La salida ya finalizó, no admite nuevos consumos';
    }
    if (status === OutingStatus.CANCELLED) return 'La salida fue cancelada, no admite nuevos consumos';
    return 'La salida todavía no está en curso (falta el check-in), no admite nuevos consumos';
}

// Misma regla de negocio que apps/client/src/types/consumption.ts
// (UNUSUAL_AMOUNT_THRESHOLD). Duplicada a mano porque apps/client y
// apps/server no comparten código (regla de aislamiento del monorepo,
// backend.md §C1 / frontend.md §3). No bloqueante, sin tope duro: solo
// deja rastro auditable en el documento, nunca rechaza el request.
const UNUSUAL_AMOUNT_THRESHOLD = 500_000;

export class ConsumptionController {
    static createConsumption = async (req: Request, res: Response) => {
        try {
            const cashierContext = req.cashierContext!;
            const outingId = req.params.outingId as string;
            const { amount, breakdown } = req.body;

            const outing = await Outing.findById(outingId).lean();
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            // authenticateCashier ya validó sesión/turno activo sobre cashierContext.bar;
            // acá solo falta confirmar que la salida puntual pertenece a ESE bar.
            if (outing.bar.toString() !== cashierContext.bar.toString()) {
                res.status(403).json({ message: 'Esta salida no pertenece a tu bar' });
                return;
            }

            const statusError = getOutingStatusError(outing.status);
            if (statusError) {
                res.status(409).json({ message: statusError });
                return;
            }

            // El JWT del QR necesita el consumptionId en su payload, así que
            // generamos el ObjectId del lado del cliente (Mongoose lo soporta
            // sin round-trip a la DB) antes de persistir el documento completo
            // en un único create().
            const consumptionId = new Types.ObjectId();
            const { qrData, qrToken, manualCode, expiresAt } = await generate(consumptionId.toString());
            const isUnusualAmount = amount > UNUSUAL_AMOUNT_THRESHOLD;

            const consumption = await Consumption.create({
                _id: consumptionId,
                outing: outingId,
                bar: outing.bar,
                cashier: cashierContext.user._id,
                ...(cashierContext.shift._id ? { shift: cashierContext.shift._id } : {}),
                amount,
                isUnusualAmount,
                breakdown,
                status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
                qrToken,
                manualCode,
                expiresAt,
            });

            // Auditoría (cajero, hora, monto, grupo, salida) en la colección
            // real de LB-53, no un console.log ad hoc.
            await AuditLog.create({
                bar: cashierContext.bar,
                user: cashierContext.user._id,
                action: AuditAction.CONSUMPTION_CREATED,
                deviceInfo: cashierContext.shift.deviceInfo,
                ip: req.ip,
                amount,
                outing: outingId,
                group: outing.group,
            });

            res.status(201).json({
                consumptionId: consumption._id,
                outing: outingId,
                amount: consumption.amount,
                breakdown: consumption.breakdown,
                status: consumption.status,
                qrData,
                manualCode,
                expiresAt,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al registrar el consumo' });
        }
    };

    static regenerateConsumption = async (req: Request, res: Response) => {
        try {
            const cashierContext = req.cashierContext!;
            const outingId = req.params.outingId as string;
            const consumptionId = req.params.consumptionId as string;

            const consumption = await Consumption.findOne({ _id: consumptionId, outing: outingId });
            if (!consumption) {
                res.status(404).json({ message: 'Consumo no encontrado' });
                return;
            }

            if (consumption.bar.toString() !== cashierContext.bar.toString()) {
                res.status(403).json({ message: 'Este consumo no pertenece a tu bar' });
                return;
            }

            // LB-61: el cajero puede regenerar tras un REJECTED (corregir monto).
            // CONFIRMED / DISPUTED quedan bloqueados.
            if (
                consumption.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION &&
                consumption.status !== ConsumptionStatus.REJECTED
            ) {
                res.status(409).json({
                    message: 'Este consumo ya fue confirmado o está en disputa y no puede regenerarse',
                });
                return;
            }

            // No se llama a invalidate() acá: ese helper hace un updateOne por ID
            // para casos donde el caller no tiene el documento cargado (LB-61/62).
            // Acá ya tenemos el Consumption en memoria, así que alcanza con
            // sobreescribir sus credenciales y guardar una sola vez — el token/código
            // viejo queda invalidado de hecho porque deja de existir en el documento.
            const { qrData, qrToken, manualCode, expiresAt } = await generate(consumption._id.toString());

            consumption.qrToken = qrToken;
            consumption.manualCode = manualCode;
            consumption.expiresAt = expiresAt;
            consumption.invalidatedAt = null;
            // Tras regenerar, vuelve a pendiente de confirmación del líder.
            consumption.status = ConsumptionStatus.PENDING_LEADER_CONFIRMATION;

            await consumption.save();

            const relatedOuting = await Outing.findById(consumption.outing).select('group').lean();

            await AuditLog.create({
                bar: cashierContext.bar,
                user: cashierContext.user._id,
                action: AuditAction.CONSUMPTION_REGENERATED,
                deviceInfo: cashierContext.shift.deviceInfo,
                ip: req.ip,
                amount: consumption.amount,
                outing: consumption.outing,
                group: relatedOuting?.group,
            });

            res.status(200).json({
                consumptionId: consumption._id,
                outing: outingId,
                amount: consumption.amount,
                status: consumption.status,
                qrData,
                manualCode,
                expiresAt,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al regenerar el código' });
        }
    };

    static getPendingConsumptions = async (req: Request, res: Response) => {
        try {
            const cashierContext = req.cashierContext!;
            const outingId = req.params.outingId as string;

            const outing = await Outing.findById(outingId).select('bar').lean();
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            if (outing.bar.toString() !== cashierContext.bar.toString()) {
                res.status(403).json({ message: 'Esta salida no pertenece a tu bar' });
                return;
            }

            // Incluye REJECTED para que el cajero pueda regenerar (LB-61).
            const consumptions = await Consumption.find({
                outing: outingId,
                status: {
                    $in: [
                        ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
                        ConsumptionStatus.REJECTED,
                    ],
                },
            })
                .select('amount breakdown status expiresAt createdAt rejectCount')
                .sort({ createdAt: -1 })
                .lean();

            res.status(200).json(consumptions);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los consumos pendientes' });
        }
    };
}
