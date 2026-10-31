import { ContentPage, pageMetadata } from "@/components/content";

export const generateMetadata = () => pageMetadata("privacy", "/privacy");

export default function Page() {
  return <ContentPage slug="privacy" />;
}
