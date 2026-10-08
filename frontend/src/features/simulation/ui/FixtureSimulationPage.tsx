import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { PreferencesButton } from '../../preferences';
import { Badge, Button, EmptyState, ErrorState, Field, Select } from '../../../shared/ui';
import { fixturePreviewUrl, runFixtureSimulation, type FixtureResult, type FixtureScenario } from '../api/fixtureSimulationApi';

export interface FixtureReviewProps {
  loading: boolean;
  error: string | null;
  result: FixtureResult | null;
}

export function FixtureReview({ loading, error, result }: FixtureReviewProps) {
  useTranslation();
  if (loading) return <p role="status" aria-live="polite">{t("Creating fixture previews…")}</p>;
  if (error) return <ErrorState title={error} />;
  if (!result || result.items.length === 0) return <EmptyState title={t("No fixture previews yet")} detail={t("Choose a scenario and run the simulation.")} />;
  return <div className="space-y-4" aria-live="polite">
    <p className="text-sm text-on-surface-variant">{t("Request ID:")} <code>{result.request_id}</code></p>
    <p className="text-sm text-on-surface-variant">{result.items.filter((item) => item.status === 'CAPTURED').length} {t("of")} {result.items.length} {t("previews ready · 80 × 200 mm · 203.2 DPI")}</p>
    {result.items.map((item) => {
      const url = fixturePreviewUrl(item);
      return <article key={item.item_index} className="border border-outline-variant p-4 space-y-3">
        <div className="flex gap-3 items-center"><h2 className="font-semibold">{t("Item")} {item.item_index + 1} · {item.item_id}</h2><Badge tone={url ? "success" : "danger"}>{url ? t("Preview ready") : t("Failed")}</Badge></div>
        {item.error && <ErrorState title={item.error.message} detail={`Error: ${item.error.code}`} />}
        {url && <img src={url} alt={`Backend fixture preview for item ${item.item_index + 1}`} className="max-h-[28rem] max-w-full bg-white object-contain" />}
        <details><summary className="cursor-pointer text-sm">{t("Processing steps")}</summary><ol className="mt-2 space-y-1 text-sm text-on-surface-variant">{item.trace.map((step, index) => <li key={index}>{index + 1}. {step.message} <span className="text-xs">({step.status})</span></li>)}</ol></details>
      </article>;
    })}
  </div>;
}

export function FixtureSimulationPage() {
  useTranslation();
  const [scenario, setScenario] = React.useState<FixtureScenario>('sample');
  const [review, setReview] = React.useState<FixtureReviewProps>({ loading: false, error: null, result: null });
  const active = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const run = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setReview({ loading: true, error: null, result: null });
    try {
      const result = await runFixtureSimulation(scenario, controller.signal);
      if (!controller.signal.aborted) setReview({ loading: false, error: null, result });
    } catch (error) {
      if (!controller.signal.aborted) setReview({ loading: false, error: error instanceof Error ? error.message : 'Fixture simulation failed.', result: null });
    } finally { if (active.current === controller) active.current = null; }
  };
  return <main className="min-h-screen bg-surface-base text-on-surface font-sans px-4 py-8" data-ui-root="true">
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="space-y-2"><div className="flex justify-end"><PreferencesButton /></div><a href="/" className="text-sm text-primary underline">{t("Back to Studio")}</a><h1 className="text-2xl font-bold">{t("Fixture simulation")}</h1><Badge>{t("Development fixture")}</Badge><p className="text-sm text-on-surface-variant">{t("Review sample labels created by the backend processing pipeline. The mixed scenario includes one item with missing data to show how failures are reported.")}</p></header>
      <div className="flex flex-wrap items-end gap-4 border border-outline-variant bg-surface-container p-4">
        <Field label={t("Fixture scenario")}><Select value={scenario} disabled={review.loading} onChange={(event) => { setScenario(event.target.value as FixtureScenario); setReview({ loading: false, error: null, result: null }); }}><option value="sample">{t("One sample label")}</option><option value="mixed">{t("Three items, including one failure")}</option></Select></Field>
        <Button tone="primary" disabled={review.loading} onClick={() => void run()} variant="default">{review.loading ? t("Creating previews…") : review.error ? t("Retry simulation") : t("Run fixture simulation")}</Button>
      </div>
      <FixtureReview {...review} />
    </div>
  </main>;
}
