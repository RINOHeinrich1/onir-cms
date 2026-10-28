# Third-party notices

ONIR CMS is distributed under the MIT licence, but it includes or depends on third-party
software and assets that keep their own licences.

## npm dependencies

The full dependency tree and versions are recorded in the lockfiles:

- `package-lock.json`
- `template-kit/package-lock.json`
- `packages/template-sdk/package-lock.json`
- `packages/create-onirtech-template/package-lock.json`

Each package keeps its own licence. Common dependencies include Next.js, React, `pg`,
`pdfkit`, `react-markdown`, `remark-gfm`, `fflate`, `officeparser`, `cheerio`, `undici`,
`swagger-ui-dist`, Three.js, and their transitive dependencies.

## Fonts

- **Montserrat** — SIL Open Font License 1.1
  (`src/app/fonts/montserrat-latin-normal.woff2`,
  `src/app/fonts/montserrat-latin-italic.woff2`)

## API documentation

- **Swagger UI** (`swagger-ui-dist`) — Apache License 2.0

## Template SDK and generator

- `@onirtech/template-sdk` — MIT
- `@onirtech/create-onirtech-template` — MIT
- `@onirtech/template-kit` — MIT

## Immersive 3D template

See [`template-kit/template-immersive/CREDITS.md`](template-kit/template-immersive/CREDITS.md)
for detailed attribution.

- **Three.js** — MIT
- **TalkingHead** by Mika Suominen — MIT
- **DynamicBones** by Mika Suominen — MIT
- **Microsoft RocketBox** avatar — MIT, © Microsoft Corporation
- **Poly Haven** HDRIs — CC0 1.0
- **ambientCG** PBR textures — CC0 1.0
- **Kenney Furniture Kit** models — CC0 1.0

CC0 assets do not require attribution; the credits are kept for provenance.

## Assets not included

Client-provided assets are not part of the public repository. The enclosure fence in the
immersive template is generated procedurally.

## Reporting a licensing issue

If you believe an asset or dependency is misattributed, please open an issue or contact the
maintainer. We will correct or remove the material promptly.
