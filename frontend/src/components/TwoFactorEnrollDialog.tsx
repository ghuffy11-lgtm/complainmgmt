import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { TwoFactorService, EnableResponse } from '../services/two-factor.service';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { errorMessage, useToast } from './ui/Toast';

type Step = 'scan' | 'verify' | 'backup-codes';

/**
 * 3-step enrollment wizard.
 *
 *   1. scan         — show QR + manual key from /auth/2fa/setup. The
 *                     user adds the entry to their authenticator app.
 *   2. verify       — user enters the first 6-digit code. We POST it
 *                     with the provisional secret to /auth/2fa/enable;
 *                     on success the response carries the backup codes
 *                     in plaintext (only time they're shown).
 *   3. backup-codes — display the codes with download / copy / print.
 *                     User must tick "I have saved these" to dismiss,
 *                     since this is their only chance.
 */
export function TwoFactorEnrollDialog({ onClose, onEnrolled, mandatory = false }: {
  onClose: () => void;
  onEnrolled: () => void;
  /** When true, the dialog refuses to close until enrollment finishes
   *  and there's no Cancel button — used for forced-enrollment of
   *  admin-role users (T-443). */
  mandatory?: boolean;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('scan');
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState<EnableResponse | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const setupQ = useQuery({
    queryKey: ['2fa-setup'],
    queryFn: () => TwoFactorService.setup(),
    refetchOnWindowFocus: false,
  });

  const enableM = useMutation({
    mutationFn: () =>
      TwoFactorService.enable(setupQ.data!.provisionalSecret, code),
    onSuccess: (data) => {
      setEnabled(data);
      setStep('backup-codes');
    },
    onError: (err) => toast.error(errorMessage(err, 'Code did not match')),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={
        step === 'scan'
          ? 'Set up two-factor authentication — Step 1 of 3'
          : step === 'verify'
            ? 'Set up two-factor authentication — Step 2 of 3'
            : 'Save your backup codes — Step 3 of 3'
      }
      footer={
        step === 'scan' ? (
          <>
            {!mandatory && <Button variant="secondary" onClick={onClose}>Cancel</Button>}
            <Button onClick={() => setStep('verify')} disabled={!setupQ.data}>
              Next
            </Button>
          </>
        ) : step === 'verify' ? (
          <>
            <Button variant="secondary" onClick={() => setStep('scan')}>Back</Button>
            <Button
              onClick={() => enableM.mutate()}
              disabled={!/^\d{6}$/.test(code) || enableM.isPending}
            >
              {enableM.isPending ? 'Verifying…' : 'Confirm'}
            </Button>
          </>
        ) : (
          <Button
            disabled={!acknowledged}
            onClick={() => {
              toast.success('Two-factor authentication enabled');
              onEnrolled();
            }}
          >
            Done
          </Button>
        )
      }
    >
      {step === 'scan' && (
        <>
          {mandatory && (
            <div
              className="rounded-md text-sm px-3 py-2 mb-3"
              style={{
                background: 'var(--warn-bg)',
                border: '1px solid var(--warn-border)',
                color: 'var(--warn)',
              }}
            >
              Admin accounts must use two-factor authentication. Complete this step to continue.
            </div>
          )}
          <p className="text-sm m-0 mb-2">
            Scan this QR code with an authenticator app — Google Authenticator, Microsoft Authenticator,
            Authy, or 1Password all work.
          </p>
          {setupQ.isLoading && <p className="muted">Generating secret…</p>}
          {setupQ.data && (
            <>
              <div
                className="bg-white p-3 rounded border border-border w-fit mx-auto"
                dangerouslySetInnerHTML={{ __html: setupQ.data.qrSvg }}
              />
              <p className="muted text-xs mt-3 m-0">
                If you can't scan, type this key into your app instead:
              </p>
              <div className="mono text-sm bg-surface-2 p-2 rounded border border-border mt-1 break-all">
                {setupQ.data.provisionalSecret}
              </div>
            </>
          )}
          {setupQ.isError && (
            <p className="text-danger text-sm">
              {errorMessage(setupQ.error, 'Could not generate secret. Server may not be configured for 2FA — see TOTP_ENCRYPTION_KEY in the deploy guide.')}
            </p>
          )}
        </>
      )}

      {step === 'verify' && (
        <>
          <p className="text-sm m-0 mb-2">
            Enter the 6-digit code currently shown in your authenticator app.
          </p>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="mono text-center"
            style={{ maxWidth: 200, letterSpacing: '0.3em', fontSize: '1.4em' }}
          />
          <p className="muted text-xs mt-2 m-0">
            Codes change every 30 seconds. Use the most recent one.
          </p>
        </>
      )}

      {step === 'backup-codes' && enabled && (
        <BackupCodesPanel
          codes={enabled.backupCodes}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      )}
    </Modal>
  );
}

function BackupCodesPanel({
  codes,
  acknowledged,
  onAcknowledge,
}: {
  codes: string[];
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
}) {
  const toast = useToast();
  const text = codes.join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Backup codes copied');
    } catch {
      toast.error('Could not access clipboard — please copy manually');
    }
  };

  const download = () => {
    const blob = new Blob([`# Backup codes — keep these safe.\n# Each can be used once if you lose access to your authenticator.\n\n${text}\n`], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cts-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="bg-warn/10 border border-warn/40 rounded p-3 text-sm">
        <strong>This is your only chance to save these.</strong>{' '}
        Each code lets you sign in once if you lose your authenticator.
        Store them somewhere safe (a password manager, a printed copy, an encrypted note).
      </div>
      <div className="grid grid-cols-2 gap-2 my-3 mono text-sm">
        {codes.map((c) => (
          <div key={c} className="bg-surface-2 px-2 py-1 rounded border border-border text-center">
            {c}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={copy}>Copy all</Button>
        <Button variant="secondary" size="sm" onClick={download}>Download .txt</Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>
      </div>
      <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        I have saved my backup codes somewhere safe.
      </label>
    </>
  );
}
