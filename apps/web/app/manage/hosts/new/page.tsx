"use client";

import { useI18n } from "../../../../components/i18n/I18nProvider";
import { HostForm } from "../../../../components/manage/HostForm";

export default function CreateHostPage() {
  const { t } = useI18n();
  return (
    <div className="manage-form-page">
      <h1 className="manage-page-title">{t("manage.hostForm.createHost")}</h1>
      <HostForm mode="create" />
    </div>
  );
}
