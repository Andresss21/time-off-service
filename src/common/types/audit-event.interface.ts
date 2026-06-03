export enum AuditEventType {
  PUSH_SIGNATURE_INVALID                   = 'PUSH_SIGNATURE_INVALID',
  PUSH_REPLAY_DETECTED                     = 'PUSH_REPLAY_DETECTED',
  PUSH_SCHEMA_INVALID                      = 'PUSH_SCHEMA_INVALID',
  INTEGRITY_VIOLATION_NEGATIVE_BALANCE     = 'INTEGRITY_VIOLATION_NEGATIVE_BALANCE',
  INTEGRITY_ANNOTATION_ZERO_BALANCE        = 'INTEGRITY_ANNOTATION_ZERO_BALANCE',
  CREDENTIAL_ERROR                         = 'CREDENTIAL_ERROR',
  REQUEST_EXHAUSTED                        = 'REQUEST_EXHAUSTED',
  SYNC_RESET_INVALID                       = 'SYNC_RESET_INVALID',
}

export enum AuditEventSeverity {
  CRITICAL = 'CRITICAL',
  HIGH     = 'HIGH',
  MEDIUM   = 'MEDIUM',
  LOW      = 'LOW',
}

export enum AuditEventSourceSubsystem {
  PUSH_VERIFICATION = 'push-verification',
  DEDUCTION_FLOW    = 'deduction-flow',
  SYNC_ENGINE       = 'sync-engine',
}

export interface AuditEventBase {
  eventType:        AuditEventType;
  occurredAt:       string;
  severity:         AuditEventSeverity;
  sourceSubsystem:  AuditEventSourceSubsystem;
}

export interface PushSignatureInvalidEvent extends AuditEventBase {
  eventType:              AuditEventType.PUSH_SIGNATURE_INVALID;
  severity:               AuditEventSeverity.HIGH;
  sourceSubsystem:        AuditEventSourceSubsystem.PUSH_VERIFICATION;
  sourceIp:               string | null;
  requestContentLength:   number;
  rejectionGate:          'Gate 2';
  // CRITICAL: the received X-HCM-Signature digest and the computed digest
  // must NEVER be included here. L1-adr Decision 5.
}

export interface PushReplayDetectedEvent extends AuditEventBase {
  eventType:             AuditEventType.PUSH_REPLAY_DETECTED;
  severity:              AuditEventSeverity.HIGH;
  sourceSubsystem:       AuditEventSourceSubsystem.PUSH_VERIFICATION;
  presentedTimestamp:    number;
  serverTimeAtRejection: number;
  deviationMs:           number;
  rejectionGate:         'Gate 1';
}

export interface PushSchemaInvalidEvent extends AuditEventBase {
  eventType:                   AuditEventType.PUSH_SCHEMA_INVALID;
  severity:                    AuditEventSeverity.MEDIUM;
  sourceSubsystem:             AuditEventSourceSubsystem.PUSH_VERIFICATION;
  sanitizedFailureDescription: string;
  rejectionGate:               'Gate 3';
}

export interface IntegrityViolationNegativeBalanceEvent extends AuditEventBase {
  eventType:            AuditEventType.INTEGRITY_VIOLATION_NEGATIVE_BALANCE;
  severity:             AuditEventSeverity.HIGH;
  sourceSubsystem:      AuditEventSourceSubsystem.DEDUCTION_FLOW;
  requestId:            string;
  employeeId:           string;
  locationId:           string;
  requestedDays:        number;
  returnedBalanceDays:  number;
}

export interface IntegrityAnnotationZeroBalanceEvent extends AuditEventBase {
  eventType:            AuditEventType.INTEGRITY_ANNOTATION_ZERO_BALANCE;
  severity:             AuditEventSeverity.LOW;
  sourceSubsystem:      AuditEventSourceSubsystem.DEDUCTION_FLOW;
  requestId:            string;
  employeeId:           string;
  locationId:           string;
  requestedDays:        number;
  returnedBalanceDays:  0;
}

export interface CredentialErrorEvent extends AuditEventBase {
  eventType:       AuditEventType.CREDENTIAL_ERROR;
  severity:        AuditEventSeverity.CRITICAL;
  sourceSubsystem: AuditEventSourceSubsystem.DEDUCTION_FLOW;
  requestId:       string;
  employeeId:      string;
  locationId:      string;
  httpStatus:      401 | 403;
}

export interface RequestExhaustedEvent extends AuditEventBase {
  eventType:                       AuditEventType.REQUEST_EXHAUSTED;
  severity:                        AuditEventSeverity.HIGH;
  sourceSubsystem:                 AuditEventSourceSubsystem.DEDUCTION_FLOW;
  requestId:                       string;
  employeeId:                      string;
  locationId:                      string;
  requestedDays:                   number;
  postAttemptCount:                number;
  firstPostAttemptAt:              string;
  hcmPrePostSequenceAtLastAttempt: number;
  exhaustionReason:                'attempt_limit' | 'time_window';
}

export interface SyncResetInvalidEvent extends AuditEventBase {
  eventType:       AuditEventType.SYNC_RESET_INVALID;
  severity:        AuditEventSeverity.MEDIUM;
  sourceSubsystem: AuditEventSourceSubsystem.SYNC_ENGINE;
  employeeId:      string;
  locationId:      string;
  presentedSetTo:  number;
  ledgerSequence:  number;
}

export type AuditEvent =
  | PushSignatureInvalidEvent
  | PushReplayDetectedEvent
  | PushSchemaInvalidEvent
  | IntegrityViolationNegativeBalanceEvent
  | IntegrityAnnotationZeroBalanceEvent
  | CredentialErrorEvent
  | RequestExhaustedEvent
  | SyncResetInvalidEvent;
