# Bundled typefaces

The app serves these fonts from its own origin; no Google Fonts API or CDN is
contacted by the production page. The approved welcoming design uses Bricolage
Grotesque for headings and Plus Jakarta Sans for body text.

Unmodified variable TrueType assets from the Google Fonts repository, pinned to
commit `809e4d8b8d7e9364a914909bb777679606c178b8`:

- `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf`
- `ofl/plusjakartasans/PlusJakartaSans[wght].ttf`
- `ofl/plusjakartasans/PlusJakartaSans-Italic[wght].ttf`

Upstream sources: [Bricolage Grotesque](https://github.com/google/fonts/tree/809e4d8b8d7e9364a914909bb777679606c178b8/ofl/bricolagegrotesque),
[Plus Jakarta Sans](https://github.com/google/fonts/tree/809e4d8b8d7e9364a914909bb777679606c178b8/ofl/plusjakartasans).
The two bundled OFL text files retain the complete copyright notices and SIL Open
Font License supplied with each family. Do not remove them from distributions.
Fonts use `font-display: swap`; platform fonts remain a usable offline fallback.
No runtime package or account dependency is introduced.
