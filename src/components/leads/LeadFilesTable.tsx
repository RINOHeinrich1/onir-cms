import type { OrganizationAttachment } from "@/domain/entities/attachment";
import { dashboardAttachmentUrl } from "@/lib/attachment-token";

function prospectLabel(file: OrganizationAttachment): string {
  const fullName = `${file.prospectNom} ${file.prospectPrenom}`.trim();
  if (fullName !== "") return fullName;
  if (file.visitorNom !== "") return file.visitorNom;
  if (file.visitorEmail !== "") return file.visitorEmail;
  return "Anonyme";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Onglet Fichiers des leads : toutes les pièces récupérées. */
export function LeadFilesTable({ files }: { files: OrganizationAttachment[] }) {
  return (
    <div className="fiches-admin">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Prospect</th>
              <th>Lien</th>
              <th>Champ</th>
              <th>Fichier</th>
              <th>Taille</th>
              <th>Fiche</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>{new Date(file.createdAt).toLocaleDateString("fr-FR")}</td>
                <td>
                  {file.prospectId === null ? (
                    prospectLabel(file)
                  ) : (
                    <a className="link" href={`/prospects?prospect=${file.prospectId}`}>
                      {prospectLabel(file)}
                    </a>
                  )}
                </td>
                <td>{file.linkLabel === "" ? "—" : file.linkLabel}</td>
                <td>
                  <span className="badge muted" title={file.fieldName}>
                    {file.fieldLabel}
                  </span>
                </td>
                <td>
                  <a
                    className="link"
                    href={dashboardAttachmentUrl(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.originalName}
                  </a>
                  <span className="muted-text"> · {file.mime}</span>
                </td>
                <td>{formatSize(file.sizeBytes)}</td>
                <td>
                  {file.ficheId === null ? (
                    <span className="muted-text">Non rattachée</span>
                  ) : (
                    <a className="btn ghost small" href={`/leads/${file.ficheId}`}>
                      Voir la fiche
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {files.length === 0 ? (
              <tr>
                <td colSpan={7}>Aucun fichier récupéré.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
