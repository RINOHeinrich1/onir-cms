-- 0086_sanitize_technical_key_instruction.sql — retire l'instruction historique
-- qui demandait au modèle de conserver les clés techniques dans le prompt.
UPDATE chatbot_configs
SET system_prompt = replace(
  system_prompt,
  'Traduis les libellés des informations à collecter dans la langue du visiteur dans tes questions, mais conserve les clés techniques pour la fiche interne.',
  'Traduis les libellés des informations à collecter dans la langue du visiteur dans tes questions. Ne mentionne jamais les noms techniques des champs.'
)
WHERE system_prompt LIKE '%conserve les clés techniques pour la fiche interne%';
