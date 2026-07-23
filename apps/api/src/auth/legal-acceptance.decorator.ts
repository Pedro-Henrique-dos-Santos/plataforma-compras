import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_LEGAL_ACCEPTANCE = 'auth:allow-pending-legal-acceptance';

export const AllowPendingLegalAcceptance = () =>
  SetMetadata(ALLOW_PENDING_LEGAL_ACCEPTANCE, true);
