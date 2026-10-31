import { ContentPage, pageMetadata } from "@/components/content";

export const generateMetadata = () => pageMetadata("about", "/about");

export default function Page() {
  return <ContentPage slug="about" />;
}
