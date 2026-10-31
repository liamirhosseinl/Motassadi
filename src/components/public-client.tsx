"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitInquiry } from "@/app/(public)/actions";
import { faDigits } from "@/lib/format";

type Img = { id: number; key: string; thumb: string; alt: string | null; width: number; height: number };

/** Accessible gallery: buttons, keyboard arrows (RTL-aware), swipe, live counter. */
export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [i, setI] = useState(0);
  const n = images.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const touch = useRef<number | null>(null);
  if (!n) return null;
  const cur = images[i];
  return (
    <section className="gallery" aria-roledescription="گالری تصاویر" aria-label={`تصاویر ${title}`}>
      <div
        className="stage"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); go(1); }
          if (e.key === "ArrowRight") { e.preventDefault(); go(-1); }
        }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? -1 : 1);
          touch.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/media/${cur.key}`} alt={cur.alt ?? title} width={cur.width} height={cur.height} />
        {n > 1 && (
          <>
            <button type="button" className="nav prev" onClick={() => go(-1)} aria-label="تصویر قبلی">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1A3263" strokeWidth="2.5" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <button type="button" className="nav next" onClick={() => go(1)} aria-label="تصویر بعدی">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1A3263" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          </>
        )}
        <span className="count" aria-live="polite">{faDigits(i + 1)} از {faDigits(n)}</span>
      </div>
      {n > 1 && (
        <div className="thumbs" role="list">
          {images.map((im, k) => (
            <button key={im.id} type="button" role="listitem" aria-current={k === i} aria-label={`نمایش تصویر ${faDigits(k + 1)}`} onClick={() => setI(k)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${im.thumb}`} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Submit({ busy }: { busy?: boolean }) {
  const status = useFormStatus();
  const pending = busy || status.pending;
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending} style={{ width: "100%" }}>
      {pending ? <><span className="spinner" aria-hidden="true" />در حال ارسال…</> : "ارسال درخواست"}
    </button>
  );
}

/** Inquiry form. Success is shown only after the server confirms the record was saved. */
export function InquiryForm({ propertyRef, notice, compact }: { propertyRef?: string; notice: string; compact?: boolean }) {
  const [state, action, busy] = useActionState(submitInquiry, null);
  const [ts, setTs] = useState(0);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setTs(Date.now()); }, []);
  useEffect(() => { if (state) msgRef.current?.focus(); }, [state]);
  if (state?.ok) {
    return <div ref={msgRef} tabIndex={-1} role="status" className="alert alert-success">{state.message}</div>;
  }
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form
      action={action} className="stack" style={{ gap: 12 }} noValidate
      onSubmit={(e) => {
        // Keep what the visitor typed if the server rejects the submission (React would otherwise reset the form).
        e.preventDefault();
        if (busy) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {state?.message && <div ref={msgRef} tabIndex={-1} role="alert" className="alert alert-error">{state.message}</div>}
      {propertyRef && <input type="hidden" name="propertyRef" value={propertyRef} />}
      <input type="hidden" name="ts" value={ts} />
      <div aria-hidden="true" style={{ position: "absolute", insetInlineStart: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>وب‌سایت<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="field">
        <label htmlFor="iq-name">نام و نام خانوادگی<span className="req" aria-hidden="true">*</span></label>
        <input id="iq-name" name="name" className="input" required maxLength={80} autoComplete="name" aria-invalid={err("name") ? true : undefined} />
        {err("name") && <span className="error-text">{err("name")}</span>}
      </div>
      <div className="field">
        <label htmlFor="iq-phone">شمارهٔ تماس<span className="req" aria-hidden="true">*</span></label>
        <input id="iq-phone" name="phone" className="input ltr" dir="ltr" inputMode="tel" required autoComplete="tel" placeholder="09xxxxxxxxx" aria-invalid={err("phone") ? true : undefined} />
        {err("phone") && <span className="error-text">{err("phone")}</span>}
      </div>
      {!compact && (
        <div className="field">
          <label htmlFor="iq-time">زمان مناسب برای تماس</label>
          <input id="iq-time" name="preferredTime" className="input" maxLength={80} placeholder="مثلاً عصرها" />
        </div>
      )}
      <div className="field">
        <label htmlFor="iq-msg">پیام</label>
        <textarea id="iq-msg" name="message" className="textarea" maxLength={1500} style={{ minHeight: compact ? 90 : 120 }} />
      </div>
      <label className="check small"><input type="checkbox" name="consent" required />با استفاده از اطلاعات تماسم برای پاسخ به این درخواست موافقم.</label>
      {err("consent") && <span className="error-text">{err("consent")}</span>}
      <p className="tiny muted">{notice}</p>
      <Submit busy={busy} />
    </form>
  );
}
