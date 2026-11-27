import type { TemplateParamValues } from "@/domain/template-params";

export type AgentRenderObservation = {
  revision: number;
  text: string;
  header: string;
  main: string;
};

export type AgentObservation = {
  revision: number;
  stateHash: string;
  counts: {
    pages: number;
    regions: number;
    blocks: number;
    placements: number;
    actions: number;
    styles: number;
  };
  pages: Array<{
    id: string;
    title: string;
    headerId: string | null;
    footerId: string | null;
  }>;
  blocks: Array<{
    id: string;
    kind: string | null;
    title: string;
    visible: boolean;
    actionId: string | null;
    styleId: string | null;
  }>;
  placements: Array<{
    parentKind: string;
    parentId: string;
    childId: string;
    slot: string;
    position: number;
  }>;
  actions: Array<{
    id: string;
    kind: string;
    target: string | null;
  }>;
  styles: Array<{
    id: string;
    name: string;
  }>;
  render: AgentRenderObservation;
};

type RecordValue = Record<string, unknown>;

function records(value: unknown): RecordValue[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is RecordValue =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function hashAgentState(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Construit une observation stable à partir des paramètres et du rendu. */
export function buildAgentObservation(input: {
  values: TemplateParamValues;
  render: AgentRenderObservation;
}): AgentObservation {
  const pages = records(input.values.pages);
  const regions = records(input.values.regions);
  const blocks = records(input.values.blocks);
  const placements = records(input.values.placements);
  const actions = records(input.values.actions);
  const styles = records(input.values.style_profiles);

  return {
    revision: input.render.revision,
    stateHash: hashAgentState(input.values),
    counts: {
      pages: pages.length,
      regions: regions.length,
      blocks: blocks.length,
      placements: placements.length,
      actions: actions.length,
      styles: styles.length,
    },
    pages: pages.map((page) => ({
      id: text(page.id),
      title: text(page.title),
      headerId: optionalText(page.header_id),
      footerId: optionalText(page.footer_id),
    })),
    blocks: blocks.map((block) => ({
      id: text(block.id),
      kind: optionalText(block.kind),
      title: text(block.title),
      visible: block.visible !== false,
      actionId: optionalText(block.action_id),
      styleId: optionalText(block.style_id),
    })),
    placements: placements.map((placement) => ({
      parentKind: text(placement.parent_kind),
      parentId: text(placement.parent_id),
      childId: text(placement.child_id),
      slot: text(placement.slot),
      position: number(placement.position),
    })),
    actions: actions.map((action) => ({
      id: text(action.id),
      kind: text(action.kind),
      target: optionalText(action.target),
    })),
    styles: styles.map((style) => ({
      id: text(style.id),
      name: text(style.name),
    })),
    render: input.render,
  };
}
