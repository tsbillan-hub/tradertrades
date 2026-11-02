import type { Metadata } from "next";
import { createProduct } from "@/server/actions/products";
import { requireCreator } from "@/server/dal";
import { ActionForm, Field, FieldError, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { ProductTypeIcon } from "@/components/market/product-type-icon";
import { PRODUCT_TYPES } from "@/lib/constants";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireCreator();
  const { type } = await searchParams;
  const picked = PRODUCT_TYPES.find((t) => t.value.toLowerCase() === type?.toLowerCase() || t.slug === type)?.value ?? "COMMUNITY";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="New product" description="Pick what you're selling and give it a name. You can change everything else on the next screen." back={{ href: "/creator/products", label: "Products" }} />
      <ActionForm action={createProduct} className="card space-y-7 p-6 sm:p-8">
        <fieldset>
          <legend className="label">What are you selling?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PRODUCT_TYPES.map((t) => (
              <label key={t.value} className="tile">
                <input type="radio" name="type" value={t.value} defaultChecked={t.value === picked} className="checkbox radio mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <ProductTypeIcon type={t.value} className="size-4" />
                    {t.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError name="type" />
        </fieldset>
        <Field label="Name" name="title" hint="Say what it is and who it's for. For example: NQ Morning Session Community.">
          <Input name="title" maxLength={90} placeholder="Name your product" autoFocus />
        </Field>
        <FormMessage />
        <SubmitButton size="lg">Create draft</SubmitButton>
      </ActionForm>
    </div>
  );
}
