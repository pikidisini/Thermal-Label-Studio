import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../shared/i18n';
import { Button, Field, Input } from '../../../shared/ui/primitives';
import { agentStatus, type AgentPrinter } from '../api/localAgentApi';

export type AgentConnection = { token: string; printers: AgentPrinter[] };
export function LocalAgentPanel({ disabled, onChange }: { disabled: boolean; onChange: (value: AgentConnection | null) => void }) {
  const t = useTranslation();
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  async function connect() {
    const current = ++attempt.current;
    setChecking(true); onChange(null);
    try {
      const printers = await agentStatus(token);
      if (current !== attempt.current) return;
      setMessage('Connected to local agent. Printer readiness is not confirmed.');
      onChange({ token, printers });
    } catch (error) {
      if (current === attempt.current) setMessage(error instanceof Error && ['Invalid local agent response.', 'Local agent access failed. Check its token and allowed web origin.'].includes(error.message) ? error.message : 'Local agent is unreachable. Start it on this computer and check browser access permissions.');
    } finally { if (current === attempt.current) setChecking(false); }
  }
  return <div className="label-print-local-agent">
    <Field label={t('Local agent token')}><Input type="password" aria-label={t('Local agent token')} autoComplete="off" value={token} disabled={disabled || checking} onChange={event => { attempt.current++; setToken(event.target.value); setMessage(''); onChange(null); }} /></Field>
    <Button variant="compact" disabled={disabled || checking || !/^[A-Za-z0-9_-]{32,128}$/.test(token)} onClick={connect}>{t(checking ? 'Connecting…' : 'Connect local agent')}</Button>
    {message && <p role="status">{t(message)}</p>}
    <p className="label-print-muted">{t('Agent: 127.0.0.1:18191. Token stays in memory for this page only.')}</p>
  </div>;
}
