import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { staffOptions } from "@/server/services/admin";
import { Breadcrumbs } from "@/components/ui";
import { TxForm } from "../form";
import { txFormOptions } from "../data";
import { createTxAction } from "../actions";

export const metadata = { title: "معاملهٔ جدید" };

export default async function NewTx({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  await requirePage("transactions.manage");
  const db = await getDb();
  const [{ properties, contacts }, staff] = await Promise.all([txFormOptions(db), staffOptions(db)]);
  const pid = Number((await searchParams).property) || undefined;
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/transactions", label: "معاملات" }, { label: "معاملهٔ جدید" }]} />
      <div className="page-header"><h1>معاملهٔ جدید</h1></div>
      <TxForm action={createTxAction} properties={properties} contacts={contacts} staff={staff} defaultPropertyId={pid} />
    </>
  );
}
