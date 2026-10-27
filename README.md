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

**Source status:** the application/backend source below is the October 11 snapshot (Android version 1.2.0/code 9); it predates the current companion and reader release. The APK is not claimed to be reproducible from this older snapshot. Updating the public source remains an outstanding submission task.

## Demo

[Watch the published demo](https://youtu.be/LWo1uFdglhw), including Sol's companion conversation, a saved quest and its first step.

## Backend setup

Use Node.js 22 and PostgreSQL. In `backend`, run `npm ci`, copy `.env.example` to `.env`, and configure `DATABASE_URL` for your own empty PostgreSQL database. Generate a random `AUTH_JWT_SECRET`. Supply your own provider keys for live AI. Stripe test credentials are needed for the current server initialization; never use live purchases for judging.

```sh
cd backend
npm ci
npm run db:generate
npm run db:migrate
npm start
```

Email, Google/Apple sign-in and store billing require your own service configuration. The snapshot excludes deployment scripts, certificates, production configuration and signing material. Configure those integrations only if you are testing them; mock tests below do not need paid credentials.

## Focused, offline integration tests

```sh
cd backend
npm ci
npm test -- --runInBand
```

The backend suite covers provider selection, fallback, refusal handling, age restrictions, output validation, wallet retries, accounts and store billing. Mocked tests need no paid provider credentials. Use your own test accounts and service credentials for integration checks.

## Android development

Install Android Studio, the Android SDK/NDK versions declared in `android/build.gradle`, and JDK 17. Run `npm ci` at the repository root. Supply your own Firebase Android configuration at `android/app/google-services.json` for package `com.risequest.app`; it is deliberately excluded. Generate your own debug-only keystore:

```sh
keytool -genkeypair -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
npm start
```

In another terminal, use `cd android` then `./gradlew installDirectDebug` (`gradlew.bat` on Windows). Android emulator debug builds use `http://10.0.2.2:3000`; iOS debug builds use localhost. See `src/config/backendConfig.js` for the base URL logic. Configure your own backend when distributing a derivative. Never distribute the debug keystore as a production signing identity.

## iOS source

The iOS project is included. Building requires macOS/Xcode, CocoaPods and your own bundle identifier, signing and service configuration. No signing keys or provisioning profiles are included.

## Source and testing

This public snapshot includes the app and backend source, setup instructions and regression tests. Private account data, signing credentials and deployment configuration are excluded. Additional service configuration is required for the integrations described above.

MIT license: see `LICENSE`. Do not use production accounts, make real purchases, or enter sensitive personal information when testing.
