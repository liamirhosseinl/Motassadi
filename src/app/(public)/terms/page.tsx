import { ContentPage, pageMetadata } from "@/components/content";

export const generateMetadata = () => pageMetadata("terms", "/terms");

export default function Page() {
  return <ContentPage slug="terms" />;
}
