export interface ChatbotHotSet {
  touch(
    organizationId: string,
    chatLinkId: string,
    configId: string,
    score?: number,
  ): Promise<void>;
}
