import { useState } from 'react';
import { Navigate } from 'react-router';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCashierAuth } from '@/hooks/useCashierAuth';

export default function CashierLoginView() {
  const { session, isLoading, login, isLoggingIn } = useCashierAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [barId, setBarId] = useState('');

  if (!isLoading && session) {
    return <Navigate to="/cashier" replace />;
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email: email.trim(), password, barId: barId.trim() });
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary flex items-center justify-center px-4">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={onSubmit}
        className="w-full max-w-md flex flex-col gap-4"
      >
        <div className="mb-2">
          <p className="overline m-0">La Banda</p>
          <h1 className="text-2xl font-display font-bold m-0">Login cajero</h1>
          <p className="text-sm text-text-secondary mt-2 mb-0">
            Ingresá con tu cuenta OWNER o CASHIER del bar.
          </p>
        </div>

        <Input
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Input
          label="ID del bar"
          placeholder="Mongo ObjectId del bar"
          value={barId}
          onChange={(e) => setBarId(e.target.value)}
          required
        />

        <Button type="submit" variant="primary" fullWidth disabled={isLoggingIn}>
          {isLoggingIn ? <Loader2 className="animate-spin" size={18} /> : 'Entrar al panel'}
        </Button>
      </motion.form>
    </div>
  );
}
