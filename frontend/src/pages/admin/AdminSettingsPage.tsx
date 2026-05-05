import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsService } from '../../services/settings.service';
import { Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';

export function AdminSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.settings:manage');

  const q = useQuery({ queryKey: ['settings'], queryFn: () => SettingsService.get() });

  // Local edit buffer keyed by setting key. Each value is the JSON-stringified
  // representation; we only send back keys the operator actually edited.
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!q.data) return;
    const initial: Record<string, string> = {};
    for (const [k, v] of Object.entries(q.data)) initial[k] = JSON.stringify(v);
    setDraft(initial);
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => {
      const out: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(draft)) {
        if (raw === '' || q.data == null) continue;
        if (raw === JSON.stringify(q.data[k])) continue;
        try { out[k] = JSON.parse(raw); }
        catch { throw new Error(`Invalid JSON for "${k}"`); }
      }
      if (Object.keys(out).length === 0) {
        return Promise.resolve();
      }
      return SettingsService.update(out);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.success('Saved'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isLoading) return <p className="text-text-muted">Loading…</p>;

  return (
    <Card
      title="System settings"
      subtitle='Each setting is stored as JSON. Strings need quotes ("value"); numbers and arrays are written without.'
      headerAction={canManage ? (
        <Button size="sm" icon={<Save size={14} />} isLoading={m.isPending} onClick={() => m.mutate()}>
          Save
        </Button>
      ) : undefined}
    >
      {Object.keys(draft).map((key) => (
        <div key={key} className="field">
          <label className="mono text-[12px] font-medium text-text-main">{key}</label>
          <textarea
            className="mono w-full bg-surface border border-border-strong rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-2 disabled:opacity-50"
            value={draft[key]}
            disabled={!canManage}
            onChange={(e) => setDraft((s) => ({ ...s, [key]: e.target.value }))}
            rows={2}
          />
        </div>
      ))}
    </Card>
  );
}
