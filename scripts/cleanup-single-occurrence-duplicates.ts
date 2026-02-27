import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dr_events:dr_events_password@localhost:15432/dr_events";

async function main() {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  try {
    const deleted = await db.query<{
      id: string;
      event_id: string;
    }>(
      `
        with ranked as (
          select
            o.id,
            o.event_id,
            row_number() over (
              partition by o.event_id
              order by o.updated_at desc, o.created_at desc, o.id desc
            ) as rn
          from event_occurrences o
          join events e on e.id = o.event_id
          where e.schedule_kind = 'single'
        )
        delete from event_occurrences o
        using ranked r
        where o.id = r.id
          and r.rn > 1
        returning o.id, o.event_id
      `,
    );

    const stillDuplicate = await db.query<{
      event_id: string;
      future_occ_count: number;
    }>(
      `
        select o.event_id::text as event_id, count(*)::int as future_occ_count
        from event_occurrences o
        join events e on e.id = o.event_id
        where o.starts_at_utc > now()
          and e.schedule_kind = 'single'
        group by o.event_id
        having count(*) > 1
        order by future_occ_count desc, o.event_id::text
      `,
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          deleted_rows: deleted.rowCount ?? 0,
          deleted_sample: deleted.rows.slice(0, 20),
          remaining_future_duplicate_events: stillDuplicate.rowCount ?? 0,
          remaining_future_duplicates: stillDuplicate.rows,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
