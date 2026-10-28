# October 28 source publication

This refresh includes the application and backend source from the existing RiseQuest Build 22 release revision `230642e1d05d8b90b7c8321beff30e121f57eba5`, with the public setup documentation and validation fixtures described below. It updates this repository in place.

## Included

- Companion chat, voice-session controls, navigation and confirmed alarm, quest and cosmetic actions.
- Time-aware planning, editable quest steps, notes, check-ins, paced support and spending controls.
- Lumen reader policies, document/image reading, Android capture and iOS document/broadcast reader source.
- Companion and shop artwork, profile banner display and Notes/Messages shortcuts.
- Backend modules, schema migrations, tests and the Android feature inventory used by the packaging check.

The repository retains its MIT license. Deployment credentials, account data, production configuration, signing keys and private operating instructions are excluded. Configure services with your own accounts as described in the README.

## Validation

- Backend: 248 tests passed across 22 suites.
- Focused companion/client checks: 64 tests passed.
- Relative JavaScript module and asset imports: no missing files.
- Source scan: no matching private-key or provider-token signatures. Two database-password matches are explicit localhost-only disposable test fixtures.

Two existing backend test fixtures were brought in line with the shipped behavior: the daily-login reward assertion now expects 2 points, and the profile-route mock supplies the wallet-lock and welcome-receipt methods. These are fixture changes. The export additionally retains the checkpoint’s required 32-character JWT secret, non-disclosing password reset behavior and explicitly configured owner provisioning.

Native compilation and device acceptance are separate from these source checks. The delivered Android build uses the established release toolchain and signing setup; this public snapshot is not a claim of byte-for-byte signed-APK reproducibility. No new app build, server deployment or store release is triggered by this source update.

## Lumen artwork provenance

The full-resolution source PNG is staged separately in the private release environment. This snapshot preserves the actual 1024 × 1536 PNG shipped in the verified Build 22 APK, extracted without editing from Android drawable `src_assets_companions_lumen` (`res/e0.png`). No replacement artwork was generated.

- APK SHA-256: `80732e9416215817519cf93b4367374503dd8f8ba51c3bc86f37ba2b40cfbb21`
- Included Lumen PNG SHA-256: `b4457eecb062fc1db190853f847e785d954d4d854a49224d54387d0391d165d7`
- Original private staging PNG SHA-256: `aa5da12956c7a910118efa50befc6b8728a70827030d33897e1a5d5fa2c86d39`

Android resource processing changed the file bytes; the public PNG is the shipped rendition. The retained feature-overlay inventory records the original private staging checksum, not the checksum of this extracted rendition. Ordinary source bundling uses the included PNG directly.

## Public configuration changes

The public export replaces production backend/auth URLs, owner/support contacts, OAuth client identifiers and ad settings with development placeholders or official test settings. Apple signing-team values are blank. Current Stripe point-price IDs come from environment variables. Release workflows and Fastlane account automation are removed. These changes apply only to this public development snapshot.

## Companion identity

Lumen is the lantern-bearing fox. The earlier rejected owl concept is a different, unused artwork reserved for a possible future companion; refer to it as `owl-lantern-concept`, never as “original Lumen”. It is not included in the runtime export. The fox PNG included here is the unchanged rendition from the accepted Build 22 APK, with the provenance above. The staged master remains preserved separately.

## Apple trust certificates

The export includes AppleRootCA-G2.cer and AppleRootCA-G3.cer in `backend/certificates`, where the store-verification module loads them. They are public Apple trust anchors, not private signing keys. See `backend/certificates/README.md` for fingerprints.
