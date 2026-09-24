import React from 'react';
import { useAuthStore } from './store/useAuthStore';
import { LoginPage } from './components/auth/LoginPage';
import { AuthenticatedStudio } from './components/studio/AuthenticatedStudio';

export default function App() {
  const { isAuthenticated, isLoading: isAuthLoading, checkAuth } = useAuthStore();

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isAuthLoading) {
    return (
      <div
        data-testid="app-auth-loading"
        className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center space-y-3 text-slate-400 font-sans"
      >
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono">Memverifikasi sesi aplikasi...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedStudio />;
}
