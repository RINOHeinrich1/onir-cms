/**
 * Entrée de la fixture d'intégration P5 : enregistre le Custom Element
 * `onirtech-template-fixture`. Le nom est présent dans le bundle produit, ce
 * que le plugin et le validateur du kit vérifient.
 */
const ELEMENT = "onirtech-template-fixture";

export class FixtureTemplateElement extends HTMLElement {
  connectedCallback(): void {
    this.textContent = "onirtech-template-fixture";
  }
}

if (customElements.get(ELEMENT) === undefined) {
  customElements.define(ELEMENT, FixtureTemplateElement);
}
