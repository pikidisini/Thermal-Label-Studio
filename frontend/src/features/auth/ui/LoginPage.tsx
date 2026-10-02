import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, ShieldCheck, Printer, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import { Button, ErrorState, Field, IconButton, Input } from '../../../shared/ui';

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
      className="min-h-screen w-screen bg-surface-base flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans text-on-surface antialiased"
    >
      <div className="w-full max-w-md bg-surface-container/95 backdrop-blur border border-outline-variant p-8 shadow-2xl relative z-10">
        {/* Header & Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3.5 bg-surface-container-high border border-primary-container text-primary mb-4">
            <Printer className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Thermal Label Studio
          </h1>
          <p className="text-xs text-on-surface-variant mt-1.5 max-w-xs">
            SVG label design and controlled print simulation for PPIC and IT
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div data-testid="login-error-message" className="mb-6 animate-fadeIn"><ErrorState title={error} /></div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                <User className="w-4 h-4" />
              </div>
              <Input
              id="login-username" data-testid="input-username"
                type="text"
                value={username}
                onChange={(e) => {
                  if (error) clearError();
                  setUsername(e.target.value);
                }}
                placeholder="ppic_operator or it_admin"
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
          </Field>

          <Field label="Password">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                <Lock className="w-4 h-4" />
              </div>
              <Input
              id="login-password" data-testid="input-password"
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
                className="w-full pl-10 pr-10 py-2.5 text-sm"
              />
              <IconButton
                type="button"
                label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 h-auto w-10 border-0 bg-transparent p-0 text-on-surface-variant hover:text-on-surface"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </IconButton>
            </div>
          </Field>

          <Button
            data-testid="btn-login"
            type="submit"
            disabled={isLoading || !username.trim() || !password}
            tone="primary"
            className="w-full mt-2 py-2.5 px-4 font-semibold text-sm flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying session...</span>
              </>
            ) : (
              <span>Sign in to Studio</span>
            )}
          </Button>
        </form>

        {/* Security & Access Information */}
        <div className="mt-8 pt-6 border-t border-outline-variant text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-on-surface-variant">
            <ShieldCheck className="w-4 h-4 text-tertiary" />
            <span>One controlled session: Studio and label simulation</span>
          </div>
          <p className="text-[11px] text-outline leading-relaxed">
            Local access is limited to authorized PPIC and IT roles. Public registration is unavailable.
            Local simulation does not allow dispatch to physical printers.
          </p>
        </div>
      </div>
    </div>
  );
};
