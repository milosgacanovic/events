"use client";

import { useI18n } from "../../../../components/i18n/I18nProvider";
import { EventForm } from "../../../../components/manage/EventForm";

export default function CreateEventPage() {
  const { t } = useI18n();
  return (
    <div className="manage-form-page">
      <h1 className="manage-page-title">{t("manage.eventForm.createEvent")}</h1>
      <EventForm mode="create" />
    </div>
  );
}
