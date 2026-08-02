import { useState } from 'react';
import { FileScan, Upload } from 'lucide-react';

import { FiscalInboxView } from './FiscalInboxView';
import { InvoiceDocumentsView } from './InvoiceDocumentsView';

type Props = {
  accessToken: string | null;
  canConfigure: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

export function FiscalWorkspaceView(props: Props) {
  const [tab, setTab] = useState<'SEFAZ' | 'UPLOAD'>('SEFAZ');
  return (
    <div className="fiscal-workspace">
      <div className="workspace-tabs" role="tablist">
        <button aria-selected={tab === 'SEFAZ'} onClick={() => setTab('SEFAZ')} role="tab" type="button"><FileScan size={16} />Caixa NF-e</button>
        <button aria-selected={tab === 'UPLOAD'} onClick={() => setTab('UPLOAD')} role="tab" type="button"><Upload size={16} />Upload e OCR</button>
      </div>
      {tab === 'SEFAZ' ? <FiscalInboxView {...props} /> : <InvoiceDocumentsView accessToken={props.accessToken} canWrite={props.canWrite} onChanged={props.onChanged} organizationId={props.organizationId} />}
    </div>
  );
}
