import { Request, Response } from "express";
import { Types } from "mongoose";
import Consumption, { ConsumptionStatus } from "../models/Consumption";
import Outing, { OutingStatus } from "../models/Outing";
import { BarUserRole } from "../models/BarUser";
import { verifyBarAccess } from "../utils/barAccess";
import { generate } from "../utils/consumptionQr";

function getOutingStatusError(status: OutingStatus): string | null {
    if (status === OutingStatus.ACTIVE) return null;
    if (status === OutingStatus.COMPLETED) return 'La salida ya finalizó, no admite nuevos consumos';
    if (status === OutingStatus.CANCELLED) return 'La salida fue cancelada, no admite nuevos consumos';
    return 'La salida todavía no está en curso (falta el check-in), no admite nuevos consumos';
}

async function authorizeCashier(userId: string, barId: Types.ObjectId | string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const { hasAccess, role } = await verifyBarAccess(userId, barId.toString());

    if (!hasAccess) {
        return { ok: false, status: 403, message: 'Esta salida no pertenece a tu bar' };
    }

    if (role !== BarUserRole.CASHIER) {
        return { ok: false, status: 403, message: 'No tenés permisos de cajero para esta acción' };
    }

    return { ok: true };
}

export class ConsumptionController {
    static createConsumption = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const outingId = req.params.outingId as string;
            const { amount, breakdown } = req.body;

            const outing = await Outing.findById(outingId).lean();
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            const authResult = await authorizeCashier(userId, outing.bar);
            if (!authResult.ok) {
                res.status(authResult.status).json({ message: authResult.message });
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

            const consumption = await Consumption.create({
                _id: consumptionId,
                outing: outingId,
                bar: outing.bar,
                cashier: userId,
                amount,
                breakdown,
                status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
                qrToken,
                manualCode,
                expiresAt,
            });

            // Auditoría MVP: cajero, hora, monto y grupo/salida quedan en el log de
            // proceso. No hay colección de auditoría dedicada todavía (fuera de
            // alcance de LB-60); si se necesita persistirla, es una extensión futura.
            console.log('[AUDIT] consumption.created', {
                consumptionId: consumption._id.toString(),
                cashierId: userId,
                outingId,
                groupId: outing.group.toString(),
                barId: outing.bar.toString(),
                amount: consumption.amount,
                at: new Date().toISOString(),
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
            const userId = req.user!._id.toString();
            const outingId = req.params.outingId as string;
            const consumptionId = req.params.consumptionId as string;

            const consumption = await Consumption.findOne({ _id: consumptionId, outing: outingId });
            if (!consumption) {
                res.status(404).json({ message: 'Consumo no encontrado' });
                return;
            }

            const authResult = await authorizeCashier(userId, consumption.bar);
            if (!authResult.ok) {
                res.status(authResult.status).json({ message: authResult.message });
                return;
            }

            if (consumption.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION) {
                res.status(409).json({ message: 'Este consumo ya fue confirmado, rechazado o está en disputa y no puede regenerarse' });
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

            await consumption.save();

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
            const userId = req.user!._id.toString();
            const outingId = req.params.outingId as string;

            const outing = await Outing.findById(outingId).select('bar').lean();
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            const authResult = await authorizeCashier(userId, outing.bar);
            if (!authResult.ok) {
                res.status(authResult.status).json({ message: authResult.message });
                return;
            }

            const consumptions = await Consumption.find({
                outing: outingId,
                status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
            })
                .select('amount breakdown status expiresAt createdAt')
                .sort({ createdAt: -1 })
                .lean();

            res.status(200).json(consumptions);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los consumos pendientes' });
        }
    };
}
