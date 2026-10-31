import { ContentPage, pageMetadata } from "@/components/content";

export const generateMetadata = () => pageMetadata("buy-sell", "/guide/buy-sell");

export default function Page() {
  return <ContentPage slug="buy-sell" />;
}
