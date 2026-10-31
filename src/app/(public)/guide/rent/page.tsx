import { ContentPage, pageMetadata } from "@/components/content";

export const generateMetadata = () => pageMetadata("rent", "/guide/rent");

export default function Page() {
  return <ContentPage slug="rent" />;
}
