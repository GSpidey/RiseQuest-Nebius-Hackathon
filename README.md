# RiseQuest — Build 22 source upload checkpoint

This branch is an incomplete upload checkpoint, not the judging release. The public judging branch is still main. Do not merge this checkpoint until the original Lumen image and final sanitized release configuration have been verified.

This checkpoint recovers the application/backend files from release 230642e1d05d8b90b7c8321beff30e121f57eba5. The three later commits changed guidance and documentation only. It preserves the files already uploaded by the previous agent and adds the reviewed small text files. Runtime source and assets, dependency lockfiles, native projects, regression tests and the MIT license are retained; deployment configuration, production environment files, signing material and registration files are excluded.

## Remaining required asset

src/assets/companions/lumen.png must be the staged original, 2,413,153 bytes, SHA-256 aa5da12956c7a910118efa50befc6b8728a70827030d33897e1a5d5fa2c86d39. It is required by CompanionAvatar.js and is currently absent. Do not generate a replacement or claim this branch bundles successfully without it.

## Integration

NVIDIA Nemotron through Nebius Token Factory supports quest breakdown, coaching and wake-up generation through backend/src/services/textGeneration.js. Configure your own provider credentials and database using backend/.env.example. Account data, API credentials and signing material are not included.

## Validation at recovery

All 399 recovered candidate files were byte-count and Git-hash verified. The 64 existing companion/action/voice/recharge/sign-out client regression tests passed. The only unresolved runtime relative asset was lumen.png; dependencies under node_modules require installation. No mobile build, backend deployment, live purchase or new native/device acceptance test was run during this recovery. The private handoff records immutable hashes and the remaining release-configuration checks.

## Public-export security configuration

This export requires your own random AUTH_JWT_SECRET of at least 32 characters in every environment. It removes development password-reset token logging and token responses. Supply SMTP settings to receive reset links. RISEQUEST_OWNER_ID is optional for normal use and must be configured before explicit audited owner provisioning; no production owner identity is embedded. These export-only changes do not deploy or modify the production service.
