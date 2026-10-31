import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { getPage } from "@/server/services/admin";
import fs from "node:fs";
import path from "node:path";
import { Breadcrumbs } from "./ui";

/** Renders the simple page format: blank-line paragraphs, "## " sub-headings, "- " list items. Plain text only — no HTML is interpreted. */
export function RichText({ body }: { body: string }) {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="rich">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        if (lines[0].startsWith("## ")) {
          const rest = lines.slice(1);
          return (
            <div key={i} className="stack" style={{ gap: 8 }}>
              <h2>{lines[0].slice(3)}</h2>
              {rest.length > 0 && (rest.every((l) => l.startsWith("- "))
                ? <ul>{rest.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
                : <p style={{ whiteSpace: "pre-line" }}>{rest.join("\n")}</p>)}
            </div>
          );
        }
        return <p key={i} style={{ whiteSpace: "pre-line" }}>{b}</p>;
      })}
    </div>
  );
}

/** Dark title band used by inner pages; the fixed header sits on top of it. */
export function PageHero({ title, sub, crumbs, image = "about.jpg" }: { title: React.ReactNode; sub?: React.ReactNode; crumbs: { href?: string; label: string }[]; image?: string }) {
  const bg = fs.existsSync(path.join(process.cwd(), "public", "images", "site", image)) ? `/images/site/${image}` : null;
  return (
    <section className="page-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {bg && <img src={bg} alt="" width={1400} height={900} />}
      <span className="glow" aria-hidden="true" />
      <div className="container">
        <Breadcrumbs items={crumbs} />
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
    </section>
  );
}

export async function pageMetadata(slug: string, path: string): Promise<Metadata> {
  const p = await getPage(await getDb(), slug);
  if (!p) return {};
  return { title: p.seoTitle ?? p.title, description: p.seoDescription ?? undefined, alternates: { canonical: path } };
}

export async function ContentPage({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const p = await getPage(await getDb(), slug);
  if (!p) notFound();
  return (
    <>
      <PageHero title={p.title} crumbs={[{ href: "/", label: "خانه" }, { label: p.title }]} />
      <div className="container section tight">
        <div className="content-wrap stack" style={{ gap: 20 }} data-reveal="">
          <RichText body={p.body} />
          {children}
        </div>
      </div>
    </>
  );
}
