import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const ORG_ID = process.env.DEMO_ORGANIZATION_ID || null;
const ORG_NAME = process.env.DEMO_ORGANIZATION_NAME || "Onirtech";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || "admin@onirtech.com";
const APP_URL = (process.env.APP_URL || "http://localhost:3008").replace(/\/$/, "");
const TEMPLATE_KEY = "onir-cms-demo";
const SIMPLE_LABEL = "Démo ONIR CMS — simplifiée";
const IMMERSIVE_LABEL = "Démo ONIR CMS — immersive";
const CONSENT_TITLE = "Consentement démonstration ONIR CMS";
const CONSENT_TEXT =
  "J’accepte que mes informations et les échanges de cette démonstration soient enregistrés et traités par ONIRTECH afin de réaliser la démonstration, qualifier ma demande et me recontacter, conformément à la politique de confidentialité.";

const definition = {
  key: TEMPLATE_KEY,
  label: "Démo ONIR CMS",
  description:
    "Présentation guidée d’ONIR CMS : produit, fonctionnalités, licence et deux expériences de démonstration.",
  fields: [
    { name: "sujet", type: "text", label: "Sujet d’intérêt", required: true },
    { name: "questions", type: "textarea", label: "Questions posées", required: false },
    { name: "contact", type: "text", label: "Contact", required: true },
  ],
  systemPrompt: `Tu es l’assistant de démonstration d’ONIR CMS, un CMS open source de prospection et de conversation assistée par IA.

Tu présentes ONIR CMS avec précision et simplicité. Tu réponds en français naturel, en restant dans le cadre professionnel du produit. Si une question sort de ce cadre, refuse poliment et reviens à ONIR CMS.

Ce que tu peux expliquer :
- ONIR CMS crée des parcours de chat, qualifie les demandes avec l’IA et centralise prospects, conversations et fiches dans un cockpit.
- Il est open source sous licence MIT, auto-hébergé, sans lock-in.
- Les templates visuels sont optionnels : l’expérience simplifiée utilise le chat par défaut, sans 3D ; l’expérience immersive ajoute une scène 3D et un avatar.
- L’expérience simplifiée est adaptée aux appareils à puissance graphique légère.
- L’expérience immersive est adaptée aux appareils disposant d’un minimum de puissance graphique ; elle n’est pas destinée aux vieux appareils.
- Les plugins Starter et Immersive sont gratuits et disponibles dans la marketplace.

Tu ne promets jamais de prix, de délai ni de livrable. Tu ne prétends pas que la démo contient toute la documentation : elle ne s’appuie que sur quelques informations de base.

Tu poses une question à la fois et tu gardes des réponses courtes. Ton objectif est de répondre aux questions, de guider le visiteur dans la découverte du produit et de recueillir les éléments suivants :
{{champs_guide}}

Quand le visiteur n’a plus de questions, invite-le explicitement à cliquer sur « Terminer » pour envoyer sa demande. Précise que sans ce clic, elle n’est pas transmise à l’équipe.

{{#if prospect_connu}}Tu parles déjà avec un contact connu, ne lui redemande pas ses coordonnées de base :
{{prospect_contexte}}{{/if}}{{#if visiteur_connu}}Le visiteur s’est déjà identifié (nom et email connus) : ne les redemande pas.{{/if}}`,
  renderTemplate: `# Demande — ONIR CMS

Date : {{date}}

## Sujet

{{sujet}}

{{#if questions}}## Questions

{{questions}}

{{/if}}## Contact

{{contact}}
`,
};

const knowledge = [
  {
    titre: "ONIR CMS — Qu’est-ce que c’est ?",
    contenu:
      "ONIR CMS est un CMS open source de prospection et de conversation assistée par IA. Il permet de créer des parcours de chat, de laisser l’IA qualifier les demandes et de retrouver les prospects, les conversations et les fiches dans un cockpit unique. Il s’adresse aux indépendants, agences et PME qui veulent garder la maîtrise de leurs données.",
  },
  {
    titre: "ONIR CMS — Fonctionnalités clés",
    contenu:
      "Fonctionnalités principales : liens de chat publics, modèles de raisonnement, base de connaissances, photothèque et liens proposés par l’IA, détection de l’état du visiteur, fiches de prospection, suivi des conversations, organisations multiples et templates visuels. Les sources de données sont choisies par lien.",
  },
  {
    titre: "ONIR CMS — Templates et expériences",
    contenu:
      "Deux expériences de démonstration sont proposées. L’expérience simplifiée utilise le chat par défaut, sans template 3D : elle est idéale pour les périphériques à puissance graphique légère. L’expérience immersive utilise le template Immersive : une scène 3D avec avatar, adaptée aux appareils disposant d’un minimum de puissance graphique. Elle n’est pas destinée aux vieux périphériques.",
  },
  {
    titre: "ONIR CMS — Licence, hébergement et plugins",
    contenu:
      "ONIR CMS est distribué sous licence MIT et peut être auto-hébergé. Il ne dépend pas d’une plateforme tierce et ne crée pas de lock-in. Les plugins Starter et Immersive sont gratuits et disponibles dans la marketplace du site. Le code source et la documentation sont accessibles depuis le dépôt GitHub officiel.",
  },
  {
    titre: "ONIR CMS — Démo : mode d’emploi",
    contenu:
      "Cette démonstration s’appuie sur quelques informations de base sur ONIR CMS. Elle permet de tester le parcours de chat, la qualification et la restitution. Elle ne remplace pas la documentation complète et ne constitue pas un devis. Pour l’expérience immersive, un appareil récent avec accélération graphique est recommandé.",
  },
  {
    titre: "ONIR CMS — Ressources",
    contenu:
      "Ressources disponibles sur le site : page Plugins pour télécharger les templates, Documentation pour l’installation et le SDK, et dépôt GitHub pour le code source. L’équipe peut être contactée via le bouton Terminer à la fin de la conversation.",
  },
];

let linkKey = null;

function decodeBase64url(value) {
  return Buffer.from(value, "base64url");
}

async function resolveLinkKey(client) {
  const master = process.env.CONFIG_MASTER_KEY || "";
  if (/^[0-9a-fA-F]{64}$/.test(master)) {
    try {
      const { rows } = await client.query(
        "SELECT value_enc FROM app_secrets WHERE key = 'LINK_TOKEN_KEY' LIMIT 1",
      );
      if (rows[0]?.value_enc) {
        const [version, iv, tag, data] = String(rows[0].value_enc).split(":");
        if (version !== "v1" || !iv || !tag || !data) throw new Error("secret illisible");
        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          Buffer.from(master, "hex"),
          decodeBase64url(iv),
        );
        decipher.setAAD(Buffer.from("onir:app-secret:LINK_TOKEN_KEY:v1", "utf8"));
        decipher.setAuthTag(decodeBase64url(tag));
        const plain = Buffer.concat([
          decipher.update(decodeBase64url(data)),
          decipher.final(),
        ]).toString("utf8");
        if (/^[0-9a-fA-F]{64}$/.test(plain)) return Buffer.from(plain, "hex");
      }
    } catch {
      // Table absente ou clé non encore initialisée : fallback environnement.
    }
  }
  const raw = process.env.LINK_TOKEN_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "LINK_TOKEN_KEY absente de app_secrets et de l'environnement (64 hex attendus)",
    );
  }
  return Buffer.from(raw, "hex");
}

function encryptionKey() {
  if (linkKey === null) throw new Error("Clé des liens non initialisée");
  return linkKey;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function encryptToken(token) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${data.toString("hex")}:${cipher.getAuthTag().toString("hex")}`;
}

function decryptToken(payload) {
  const key = encryptionKey();
  const [prefix, ivHex, dataHex, tagHex] = String(payload).split(":");
  if (prefix !== "v1" || !ivHex || !dataHex || !tagHex) throw new Error("Jeton chiffré illisible");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
    "utf8",
  );
}

function linkToken(existing) {
  if (existing?.token_enc) {
    try {
      return { token: decryptToken(existing.token_enc), rotated: false };
    } catch {
      return { token: crypto.randomBytes(24).toString("base64url"), rotated: true };
    }
  }
  return { token: crypto.randomBytes(24).toString("base64url"), rotated: true };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    linkKey = await resolveLinkKey(client);
    await client.query("BEGIN");
    let organizationId = ORG_ID;
    if (organizationId === null) {
      const organization = await client.query(
        "SELECT id FROM organizations WHERE lower(name)=lower($1) LIMIT 1",
        [ORG_NAME],
      );
      organizationId = organization.rows[0]?.id ?? null;
    }
    if (organizationId === null) {
      throw new Error(`Organisation introuvable : ${ORG_NAME}`);
    }
    const admin = await client.query(
      `SELECT u.id
       FROM users u
       JOIN organization_members m ON m.user_id=u.id
       WHERE m.organization_id=$1
         AND m.role='admin'
       ORDER BY (lower(u.email)=lower($2)) DESC, u.created_at
       LIMIT 1`,
      [organizationId, ADMIN_EMAIL],
    );
    const adminId = admin.rows[0]?.id ?? null;

    const template = await client.query(
      `SELECT t.id, v.version
       FROM chat_templates t
       JOIN chat_template_versions v ON v.template_id=t.id
       WHERE t.organization_id=$1 AND lower(t.key)=lower($2)
       ORDER BY v.version DESC LIMIT 1`,
      [organizationId, TEMPLATE_KEY],
    );
    let templateVersion;
    if (template.rows[0]) {
      templateVersion = Number(template.rows[0].version);
      console.log(`template ${TEMPLATE_KEY} déjà présent (v${templateVersion})`);
    } else {
      const inserted = await client.query(
        `INSERT INTO chat_templates (organization_id, key, label, description, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [organizationId, TEMPLATE_KEY, definition.label, definition.description, adminId],
      );
      await client.query(
        `INSERT INTO chat_template_versions (template_id, version, definition, created_by)
         VALUES ($1,1,$2,$3)`,
        [inserted.rows[0].id, JSON.stringify(definition), adminId],
      );
      templateVersion = 1;
      console.log(`template ${TEMPLATE_KEY} créé (v1)`);
    }

    for (const entry of knowledge) {
      await client.query(
        `INSERT INTO base_connaissances (organization_id, titre, contenu, template_keys, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (organization_id, lower(titre))
         DO UPDATE SET contenu=EXCLUDED.contenu, template_keys=EXCLUDED.template_keys, actif=true,
                       updated_at=now()`,
        [organizationId, entry.titre, entry.contenu, [TEMPLATE_KEY], adminId],
      );
    }
    console.log(`connaissances : ${knowledge.length} entrées prêtes`);

    const privacy = await client.query(
      `INSERT INTO confidentialites (organization_id, titre, texte, lien, actif, created_by)
       VALUES ($1,$2,$3,$4,true,$5)
       ON CONFLICT (organization_id, lower(titre))
       DO UPDATE SET texte=EXCLUDED.texte, lien=EXCLUDED.lien, actif=true, updated_at=now()
       RETURNING id`,
      [organizationId, CONSENT_TITLE, CONSENT_TEXT, "/confidentialite-site", adminId],
    );
    const confidentialiteId = privacy.rows[0].id;
    console.log(`consentement : ${CONSENT_TITLE}`);

    const immersive = await client.query(
      `SELECT t.id, v.version
       FROM visual_templates t
       JOIN visual_template_versions v ON v.template_id=t.id
       WHERE lower(t.key)='immersive'
       ORDER BY v.created_at DESC LIMIT 1`,
    );
    if (!immersive.rows[0]) throw new Error("Template visuel Immersive introuvable");
    const immersiveId = immersive.rows[0].id;
    const immersiveVersion = immersive.rows[0].version;

    const links = [
      {
        label: SIMPLE_LABEL,
        visualTemplateId: null,
        visualTemplateVersion: null,
        visualTemplateParams: {},
      },
      {
        label: IMMERSIVE_LABEL,
        visualTemplateId: immersiveId,
        visualTemplateVersion: immersiveVersion,
        visualTemplateParams: { categorie: "ONIR CMS", titre_de_livre: "ONIR CMS" },
      },
    ];
    const urls = [];
    for (const entry of links) {
      const existing = await client.query(
        "SELECT id, token_enc FROM chat_links WHERE organization_id=$1 AND label=$2 ORDER BY created_at DESC LIMIT 1",
        [organizationId, entry.label],
      );
      const { token, rotated } = linkToken(existing.rows[0]);
      const tokenHash = hashToken(token);
      const tokenEnc = encryptToken(token);
      if (existing.rows[0]) {
        await client.query(
          `UPDATE chat_links
           SET token_hash=$1, token_enc=$2, type='standard', actif=true, expires_at=NULL,
               template_key=$3, template_version=$4,
               sources=$5, confidentialite_id=$6, user_state_enabled=false,
               visual_template_id=$7, visual_template_version=$8,
               visual_template_config='{}'::jsonb, visual_template_params=$9,
               ai_provider_id=NULL, ai_model=NULL
           WHERE id=$10`,
          [
            tokenHash,
            tokenEnc,
            TEMPLATE_KEY,
            templateVersion,
            JSON.stringify({ lien: false, phototheque: false, connaissances: true }),
            confidentialiteId,
            entry.visualTemplateId,
            entry.visualTemplateVersion,
            JSON.stringify(entry.visualTemplateParams),
            existing.rows[0].id,
          ],
        );
        console.log(
          `lien existant mis à jour : ${entry.label}${rotated ? " (jeton régénéré)" : ""}`,
        );
      } else {
        await client.query(
          `INSERT INTO chat_links
             (organization_id, token_hash, token_enc, label, type, created_by, expires_at,
              template_key, template_version, sources, confidentialite_id, user_state_enabled,
              visual_template_id, visual_template_version, visual_template_config,
              visual_template_params, ai_provider_id, ai_model)
           VALUES ($1,$2,$3,$4,'standard',$5,NULL,$6,$7,$8,$9,false,$10,$11,'{}'::jsonb,$12,NULL,NULL)`,
          [
            organizationId,
            tokenHash,
            tokenEnc,
            entry.label,
            adminId,
            TEMPLATE_KEY,
            templateVersion,
            JSON.stringify({ lien: false, phototheque: false, connaissances: true }),
            confidentialiteId,
            entry.visualTemplateId,
            entry.visualTemplateVersion,
            JSON.stringify(entry.visualTemplateParams),
          ],
        );
        console.log(`lien créé : ${entry.label}`);
      }
      urls.push({ label: entry.label, url: `${APP_URL}/l/${token}` });
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ templateVersion, urls }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
