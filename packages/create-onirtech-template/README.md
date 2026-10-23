# create-onirtech-template

Générateur de projets de **templates visuels Onirtech**. Il crée un projet
complet et autonome, prêt à développer, tester et empaqueter.

```bash
npx @onirtech/create-onirtech-template aurora --stack react
```

Stacks disponibles : `vanilla` (défaut), `react`, `vue`.

## Ce que le générateur produit

- le **manifeste** (`onirtech.template.json` ou `src/manifest.ts`) ;
- l'**entrée** qui enregistre le Custom Element ;
- une **interface de référence** (formulaire d'identité + discussion) ;
- les **styles** (en chaîne pour vanilla, `?inline` pour React/Vue) ;
- les **tests** Vitest + `happy-dom` ;
- le **harness** local (hôte simulé, hors-ligne) ;
- les scripts npm `dev`, `test`, `build` (React/Vue), `validate`, `pack`.

Le nom de l'élément (`onirtech-template-<id>`) et le manifeste sont cohérents
automatiquement. En vanilla, l'intégrité SRI de l'entrée est calculée à la
génération ; en React/Vue, elle est calculée au build.

## Après génération

```bash
cd aurora
npm install
npm run dev      # harness local (http://localhost:4500)
npm test
npm run build    # React / Vue uniquement
npm run validate
npm run pack     # release/<id>-<version>.onirtech-template
```

Le projet importe `@onirtech/template-sdk` (publié sur npm).

## Prérequis

- Node.js 18 ou plus.
- npm.

## Licence

MIT.
