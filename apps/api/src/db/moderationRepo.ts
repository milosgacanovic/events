import type { Pool } from "pg";

export type ModerationQueueRow = {
  id: string;
  item_type: string;
  item_id: string;
  status: string;
  moderator_id: string | null;
  moderator_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const COLUMNS = `id, item_type, item_id, status, moderator_id, moderator_note, reviewed_at, created_at`;

export async function createQueueEntry(
  pool: Pool,
  itemType: string,
  itemId: string,
): Promise<ModerationQueueRow> {
  const result = await pool.query<ModerationQueueRow>(
    `INSERT INTO moderation_queue (item_type, item_id)
     VALUES ($1, $2)
     RETURNING ${COLUMNS}`,
    [itemType, itemId],
  );
  return result.rows[0];
}

export async function listPending(
  pool: Pool,
  itemType?: string,
): Promise<ModerationQueueRow[]> {
  if (itemType) {
    const result = await pool.query<ModerationQueueRow>(
      `SELECT ${COLUMNS} FROM moderation_queue
       WHERE status = 'pending' AND item_type = $1
       ORDER BY created_at ASC`,
      [itemType],
    );
    return result.rows;
  }
  const result = await pool.query<ModerationQueueRow>(
    `SELECT ${COLUMNS} FROM moderation_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC`,
  );
  return result.rows;
}

export async function updateStatus(
  pool: Pool,
  queueId: string,
  status: string,
  moderatorId: string,
  note?: string,
): Promise<ModerationQueueRow | null> {
  const result = await pool.query<ModerationQueueRow>(
    `UPDATE moderation_queue
     SET status = $2, moderator_id = $3, moderator_note = $4, reviewed_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [queueId, status, moderatorId, note ?? null],
  );
  return result.rows[0] ?? null;
}

// ── Enhanced admin queries ────────────────────────────────────────────

export type ModerationListInput = {
  type?: string;
  status?: string;
  search?: string;
  targetType?: string;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
};

export type ModerationDetailRow = ModerationQueueRow & {
  moderator_name: string | null;
  // comment fields (when item_type = 'comment')
  comment_body: string | null;
  comment_user_name: string | null;
  comment_event_id: string | null;
  comment_event_title: string | null;
  // suggestion fields (when item_type = 'edit_suggestion')
  suggestion_category: string | null;
  suggestion_value: string | null;
  suggestion_user_name: string | null;
  suggestion_target_type: string | null;
  suggestion_target_id: string | null;
  suggestion_event_title: string | null;
  // report fields (when item_type = 'report')
  report_reason: string | null;
  report_detail: string | null;
  reporter_name: string | null;
  report_target_type: string | null;
  report_target_id: string | null;
  report_target_label: string | null;
  report_count: number | null;
};

export async function listModerationItems(
  pool: Pool,
  input: ModerationListInput,
) {
  const page = Math.max(input.page, 1);
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const values: unknown[] = [];

  if (input.type) {
    values.push(input.type);
    whereParts.push(`mq.item_type = $${values.length}`);
  }
  if (input.status) {
    values.push(input.status);
    whereParts.push(`mq.status = $${values.length}`);
  }
  if (input.search) {
    values.push(`%${input.search}%`);
    const idx = values.length;
    whereParts.push(`(
      c.body ilike $${idx} or cu.display_name ilike $${idx}
      or es.body ilike $${idx} or esu.display_name ilike $${idx}
      or r.detail ilike $${idx} or ru.display_name ilike $${idx}
      or ce.title ilike $${idx}
      or ese.title ilike $${idx}
      or re.title ilike $${idx}
      or ro.name ilike $${idx}
    )`);
  }
  if (input.targetType) {
    values.push(input.targetType);
    whereParts.push(`r.target_type = $${values.length}`);
  }
  if (input.reason) {
    values.push(input.reason);
    whereParts.push(`r.reason = $${values.length}`);
  }
  if (input.dateFrom) {
    values.push(input.dateFrom);
    whereParts.push(`mq.created_at >= $${values.length}::date`);
  }
  if (input.dateTo) {
    values.push(input.dateTo);
    whereParts.push(`mq.created_at < ($${values.length}::date + interval '1 day')`);
  }

  const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  const [itemsRes, totalRes] = await Promise.all([
    pool.query<ModerationDetailRow>(
      `select
         mq.id, mq.item_type, mq.item_id, mq.status,
         mq.moderator_id, mq.moderator_note, mq.reviewed_at, mq.created_at,
         mod.display_name as moderator_name,
         c.body as comment_body,
         cu.display_name as comment_user_name,
         c.event_id::text as comment_event_id,
         ce.title as comment_event_title,
         es.category as suggestion_category,
         es.body as suggestion_value,
         esu.display_name as suggestion_user_name,
         es.target_type as suggestion_target_type,
         es.target_id::text as suggestion_target_id,
         ese.title as suggestion_event_title,
         r.reason as report_reason,
         r.detail as report_detail,
         ru.display_name as reporter_name,
         r.target_type as report_target_type,
         r.target_id::text as report_target_id,
         coalesce(re.title, ro.name) as report_target_label,
         (select count(distinct r2.user_id)::int
          from reports r2
          where r2.target_type = r.target_type and r2.target_id = r.target_id
         ) as report_count
       from moderation_queue mq
       left join users mod on mod.id = mq.moderator_id
       left join comments c on mq.item_type = 'comment' and c.id = mq.item_id
       left join users cu on cu.id = c.user_id
       left join events ce on ce.id = c.event_id
       left join edit_suggestions es on mq.item_type = 'edit_suggestion' and es.id = mq.item_id
       left join users esu on esu.id = es.user_id
       left join events ese on es.target_type = 'event' and ese.id = es.target_id
       left join reports r on mq.item_type = 'report' and r.id = mq.item_id
       left join users ru on ru.id = r.user_id
       left join events re on r.target_type = 'event' and re.id = r.target_id::uuid
       left join organizers ro on r.target_type = 'organizer' and ro.id = r.target_id::uuid
       ${whereClause}
       order by mq.created_at desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count
       from moderation_queue mq
       left join comments c on mq.item_type = 'comment' and c.id = mq.item_id
       left join users cu on cu.id = c.user_id
       left join events ce on ce.id = c.event_id
       left join edit_suggestions es on mq.item_type = 'edit_suggestion' and es.id = mq.item_id
       left join users esu on esu.id = es.user_id
       left join events ese on es.target_type = 'event' and ese.id = es.target_id
       left join reports r on mq.item_type = 'report' and r.id = mq.item_id
       left join users ru on ru.id = r.user_id
       left join events re on r.target_type = 'event' and re.id = r.target_id::uuid
       left join organizers ro on r.target_type = 'organizer' and ro.id = r.target_id::uuid
       ${whereClause}`,
      values,
    ),
  ]);

  const total = Number(totalRes.rows[0]?.count ?? "0");
  return {
    items: itemsRes.rows,
    pagination: { page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1), totalItems: total },
  };
}

export async function getModerationStats(pool: Pool) {
  const [queue, apps, tags] = await Promise.all([
    pool.query<{ item_type: string; status: string; count: string }>(
      `select item_type, status, count(*)::text as count
       from moderation_queue
       group by item_type, status`,
    ),
    pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count from editor_applications group by status`,
    ),
    pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count from tag_suggestions group by status`,
    ),
  ]);
  const stats: Record<string, Record<string, number>> = {};
  for (const row of queue.rows) {
    if (!stats[row.item_type]) stats[row.item_type] = {};
    stats[row.item_type][row.status] = Number(row.count);
  }
  stats.application = {};
  for (const row of apps.rows) stats.application[row.status] = Number(row.count);
  stats.tag_suggestion = {};
  for (const row of tags.rows) stats.tag_suggestion[row.status] = Number(row.count);
  return stats;
}

export async function getModerationDetail(
  pool: Pool,
  id: string,
): Promise<ModerationDetailRow | null> {
  const result = await pool.query<ModerationDetailRow>(
    `select
       mq.id, mq.item_type, mq.item_id, mq.status,
       mq.moderator_id, mq.moderator_note, mq.reviewed_at, mq.created_at,
       mod.display_name as moderator_name,
       c.body as comment_body,
       cu.display_name as comment_user_name,
       c.event_id::text as comment_event_id,
       ce.title as comment_event_title,
       es.category as suggestion_category,
       es.body as suggestion_value,
       esu.display_name as suggestion_user_name,
       es.target_type as suggestion_target_type,
       es.target_id::text as suggestion_target_id,
       ese.title as suggestion_event_title,
       r.reason as report_reason,
       r.detail as report_detail,
       ru.display_name as reporter_name,
       r.target_type as report_target_type,
       r.target_id::text as report_target_id,
       coalesce(re.title, ro.name) as report_target_label
     from moderation_queue mq
     left join users mod on mod.id = mq.moderator_id
     left join comments c on mq.item_type = 'comment' and c.id = mq.item_id
     left join users cu on cu.id = c.user_id
     left join events ce on ce.id = c.event_id
     left join edit_suggestions es on mq.item_type = 'edit_suggestion' and es.id = mq.item_id
     left join users esu on esu.id = es.user_id
     left join events ese on es.target_type = 'event' and ese.id = es.target_id
     left join reports r on mq.item_type = 'report' and r.id = mq.item_id
     left join users ru on ru.id = r.user_id
     left join events re on r.target_type = 'event' and re.id = r.target_id::uuid
     left join organizers ro on r.target_type = 'organizer' and ro.id = r.target_id::uuid
     where mq.id = $1::uuid`,
    [id],
  );
  return result.rows[0] ?? null;
}
