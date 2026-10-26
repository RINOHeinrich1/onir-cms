import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Installation — build local ou images GHCR",
};

const LOCAL_CHECK = `docker --version
docker compose version
git --version
openssl version`;

const LOCAL_CLONE = `mkdir -p ~/dev
cd ~/dev
git clone https://github.com/RINOHeinrich1/onir-cms.git
cd onir-cms`;

const LOCAL_PULL = `cd ~/dev/onir-cms
git pull --ff-only`;

const LOCAL_INIT = `cd ~/dev/onir-cms
./scripts/docker-dev-init.sh`;

const LOCAL_UP = `cd ~/dev/onir-cms
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d`;

const LOCAL_STATUS = `cd ~/dev/onir-cms
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml ps

# Suivre le démarrage
cd ~/dev/onir-cms
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml logs -f app`;

const LOCAL_PASSWORD = `cd ~/dev/onir-cms
grep '^DEFAULT_ADMIN_PASSWORD=' .env.docker`;

const LOCAL_STOP = `cd ~/dev/onir-cms
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml down`;

const LOCAL_RESET = `cd ~/dev/onir-cms
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml down -v`;

const LOCAL_UPDATE = `cd ~/dev/onir-cms
git pull --ff-only
sudo docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d`;

const HUB_CHECK = `docker --version
openssl version
sudo -v`;

const HUB_ENV = `DB_PASSWORD="$(openssl rand -hex 16)"
CONFIG_MASTER_KEY="$(openssl rand -hex 32)"
ADMIN_PASSWORD="Admin-$(openssl rand -hex 8)"

cat > "$HOME/.onir-cms.env" <<EOF
ONIR_CMS_VERSION=0.1.1
DATABASE_URL=postgres://onir_cms:$DB_PASSWORD@onir-cms-db:5432/onir_cms
CONFIG_MASTER_KEY=$CONFIG_MASTER_KEY
AI_ALLOW_PRIVATE_NETWORKS=false
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=$ADMIN_PASSWORD
APP_URL=http://localhost:3000
MEDIA_DIR=/app/var/media
AI_API_TOKEN=
AI_PRODUCT_ID=
AI_MODEL=Qwen/Qwen3.5-122B-A10B-FP8
EOF

chmod 600 "$HOME/.onir-cms.env"
echo "Mot de passe admin : $ADMIN_PASSWORD"`;

const HUB_NETWORK = `sudo docker network create onir-cms-net 2>/dev/null || true
sudo docker volume create onir-cms-db-data
sudo docker volume create onir-cms-media`;

const HUB_PULL = `set -a
. "$HOME/.onir-cms.env"
set +a

sudo docker pull postgres:16
sudo docker pull "ghcr.io/rinoheinrich1/onir-cms:\${ONIR_CMS_VERSION}-migrate"
sudo docker pull "ghcr.io/rinoheinrich1/onir-cms:\${ONIR_CMS_VERSION}"`;

const HUB_DB = `set -a
. "$HOME/.onir-cms.env"
set +a

DB_PASSWORD="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\\1#')"
test -n "$DB_PASSWORD" || { echo "Mot de passe introuvable dans DATABASE_URL"; exit 1; }

sudo docker run -d \\
  --name onir-cms-db \\
  --restart unless-stopped \\
  --network onir-cms-net \\
  -e POSTGRES_DB=onir_cms \\
  -e POSTGRES_USER=onir_cms \\
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \\
  -v onir-cms-db-data:/var/lib/postgresql/data \\
  postgres:16`;

const HUB_WAIT = `until sudo docker exec onir-cms-db pg_isready -U onir_cms -d onir_cms; do
  sleep 1
done`;

const HUB_MIGRATE = `set -a
. "$HOME/.onir-cms.env"
set +a

sudo docker run --rm \\
  --network onir-cms-net \\
  --env-file "$HOME/.onir-cms.env" \\
  "ghcr.io/rinoheinrich1/onir-cms:\${ONIR_CMS_VERSION}-migrate"`;

const HUB_APP = `set -a
. "$HOME/.onir-cms.env"
set +a

sudo docker run -d \\
  --name onir-cms-app \\
  --restart unless-stopped \\
  --network onir-cms-net \\
  --env-file "$HOME/.onir-cms.env" \\
  -p 127.0.0.1:3000:3000 \\
  -v onir-cms-media:/app/var/media \\
  "ghcr.io/rinoheinrich1/onir-cms:\${ONIR_CMS_VERSION}"`;

const HUB_VERIFY = `curl http://localhost:3000/api/health
grep '^DEFAULT_ADMIN_PASSWORD=' "$HOME/.onir-cms.env"`;

const HUB_UPDATE_EDIT = `nano "$HOME/.onir-cms.env"`;
const HUB_UPDATE_PULL = HUB_PULL;
const HUB_UPDATE_MIGRATE = HUB_MIGRATE;

const HUB_UPDATE_APP = `sudo docker rm -f onir-cms-app 2>/dev/null || true

set -a
. "$HOME/.onir-cms.env"
set +a

sudo docker run -d \\
  --name onir-cms-app \\
  --restart unless-stopped \\
  --network onir-cms-net \\
  --env-file "$HOME/.onir-cms.env" \\
  -p 127.0.0.1:3000:3000 \\
  -v onir-cms-media:/app/var/media \\
  "ghcr.io/rinoheinrich1/onir-cms:\${ONIR_CMS_VERSION}"`;

const HUB_STOP = `sudo docker stop onir-cms-app onir-cms-db
sudo docker rm onir-cms-app onir-cms-db`;

const HUB_RESET = `sudo docker volume rm onir-cms-db-data onir-cms-media`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

function Step({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <>
      <h3 id={id}>{title}</h3>
      {children}
    </>
  );
}

/** Guide d'installation : deux parcours indépendants, build local et images GHCR. */
export default function InstallationPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Installation</span>
          <h1 className="text-title">Installer ONIR CMS</h1>
          <p className="hint">
            Deux parcours indépendants. Choisissez-en un et suivez-le de A à Z sans mélanger les
            commandes ni les fichiers d&apos;environnement.
          </p>
        </div>
      </div>

      <div className="doc-cards">
        <a className="doc-card" href="#build-local">
          <strong>Partie 1 — Build local</strong>
          <p>
            Cloner le dépôt, builder l&apos;image et développer l'application avec Docker Compose.
          </p>
          <span>Aller à la partie 1 →</span>
        </a>
        <a className="doc-card" href="#ghcr">
          <strong>Partie 2 — Images GHCR</strong>
          <p>
            Utiliser uniquement les images publiées, sans dépôt Git, sans build et sans Compose.
          </p>
          <span>Aller à la partie 2 →</span>
        </a>
      </div>

      <h2 id="build-local">Partie 1 — Build local depuis le dépôt</h2>
      <p>
        Ce parcours utilise le dépôt Git, <code>docker-compose.dev.yml</code> et le fichier{" "}
        <code>.env.docker</code>. Il ne faut <strong>pas</strong> utiliser les commandes de la
        partie 2.
      </p>

      <Step id="local-prereq" title="1. Prérequis">
        <ul>
          <li>
            <strong>Windows</strong> : Docker Desktop avec WSL 2, intégration activée pour Ubuntu.
            Les commandes se lancent dans le terminal Ubuntu.
          </li>
          <li>
            <strong>Linux</strong> : Docker Engine et le plugin Compose.
          </li>
          <li>
            <strong>macOS</strong> : Docker Desktop.
          </li>
          <li>Git et OpenSSL dans le terminal utilisé.</li>
        </ul>
        <Code>{LOCAL_CHECK}</Code>
        <p className="hint">
          Si votre installation Docker exige <code>sudo</code>, gardez-le dans les commandes
          ci-dessous. Sous Docker Desktop/WSL, il peut être inutile.
        </p>
      </Step>

      <Step id="local-clone" title="2. Cloner le dépôt">
        <p>
          Le projet doit être dans le système de fichiers Linux, par exemple{" "}
          <code>~/dev/onir-cms</code>, et non sous <code>/mnt/c</code>.
        </p>
        <Code>{LOCAL_CLONE}</Code>
        <p>Si le dépôt est déjà cloné :</p>
        <Code>{LOCAL_PULL}</Code>
      </Step>

      <Step id="local-init" title="3. Générer l'environnement local">
        <p>
          Le script génère <code>.env.docker</code>, les secrets et le mot de passe du compte
          administrateur.
        </p>
        <Code>{LOCAL_INIT}</Code>
      </Step>

      <Step id="local-up" title="4. Builder et démarrer">
        <Code>{LOCAL_UP}</Code>
        <p>
          Le premier build prend quelques minutes. Les services <code>db</code>,{" "}
          <code>migrate</code> et <code>app</code> sont créés automatiquement.
        </p>
      </Step>

      <Step id="local-status" title="5. Vérifier">
        <Code>{LOCAL_STATUS}</Code>
        <p>
          Attendez que <code>app</code> soit <code>healthy</code>, puis ouvrez{" "}
          <code>http://localhost:3000</code>.
        </p>
      </Step>

      <Step id="local-login" title="6. Se connecter">
        <ul>
          <li>
            Email : <code>admin@example.com</code>
          </li>
          <li>Mot de passe : affiché par le script ou récupérable ci-dessous.</li>
        </ul>
        <Code>{LOCAL_PASSWORD}</Code>
        <p>L'application impose le changement du mot de passe à la première connexion.</p>
      </Step>

      <Step id="local-stop" title="7. Arrêter ou mettre à jour">
        <p>Arrêt en conservant les données :</p>
        <Code>{LOCAL_STOP}</Code>
        <p>Mise à jour du code puis rebuild :</p>
        <Code>{LOCAL_UPDATE}</Code>
        <p>Remise à zéro complète, uniquement en développement :</p>
        <Code>{LOCAL_RESET}</Code>
      </Step>

      <h2 id="ghcr">Partie 2 — Images GHCR sans dépôt</h2>
      <p>
        Ce parcours utilise uniquement les images publiées sur GitHub Container Registry :{" "}
        <code>ghcr.io/rinoheinrich1/onir-cms</code>. Il ne faut <strong>ni dépôt Git</strong>,{" "}
        <strong>ni build</strong>, <strong>ni Docker Compose</strong>.
      </p>
      <p className="hint">
        Exécutez chaque bloc séparément, dans l&apos;ordre. Les mots de passe <code>sudo</code> ne
        seront pas avalés par un copier-coller massif : chaque bloc est une unité exécutable.
      </p>

      <Step id="hub-prereq" title="1. Prérequis">
        <ul>
          <li>Docker opérationnel.</li>
          <li>OpenSSL disponible.</li>
          <li>
            <strong>Windows</strong> : Docker Desktop avec WSL 2 et intégration Ubuntu. Les
            commandes se lancent dans le terminal Ubuntu.
          </li>
          <li>
            <strong>Linux / macOS</strong> : un terminal avec Docker.
          </li>
        </ul>
        <Code>{HUB_CHECK}</Code>
      </Step>

      <Step id="hub-env" title="2. Créer le fichier d'environnement">
        <p>
          Ce fichier reste en dehors du dépôt, dans <code>~/.onir-cms.env</code>. Il contient les
          secrets générés une seule fois. Les quatre secrets applicatifs (SESSION_SECRET,
          LINK_TOKEN_KEY, AI_PROVIDER_KEY, WEBHOOK_SECRET_KEY) sont générés au premier démarrage
          puis gérés depuis <code>/configuration</code>.
        </p>
        <Code>{HUB_ENV}</Code>
        <p className="hint">
          Notez le mot de passe admin affiché. Pour modifier la version ou les secrets plus tard :{" "}
          <code>nano ~/.onir-cms.env</code>.
        </p>
      </Step>

      <Step id="hub-network" title="3. Créer le réseau et les volumes">
        <Code>{HUB_NETWORK}</Code>
      </Step>

      <Step id="hub-pull" title="4. Télécharger les images">
        <Code>{HUB_PULL}</Code>
      </Step>

      <Step id="hub-db" title="5. Démarrer PostgreSQL">
        <Code>{HUB_DB}</Code>
      </Step>

      <Step id="hub-wait" title="6. Attendre que PostgreSQL soit prêt">
        <Code>{HUB_WAIT}</Code>
      </Step>

      <Step id="hub-migrate" title="7. Appliquer les migrations et le seed">
        <p>
          Cette commande crée le schéma, l&apos;organisation initiale et le compte administrateur.
          Le conteneur s&apos;arrête ensuite.
        </p>
        <Code>{HUB_MIGRATE}</Code>
      </Step>

      <Step id="hub-app" title="8. Démarrer l'application">
        <Code>{HUB_APP}</Code>
      </Step>

      <Step id="hub-verify" title="9. Vérifier et se connecter">
        <Code>{HUB_VERIFY}</Code>
        <p>
          Ouvrez <code>http://localhost:3000</code>. Email : <code>admin@example.com</code>. Le mot
          de passe est celui affiché à l&apos;étape 2 ou récupéré par la commande ci-dessus.
        </p>
      </Step>

      <Step id="hub-update" title="10. Mettre à jour l'instance">
        <p>
          Modifier <code>ONIR_CMS_VERSION</code> dans le fichier d&apos;environnement :
        </p>
        <Code>{HUB_UPDATE_EDIT}</Code>
        <p>Puis télécharger les nouvelles images :</p>
        <Code>{HUB_UPDATE_PULL}</Code>
        <p>Appliquer les migrations de la nouvelle version :</p>
        <Code>{HUB_UPDATE_MIGRATE}</Code>
        <p>Recréer le conteneur applicatif :</p>
        <Code>{HUB_UPDATE_APP}</Code>
      </Step>

      <Step id="hub-stop" title="11. Arrêter">
        <p>Arrêt en conservant les volumes :</p>
        <Code>{HUB_STOP}</Code>
        <p>Suppression définitive des données, après l&apos;arrêt des conteneurs :</p>
        <Code>{HUB_RESET}</Code>
      </Step>

      <h2 id="depannage">Dépannage</h2>
      <ul>
        <li>
          <strong>Nom de conteneur déjà utilisé</strong> : supprimer les anciens conteneurs avec{" "}
          <code>sudo docker rm -f onir-cms-app onir-cms-db</code>.
        </li>
        <li>
          <strong>Image introuvable</strong> : vérifier que la version existe avec{" "}
          <code>sudo docker pull ghcr.io/rinoheinrich1/onir-cms:0.1.1</code>.
        </li>
        <li>
          <strong>Application non healthy</strong> : consulter{" "}
          <code>sudo docker logs onir-cms-app</code>.
        </li>
        <li>
          <strong>Erreur de migration</strong> : consulter <code>sudo docker logs onir-cms-db</code>{" "}
          et relancer l&apos;étape 7.
        </li>
        <li>
          <strong>ENOTFOUND onir-cms-db</strong> : le conteneur PostgreSQL n&apos;est pas démarré ou
          n&apos;est pas attaché au réseau <code>onir-cms-net</code>. Vérifier avec{" "}
          <code>sudo docker ps -a</code> puis recréer le conteneur DB.
        </li>
        <li>
          <strong>Chat IA indisponible</strong> : renseigner <code>AI_API_TOKEN</code>,{" "}
          <code>AI_PRODUCT_ID</code> et éventuellement <code>AI_MODEL</code> dans{" "}
          <code>~/.onir-cms.env</code>, puis recréer l&apos;application.
        </li>
      </ul>
    </Doc>
  );
}
