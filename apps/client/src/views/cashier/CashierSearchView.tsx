import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Camera, Loader2, QrCode, Search, Users } from 'lucide-react';
import { searchCashierGroupsRaw } from '@/API/CashierAPI';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CashierSearchExactError, CashierSearchResult } from '@/types/cashier';
import { toast } from 'sonner';

const DEBOUNCE_MS = 300;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function CashierSearchView() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [exactError, setExactError] = useState<CashierSearchExactError | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ['cashierSearch', debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const outcome = await searchCashierGroupsRaw(debounced);
      if (!outcome.ok) {
        setExactError(outcome.error);
        return [] as CashierSearchResult[];
      }
      setExactError(null);
      return outcome.results;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (debounced.length < 2) {
      setExactError(null);
    }
  }, [debounced]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScanner = () => {
    if (scanTimer.current) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startScanner = async () => {
    setCameraError(null);
    if (!('BarcodeDetector' in window)) {
      setCameraError(
        'Este navegador no soporta lectura de QR. Usá el código de 6 caracteres del grupo.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-expect-error BarcodeDetector is not in all TS libs
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes?.[0]?.rawValue as string | undefined;
          if (raw) {
            setQuery(raw);
            stopScanner();
            toast.success('QR leído');
          }
        } catch {
          // frame skip
        }
      }, 400);
    } catch {
      setCameraError(
        'No hay permiso de cámara. Usá el código de 6 caracteres del grupo como alternativa.'
      );
      stopScanner();
    }
  };

  const results = searchQuery.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 max-w-xl mx-auto"
    >
      <div>
        <h2 className="text-xl font-display font-bold m-0">Buscar grupo</h2>
        <p className="text-sm text-text-secondary mt-1 mb-0">
          Por nombre (2+ letras), código de 6 caracteres o QR del líder.
        </p>
      </div>

      <Input
        label="Búsqueda"
        icon={<Search size={18} />}
        placeholder="Nombre, código o pegá el link del QR"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar grupo"
      />

      <div className="flex gap-2">
        {!scanning ? (
          <Button variant="outline" size="sm" onClick={startScanner} type="button">
            <Camera size={16} />
            Escanear QR
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={stopScanner} type="button">
            Detener cámara
          </Button>
        )}
      </div>

      {cameraError && (
        <p className="text-sm text-error m-0" role="alert">
          {cameraError}
        </p>
      )}

      {scanning && (
        <div className="rounded-md overflow-hidden border border-border bg-black aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        </div>
      )}

      {debounced.length > 0 && debounced.length < 2 && (
        <p className="text-sm text-text-secondary m-0">Escribí al menos 2 caracteres…</p>
      )}

      {searchQuery.isFetching && (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Loader2 className="animate-spin" size={16} />
          Buscando…
        </div>
      )}

      {exactError && (
        <div
          className="rounded-md border border-error-border bg-error-dim px-4 py-3 text-sm text-error"
          role="alert"
        >
          {exactError.message}
        </div>
      )}

      {!exactError && !searchQuery.isFetching && debounced.length >= 2 && results.length === 0 && (
        <p className="text-sm text-text-secondary m-0">
          No hay grupos con salida agendada a este bar para hoy.
        </p>
      )}

      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {results.map((item) => (
          <li
            key={item.outingId}
            className="rounded-md border border-border bg-surface-2 px-4 py-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-display font-bold m-0">{item.name}</h3>
                <p className="text-sm text-text-secondary m-0 flex items-center gap-1.5 mt-1">
                  <QrCode size={14} />
                  {item.inviteCode} · salida {formatTime(item.scheduledFor)}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-text-secondary">
                {item.status === 'ACTIVE' ? 'En curso' : 'Activa'}
              </span>
            </div>

            <div>
              <p className="overline m-0 mb-2 flex items-center gap-1">
                <Users size={12} />
                Invitados ({item.members.length})
              </p>
              <ul className="list-none p-0 m-0 flex flex-col gap-1">
                {item.members.map((m) => (
                  <li key={m.id} className="text-sm text-text-primary">
                    {m.name} {m.lastName}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="primary"
              fullWidth
              type="button"
              onClick={() =>
                toast.message(
                  item.action === 'check_in'
                    ? 'Check-in: pendiente LB-55'
                    : 'Detalle: pendiente LB-55'
                )
              }
            >
              {item.action === 'check_in' ? 'Iniciar check-in' : 'Ver detalle'}
            </Button>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
