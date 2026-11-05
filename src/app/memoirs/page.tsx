import type { Metadata } from "next";
import { CollectionIndex } from "@/components/publication/CollectionIndex";

export const metadata: Metadata = { title: "Memoirs" };

export default function Page() {
  return <CollectionIndex collection="memoirs" />;
}
