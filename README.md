# RiseQuest — routines, alarms and manageable next steps

RiseQuest is a React Native app with an Express/PostgreSQL backend. It combines alarms, wake-up challenges, quests and practical wellbeing tools. It is not medical diagnosis or treatment.

## Nebius × NVIDIA integration

NVIDIA Nemotron through Nebius Token Factory powers eligible adult quest breakdowns, coaching replies and wake-up messages. `backend/src/services/textGeneration.js` shares provider routing, bounded requests, validated results and OpenAI fallback across all three paths. Safety moderation is separate: refusals are not retried with another generator. Child profiles receive curated routines without external generation or moderation calls.

Set these backend environment variables using your own credentials:

```dotenv
QUEST_AI_PROVIDER=nebius
NEBIUS_API_KEY=
NEBIUS_TEXT_MODEL=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5-mini
```

The integration uses the hosted Token Factory API. Provider calls consume your account's credits or paid balance. Keep credentials server-side and use synthetic data for development.

## Android judging build — October 27, 2026

[Download RiseQuest 1.2.4 Build 22](https://risequest-downloads.goldenepics.com/releases/230642e1d05d8b90b7c8321beff30e121f57eba5/d8a69b0e-7fe0-4356-afad-aa45dc629228/RiseQuest-1.2.4-build22.apk). The signed APK is hosted under our Cloudflare download domain with no scheduled expiration. [Release checksums and artifact details](https://risequest-downloads.goldenepics.com/releases/230642e1d05d8b90b7c8321beff30e121f57eba5/d8a69b0e-7fe0-4356-afad-aa45dc629228/manifest.json).

Explore preference onboarding, personal wake-up messages, quests and AI companions. Companions support text/voice conversations, a floating view, navigation and confirmed alarm, quest and cosmetic actions. The latest build adds time-aware planning, editable quest steps, private notes, paced breaks and Lumen's screen/document reading tools. Each companion card has a clear feature checklist. Profile banners now display, with Notes and Buddy Messages icons at the top.

**Source status:** updated October 27 with the app and backend source for the Build 22 feature set, including companion actions, planning, notes, reader tools, native reader integrations and artwork. See [source and validation details](SOURCE_SNAPSHOT.md). Android source is version 1.2.4/code 22; iOS source retains its existing build settings. The signed judging APK remains the download above.

## Demo

[Watch the published demo](https://youtu.be/LWo1uFdglhw), including Sol's companion conversation, a saved quest and its first step.

## Backend setup

Use Node.js 22 and PostgreSQL. In `backend`, run `npm ci`, copy `.env.example` to `.env`, and configure `DATABASE_URL` for your own empty PostgreSQL database. Generate a random `AUTH_JWT_SECRET` of at least 32 characters. Supply your own provider keys for live AI. Stripe test credentials are needed for the current server initialization; never use live purchases for judging.

```sh
cd backend
npm ci
npm run db:generate
npm run db:migrate
npm start
```

Email, Google/Apple sign-in and store billing require your own service configuration. The snapshot includes the public Apple G2/G3 trust certificates used for receipt verification; it excludes deployment scripts, private keys, production configuration and signing material. Configure those integrations only if you are testing them; mock tests below do not need paid credentials.

## Focused, offline integration tests

```sh
cd backend
npm ci
npm test -- --runInBand
```

The backend suite covers provider selection, fallback, refusal handling, age restrictions, output validation, wallet retries, accounts and store billing. Mocked tests need no paid provider credentials. Use your own test accounts and service credentials for integration checks.

The updated snapshot passes 248 backend tests and 64 focused companion/client tests. From the repository root, run the client checks with:

```sh
node --test tests/companion-actions.test.cjs tests/companion-client.test.cjs tests/companion-management.test.cjs tests/recharge-client.test.cjs tests/signout-regression.test.cjs tests/voice-conversation.test.cjs
```

## Android development

Install Android Studio, the Android SDK/NDK versions declared in `android/build.gradle`, and JDK 17. Run `npm ci` at the repository root. For Google sign-in, replace the `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` placeholders in `App.js`, `src/services/GoogleAuthService.js` and backend configuration with your own OAuth client IDs. Configure Firebase separately if using its integrations. Generate your own debug-only keystore:

```sh
keytool -genkeypair -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
npm start
```

In another terminal, use `cd android` then `./gradlew installDirectDebug` (`gradlew.bat` on Windows). Android emulator debug builds use `http://10.0.2.2:3000`; iOS debug builds use localhost. See `src/config/backendConfig.js` for the base URL logic. Configure your own backend when distributing a derivative. Never distribute the debug keystore as a production signing identity.

## iOS source

The iOS project is included. Building requires macOS/Xcode, CocoaPods and your own bundle identifier, signing and service configuration. The reader broadcast extension requires a matching App Group and provisioning profiles. No signing keys or provisioning profiles are included.

## Source and testing

This public snapshot includes the app and backend source, setup instructions and regression tests. Private account data, signing credentials and deployment configuration are excluded. Additional service configuration is required for the integrations described above.

MIT license: see `LICENSE`. Do not use production accounts, make real purchases, or enter sensitive personal information when testing.

## Public development configuration

Debug builds connect to a local backend; set your own HTTPS URL in `src/config/backendConfig.js` for release builds. Public builds use Google test-ad settings. Configure your own OAuth identifiers and Apple signing team; bundle identifiers are retained to document the original integrations. The optional GoldenEpics integration uses `accounts.example.invalid` placeholders: configure an authorized compatible identity provider in both client and backend before using it. Set the five `STRIPE_PRICE_POINTS_*` variables for your own Stripe test catalog. Replace `api.example.invalid` and `owner@example.invalid`/`support@example.invalid` with your development service URLs and contacts. Production deployment workflows and Fastlane account automation are excluded.

## Development during the competition

RiseQuest existed before this hackathon. Work during the submission period added the shared NVIDIA Nemotron / Nebius Token Factory integration for eligible quest breakdowns, coaching and wake-up messages, and expanded companion conversations, confirmed in-app actions, planning, notes and reader tools. This snapshot records the resulting Build 22 feature set; it does not claim the whole application was first created during the event. Token Factory supplies hosted model inference while the application backend validates results and applies age, moderation and spending controls.

Owner provisioning is an explicit audited operator action and requires `RISEQUEST_OWNER_ID`. Password-reset tokens are delivered through configured SMTP, never returned by the API or printed in development logs.
