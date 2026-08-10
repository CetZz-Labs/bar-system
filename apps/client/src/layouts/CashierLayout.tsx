import { Navigate, Outlet } from 'react-router';
import { Loader2, LogOut } from 'lucide-react';
import { useCashierAuth } from '@/hooks/useCashierAuth';
import { Button } from '@/components/ui/Button';

export default function CashierLayout() {
  const { session, isLoading, isError, logout } = useCashierAuth();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-bg text-text-primary">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (isError || !session) {
    return <Navigate to="/cashier/login" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-xs text-text-secondary m-0">Panel cajero</p>
          <h1 className="text-lg font-display font-bold m-0">{session.bar.name}</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          aria-label="Cerrar sesión cajero"
        >
          <LogOut size={18} />
        </Button>
      </header>
      <main className="flex-1 px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
