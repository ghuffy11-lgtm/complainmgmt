import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Save, Trash2, Upload } from 'lucide-react';
import { SettingsService } from '../../services/settings.service';
import { BrandingService, type Branding } from '../../services/branding.service';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { BRANDING_QUERY_KEY } from '../../hooks/useBranding';
import { THEME_PRESETS, derivePrimaryFamily, findPreset } from '../../lib/theme';

export function AdminSettingsPage() {
  const { has } = usePermissions();
  const canManage = has('admin.settings:manage');

  return (
    <div className="space-y-6">
      <BrandingCard canManage={canManage} />
      <RawSettingsCard canManage={canManage} />
    </div>
  );
}

// ─── Branding ──────────────────────────────────────────────────────────

const TEXT_FIELDS: Array<{
  key: keyof Omit<Branding, 'logoUrl' | 'logoUpdatedAt'>;
  label: string;
  hint?: string;
  maxLength: number;
}> = [
  { key: 'organizationName', label: 'Organisation name', hint: 'Shown in the header strip and footer', maxLength: 120 },
  { key: 'systemName',       label: 'System name',       hint: 'Browser tab + sidebar subtitle + login heading', maxLength: 120 },
  { key: 'systemShortName',  label: 'System short name', hint: 'Sidebar brand mark and footer', maxLength: 40 },
  { key: 'loginSubtitle',    label: 'Login subtitle',    hint: 'Below the login heading', maxLength: 160 },
  { key: 'loginTagline',     label: 'Login tagline',     hint: 'One-line prompt above the form', maxLength: 240 },
  { key: 'footerText',       label: 'Footer text',       hint: 'Right of "Org name ·" in the footer', maxLength: 240 },
];

function BrandingCard({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: BRANDING_QUERY_KEY, queryFn: () => BrandingService.get() });

  const [draft, setDraft] = React.useState<Partial<Branding>>({});
  React.useEffect(() => {
    if (q.data) setDraft({});
  }, [q.data]);

  const dirty = Object.keys(draft).length > 0;
  const value = (k: keyof Branding) => (draft[k] as string | undefined) ?? (q.data?.[k] as string | undefined) ?? '';

  const saveTextM = useMutation({
    mutationFn: () => BrandingService.updateText(draft as Partial<Branding>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      setDraft({});
      toast.success('Branding saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save branding')),
  });

  const fileRef = React.useRef<HTMLInputElement>(null);
  const uploadM = useMutation({
    mutationFn: (file: File) => BrandingService.uploadLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      toast.success('Logo uploaded');
    },
    onError: (err) => toast.error(errorMessage(err, 'Logo upload failed')),
  });
  const deleteM = useMutation({
    mutationFn: () => BrandingService.deleteLogo(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      toast.success('Logo cleared');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not clear logo')),
  });

  return (
    <Card
      title="Branding"
      subtitle="Logo + the strings shown on the login page, sidebar, header, and footer."
      headerAction={canManage ? (
        <Button
          size="sm"
          icon={<Save size={14} />}
          isLoading={saveTextM.isPending}
          disabled={!dirty || saveTextM.isPending}
          onClick={() => saveTextM.mutate()}
        >
          Save changes
        </Button>
      ) : undefined}
    >
      {/* Theme */}
      <ThemePicker
        value={value('primaryColor')}
        onChange={(hex) => setDraft((s) => ({ ...s, primaryColor: hex }))}
        disabled={!canManage}
      />

      {/* Logo */}
      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
        <div
          className="w-20 h-20 rounded-xl border border-border bg-surface-2 flex items-center justify-center overflow-hidden shrink-0"
        >
          {q.data?.logoUrl ? (
            <img src={q.data.logoUrl} alt="Current logo" className="w-full h-full object-contain p-2" />
          ) : (
            <ImageIcon size={28} className="text-text-subtle" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-main m-0">Logo</p>
          <p className="text-xs text-text-muted m-0 mt-0.5">
            PNG, JPEG, WebP or SVG · max 512 KB · displayed at the login card and sidebar.
          </p>
          {canManage && (
            <div className="flex items-center gap-2 mt-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadM.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Upload size={14} />}
                isLoading={uploadM.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {q.data?.logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {q.data?.logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  isLoading={deleteM.isPending}
                  onClick={() => {
                    if (confirm('Remove the uploaded logo? The default shield icon will be shown.')) {
                      deleteM.mutate();
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Text fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEXT_FIELDS.map((f) => (
          <Input
            key={f.key}
            label={f.label}
            hint={f.hint}
            maxLength={f.maxLength}
            disabled={!canManage}
            value={value(f.key)}
            onChange={(e) =>
              setDraft((s) => ({ ...s, [f.key]: e.target.value }))
            }
          />
        ))}
      </div>
    </Card>
  );
}

// ─── Theme picker (presets + custom hex) ───────────────────────────────

function ThemePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled: boolean;
}) {
  const matched = findPreset(value);
  const isCustom = matched === null;
  const family = derivePrimaryFamily(value || '#2563eb');

  return (
    <div className="mb-6 pb-6 border-b border-border">
      <p className="text-sm font-medium text-text-main m-0">Theme</p>
      <p className="text-xs text-text-muted m-0 mt-0.5">
        Pick a preset or supply a custom primary color. Hover, active, badge-bg, and
        border tones are derived automatically. Sidebar stays dark.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end mt-4">
        {/* Preset dropdown — only presets are pickable. The "Custom" entry
         *  is a status display: it auto-shows when the colour picker / hex
         *  input below has a value that doesn't match any preset, but it
         *  can't be picked from the dropdown (that would be a no-op and
         *  felt broken in earlier versions). */}
        <div className="field m-0">
          <label className="text-[13px] font-medium text-text-main">Preset</label>
          <Select
            value={isCustom ? '__custom__' : matched.key}
            onChange={(k) => {
              if (k === '__custom__') return; // unreachable — disabled option
              const preset = THEME_PRESETS.find((p) => p.key === k);
              if (preset) onChange(preset.primary);
            }}
            disabled={disabled}
            options={[
              ...THEME_PRESETS.map((p) => ({ value: p.key, label: p.label })),
              { value: '__custom__', label: '— Custom (use color picker →) —', disabled: true },
            ]}
          />
          {!isCustom && matched.description && (
            <span className="hint">{matched.description}</span>
          )}
          {isCustom && (
            <span className="hint">Custom primary — change with the color picker, or pick a preset to leave custom.</span>
          )}
        </div>

        {/* Color picker + hex input — always usable. Picking a value here
         *  that doesn't match any preset auto-flips the dropdown to
         *  "Custom" status without the admin having to "select Custom"
         *  first. */}
        <div className="field m-0">
          <label className="text-[13px] font-medium text-text-main">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(value)}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="h-10 w-12 border border-border-strong rounded-md cursor-pointer disabled:cursor-not-allowed"
              aria-label="Primary color"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              maxLength={7}
              className="font-mono h-10 w-24 bg-surface border border-border-strong rounded-md px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-2 disabled:opacity-50"
              placeholder="#2563eb"
            />
          </div>
        </div>

        {/* Live swatch row — primary family + sidebar tones. Sidebar derives
         *  from the primary hue so every theme has a brand-consistent dark
         *  anchor. */}
        <div className="field m-0">
          <label className="text-[13px] font-medium text-text-main">Preview</label>
          <div
            className="flex items-center h-10 rounded-md border border-border overflow-hidden"
            title="primary · hover · active · bg · border · sidebar · sidebar-2"
          >
            {([
              ['primary', family.primary],
              ['hover', family.primaryHover],
              ['active', family.primaryActive],
              ['bg', family.primaryBg],
              ['border', family.primaryBorder],
              ['sidebar', family.sidebar],
              ['sidebar-2', family.sidebar2],
            ] as const).map(([label, hex]) => (
              <span
                key={label}
                title={`${label}: ${hex}`}
                style={{ background: hex, width: 24, height: '100%' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Normalise a possibly-3-char hex to a 6-char hex for `<input type=color>`,
 *  which only accepts 6-char form. Returns the input unchanged if it's
 *  already 6 chars. Empty / invalid input falls back to the editorial blue. */
function normalizeHex(value: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return '#2563eb';
  if (m[1].length === 3) {
    const [r, g, b] = m[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value.toLowerCase();
}

// ─── Raw settings (low-level JSON editor) ──────────────────────────────

function RawSettingsCard({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => SettingsService.get() });

  const [draft, setDraft] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
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
      if (Object.keys(out).length === 0) return Promise.resolve();
      return SettingsService.update(out);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      toast.success('Saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isLoading) return <p className="text-text-muted">Loading…</p>;

  return (
    <Card
      title="Raw settings"
      subtitle='Low-level JSON editor. Strings need quotes ("value"); numbers and arrays are written without. The Branding card above is the easier place to edit branding.* keys.'
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
