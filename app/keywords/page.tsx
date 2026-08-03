import { redirect } from "next/navigation";

import KeywordsPanel from "@/components/KeywordsPanel";
import { getBrand } from "@/lib/actions/brand.actions";
import { getKeywords } from "@/lib/actions/keyword.actions";

export default async function KeywordsPage() {
  const brand = await getBrand();

  if (!brand) redirect("/onboarding");

  const keywords = await getKeywords();

  return (
    <main className="pb-24">
      <h1 className="rise text-3xl font-bold tracking-tight">Keyword bank</h1>
      <p className="rise stagger-1 mt-3 text-muted-foreground max-w-2xl">
        Topics in <span className="text-foreground">{brand.domain}</span>,
        ranked by how much demand they have, how crowded they are, and how
        naturally they lead back to {brand.name}.
      </p>

      <div className="rise stagger-2 mt-10">
        <KeywordsPanel keywords={keywords} />
      </div>
    </main>
  );
}
