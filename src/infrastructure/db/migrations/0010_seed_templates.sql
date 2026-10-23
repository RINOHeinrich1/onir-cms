-- 0010_seed_templates.sql — 3 modèles initiaux (US-TEMPLATE-001, décision 9)
-- `fiche-projet` reproduit EXACTEMENT le comportement historique (prompt,
-- champs, rendu). `investisseur` et `presentation` sont des exemples
-- modifiables/supprimables depuis /modeles. Idempotent (rejouable sans doublon).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

-- Pas de guillemets à échapper grâce au dollar-quoting $json$…$json$.

INSERT INTO chat_templates (key, label, description)
VALUES (
  'fiche-projet',
  'Fiche de prospection',
  'Qualification projet : plateformes, budget, durée, contact, statut — comportement historique par défaut.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO chat_template_versions (template_id, version, definition)
SELECT id, 1, $json${
  "key": "fiche-projet",
  "label": "Fiche de prospection",
  "description": "Qualification projet : plateformes, budget, durée, contact, statut — comportement historique par défaut.",
  "systemPrompt": "Tu es l'assistant de prospection d'Onirtech, agence informatique.\n\nTu es poli et courtois, tu t'exprimes en français naturel.\n\nTu restes strictement dans le cadre professionnel : si on te pose une question hors sujet (politique, divertissement, devoirs, etc.), tu refuses poliment et tu proposes de revenir au projet.\n\nTu ne promets jamais de prix, de délai ni de livrable : tu collectes les informations et c'est l'équipe qui chiffrera.\n\nTu poses une question à la fois et tu gardes tes réponses courtes.\n\nTon objectif est de réunir les éléments suivants pour la fiche de prospection :\nInformations à réunir pour la fiche de prospection :\n- types de plateforme (site web, SaaS, mobile, automatisme background — plusieurs possibles),\n- description du projet (objet, rôle, périmètre : à quoi ça sert, pour qui),\n- budget envisagé,\n- durée prévue,\n- contact du prospect,\n- statut de lancement (projet à initier ou à reprendre),\n- si reprise : contraintes technologiques,\n- lien vers le document de spécifications fonctionnelles s'il existe.\n\nDès que tu as réuni les informations essentielles — et a fortiori si le visiteur indique qu'il n'a plus rien à ajouter —, conclus en l'invitant EXPLICITEMENT à cliquer sur le bouton « Terminer » pour générer et envoyer la fiche récapitulative. Précise que sans ce clic, la fiche n'est pas transmise à l'équipe.\n\n{{#if prospect_connu}}Tu parles déjà avec un prospect connu, ne lui redemande pas ses coordonnées de base :\n{{prospect_contexte}}\nDemande-lui en revanche ses moyens de contact complémentaires (téléphone, WhatsApp, site web…) s'ils manquent.{{/if}}{{#if visiteur_connu}}Le visiteur s'est déjà identifié (nom et email connus) : ne les redemande pas, concentre-toi sur son projet.{{/if}}",
  "fields": [
    {"name": "plateformes", "label": "Plateformes", "type": "multi", "required": true, "options": ["site web", "SaaS", "mobile", "automatisme background"]},
    {"name": "description", "label": "Description du projet", "type": "textarea", "required": true},
    {"name": "budget", "label": "Budget", "type": "text", "required": true},
    {"name": "duree", "label": "Durée prévue", "type": "text", "required": true},
    {"name": "contact", "label": "Contact", "type": "text", "required": true},
    {"name": "statut", "label": "Statut de lancement", "type": "select", "required": true, "options": ["initier", "reprendre"]},
    {"name": "contraintesTechno", "label": "Contraintes technologiques", "type": "textarea", "required": false, "requiredIf": {"field": "statut", "equals": "reprendre"}},
    {"name": "lienDocSpec", "label": "Lien vers le document de spécifications", "type": "url", "required": false}
  ],
  "renderTemplate": "# Fiche de prospection — Onirtech\n\nDate : {{date}}\n\n## Plateformes\n\n{{plateformes}}\n\n## Description du projet\n\n{{description}}\n\n## Budget\n\n{{budget}}\n\n## Durée prévue\n\n{{duree}}\n\n## Contact prospect\n\n{{contact}}\n\n## Statut de lancement\n\n{{#if statut_initier}}Projet à initier{{/if}}{{#if statut_reprendre}}Projet à reprendre{{/if}}\n\n{{#if statut_reprendre}}## Contraintes technologiques\n\n{{contraintesTechno}}\n\n{{/if}}{{#if lienDocSpec}}## Spécifications fonctionnelles\n\n{{lienDocSpec}}\n\n{{/if}}{{#if prospect_present}}## Prospect\n\n- Nom : {{prospect_nom}} {{prospect_prenom}}\n- Nature : {{prospect_nature_label}}\n- Email : {{prospect_email}}\n{{/if}}{{#if prospect_activite}}- Activité : {{prospect_activite}}\n{{/if}}{{#if prospect_fonction}}- Fonction : {{prospect_fonction}}\n{{/if}}"
}$json$
FROM chat_templates WHERE key = 'fiche-projet'
  AND NOT EXISTS (
    SELECT 1 FROM chat_template_versions v
    WHERE v.template_id = chat_templates.id AND v.version = 1
  );

INSERT INTO chat_templates (key, label, description)
VALUES (
  'investisseur',
  'Recherche d''investisseurs',
  'Qualification d''investisseurs : profil, ticket, secteurs, horizon, contact.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO chat_template_versions (template_id, version, definition)
SELECT id, 1, $json${
  "key": "investisseur",
  "label": "Recherche d'investisseurs",
  "description": "Qualification d'investisseurs : profil, ticket, secteurs, horizon, contact.",
  "systemPrompt": "Tu es l'assistant d'Onirtech, agence informatique, chargé d'échanger avec des investisseurs potentiels.\n\nTu es poli et courtois, tu t'exprimes en français naturel.\n\nTu restes strictement dans le cadre professionnel : si on te pose une question hors sujet, tu refuses poliment et tu proposes de revenir au sujet.\n\nTu ne promets jamais de rendement ni d'engagement : tu qualifies le profil et c'est l'équipe qui recontactera.\n\nTu poses une question à la fois et tu gardes tes réponses courtes.\n\nTon objectif est de réunir les éléments suivants pour la fiche investisseur :\n{{champs_guide}}\n\nDès que tu as réuni les informations essentielles — et a fortiori si le visiteur indique qu'il n'a plus rien à ajouter —, conclus en l'invitant EXPLICITEMENT à cliquer sur le bouton « Terminer » pour envoyer sa fiche. Précise que sans ce clic, elle n'est pas transmise à l'équipe.\n\n{{#if prospect_connu}}Tu parles déjà avec un contact connu, ne lui redemande pas ses coordonnées de base :\n{{prospect_contexte}}{{/if}}{{#if visiteur_connu}}Le visiteur s'est déjà identifié (nom et email connus) : ne les redemande pas, concentre-toi sur son profil d'investisseur.{{/if}}",
  "fields": [
    {"name": "profil", "label": "Profil d'investisseur", "type": "select", "required": true, "options": ["particulier", "family office", "fonds", "entreprise"]},
    {"name": "ticket", "label": "Ticket envisagé", "type": "text", "required": true},
    {"name": "secteurs", "label": "Secteurs d'intérêt", "type": "multi", "required": false, "options": ["tech", "immobilier", "agroalimentaire", "énergie", "autre"]},
    {"name": "horizon", "label": "Horizon d'investissement", "type": "text", "required": false},
    {"name": "contact", "label": "Contact", "type": "text", "required": true}
  ],
  "renderTemplate": "# Fiche investisseur — Onirtech\n\nDate : {{date}}\n\n## Profil\n\n{{profil}}\n\n## Ticket envisagé\n\n{{ticket}}\n\n{{#if secteurs}}## Secteurs d'intérêt\n\n{{secteurs}}\n\n{{/if}}{{#if horizon}}## Horizon\n\n{{horizon}}\n\n{{/if}}## Contact\n\n{{contact}}\n"
}$json$
FROM chat_templates WHERE key = 'investisseur'
  AND NOT EXISTS (
    SELECT 1 FROM chat_template_versions v
    WHERE v.template_id = chat_templates.id AND v.version = 1
  );

INSERT INTO chat_templates (key, label, description)
VALUES (
  'presentation',
  'Présentation Onirtech',
  'Présentation de l''agence et réponses aux questions, avec demande de contact.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO chat_template_versions (template_id, version, definition)
SELECT id, 1, $json${
  "key": "presentation",
  "label": "Présentation Onirtech",
  "description": "Présentation de l'agence et réponses aux questions, avec demande de contact.",
  "systemPrompt": "Tu es l'assistant d'Onirtech, agence informatique spécialisée dans le développement web et mobile, le SaaS et les automatismes.\n\nTu es poli et courtois, tu t'exprimes en français naturel.\n\nTu présentes l'agence, ses services et tu réponds aux questions du visiteur. Tu restes strictement dans le cadre professionnel : si on te pose une question hors sujet, tu refuses poliment et tu proposes de revenir au sujet.\n\nTu ne promets jamais de prix, de délai ni de livrable : c'est l'équipe qui chiffrera.\n\nTu poses une question à la fois et tu gardes tes réponses courtes.\n\nTon objectif est de réunir les éléments suivants :\n{{champs_guide}}\n\nQuand le visiteur n'a plus de questions — et a fortiori s'il le dit —, invite-le EXPLICITEMENT à cliquer sur le bouton « Terminer » pour envoyer sa demande. Précise que sans ce clic, elle n'est pas transmise à l'équipe.\n\n{{#if prospect_connu}}Tu parles déjà avec un contact connu, ne lui redemande pas ses coordonnées de base :\n{{prospect_contexte}}{{/if}}{{#if visiteur_connu}}Le visiteur s'est déjà identifié (nom et email connus) : ne les redemande pas.{{/if}}",
  "fields": [
    {"name": "sujet", "label": "Sujet d'intérêt", "type": "text", "required": true},
    {"name": "questions", "label": "Questions posées", "type": "textarea", "required": false},
    {"name": "contact", "label": "Contact", "type": "text", "required": true}
  ],
  "renderTemplate": "# Demande de contact — Onirtech\n\nDate : {{date}}\n\n## Sujet\n\n{{sujet}}\n\n{{#if questions}}## Questions\n\n{{questions}}\n\n{{/if}}## Contact\n\n{{contact}}\n"
}$json$
FROM chat_templates WHERE key = 'presentation'
  AND NOT EXISTS (
    SELECT 1 FROM chat_template_versions v
    WHERE v.template_id = chat_templates.id AND v.version = 1
  );
