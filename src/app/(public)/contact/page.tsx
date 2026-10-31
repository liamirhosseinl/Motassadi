import type { Metadata } from "next";
import { getSettings } from "@/server/services/settings";
import { Icon, Ltr } from "@/components/ui";
import { PageHero } from "@/components/content";
import { InquiryForm } from "@/components/public-client";
import { whatsappLink } from "@/lib/format";
import { JsonLd, localBusinessJsonLd } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const st = await getSettings();
  return {
    title: "تماس با ما",
    description: `نشانی و شمارهٔ تماس ${st.business.name}: ${st.business.address}.`,
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage() {
  const st = await getSettings();
  const b = st.business;
  return (
    <>
      <JsonLd data={localBusinessJsonLd(st)} />
      <PageHero title={<>تماس با <span className="accent">{b.name}</span></>} sub="برای خرید، فروش، اجاره یا سپردن ملک، فرم را پر کنید یا مستقیم تماس بگیرید." crumbs={[{ href: "/", label: "خانه" }, { label: "تماس با ما" }]} image="cta.jpg" />
      <div className="container section tight">
        <div className="detail-grid">
          <div className="main">
            <div className="form-card" data-reveal="">
              <h2>فرم درخواست</h2>
              <p className="muted">نوع درخواستتان (خرید، فروش، اجاره یا سپردن ملک) را بنویسید تا با شما تماس بگیریم.</p>
              <InquiryForm notice={st.privacy.inquiryNotice} />
            </div>
          </div>
          <aside>
            <address className="contact-card" data-reveal="" style={{ "--d": 1 } as React.CSSProperties}>
              <strong>{b.name}</strong>
              <span className="row-i"><Icon name="user" size={18} />{b.ownerName}</span>
              <span className="row-i"><Icon name="pin" size={18} />{b.address}</span>
              <a className="big-phone" href={`tel:${b.phone}`}><Ltr>{b.phone}</Ltr></a>
              <a className="btn btn-primary btn-arrow" href={`tel:${b.phone}`} style={{ justifyContent: "space-between" }}><span className="row" style={{ gap: 8 }}><Icon name="phone" size={18} />تماس تلفنی</span><span className="disc"><Icon name="arrow" size={16} /></span></a>
              {b.whatsapp && <a className="btn btn-light" href={whatsappLink(b.whatsapp)} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />واتساپ</a>}
            </address>
          </aside>
        </div>
      </div>
    </>
  );
}
