import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityLogEntry = {
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ErrorLogEntry = {
  errorMessage: string;
  stackTrace?: string | null;
  requestMethod?: string | null;
  requestUrl?: string | null;
  requestBody?: Record<string, unknown> | null;
  actorId?: string | null;
  actorName?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type ActivityLogRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type ErrorLogRow = {
  id: string;
  error_message: string;
  stack_trace: string | null;
  request_method: string | null;
  request_url: string | null;
  request_body: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  status_code: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function logActivity(pool: Pool, entry: ActivityLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO activity_log (actor_id, actor_name, action, target_type, target_id, target_label, metadata, snapshot, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::inet, $10)`,
    [
      entry.actorId,
      entry.actorName,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.targetLabel ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.snapshot ? JSON.stringify(entry.snapshot) : null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ],
  );
}

export async function logError(pool: Pool, entry: ErrorLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO error_log (error_message, stack_trace, request_method, request_url, request_body, actor_id, actor_name, status_code, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::inet, $10)`,
    [
      entry.errorMessage,
      entry.stackTrace ?? null,
      entry.requestMethod ?? null,
      entry.requestUrl ?? null,
      entry.requestBody ? JSON.stringify(entry.requestBody) : null,
      entry.actorId ?? null,
      entry.actorName ?? null,
      entry.statusCode ?? null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Read — Activity Logs
// ---------------------------------------------------------------------------

export async function listActivityLogs(
  pool: Pool,
  input: {
    q?: string;
    action?: string;
    targetType?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.q) {
    values.push(input.q);
    whereParts.push(`to_tsvector('simple', coalesce(action, '') || ' ' || coalesce(actor_name, '') || ' ' || coalesce(target_label, '')) @@ plainto_tsquery('simple', $${values.length})`);
  }
  if (input.action) {
    if (input.action.includes(".")) {
      values.push(input.action);
      whereParts.push(`action = $${values.length}`);
    } else {
      values.push(`${input.action}.%`);
      whereParts.push(`action LIKE $${values.length}`);
    }
  }
  if (input.targetType) {
    values.push(input.targetType);
    whereParts.push(`target_type = $${values.length}`);
  }
  if (input.actorId) {
    values.push(input.actorId);
    whereParts.push(`actor_id = $${values.length}`);
  }
  if (input.dateFrom) {
    values.push(input.dateFrom);
    whereParts.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (input.dateTo) {
    values.push(`${input.dateTo}T23:59:59.999Z`);
    whereParts.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereSQL = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<ActivityLogRow>(
      `SELECT id, actor_id, actor_name, action, target_type, target_id, target_label, metadata, ip_address, user_agent, created_at
       FROM activity_log ${whereSQL}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM activity_log ${whereSQL}`,
      values,
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.total ?? "0", 10);

  return {
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    })),
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      totalItems: total,
    },
  };
}

export async function getActivityLogById(pool: Pool, id: string) {
  const result = await pool.query<ActivityLogRow>(
    `SELECT * FROM activity_log WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    metadata: row.metadata,
    snapshot: row.snapshot,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Read — Error Logs
// ---------------------------------------------------------------------------

export async function listErrorLogs(
  pool: Pool,
  input: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
  },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.q) {
    values.push(`%${input.q}%`);
    whereParts.push(`(error_message ILIKE $${values.length} OR request_url ILIKE $${values.length})`);
  }
  if (input.dateFrom) {
    values.push(input.dateFrom);
    whereParts.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (input.dateTo) {
    values.push(`${input.dateTo}T23:59:59.999Z`);
    whereParts.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereSQL = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<ErrorLogRow>(
      `SELECT id, error_message, stack_trace, request_method, request_url, status_code, actor_id, actor_name, ip_address, user_agent, created_at
       FROM error_log ${whereSQL}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM error_log ${whereSQL}`,
      values,
    ),
  ]);

  const total = parseInt(totalResult.rows[0]?.total ?? "0", 10);

  return {
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      errorMessage: row.error_message,
      requestMethod: row.request_method,
      requestUrl: row.request_url,
      statusCode: row.status_code,
      actorName: row.actor_name,
      createdAt: row.created_at,
    })),
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      totalItems: total,
    },
  };
}

export async function getErrorLogById(pool: Pool, id: string) {
  const result = await pool.query<ErrorLogRow>(
    `SELECT * FROM error_log WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    errorMessage: row.error_message,
    stackTrace: row.stack_trace,
    requestMethod: row.request_method,
    requestUrl: row.request_url,
    requestBody: row.request_body,
    actorId: row.actor_id,
    actorName: row.actor_name,
    statusCode: row.status_code,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}
