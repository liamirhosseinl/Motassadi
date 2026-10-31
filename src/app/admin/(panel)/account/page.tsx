import { requirePage } from "@/server/auth/session";
import { ROLES } from "@/server/auth/permissions";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { changePasswordAction } from "./actions";

export const metadata = { title: "حساب من" };

export default async function Account() {
  const user = await requirePage();
  return (
    <>
      <div className="page-header"><h1>حساب من</h1></div>
      <section className="panel stack" style={{ maxWidth: 560 }}>
        <dl className="kv">
          <div><dt>نام</dt><dd>{user.name}</dd></div>
          <div><dt>نام کاربری</dt><dd className="mono">{user.username}</dd></div>
          <div><dt>نقش</dt><dd>{ROLES[user.role]}</dd></div>
        </dl>
      </section>
      <ActionForm action={changePasswordAction} className="panel stack" >
        <h2 style={{ fontSize: 18 }}>تغییر رمز</h2>
        <p className="small muted">پس از تغییر، از همهٔ دستگاه‌ها خارج می‌شوید و باید دوباره وارد شوید.</p>
        <div className="stack" style={{ maxWidth: 420 }}>
          <TextField label="رمز فعلی" name="current" type="password" required autoComplete="current-password" />
          <TextField label="رمز جدید" name="next" type="password" required autoComplete="new-password" hint="دست‌کم ۱۰ نویسه؛ فقط عدد نباشد." />
          <TextField label="تکرار رمز جدید" name="next2" type="password" required autoComplete="new-password" />
        </div>
        <div className="row"><SubmitButton>تغییر رمز</SubmitButton></div>
      </ActionForm>
    </>
  );
}
