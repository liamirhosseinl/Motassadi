"use client";

export function PrintButton({ label = "چاپ" }: { label?: string }) {
  return <button type="button" className="btn btn-outline btn-sm no-print" onClick={() => window.print()}>{label}</button>;
}
