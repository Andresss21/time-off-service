import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { hcmConfig } from '../common/config';

export interface HcmBalanceRecord {
  employeeId: string;
  locationId: string;
  balanceDays: number;
  lastSequence: number;
  leaveType?: string;
  version?: number;
  updatedAt?: string;
}

export interface HcmLedgerEntry {
  entryId: string;
  employeeId: string;
  locationId: string;
  type: 'GRANT' | 'DEDUCTION' | 'ADJUSTMENT' | 'RESET';
  delta?: number;
  setTo?: number;
  reason: string;
  source: string;
  sequence: number;
  leaveType?: string;
  effectiveAt?: string;
  recordedAt?: string;
}

export interface HcmBalancesFullResponse {
  generatedAt: string;
  count: number;
  records: HcmBalanceRecord[];
}

export interface HcmBalancesDeltaResponse {
  generatedAt: string;
  count: number;
  entries: HcmLedgerEntry[];
}

export interface HcmPostTimeOffSuccessResponse {
  balanceDays: number;
  [key: string]: unknown;
}

export interface HcmHttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export interface HcmPostTimeOffBody {
  requestId: string;
  employeeId: string;
  locationId: string;
  requestedDays: number;
}

@Injectable()
export class HcmClientService {
  constructor(
    @Inject(hcmConfig.KEY)
    private readonly cfg: ConfigType<typeof hcmConfig>,
  ) {}

  async getBalances(
    since?: number,
  ): Promise<HcmHttpResponse<HcmBalancesFullResponse | HcmBalancesDeltaResponse>> {
    const url =
      since != null
        ? `${this.cfg.baseUrl}/api/v1/balances?since=${since}`
        : `${this.cfg.baseUrl}/api/v1/balances`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': this.cfg.apiKey },
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });

    const data = await response.json();

    return {
      status: response.status,
      headers: this.headersToRecord(response.headers),
      data,
    };
  }

  async postTimeOff(
    body: HcmPostTimeOffBody,
  ): Promise<HcmHttpResponse<HcmPostTimeOffSuccessResponse | unknown>> {
    const response = await fetch(
      `${this.cfg.baseUrl}/api/v1/time-off`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': this.cfg.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      },
    );

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      status: response.status,
      headers: this.headersToRecord(response.headers),
      data,
    };
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
