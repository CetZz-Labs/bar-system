import cors from 'cors';
import { isOriginAllowed } from '../utils/allowedOrigins';

export const corsMiddleware = () => cors({
    origin: (origin: string | undefined, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
});
