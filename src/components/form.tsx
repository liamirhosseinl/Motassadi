"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/server/services/common";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
const ErrorsCtx = createContext<Record<string, string> | undefined>(undefined);
const PendingCtx = createContext(false);

/** Form bound to a server action with inline field errors, a status message and a pending state. */
export function ActionForm({ action, children, className, resetOnSuccess, id, successMessage }: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; id?: string; successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) msgRef.current?.focus();
  }, [state, resetOnSuccess]);
  const msg = state?.message ?? (state?.ok ? successMessage : undefined);
  return (
    <form
      ref={ref} action={formAction} className={className} id={id} noValidate
      onSubmit={(e) => {
        // Submit manually so React does not auto-reset the form: on a validation error the user keeps what they typed.
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter && "form" in submitter ? submitter : undefined);
        startTransition(() => formAction(fd));
      }}
    >
      <ErrorsCtx.Provider value={state?.fieldErrors}><PendingCtx.Provider value={pending}>
        {msg && (
          <div ref={msgRef} tabIndex={-1} role={state?.ok ? "status" : "alert"} className={`alert ${state?.ok ? "alert-success" : "alert-error"}`} style={{ marginBottom: 12 }}>
            {msg}
          </div>
        )}
        {children}
      </PendingCtx.Provider></ErrorsCtx.Provider>
    </form>
  );
}

function useFieldError(name?: string) {
  const errs = useContext(ErrorsCtx);
  if (!name || !errs) return undefined;
  return errs[name.replace(/\[\]$/, "")];
}

type Common = { label: ReactNode; name: string; hint?: ReactNode; required?: boolean; className?: string };

export function TextField({ label, name, hint, required, className, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const err = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <input id={id} name={name} className="input" aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : hint ? `${id}-h` : undefined} required={required} {...rest} />
      {err ? <span id={`${id}-e`} className="error-text">{err}</span> : hint ? <span id={`${id}-h`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function MoneyField({ label, name, hint, required, className, unit = "تومان", ...rest }: Common & InputHTMLAttributes<HTMLInputElement> & { unit?: string }) {
  const err = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <div className="input-affix">
        <input id={id} name={name} className="input ltr" inputMode="numeric" autoComplete="off" aria-invalid={err ? true : undefined} dir="ltr" {...rest} />
        <span className="affix">{unit}</span>
      </div>
      {err ? <span className="error-text">{err}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function SelectField({ label, name, hint, required, className, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const err = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <select id={id} name={name} className="select" aria-invalid={err ? true : undefined} required={required} {...rest}>{children}</select>
      {err ? <span className="error-text">{err}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextAreaField({ label, name, hint, required, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const err = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <textarea id={id} name={name} className="textarea" aria-invalid={err ? true : undefined} required={required} {...rest} />
      {err ? <span className="error-text">{err}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function FieldError({ name }: { name: string }) {
  const err = useFieldError(name);
  return err ? <span className="error-text">{err}</span> : null;
}

export function SubmitButton({ children, className = "btn btn-primary", pendingText = "در حال ثبت…", name, value }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingCtx) || status.pending;
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? <><span className="spinner" aria-hidden="true" />{pendingText}</> : children}
    </button>
  );
}

/** Destructive or irreversible submit: asks in an accessible native dialog first. */
export function ConfirmSubmit({ children, title, body, confirmText = "تأیید", className = "btn btn-outline", name, value }: {
  children: ReactNode; title: string; body?: ReactNode; confirmText?: string; className?: string; name?: string; value?: string;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => dlg.current?.showModal()}>{children}</button>
      <button ref={btn} type="submit" hidden name={name} value={value} />
      <dialog ref={dlg} className="modal" aria-labelledby={`dlg-${title}`}>
        <div className="modal-body">
          <h2 id={`dlg-${title}`} style={{ fontSize: 20 }}>{title}</h2>
          {body && <div className="muted">{body}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-outline" onClick={() => dlg.current?.close()}>انصراف</button>
            <button type="button" className="btn btn-danger" onClick={() => { dlg.current?.close(); btn.current?.click(); }}>{confirmText}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
