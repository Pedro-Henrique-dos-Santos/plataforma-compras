import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

type OutboxNotification = {
  id: string;
  eventType: string;
  channel: 'EMAIL' | 'WHATSAPP';
  recipient: string;
  subject: string | null;
  payload: unknown;
};

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private transporter: Transporter | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async dispatch(notification: OutboxNotification): Promise<string> {
    const mode = this.config.get<string>('NOTIFICATION_DELIVERY_MODE', 'log');
    if (mode === 'log') {
      this.logger.log(
        `Notification ${notification.id} accepted in log mode (${notification.channel}).`,
      );
      return `log:${notification.id}`;
    }
    return notification.channel === 'EMAIL'
      ? this.sendEmail(notification)
      : this.sendWhatsApp(notification);
  }

  private async sendEmail(notification: OutboxNotification): Promise<string> {
    const transporter = this.emailTransporter();
    const payload = objectPayload(notification.payload);
    const appUrl = this.notificationUrl(payload);
    const text = renderNotificationText(notification.eventType, payload, appUrl);
    const result = await transporter.sendMail({
      from: requiredConfig(this.config, 'SMTP_FROM'),
      to: notification.recipient,
      subject: notification.subject ?? 'Atualizacao de compras',
      text,
      html: textToHtml(text, appUrl),
    });
    return String(result.messageId);
  }

  private async sendWhatsApp(notification: OutboxNotification): Promise<string> {
    const payload = objectPayload(notification.payload);
    const appUrl = this.notificationUrl(payload);
    const accessToken = requiredConfig(this.config, 'WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = requiredConfig(this.config, 'WHATSAPP_PHONE_NUMBER_ID');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v23.0');
    const templateName = whatsappTemplateName(
      this.config,
      notification.eventType,
    );
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(this.requestTimeout()),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: notification.recipient.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: this.config.get<string>(
                'WHATSAPP_TEMPLATE_LANGUAGE',
                'pt_BR',
              ),
            },
            components: [
              {
                type: 'body',
                parameters: renderWhatsAppTemplateParameters(
                  notification.eventType,
                  payload,
                  appUrl,
                ).map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }),
      },
    );
    const body = (await response.json()) as {
      error?: { message?: string };
      messages?: Array<{ id?: string }>;
    };
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `WhatsApp recusou a notificacao: ${body.error?.message ?? response.status}.`,
      );
    }
    return body.messages?.[0]?.id ?? `whatsapp:${notification.id}`;
  }

  private emailTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const port = Number(requiredConfig(this.config, 'SMTP_PORT'));
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD')?.trim();
    this.transporter = nodemailer.createTransport({
      host: requiredConfig(this.config, 'SMTP_HOST'),
      port,
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      connectionTimeout: this.requestTimeout(),
      greetingTimeout: this.requestTimeout(),
      socketTimeout: this.requestTimeout(),
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    return this.transporter;
  }

  private requestTimeout(): number {
    return Number(
      this.config.get<string>('NOTIFICATION_REQUEST_TIMEOUT_MS', '15000'),
    );
  }

  private notificationUrl(payload: Record<string, unknown>): string {
    const baseUrl = requiredConfig(this.config, 'APP_WEB_URL');
    const requestedPath =
      typeof payload['appPath'] === 'string' ? payload['appPath'] : '/';
    const appPath =
      requestedPath.startsWith('/') && !requestedPath.startsWith('//')
        ? requestedPath
        : '/';
    return new URL(appPath, `${baseUrl}/`).toString();
  }
}

function requiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new ServiceUnavailableException(
      `O provedor de notificacoes nao esta configurado (${key}).`,
    );
  }
  return value;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function renderNotificationText(
  eventType: string,
  payload: Record<string, unknown>,
  appUrl: string,
): string {
  const purchaseNumber = textField(payload, 'purchaseNumber', 'sem numero');
  const supplierName = textField(payload, 'supplierName', 'Fornecedor nao informado');
  const total = currencyField(payload['total']);
  if (eventType === 'FISCAL_REVIEW_REQUIRED') {
    return [
      `A NF-e ${textField(payload, 'invoiceNumber', 'sem numero')} requer revisao.`,
      `Emitente: ${textField(payload, 'issuerDocument', 'nao identificado')}`,
      `Valor: ${currencyField(payload['total'])}`,
      `Acesse: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'FISCAL_CERTIFICATE_EXPIRING' || eventType === 'FISCAL_CERTIFICATE_EXPIRED') {
    const expired = eventType === 'FISCAL_CERTIFICATE_EXPIRED';
    return [
      expired ? 'O certificado A1 fiscal esta vencido.' : 'O certificado A1 fiscal esta proximo do vencimento.',
      `CNPJ: ${textField(payload, 'taxpayerDocument', 'nao informado')}`,
      `Validade: ${dateField(payload['expiresAt']) ?? 'nao informada'}`,
      `Acesse: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'PAYMENT_APPROVAL_REQUESTED') {
    return [
      `Os titulos da compra ${purchaseNumber} aguardam aprovacao financeira.`,
      `Fornecedor: ${supplierName}`,
      `Valor: ${total}`,
      `Acesse: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'PURCHASE_APPROVAL_REJECTED' || eventType === 'PAYMENT_APPROVAL_REJECTED') {
    const comment = textField(payload, 'comment', 'Motivo nao informado');
    return [
      eventType === 'PAYMENT_APPROVAL_REJECTED'
        ? `O pagamento da compra ${purchaseNumber} foi reprovado.`
        : `A compra ${purchaseNumber} foi reprovada.`,
      `Fornecedor: ${supplierName}`,
      `Valor: ${total}`,
      `Motivo: ${comment}`,
      `Acesse: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'PAYMENT_RELEASED') {
    return [
      `Os titulos da compra ${purchaseNumber} foram liberados para pagamento.`,
      `Fornecedor: ${supplierName}`,
      `Valor: ${total}`,
      `Consulte os dados e vencimentos em: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'PAYMENT_SETTLED' || eventType === 'PAYMENT_PARTIALLY_SETTLED') {
    return [
      eventType === 'PAYMENT_SETTLED'
        ? `O titulo da compra ${purchaseNumber} foi liquidado.`
        : `Uma baixa parcial foi registrada na compra ${purchaseNumber}.`,
      `Fornecedor: ${supplierName}`,
      `Valor da baixa: ${currencyField(payload['amount'])}`,
      `Saldo: ${currencyField(payload['remainingBalance'])}`,
      `Acesse: ${appUrl}`,
    ].join('\n');
  }
  if (eventType === 'PURCHASE_APPROVED_FOR_PAYMENT') {
    const paymentInstructions = financePaymentInstructions(payload);
    return [
      `A compra ${purchaseNumber} foi aprovada para pagamento.`,
      `Fornecedor: ${supplierName}`,
      `Valor: ${total}`,
      paymentInstructions.length
        ? 'Dados de pagamento:'
        : 'Dados de pagamento ainda nao informados.',
      ...paymentInstructions.map((instruction) => `- ${instruction}`),
      `Consulte os dados e vencimentos em: ${appUrl}`,
    ].join('\n');
  }
  return [
    `A compra ${purchaseNumber} aguarda sua aprovacao.`,
    `Fornecedor: ${supplierName}`,
    `Valor: ${total}`,
    `Acesse: ${appUrl}`,
  ].join('\n');
}

function textToHtml(text: string, appUrl: string): string {
  const lines = text.split('\n');
  return `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.5">${lines
    .map((line) =>
      line.startsWith('Acesse:') || line.startsWith('Consulte os dados')
        ? `<p><a href="${escapeHtml(appUrl)}">Abrir no E-Gestao Compras</a></p>`
        : `<p>${escapeHtml(line)}</p>`,
    )
    .join('')}</div>`;
}

function whatsappTemplateName(
  config: ConfigService,
  eventType: string,
): string {
  if (eventType === 'PURCHASE_APPROVAL_REJECTED' || eventType === 'PAYMENT_APPROVAL_REJECTED') {
    return requiredConfig(config, 'WHATSAPP_REJECTION_TEMPLATE');
  }
  if (
    eventType === 'PURCHASE_APPROVED_FOR_PAYMENT' ||
    eventType === 'PAYMENT_RELEASED' ||
    eventType === 'PAYMENT_SETTLED' ||
    eventType === 'PAYMENT_PARTIALLY_SETTLED'
  ) {
    return requiredConfig(config, 'WHATSAPP_FINANCE_TEMPLATE');
  }
  if (eventType.startsWith('FISCAL_')) {
    return requiredConfig(config, 'WHATSAPP_FISCAL_TEMPLATE');
  }
  return requiredConfig(config, 'WHATSAPP_APPROVAL_TEMPLATE');
}

export function renderWhatsAppTemplateParameters(
  eventType: string,
  payload: Record<string, unknown>,
  appUrl: string,
): string[] {
  if (eventType === 'FISCAL_REVIEW_REQUIRED') {
    return [
      textField(payload, 'invoiceNumber', 'sem numero'),
      textField(payload, 'issuerDocument', 'nao identificado'),
      currencyField(payload['total']),
      appUrl,
    ];
  }
  if (eventType === 'FISCAL_CERTIFICATE_EXPIRING' || eventType === 'FISCAL_CERTIFICATE_EXPIRED') {
    return [
      textField(payload, 'taxpayerDocument', 'nao informado'),
      dateField(payload['expiresAt']) ?? 'nao informada',
      eventType === 'FISCAL_CERTIFICATE_EXPIRED' ? 'Vencido' : 'Proximo do vencimento',
      appUrl,
    ];
  }
  const fields = [
    textField(payload, 'purchaseNumber', 'sem numero'),
    textField(payload, 'supplierName', 'Fornecedor nao informado'),
    currencyField(payload['total']),
  ];
  if (eventType === 'PURCHASE_APPROVAL_REJECTED' || eventType === 'PAYMENT_APPROVAL_REJECTED') {
    fields.push(textField(payload, 'comment', 'Motivo nao informado'));
  }
  if (
    eventType === 'PURCHASE_APPROVED_FOR_PAYMENT' ||
    eventType === 'PAYMENT_RELEASED' ||
    eventType === 'PAYMENT_SETTLED' ||
    eventType === 'PAYMENT_PARTIALLY_SETTLED'
  ) {
    fields.push(
      paymentNotificationSummary(eventType, payload),
    );
  }
  fields.push(appUrl);
  return fields;
}

function paymentNotificationSummary(
  eventType: string,
  payload: Record<string, unknown>,
): string {
  if (eventType === 'PAYMENT_RELEASED') return 'Liberado para pagamento';
  if (eventType === 'PAYMENT_SETTLED') {
    return `Liquidado - ${currencyField(payload['amount'])}`;
  }
  if (eventType === 'PAYMENT_PARTIALLY_SETTLED') {
    return `Baixa ${currencyField(payload['amount'])} - saldo ${currencyField(payload['remainingBalance'])}`;
  }
  return financePaymentInstructions(payload)[0] ?? 'Consulte os dados de pagamento no sistema';
}

function financePaymentInstructions(payload: Record<string, unknown>): string[] {
  const installments = Array.isArray(payload['installments'])
    ? payload['installments']
    : [];
  const instructions = installments.flatMap((value) => {
    const installment = objectPayload(value);
    if (!Object.keys(installment).length) return [];
    const sequence =
      typeof installment['sequence'] === 'number'
        ? `Parcela ${installment['sequence']}`
        : 'Parcela';
    const dueDate = dateField(installment['dueDate']);
    const amount = currencyField(installment['amount']);
    const channel = paymentChannelLabel(installment['paymentChannel']);
    const reference =
      typeof installment['paymentReference'] === 'string' &&
      installment['paymentReference'].trim()
        ? installment['paymentReference'].trim()
        : null;
    return [
      [
        sequence,
        dueDate ? `vencimento ${dueDate}` : null,
        amount,
        channel,
        reference,
      ]
        .filter(Boolean)
        .join(' - '),
    ];
  });
  if (instructions.length) return instructions;

  const supplierPayment = objectPayload(payload['supplierPayment']);
  const pixKey =
    typeof supplierPayment['pixKey'] === 'string' &&
    supplierPayment['pixKey'].trim()
      ? supplierPayment['pixKey'].trim()
      : null;
  if (pixKey) {
    const pixKeyType =
      typeof supplierPayment['pixKeyType'] === 'string'
        ? supplierPayment['pixKeyType']
        : 'chave';
    return [`PIX (${pixKeyType}) - ${pixKey}`];
  }
  const paymentLink =
    typeof supplierPayment['paymentLink'] === 'string' &&
    supplierPayment['paymentLink'].trim()
      ? supplierPayment['paymentLink'].trim()
      : null;
  return paymentLink ? [`Link de pagamento - ${paymentLink}`] : [];
}

function paymentChannelLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return (
    {
      PIX: 'PIX',
      CARD_LINK: 'Link de pagamento',
      BOLETO: 'Boleto',
      BANK_TRANSFER: 'Transferencia bancaria',
      OTHER: 'Outro meio de pagamento',
    }[value] ?? null
  );
}

function dateField(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function textField(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function currencyField(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(typeof value === 'number' && Number.isFinite(value) ? value : 0)
    .replace(/\u00a0/g, ' ');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  );
}
