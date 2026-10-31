import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { listUsers, rolePermissionMatrix } from "@/server/services/admin";
import { ALL_PERMISSIONS, OWNER_LOCKED, PERMISSIONS, ROLES } from "@/server/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { createUserAction, resetPasswordAction, rolePermsAction, updateUserAction } from "./actions";

export const metadata = { title: "کاربران و دسترسی" };

export default async function Users() {
  const me = await requirePage("users.manage");
  const db = await getDb();
  const [users, matrix] = await Promise.all([listUsers(db), rolePermissionMatrix(db)]);
  return (
    <>
      <div className="page-header"><h1>کاربران و دسترسی</h1></div>
      <div className="stack" style={{ gap: 20 }}>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>کاربران</h2>
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 12 }}>
            {users.map((u) => (
              <li key={u.id} style={{ borderBottom: "1px solid var(--divider)", paddingBottom: 12 }}>
                <div className="row small muted" style={{ marginBottom: 6 }}>
                  <strong style={{ color: "var(--text)" }}>{u.name}</strong> <span className="mono">{u.username}</span>
                  {u.id === me.id && <Badge tone="amber">شما</Badge>}{!u.isActive && <Badge tone="muted">غیرفعال</Badge>}
                  <span>آخرین ورود: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</span>
                </div>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <ActionForm action={updateUserAction} className="row" >
                    <input type="hidden" name="id" value={u.id} />
                    <TextField label="نام" name="name" required defaultValue={u.name} />
                    <SelectField label="نقش" name="role" defaultValue={u.role}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
                    <label className="check"><input type="checkbox" name="isActive" defaultChecked={u.isActive} />فعال</label>
                    <SubmitButton className="btn btn-navy btn-sm">ذخیره</SubmitButton>
                  </ActionForm>
                  <ActionForm action={resetPasswordAction} className="row" resetOnSuccess>
                    <input type="hidden" name="id" value={u.id} />
                    <TextField label="رمز جدید" name="password" type="password" autoComplete="new-password" minLength={10} />
                    <SubmitButton className="btn btn-outline btn-sm">تعیین رمز</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <ActionForm action={createUserAction} className="panel stack" resetOnSuccess>
          <h2 style={{ fontSize: 18 }}>کاربر جدید</h2>
          <p className="small muted">ثبت‌نام عمومی وجود ندارد؛ فقط مدیر کاربر می‌سازد. رمز دست‌کم ۱۰ نویسه و نه فقط عدد.</p>
          <div className="form-grid">
            <TextField label="نام" name="name" required />
            <TextField label="نام کاربری (لاتین)" name="username" required dir="ltr" autoComplete="off" />
            <SelectField label="نقش" name="role" defaultValue="agent">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
            <TextField label="رمز" name="password" type="password" required autoComplete="new-password" />
            <TextField label="تکرار رمز" name="password2" type="password" required autoComplete="new-password" />
          </div>
          <div className="row"><SubmitButton>ساخت کاربر</SubmitButton></div>
        </ActionForm>

        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>دسترسی نقش‌ها</h2>
          <p className="small muted">هر بررسی دسترسی روی سرور انجام می‌شود. برخی دسترسی‌های مدیر قفل است تا کسی خودش را بیرون نکند.</p>
          <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {Object.entries(ROLES).map(([role, label]) => (
              <ActionForm key={role} action={rolePermsAction} className="card stack" >
                <input type="hidden" name="role" value={role} />
                <h3 style={{ fontSize: 16 }}>{label}</h3>
                <div className="stack" style={{ gap: 4 }}>
                  {ALL_PERMISSIONS.map((p) => {
                    const locked = role === "owner" && OWNER_LOCKED.includes(p);
                    return (
                      <label key={p} className="check small">
                        <input type="checkbox" name="perm" value={p} defaultChecked={matrix[role]?.has(p) || locked} disabled={locked} />
                        {PERMISSIONS[p]}{locked && " (قفل)"}
                      </label>
                    );
                  })}
                </div>
                <SubmitButton className="btn btn-outline btn-sm">ذخیرهٔ دسترسی‌ها</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
