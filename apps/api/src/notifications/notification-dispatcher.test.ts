import { describe, expect, it } from 'vitest';

import {
  renderNotificationText,
  renderWhatsAppTemplateParameters,
} from './notification-dispatcher.js';

const appUrl = 'https://compras.example.com/payables';

describe('notification rendering', () => {
  it('includes actionable finance payment data in email content', () => {
    const text = renderNotificationText(
      'PURCHASE_APPROVED_FOR_PAYMENT',
      {
        purchaseNumber: 'PED-900',
        supplierName: 'Fornecedor Teste',
        total: 1_250.5,
        installments: [
          {
            sequence: 1,
            dueDate: '2026-08-15',
            amount: 1_250.5,
            paymentChannel: 'BOLETO',
            paymentReference: '34191.79001 01043.510047',
          },
        ],
      },
      appUrl,
    );

    expect(text).toContain('Dados de pagamento:');
    expect(text).toContain('Parcela 1 - vencimento 15/08/2026');
    expect(text).toContain('Boleto - 34191.79001 01043.510047');
    expect(text).toContain(appUrl);
  });

  it('passes the direct URL and payment summary to WhatsApp templates', () => {
    expect(
      renderWhatsAppTemplateParameters(
        'PURCHASE_APPROVAL_REQUESTED',
        {
          purchaseNumber: 'PED-901',
          supplierName: 'Fornecedor Teste',
          total: 900,
        },
        'https://compras.example.com/approvals',
      ),
    ).toEqual([
      'PED-901',
      'Fornecedor Teste',
      'R$ 900,00',
      'https://compras.example.com/approvals',
    ]);

    const financeParameters = renderWhatsAppTemplateParameters(
      'PURCHASE_APPROVED_FOR_PAYMENT',
      {
        purchaseNumber: 'PED-902',
        supplierName: 'Fornecedor Pix',
        total: 2_000,
        supplierPayment: {
          pixKeyType: 'CNPJ',
          pixKey: '11222333000181',
          paymentLink: null,
        },
        installments: [],
      },
      appUrl,
    );
    expect(financeParameters).toEqual([
      'PED-902',
      'Fornecedor Pix',
      'R$ 2.000,00',
      'PIX (CNPJ) - 11222333000181',
      appUrl,
    ]);
  });

  it('renders payment lifecycle and fiscal review notifications', () => {
    const payment = renderNotificationText(
      'PAYMENT_PARTIALLY_SETTLED',
      {
        amount: 400,
        purchaseNumber: 'PED-903',
        remainingBalance: 600,
        supplierName: 'Fornecedor Parcial',
        total: 1_000,
      },
      appUrl,
    );
    expect(payment).toContain('baixa parcial');
    expect(payment).toContain('Saldo: R$ 600,00');

    const fiscal = renderNotificationText(
      'FISCAL_REVIEW_REQUIRED',
      {
        invoiceNumber: '456',
        issuerDocument: '12ABC34501DE35',
        total: 750,
      },
      appUrl,
    );
    expect(fiscal).toContain('NF-e 456 requer revisao');
    expect(
      renderWhatsAppTemplateParameters(
        'FISCAL_REVIEW_REQUIRED',
        { invoiceNumber: '456', issuerDocument: '12ABC34501DE35', total: 750 },
        appUrl,
      ),
    ).toEqual(['456', '12ABC34501DE35', 'R$ 750,00', appUrl]);
  });
});
