-- 0033_template_read_comments.sql — descriptions du catalogue de données exposé.
-- Les commentaires PostgreSQL sont la source de vérité affichée dans le panneau.

COMMENT ON VIEW template_read.v_connaissances IS
  'Contenus de connaissance (livres, articles) de l''organisation, exposés aux templates.';

COMMENT ON COLUMN template_read.v_connaissances.id IS 'Identifiant unique du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.organization_id IS 'Organisation propriétaire (filtrage automatique).';
COMMENT ON COLUMN template_read.v_connaissances.titre IS 'Titre affiché du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.contenu IS 'Texte ou description du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.template_keys IS 'Clés de templates auxquelles le contenu est rattaché.';
COMMENT ON COLUMN template_read.v_connaissances.actif IS 'Contenu visible (true) ou masqué (false).';
COMMENT ON COLUMN template_read.v_connaissances.created_at IS 'Date de création.';
COMMENT ON COLUMN template_read.v_connaissances.updated_at IS 'Date de dernière modification.';

COMMENT ON VIEW template_read.v_medias IS
  'Fichiers médias (images, PDF, vidéos) de l''organisation, exposés aux templates.';

COMMENT ON COLUMN template_read.v_medias.id IS 'Identifiant unique du média.';
COMMENT ON COLUMN template_read.v_medias.organization_id IS 'Organisation propriétaire (filtrage automatique).';
COMMENT ON COLUMN template_read.v_medias.type IS 'Type de média (image, pdf, video…).';
COMMENT ON COLUMN template_read.v_medias.libelle IS 'Libellé lisible du média.';
COMMENT ON COLUMN template_read.v_medias.template_keys IS 'Clés de templates auxquelles le média est rattaché.';
COMMENT ON COLUMN template_read.v_medias.actif IS 'Média visible (true) ou masqué (false).';
COMMENT ON COLUMN template_read.v_medias.mime IS 'Type MIME du fichier.';
COMMENT ON COLUMN template_read.v_medias.url IS 'Chemin ou URL du fichier.';
COMMENT ON COLUMN template_read.v_medias.created_at IS 'Date de création.';
COMMENT ON COLUMN template_read.v_medias.updated_at IS 'Date de dernière modification.';
