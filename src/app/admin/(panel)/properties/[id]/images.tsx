"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/form";
import { faDigits } from "@/lib/format";
import { imagesAction } from "../actions";

type Img = { id: number; thumb: string; alt: string; isCover: boolean };
type Job = { name: string; progress: number; error?: string; done?: boolean };

// HEIC is not decodable by the prebuilt sharp/libvips, so iPhone photos must be exported as JPG.
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function ImageManager({ propertyId, images, canEdit }: { propertyId: number; images: Img[]; canEdit: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const order = images.map((i) => i.id).join(",");

  function upload(file: File, index: number) {
    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append("file", file);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setJobs((js) => js.map((j, k) => (k === index ? { ...j, progress: Math.round((e.loaded / e.total) * 100) } : j)));
      };
      xhr.onload = () => {
        let err: string | undefined;
        if (xhr.status >= 400) { try { err = JSON.parse(xhr.responseText).error; } catch { err = "بارگذاری انجام نشد."; } }
        setJobs((js) => js.map((j, k) => (k === index ? { ...j, progress: 100, done: !err, error: err } : j)));
        resolve();
      };
      xhr.onerror = () => { setJobs((js) => js.map((j, k) => (k === index ? { ...j, error: "اتصال قطع شد." } : j))); resolve(); };
      xhr.open("POST", `/api/admin/properties/${propertyId}/images`);
      xhr.send(fd);
    });
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, 30);
    setJobs(files.map((f) => ({ name: f.name, progress: 0, error: f.size > 12 * 1024 * 1024 ? "بیش از ۱۲ مگابایت" : undefined })));
    setBusy(true);
    for (const [i, f] of files.entries()) if (f.size <= 12 * 1024 * 1024) await upload(f, i);
    setBusy(false);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack">
      {canEdit && (
        <div className="panel stack" style={{ gap: 10 }}>
          <label htmlFor="img-upload" className="label">افزودن عکس (JPG، PNG، WebP یا AVIF — هر فایل حداکثر ۱۲ مگابایت؛ عکس HEIC آیفون را اول JPG کنید)</label>
          <input id="img-upload" ref={input} type="file" accept={ACCEPT} multiple disabled={busy} onChange={(e) => onFiles(e.target.files)} className="input" />
          <span className="hint">اطلاعات مکان (GPS) و متادیتای عکس حذف و عکس‌ها برای وب فشرده می‌شوند. عکس اول، عکس اصلی آگهی است.</span>
          {jobs.length > 0 && (
            <ul className="timeline" aria-live="polite">
              {jobs.map((j, i) => (
                <li key={i}>
                  <span className="small">{j.name} — {j.error ? <span className="error-text">{j.error}</span> : j.done ? "بارگذاری شد" : `${faDigits(j.progress)}٪`}</span>
                  {!j.error && <div className="progress" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label={j.name}><span style={{ width: `${j.progress}%` }} /></div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {images.length === 0 ? <p className="muted small">هنوز عکسی اضافه نشده است.</p> : (
        <div className="img-grid">
          {images.map((img, i) => (
            <figure key={img.id} className={`img-tile ${img.isCover ? "cover" : ""}`} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${img.thumb}`} alt={img.alt || `عکس ${faDigits(i + 1)}`} />
              <figcaption className="ctl">
                {img.isCover && <span className="badge tone-amber" style={{ alignSelf: "flex-start" }}>عکس اصلی</span>}
                {canEdit && (
                  <>
                    <ActionForm action={imagesAction} className="row" >
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="order" value={order} />
                      <label className="sr-only" htmlFor={`alt-${img.id}`}>متن جایگزین عکس</label>
                      <input id={`alt-${img.id}`} name="alt" className="input" defaultValue={img.alt} placeholder="توضیح عکس" maxLength={200} style={{ minHeight: 36, padding: "4px 8px", fontSize: 14 }} />
                      <SubmitButton name="op" value="alt" className="btn btn-ghost btn-sm" pendingText="…">ذخیره</SubmitButton>
                    </ActionForm>
                    <ActionForm action={imagesAction} className="row" >
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="order" value={order} />
                      <SubmitButton name="op" value="up" className="btn btn-ghost btn-sm" pendingText="…"><span aria-label="انتقال به قبل">→</span></SubmitButton>
                      <SubmitButton name="op" value="down" className="btn btn-ghost btn-sm" pendingText="…"><span aria-label="انتقال به بعد">←</span></SubmitButton>
                      {!img.isCover && <SubmitButton name="op" value="cover" className="btn btn-ghost btn-sm" pendingText="…">اصلی شود</SubmitButton>}
                      <ConfirmSubmit name="op" value="remove" title="حذف این عکس؟" body="فایل عکس برای همیشه حذف می‌شود." confirmText="حذف" className="btn btn-ghost btn-sm">حذف</ConfirmSubmit>
                    </ActionForm>
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
