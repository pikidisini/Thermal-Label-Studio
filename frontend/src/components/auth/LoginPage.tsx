import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, ShieldCheck, Printer, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await login(username.trim(), password);
  };

  return (
    <div
      data-testid="login-page"
      className="min-h-screen w-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans text-slate-100 antialiased"
    >
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Header & Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3.5 bg-gradient-to-br from-primary-container/40 to-primary/20 border border-primary/30 rounded-2xl text-primary-fixed mb-4 shadow-inner">
            <Printer className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Thermal Label Studio
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 max-w-xs">
            Desain Template SVG & Simulasi Cetak Label Terpadu (PPIC & IT)
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            data-testid="login-error-message"
            className="mb-6 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2.5 animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nama Pengguna
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                data-testid="input-username"
                type="text"
                value={username}
                onChange={(e) => {
                  if (error) clearError();
                  setUsername(e.target.value);
                }}
                placeholder="ppic_operator atau it_admin"
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 disabled:opacity-50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                data-testid="input-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  if (error) clearError();
                  setPassword(e.target.value);
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 disabled:opacity-50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            data-testid="btn-login"
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Memverifikasi Sesi...</span>
              </>
            ) : (
              <span>Masuk ke Studio</span>
            )}
          </button>
        </form>

        {/* Security & Access Information */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Satu Sesi Terpadu: Studio & Simulasi Label</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Akses lokal dibatasi untuk peran resmi PPIC dan IT. Tidak ada pendaftaran publik.
            Deployment simulasi lokal tidak mengizinkan pengiriman ke printer fisik.
          </p>
        </div>
      </div>
    </div>
  );
};
