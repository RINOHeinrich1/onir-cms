import { describe, expect, it } from "vitest";
import {
  defaultChatbotInformationSources,
  missionSourceLabels,
  parseChatbotInformationSources,
} from "@/domain/entities/chatbot-information";

describe("sources d'information du chatbot", () => {
  it("ignore les anciens libellés et usages des connaissances et médias", () => {
    const defaults = defaultChatbotInformationSources();
    const parsed = parseChatbotInformationSources({
      ...defaults,
      connaissances: {
        ...defaults.connaissances,
        label: "Ancien libellé",
        usageHint: "Ancien usage",
      },
      medias: {
        ...defaults.medias,
        label: "Ancien média",
        usageHint: "Ancien usage média",
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.connaissances).not.toHaveProperty("label");
    expect(parsed.value.connaissances).not.toHaveProperty("usageHint");
    expect(parsed.value.medias).not.toHaveProperty("label");
    expect(parsed.value.medias).not.toHaveProperty("usageHint");
  });

  it("utilise des descriptions serveur fixes pour connaissances et médias", () => {
    const sources = defaultChatbotInformationSources();
    sources.connaissances.enabled = true;
    sources.medias.enabled = true;

    const labels = missionSourceLabels(sources);
    expect(labels).toContain("- connaissances : base de connaissances interne");
    expect(labels).toContain("- médias : photos et liens internes");
  });
});
