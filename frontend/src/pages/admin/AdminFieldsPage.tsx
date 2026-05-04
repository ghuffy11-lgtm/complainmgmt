import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DynamicFieldsService, OptionInput } from '../../services/dynamic-fields.service';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import type { DynamicField, FieldLocking, FieldType } from '../../types/api';

const TYPES: FieldType[] = ['text', 'number', 'date', 'dropdown', 'file'];
const LOCKINGS: FieldLocking[] = ['none', 'first_writer_wins'];

export function AdminFieldsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.fields:manage');

  const fieldsQ = useQuery({ queryKey: ['admin', 'fields'], queryFn: () => DynamicFieldsService.fullSchema() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DynamicField | null>(null);
  const [optionsFor, setOptionsFor] = useState<DynamicField | null>(null);

  const removeM = useMutation({
    mutationFn: (id: string) => DynamicFieldsService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'fields'] }); toast.success('Deleted'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <section>
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Complaint fields</h2>
        <span className="spacer" />
        {canManage && <Button onClick={() => setCreating(true)}>New field</Button>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Adding a field automatically provisions <span className="mono">complaint.field:&lt;key&gt;:read|write|override</span>{' '}
        permissions in the role grid.
      </p>

      {fieldsQ.isLoading && <p className="muted">Loading…</p>}
      {fieldsQ.data && (
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Key</th><th>Label</th><th>Type</th>
              <th>Required</th><th>Locking</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {fieldsQ.data.map((f) => (
              <tr key={f.id}>
                <td className="mono">{f.sortOrder}</td>
                <td className="mono">
                  {f.key}
                  {f.isSystem && <span className="badge" style={{ marginLeft: 6 }}>system</span>}
                </td>
                <td>{f.label}</td>
                <td className="mono">{f.type}</td>
                <td>{f.isRequired ? 'yes' : '—'}</td>
                <td className="mono">{f.locking}</td>
                <td>{f.isActive
                  ? <span className="badge badge-success">active</span>
                  : <span className="badge">inactive</span>}</td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(f)}>Edit</Button>
                      {f.type === 'dropdown' && <Button variant="ghost" onClick={() => setOptionsFor(f)}>Options</Button>}
                      {!f.isSystem && (
                        <Button
                          variant="ghost"
                          onClick={() => { if (confirm(`Delete field "${f.key}"?`)) removeM.mutate(f.id); }}
                        >Delete</Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <FieldEditor
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin', 'fields'] }); setCreating(false); }}
        />
      )}
      {editing && (
        <FieldEditor
          mode="edit"
          field={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin', 'fields'] }); setEditing(null); }}
        />
      )}
      {optionsFor && (
        <OptionsEditor
          field={optionsFor}
          onClose={() => setOptionsFor(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin', 'fields'] }); setOptionsFor(null); }}
        />
      )}
    </section>
  );
}

type EditorProps =
  | { mode: 'create'; field?: undefined; onClose: () => void; onSaved: () => void }
  | { mode: 'edit'; field: DynamicField; onClose: () => void; onSaved: () => void };

function FieldEditor(props: EditorProps) {
  const toast = useToast();
  const isCreate = props.mode === 'create';
  const f = isCreate ? null : props.field;

  const [key, setKey] = useState(f?.key ?? '');
  const [label, setLabel] = useState(f?.label ?? '');
  const [type, setType] = useState<FieldType>(f?.type ?? 'text');
  const [isRequired, setIsRequired] = useState(f?.isRequired ?? false);
  const [isActive, setIsActive] = useState(f?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(f?.sortOrder ?? 0));
  const [locking, setLocking] = useState<FieldLocking>(f?.locking ?? 'none');
  const [validation, setValidation] = useState(JSON.stringify(f?.validation ?? {}, null, 2));
  const [visibility, setVisibility] = useState(JSON.stringify(f?.visibility ?? { roles: '*' }, null, 2));

  const m = useMutation({
    mutationFn: () => {
      const v = parseJson(validation, 'validation');
      const vis = parseJson(visibility, 'visibility');
      if (isCreate) {
        return DynamicFieldsService.create({
          key, label, type, isRequired, isActive,
          sortOrder: parseInt(sortOrder, 10) || 0,
          validation: v, visibility: vis as { roles: '*' | string[] }, locking,
        });
      }
      return DynamicFieldsService.update(props.field.id, {
        label, isRequired, isActive,
        sortOrder: parseInt(sortOrder, 10) || 0,
        validation: v, visibility: vis as { roles: '*' | string[] }, locking,
      });
    },
    onSuccess: () => { toast.success('Saved'); props.onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={props.onClose}
      title={isCreate ? 'New field' : `Edit — ${f!.key}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Key {!isCreate && <span className="muted">(immutable)</span>}</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isCreate} />
        </div>
        <div className="field"><label>Type {!isCreate && <span className="muted">(immutable)</span>}</label>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)} disabled={!isCreate}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field"><label>Sort order</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <div className="field"><label>Locking</label>
          <select value={locking} onChange={(e) => setLocking(e.target.value as FieldLocking)}>
            {LOCKINGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="field row" style={{ gridColumn: '1 / -1' }}>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            <span>Required</span>
          </label>
          <label className="row" style={{ cursor: 'pointer', marginLeft: 16 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>Active</span>
          </label>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Validation (JSON)</label>
          <textarea className="mono" value={validation} onChange={(e) => setValidation(e.target.value)} rows={4} />
          <span className="hint">e.g. <code className="mono">{`{"min":0,"max":100}`}</code> · <code className="mono">{`{"maxLength":500}`}</code></span>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Visibility (JSON)</label>
          <textarea className="mono" value={visibility} onChange={(e) => setVisibility(e.target.value)} rows={3} />
          <span className="hint">
            <code className="mono">{`{"roles":"*"}`}</code> for everyone, or <code className="mono">{`{"roles":["supervisor"]}`}</code>.
          </span>
        </div>
      </div>
    </Modal>
  );
}

function OptionsEditor({
  field, onClose, onSaved,
}: { field: DynamicField; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<OptionInput[]>(() =>
    (field.options ?? []).map((o) => ({ id: o.id, value: o.value, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive })),
  );

  useEffect(() => {
    setRows((field.options ?? []).map((o) => ({ id: o.id, value: o.value, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive })));
  }, [field.id]);

  const m = useMutation({
    mutationFn: () => DynamicFieldsService.replaceOptions(field.id, rows),
    onSuccess: () => { toast.success('Options saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Options — ${field.key}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <table>
        <thead>
          <tr><th>Order</th><th>Value</th><th>Label</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `new-${i}`}>
              <td><input type="number" value={r.sortOrder ?? i} onChange={(e) => updateRow(setRows, i, { sortOrder: Number(e.target.value) })} style={{ width: 60 }} /></td>
              <td><input value={r.value} onChange={(e) => updateRow(setRows, i, { value: e.target.value })} /></td>
              <td><input value={r.label} onChange={(e) => updateRow(setRows, i, { label: e.target.value })} /></td>
              <td><input type="checkbox" checked={r.isActive ?? true} onChange={(e) => updateRow(setRows, i, { isActive: e.target.checked })} /></td>
              <td className="right">
                <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-end" style={{ marginTop: 8 }}>
        <Button variant="secondary" onClick={() => setRows([...rows, { value: '', label: '', isActive: true, sortOrder: rows.length }])}>
          + Add option
        </Button>
      </div>
    </Modal>
  );
}

function updateRow(setter: React.Dispatch<React.SetStateAction<OptionInput[]>>, idx: number, patch: Partial<OptionInput>) {
  setter((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
}

function parseJson(s: string, what: string): Record<string, unknown> {
  try { return JSON.parse(s); }
  catch { throw new Error(`Invalid JSON in ${what}`); }
}
