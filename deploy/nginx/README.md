# Domaines magic-panel / magic-link

Fichiers prêts à installer sur l’hôte :

```bash
sudo cp deploy/nginx/magic-panel.onir-cms.tech.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/magic-link.onir-cms.tech.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/magic-panel.onir-cms.tech.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/magic-link.onir-cms.tech.conf /etc/nginx/sites-enabled/
```

Certificats :

```bash
sudo certbot certonly --webroot -w /var/www/html -d magic-panel.onir-cms.tech
sudo certbot certonly --webroot -w /var/www/html -d magic-link.onir-cms.tech
sudo nginx -t && sudo systemctl reload nginx
```

Variables production :

```text
APP_URL=https://magic-panel.onir-cms.tech
PUBLIC_LINK_BASE_URL=https://magic-link.onir-cms.tech
```

Conserver `cms-backoffice.onirtech.com` actif pour les anciens liens.
