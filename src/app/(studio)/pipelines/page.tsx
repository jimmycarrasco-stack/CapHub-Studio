import { PageHeader } from "@/components/ui";
import { listOpportunities, listPipelines } from "@/lib/crm/pipelines";
import { listProducts } from "@/lib/crm/payments";
import { pageCtx } from "@/lib/page-ctx";
import { Board, NewPipelineButton } from "./board";

export const metadata = { title: "Pipelines" };

export default async function PipelinesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await pageCtx();
  const pipelines = listPipelines(ctx.location.id);
  const { p } = await searchParams;
  const current = pipelines.find((x) => x.id === p) ?? pipelines[0] ?? null;
  const currency = listProducts(ctx.location.id)[0]?.currency ?? "cad";

  return (
    <div className="flex h-full flex-col p-6 md:p-10">
      <PageHeader title="Pipelines" subtitle="Drag deals between stages. Click a deal to edit it or mark it won or lost." actions={<NewPipelineButton />} />
      {current ? (
        <Board
          key={current.id}
          pipelines={pipelines.map((x) => ({ id: x.id, name: x.name }))}
          pipeline={current}
          initialDeals={listOpportunities(current.id)}
          canDelete={ctx.role === "admin"}
          currency={currency}
        />
      ) : (
        <p className="text-sm text-zinc-500">No pipelines yet — create one to start tracking deals.</p>
      )}
    </div>
  );
}
