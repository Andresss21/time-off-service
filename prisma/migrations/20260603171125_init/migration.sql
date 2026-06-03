-- CreateTable
CREATE TABLE "time_off_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "requested_days" REAL NOT NULL,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "integrity_flag" BOOLEAN NOT NULL DEFAULT false,
    "hcm_outcome_status" INTEGER,
    "resolved_at" DATETIME,
    "hcm_pre_post_sequence" INTEGER,
    "post_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "first_post_attempt_at" DATETIME,
    "retry_not_before" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "balance_cache" (
    "employee_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "balance_days" REAL NOT NULL,
    "last_hcm_sequence" INTEGER NOT NULL,
    "last_synced_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,

    PRIMARY KEY ("employee_id", "location_id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "global_cursor" INTEGER,
    "last_successful_sync_at" DATETIME,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "severity" TEXT NOT NULL,
    "source_subsystem" TEXT NOT NULL,
    "employee_id" TEXT,
    "request_id" TEXT,
    "context" TEXT NOT NULL,
    "archived_at" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "time_off_request_idempotency_key_key" ON "time_off_request"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_time_off_request_balance_query" ON "time_off_request"("employee_id", "location_id", "state");

-- CreateIndex
CREATE INDEX "idx_time_off_request_state" ON "time_off_request"("state");

-- ============================================================================
-- Partial indexes for audit_log (cannot be expressed via Prisma @@index)
-- Required by L4 FC-4
-- ============================================================================

-- Active hot path: manager queries on active audit events
CREATE INDEX idx_audit_active
ON audit_log(severity, event_type, occurred_at DESC)
WHERE archived_at IS NULL;

-- Archive cold path: time-range queries on archived events
CREATE INDEX idx_audit_archive
ON audit_log(occurred_at DESC)
WHERE archived_at IS NOT NULL;

-- Employee filter: spans both active and archived events
CREATE INDEX idx_audit_employee
ON audit_log(employee_id, occurred_at DESC)
WHERE employee_id IS NOT NULL;

-- ============================================================================
-- Immutability triggers for audit_log (cannot be expressed via Prisma schema)
-- Required by L4 FC-3
-- ============================================================================

-- Block all updates except the archival move (NULL → non-null archived_at)
CREATE TRIGGER audit_log_prevent_update
AFTER UPDATE ON audit_log
WHEN NOT (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'audit_log records are immutable — only archival is permitted');
END;

-- Block deletion of active records (archived records may be deleted for expiry)
CREATE TRIGGER audit_log_prevent_active_delete
AFTER DELETE ON audit_log
WHEN OLD.archived_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Deleting active audit_log records is not permitted');
END;
