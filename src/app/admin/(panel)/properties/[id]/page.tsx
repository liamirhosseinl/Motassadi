import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import {
  activeCategories, activeFeatures, allowedTransitions, getPropertyForActor, publishProblems, PUBLIC_PAGE_STATUSES, type PropertyStatus,
} from "@/server/services/properties";
import { staffOptions } from "@/server/services/admin";
import { ServiceError } from "@/server/services/common";
import { PROPERTY_STATUSES } from "@/lib/vocab";
import { faDigits, formatDateTime } from "@/lib/format";
import { Badge, Breadcrumbs, Ltr, PropertyStatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton, ConfirmSubmit } from "@/components/form";
import { PropertyForm } from "../form";
import { ownerOptions } from "../data";
import { duplicateAction, featureAction, statusAction, updatePropertyAction } from "../actions";
import { ImageManager } from "./images";

export const metadata = { title: "ویرایش ملک" };

const STATUS_VERB: Partial<Record<PropertyStatus, string>> = {
  pending_review: "ارسال برای بررسی", published: "انتشار در سایت", draft: "بازگشت به پیش‌نویس", unpublished: "توقف انتشار",
  reserved: "علامت «رزروشده»", sold: "علامت «فروخته‌شد»", rented: "علامت «اجاره‌رفت»", archived: "بایگانی",
};

export default async function EditProperty({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requirePage("properties.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  let p;
  try { p = await getPropertyForActor(db, user, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const [categories, features, staff, owners, links, images, history, problems] = await Promise.all([
    activeCategories(db), activeFeatures(db), staffOptions(db), ownerOptions(),
    db.select().from(s.propertyFeatureLinks).where(eq(s.propertyFeatureLinks.propertyId, id)),
    db.select().from(s.propertyImages).where(eq(s.propertyImages.propertyId, id)).orderBy(asc(s.propertyImages.sort)),
    db.select({ h: s.propertyStatusHistory, by: s.users.name }).from(s.propertyStatusHistory).leftJoin(s.users, eq(s.users.id, s.propertyStatusHistory.changedBy))
      .where(eq(s.propertyStatusHistory.propertyId, id)).orderBy(desc(s.propertyStatusHistory.createdAt)).limit(30),
    publishProblems(db, id),
  ]);
  const transitions = allowedTransitions(user, p.status as PropertyStatus);
  const canEdit = user.permissions.has("properties.edit") && p.status !== "archived";
  const isPublic = PUBLIC_PAGE_STATUSES.includes(p.status as PropertyStatus);
  const created = (await searchParams).created;
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/properties", label: "املاک" }, { label: p.title }]} />
      <div className="page-header">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{p.title}</h1>
          <span className="row small muted" style={{ gap: 8 }}>کد <Ltr>{p.ref}</Ltr><PropertyStatusBadge status={p.status} />{p.featured && <Badge tone="amber">ویژه</Badge>}</span>
        </div>
        <div className="row">
          {isPublic && <a className="btn btn-outline btn-sm" href={`/properties/${p.ref}`} target="_blank">مشاهده در سایت</a>}
          <Link className="btn btn-outline btn-sm" href={`/admin/properties/${p.id}/preview`}>پیش‌نمایش</Link>
          {user.permissions.has("properties.edit") && (
            <ActionForm action={duplicateAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-ghost btn-sm" pendingText="…">کپی از این ملک</SubmitButton></ActionForm>
          )}
        </div>
      </div>
      {created && <div className="alert alert-success" role="status">ملک ذخیره شد. حالا عکس‌ها را اضافه کنید و سپس آن را منتشر کنید.</div>}

      <div className="two-col">
        <div className="main">
          <section className="stack" aria-labelledby="h-img">
            <h2 id="h-img" style={{ fontSize: 20 }}>عکس‌ها ({faDigits(images.length)})</h2>
            <ImageManager propertyId={p.id} canEdit={canEdit} images={images.map((i) => ({ id: i.id, thumb: i.thumbKey, alt: i.alt ?? "", isCover: i.isCover }))} />
          </section>
          {canEdit ? (
            <PropertyForm action={updatePropertyAction} p={p} featureIds={links.map((l) => l.featureId)} categories={categories} features={features} staff={staff} owners={owners} canAssign={user.permissions.has("properties.viewAll")} />
          ) : (
            <div className="alert alert-info">{p.status === "archived" ? "این ملک بایگانی شده است. برای ویرایش، ابتدا آن را به پیش‌نویس بازگردانید." : "شما اجازهٔ ویرایش ندارید."}</div>
          )}
        </div>
        <aside>
          <section className="panel stack" aria-labelledby="h-status" style={{ borderTop: "6px solid var(--amber)" }}>
            <h2 id="h-status" style={{ fontSize: 18 }}>وضعیت انتشار</h2>
            <p>وضعیت فعلی: <PropertyStatusBadge status={p.status} /></p>
            {problems.length > 0 && !isPublic && (
              <div className="alert alert-warning small"><strong>پیش از انتشار لازم است:</strong><ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>{problems.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}
            {transitions.length === 0 ? <p className="small muted">تغییر وضعیتی برای نقش شما در این مرحله ممکن نیست.</p> : (
              <ActionForm action={statusAction} className="stack" >
                <input type="hidden" name="id" value={p.id} />
                <div className="field"><label htmlFor="note">یادداشت تغییر (اختیاری)</label><input id="note" name="note" className="input" maxLength={200} /></div>
                <div className="stack" style={{ gap: 8 }}>
                  {transitions.map((t) => t === "archived"
                    ? <ConfirmSubmit key={t} name="to" value={t} title="بایگانی این ملک؟" body="ملک از سایت و فهرست‌ها حذف می‌شود ولی سوابق آن حفظ می‌شود و قابل بازگردانی است." confirmText="بایگانی" className="btn btn-outline">{STATUS_VERB[t]}</ConfirmSubmit>
                    : <SubmitButton key={t} name="to" value={t} className={t === "published" ? "btn btn-primary" : "btn btn-outline"} pendingText="…">{STATUS_VERB[t] ?? PROPERTY_STATUSES[t]}</SubmitButton>)}
                </div>
              </ActionForm>
            )}
            {user.permissions.has("properties.publish") && (p.status === "published" || p.status === "reserved") && (
              <ActionForm action={featureAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="featured" value={p.featured ? "0" : "1"} />
                <SubmitButton className="btn btn-ghost" pendingText="…">{p.featured ? "خروج از املاک ویژه" : "نمایش در املاک ویژه"}</SubmitButton>
              </ActionForm>
            )}
          </section>
          <section className="panel stack" aria-labelledby="h-hist">
            <h2 id="h-hist" style={{ fontSize: 18 }}>تاریخچهٔ وضعیت</h2>
            <ul className="timeline">
              {history.map(({ h, by }) => (
                <li key={h.id}>
                  <span>{h.fromStatus ? `${PROPERTY_STATUSES[h.fromStatus as PropertyStatus]} ← ` : ""}<strong>{PROPERTY_STATUSES[h.toStatus as PropertyStatus]}</strong></span>
                  <span className="tiny muted">{formatDateTime(h.createdAt)}{by ? ` · ${by}` : ""}{h.note ? ` · ${h.note}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel small stack" style={{ gap: 4 }}>
            <span>ایجاد: {formatDateTime(p.createdAt)}</span>
            <span>آخرین ویرایش: {formatDateTime(p.updatedAt)}</span>
            {p.publishedAt && <span>اولین انتشار: {formatDateTime(p.publishedAt)}</span>}
          </section>
        </aside>
      </div>
    </>
  );
}
