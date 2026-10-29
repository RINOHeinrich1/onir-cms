import type { Metadata } from "next";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "API — Documentation",
};

const AUTH = `curl "https://cms-backoffice.onirtech.com/api/v1/fiches?limit=25" \\
  -H "Authorization: Bearer onir_live_..."`;

const SEARCH = `GET /api/v1/fiches
Authorization: Bearer onir_live_...

?q=Antananarivo
&templateKey=partenaires-onir-cms
&createdFrom=2026-01-01T00:00:00.000Z
&createdTo=2026-12-31T23:59:59.999Z
&includeArchived=false
&limit=25
&sort=createdAt:desc
&cursor=...`;

function Doc({ children }: { children: React.ReactNode }) {
  return <section className="doc">{children}</section>;
}

export default function ApiFichesPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Référence</span>
          <h1 className="text-title">API</h1>
          <p className="hint">
            API server-to-server, isolée par organisation et limitée par scopes. Les clés sont
            créées dans le backoffice par un administrateur et ne doivent jamais être exposées dans
            un navigateur.
          </p>
          <p>
            <a className="btn small" href="/api/v1/docs" target="_blank" rel="noreferrer">
              Ouvrir Swagger
            </a>
          </p>
        </div>
      </div>

      <h2 id="cle">Créer une clé</h2>
      <p>
        Dans le backoffice : <strong>Clés API</strong> → <strong>Créer une clé API</strong>. Le
        secret est affiché une seule fois. Une clé est limitée à l’organisation active de
        l’administrateur qui la crée ; elle ne change jamais d’organisation.
      </p>

      <DocCode>{AUTH}</DocCode>

      <h2 id="recherche">Rechercher des fiches</h2>
      <DocCode>{SEARCH}</DocCode>

      <p>Filtres disponibles :</p>
      <ul>
        <li>
          <code>q</code> : recherche plein texte dans les données de la fiche ;
        </li>
        <li>
          <code>templateKey</code>, <code>templateVersion</code> : modèle de fiche ;
        </li>
        <li>
          <code>createdFrom</code>, <code>createdTo</code> : dates ISO 8601 ;
        </li>
        <li>
          <code>prospectId</code>, <code>conversationId</code>, <code>linkId</code> : UUID ;
        </li>
        <li>
          <code>includeArchived</code> : <code>true</code> pour inclure les fiches archivées ;
        </li>
        <li>
          <code>limit</code> : 1 à 100, défaut 25 ;
        </li>
        <li>
          <code>sort</code> : <code>createdAt:desc</code> ou <code>createdAt:asc</code> ;
        </li>
        <li>
          <code>cursor</code> : curseur opaque retourné dans <code>pagination.nextCursor</code>.
        </li>
      </ul>

      <h2 id="detail">Lire une fiche</h2>
      <DocCode>{`GET /api/v1/fiches/:id
Authorization: Bearer onir_live_...`}</DocCode>

      <h2 id="medias">Médias — photothèque et liens</h2>
      <p>
        Scopes : <code>medias:read</code> et <code>medias:write</code>. La liste accepte
        <code>type=photo|lien</code>, <code>active</code>, <code>chatbotId</code>, <code>q</code>,
        <code>limit</code>, <code>sort</code> et <code>cursor</code>.
      </p>
      <DocCode>{`GET  /api/v1/medias?type=photo&active=true&chatbotId=...
POST /api/v1/medias
     Content-Type: application/json
     { "libelle": "Visuel accueil", "url": "https://...", "actif": true }

POST /api/v1/medias
     Content-Type: multipart/form-data
     fichier=@image.webp, libelle=Visuel accueil, chatLinkIds=...

PATCH  /api/v1/medias/:id
DELETE /api/v1/medias/:id`}</DocCode>
      <p>
        Une photo renvoie aussi <code>fileUrl</code>, une URL signée courte pour récupérer le
        fichier. Les URL et clés de stockage internes ne sont jamais exposées.
      </p>

      <h2 id="connaissances">Connaissances</h2>
      <p>
        Scopes : <code>connaissances:read</code> et <code>connaissances:write</code>. La liste
        accepte <code>active</code>, <code>chatbotId</code>, <code>q</code>, <code>limit</code>,
        <code>sort</code> et <code>cursor</code>.
      </p>
      <DocCode>{`GET  /api/v1/connaissances?chatbotId=...
POST /api/v1/connaissances
     { "titre": "Délais", "contenu": "…", "chatLinkIds": [] }

GET    /api/v1/connaissances/:id
PATCH  /api/v1/connaissances/:id
DELETE /api/v1/connaissances/:id`}</DocCode>

      <h2 id="isolation">Isolation et limites</h2>
      <p>
        Toutes les requêtes sont automatiquement filtrées par l’organisation de la clé. Un accès à
        une fiche d’une autre organisation renvoie <code>404</code> pour ne pas révéler son
        existence.
      </p>
      <p>
        Limite par clé : 60 requêtes/minute et 1 000 requêtes/heure. En cas de dépassement :
        <code>429</code> avec <code>Retry-After</code>.
      </p>

      <h2 id="erreurs">Erreurs</h2>
      <DocCode>{`{
  "error": {
    "code": "invalid_api_key",
    "message": "Clé d’API invalide"
  }
}`}</DocCode>
      <p>
        Codes possibles : <code>invalid_api_key</code>, <code>insufficient_scope</code>,
        <code>invalid_request</code>, <code>not_found</code>, <code>rate_limited</code>,
        <code>internal_error</code>.
      </p>
    </Doc>
  );
}
