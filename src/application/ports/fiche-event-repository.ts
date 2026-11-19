import type {
  FicheEventPayload,
  FicheLifecycleEvent,
  FicheWebhookEventType,
} from "@/domain/entities/webhook-event";

export type CreateFicheEventInput = {
  organizationId: string;
  eventType: FicheWebhookEventType;
  source: "draft" | "fiche";
  chatLinkId: string | null;
  configId: string | null;
  ficheKey: string;
  conversationId: string | null;
  ficheInstanceId: string | null;
  ficheId: string | null;
  fieldKey: string | null;
  fieldKeys?: string[] | null;
  payload: FicheEventPayload;
};

export interface FicheEventRepository {
  create(input: CreateFicheEventInput): Promise<FicheLifecycleEvent>;
  findById(organizationId: string, id: string): Promise<FicheLifecycleEvent | null>;
  listPending(limit: number): Promise<FicheLifecycleEvent[]>;
  markDispatched(organizationId: string, id: string): Promise<void>;
  markFailed(organizationId: string, id: string, message: string): Promise<void>;
  markPayloadIncomplete(organizationId: string, id: string, message: string): Promise<void>;
}
