alter table organizers
  add column if not exists description_html text;

update organizers
set description_html = trim(
  both E'\n'
  from concat_ws(
    E'\n\n',
    case
      when coalesce(description_json->>'bio', '') <> ''
      then concat('Bio', E'\n', description_json->>'bio')
      else null
    end,
    case
      when coalesce(description_json->>'info', '') <> ''
        and coalesce(description_json->>'info', '') <> coalesce(description_json->>'bio', '')
      then concat('Info', E'\n', description_json->>'info')
      else null
    end,
    case
      when coalesce(description_json->>'description', '') <> ''
        and coalesce(description_json->>'description', '') <> coalesce(description_json->>'bio', '')
        and coalesce(description_json->>'description', '') <> coalesce(description_json->>'info', '')
      then concat('Description', E'\n', description_json->>'description')
      else null
    end,
    case
      when coalesce(description_json->>'html', '') <> ''
      then description_json->>'html'
      else null
    end,
    case
      when coalesce(description_json->>'text', '') <> ''
      then description_json->>'text'
      else null
    end
  )
)
where description_html is null;
