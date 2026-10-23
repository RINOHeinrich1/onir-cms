// Styles du template, exportés comme chaîne ES module.
//
// Le stack vanilla n'a **aucun build** : le scaffold ne peut pas importer un
// `.css` brut comme texte. `defineTemplate(..., { css: CSS })` injecte cette
// chaîne une seule fois dans le Shadow DOM.
export const CSS = `
  :host {
    display: block;
    font-family: system-ui, sans-serif;
    color: #0f172a;
  }
  .onirtech-identity,
  .onirtech-chat {
    max-width: 34rem;
    margin: 0 auto;
    padding: 1.25rem;
  }
  h2 {
    margin: 0 0 .75rem;
    color: #023777;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: .75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: .25rem;
    font-size: .9rem;
  }
  label.check {
    flex-direction: row;
    align-items: flex-start;
    gap: .5rem;
  }
  input {
    padding: .6rem .7rem;
    border: 1px solid #cbd5e1;
    border-radius: .5rem;
    font: inherit;
  }
  button {
    background: #023777;
    color: #fff;
    border: 0;
    padding: .7rem 1rem;
    border-radius: .6rem;
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    background: #03509f;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: .6rem;
  }
  li {
    padding: .6rem .8rem;
    border-radius: .6rem;
    background: #f1f5f9;
  }
  li.assistant {
    background: #e2e8f0;
  }
  li img {
    max-width: 16rem;
    border-radius: .5rem;
    display: block;
    margin-top: .4rem;
  }
  .composer,
  .footer {
    display: flex;
    gap: .5rem;
    margin-top: 1rem;
  }
  .composer input {
    flex: 1;
  }
  .hint {
    color: #475569;
    font-size: .85rem;
  }
  .typing {
    color: #64748b;
  }
`;
