import type { Pool } from "pg";

export type UiLabels = {
  categorySingular: string;
  categoryPlural: string;
};

const categorySingularKey = "category_singular";
const categoryPluralKey = "category_plural";

const fallbackLabels: UiLabels = {
  categorySingular: "Dance Practice",
  categoryPlural: "Dance Practices",
};

export async function getUiLabels(pool: Pool): Promise<UiLabels> {
  const result = await pool.query<{ key: string; value: string }>(
    `
      select key, value
      from ui_labels
      where key in ($1, $2)
    `,
    [categorySingularKey, categoryPluralKey],
  );

  const labelByKey = new Map(result.rows.map((row) => [row.key, row.value]));

  return {
    categorySingular: labelByKey.get(categorySingularKey) ?? fallbackLabels.categorySingular,
    categoryPlural: labelByKey.get(categoryPluralKey) ?? fallbackLabels.categoryPlural,
  };
}

export async function updateUiLabels(
  pool: Pool,
  input: {
    categorySingular?: string;
    categoryPlural?: string;
  },
): Promise<UiLabels> {
  if (input.categorySingular !== undefined) {
    await pool.query(
      `
        insert into ui_labels (key, value)
        values ($1, $2)
        on conflict (key) do update set value = excluded.value
      `,
      [categorySingularKey, input.categorySingular.trim()],
    );
  }

  if (input.categoryPlural !== undefined) {
    await pool.query(
      `
        insert into ui_labels (key, value)
        values ($1, $2)
        on conflict (key) do update set value = excluded.value
      `,
      [categoryPluralKey, input.categoryPlural.trim()],
    );
  }

  return getUiLabels(pool);
}
