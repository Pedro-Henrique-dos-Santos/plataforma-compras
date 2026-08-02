type ReceiptItem = {
  quantity: unknown;
  receipt: { status: string };
};

type PurchaseItem = {
  quantity: unknown;
  receiptItems: ReceiptItem[];
};

type FiscalItem = {
  matchedPurchaseItemId: string | null;
  quantity: unknown;
  receiptItems: ReceiptItem[];
};

export type ReconciliationTitle = {
  fiscalDocumentId: string | null;
  fiscalDocument: { fiscalItems: FiscalItem[] } | null;
  purchase: {
    fiscalDocumentRequired: boolean;
    fiscalDocumentLinks: Array<{
      invoiceDocumentId: string;
      matchStatus: string;
    }>;
    items: PurchaseItem[];
  };
};

export function titleIsMatched(title: ReconciliationTitle): boolean {
  if (!title.purchase.fiscalDocumentRequired) {
    return purchaseIsFullyReceived(title.purchase);
  }
  const validLinks = title.purchase.fiscalDocumentLinks.filter((link) =>
    ['MATCHED_EXACT', 'MATCHED_MANUAL'].includes(link.matchStatus),
  );
  if (!title.fiscalDocumentId) {
    return validLinks.length > 0 && purchaseIsFullyReceived(title.purchase);
  }
  if (!validLinks.some((link) => link.invoiceDocumentId === title.fiscalDocumentId)) {
    return false;
  }
  if (!title.fiscalDocument?.fiscalItems.length) {
    return purchaseIsFullyReceived(title.purchase);
  }
  return title.fiscalDocument.fiscalItems.every(
    (item) =>
      item.matchedPurchaseItemId !== null &&
      quantitySum(
        item.receiptItems
          .filter((receiptItem) => receiptItem.receipt.status === 'CONFIRMED')
          .map((receiptItem) => receiptItem.quantity),
      ) >=
        numeric(item.quantity) - 0.0001,
  );
}

function purchaseIsFullyReceived(purchase: ReconciliationTitle['purchase']): boolean {
  return (
    purchase.items.length > 0 &&
    purchase.items.every(
      (item) =>
        quantitySum(
          item.receiptItems
            .filter((receiptItem) => receiptItem.receipt.status === 'CONFIRMED')
            .map((receiptItem) => receiptItem.quantity),
        ) >=
        numeric(item.quantity) - 0.0001,
    )
  );
}

function quantitySum(values: unknown[]): number {
  return Math.round(values.reduce<number>((sum, value) => sum + numeric(value), 0) * 10_000) /
    10_000;
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object' && 'toString' in value) {
    return Number(String(value)) || 0;
  }
  return 0;
}
