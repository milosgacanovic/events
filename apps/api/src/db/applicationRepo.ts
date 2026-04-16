import type { Pool } from "pg";

export type ApplicationRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  intent: string;
  intent_other: string | null;
  description: string | null;
  practice_category_ids: string[];
  proof_url: string | null;
  claim_host_id: string | null;
  status: string;
  admin_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

// Column list in sync with ApplicationRow. Prefix with `a.` via the helper below
// when the query aliases the table.
const APPLICATION_COLUMNS = `
  id, user_id, name, email, intent, intent_other, description, practice_category_ids,
  proof_url, claim_host_id, status, admin_notes, rejection_reason, reviewed_by,
  reviewed_at, created_at, updated_at
`;
const APPLICATION_COLUMNS_A = APPLICATION_COLUMNS
  .split(",")
  .map((col) => `a.${col.trim()}`)
  .join(", ");

export async function createApplication(
  pool: Pool,
  input: {
    userId: string;
    name: string;
    email: string;
    intent: string;
    intentOther?: string;
    description?: string;
    practiceCategoryIds?: string[];
    proofUrl?: string;
    claimHostId?: string;
  },
): Promise<ApplicationRow> {
  const result = await pool.query<ApplicationRow>(
    `
      insert into editor_applications (user_id, name, email, intent, intent_other, description, practice_category_ids, proof_url, claim_host_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning ${APPLICATION_COLUMNS}
    `,
    [
      input.userId,
      input.name,
      input.email,
      input.intent,
      input.intentOther ?? null,
      input.description ?? "",
      input.practiceCategoryIds ?? [],
      input.proofUrl ?? "",
      input.claimHostId ?? null,
    ],
  );
  return result.rows[0];
}

export async function listApplications(
  pool: Pool,
  input: { status?: string; page: number; pageSize: number },
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.status) {
    values.push(input.status);
    whereParts.push(`a.status = $${values.length}`);
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<ApplicationRow>(
      `select ${APPLICATION_COLUMNS_A} from editor_applications a ${whereSql} order by a.created_at desc limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count from editor_applications a ${whereSql}`,
      values,
    ),
  ]);

  return {
    items: itemsResult.rows,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(Number(totalResult.rows[0]?.count ?? "0") / pageSize), 1),
      totalItems: Number(totalResult.rows[0]?.count ?? "0"),
    },
  };
}

export async function getApplicationById(pool: Pool, id: string): Promise<ApplicationRow | null> {
  const result = await pool.query<ApplicationRow>(
    `select ${APPLICATION_COLUMNS} from editor_applications where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateApplicationStatus(
  pool: Pool,
  id: string,
  input: {
    status: string;
    adminNotes?: string;
    rejectionReason?: string;
    reviewedBy: string;
  },
): Promise<ApplicationRow | null> {
  const result = await pool.query<ApplicationRow>(
    `
      update editor_applications
      set status = $2, admin_notes = coalesce($3, admin_notes), rejection_reason = $4,
          reviewed_by = $5, reviewed_at = now(), updated_at = now()
      where id = $1
      returning *
    `,
    [id, input.status, input.adminNotes ?? null, input.rejectionReason ?? null, input.reviewedBy],
  );
  return result.rows[0] ?? null;
}
