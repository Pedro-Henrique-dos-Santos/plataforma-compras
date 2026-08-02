export type ExactFiscalItem = {
  description: string;
  quantity: number;
  sequence: number;
  total: number;
  unitPrice: number;
};

export type ExactFiscalPurchase = {
  fiscalDocumentLinks: Array<{
    invoiceDocument: {
      fiscalItems: Array<{
        matchedPurchaseItemId: string | null;
        quantity: unknown;
      }>;
    };
  }>;
  items: Array<{
    description: string;
    id: string;
    negotiatedPrice: unknown;
    quantity: unknown;
    unitPrice: unknown;
  }>;
};

export function exactItemMatches(
  purchase: ExactFiscalPurchase,
  items: ExactFiscalItem[],
  fiscalTotal: number | null,
): Array<{ purchaseItemId: string; sequence: number }> | null {
  const lineTotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  if (fiscalTotal === null || Math.abs(lineTotal - fiscalTotal) > 0.02) return null;
  const alreadyInvoiced = new Map<string, number>();
  for (const link of purchase.fiscalDocumentLinks) {
    for (const item of link.invoiceDocument.fiscalItems) {
      if (!item.matchedPurchaseItemId) continue;
      alreadyInvoiced.set(
        item.matchedPurchaseItemId,
        (alreadyInvoiced.get(item.matchedPurchaseItemId) ?? 0) + numeric(item.quantity),
      );
    }
  }
  const consumed = new Map<string, number>();
  const matches: Array<{ purchaseItemId: string; sequence: number }> = [];
  for (const fiscalItem of items) {
    const candidates = purchase.items.filter((purchaseItem) => {
      const expectedPrice = numeric(
        purchaseItem.negotiatedPrice ?? purchaseItem.unitPrice,
      );
      const available =
        numeric(purchaseItem.quantity) -
        (alreadyInvoiced.get(purchaseItem.id) ?? 0) -
        (consumed.get(purchaseItem.id) ?? 0);
      return (
        normalize(purchaseItem.description) === normalize(fiscalItem.description) &&
        Math.abs(expectedPrice - fiscalItem.unitPrice) <= 0.0001 &&
        fiscalItem.quantity <= available + 0.0001 &&
        Math.abs(
          roundMoney(fiscalItem.quantity * fiscalItem.unitPrice) - fiscalItem.total,
        ) <= 0.02
      );
    });
    if (candidates.length !== 1) return null;
    const candidate = candidates[0]!;
    consumed.set(
      candidate.id,
      (consumed.get(candidate.id) ?? 0) + fiscalItem.quantity,
    );
    matches.push({ purchaseItemId: candidate.id, sequence: fiscalItem.sequence });
  }
  return matches;
}

export function hasPurchaseReference(
  purchase: { number: string; sourceReference: string | null },
  references: string[],
): boolean {
  const expected = [purchase.number, purchase.sourceReference]
    .filter((value): value is string => Boolean(value))
    .map(normalizeReference);
  return references.some((reference) => {
    const normalized = normalizeReference(reference);
    return expected.some(
      (candidate) =>
        normalized === candidate ||
        (candidate.length >= 6 && normalized.includes(candidate)),
    );
  });
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeReference(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    return Number(String(value));
  }
  return 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
