# RiseQuest — routines, alarms and manageable next steps

RiseQuest is a React Native app with an Express/PostgreSQL backend. It combines alarms, wake-up challenges, quests and practical wellbeing tools. It is not medical diagnosis or treatment.

## Nebius × NVIDIA integration

The hackathon work extends the existing adult quest workflow rather than creating a second planner. `backend/src/services/questProviders.js` selects NVIDIA Nemotron through Nebius Token Factory for eligible adult requests. `aiSubtasks.js` validates structured steps and retains OpenAI fallback. OpenAI moderation is separate. Child requests receive curated steps without external generation calls.

Set these backend environment variables using your own credentials:

```dotenv
QUEST_AI_PROVIDER=nebius
NEBIUS_API_KEY=
NEBIUS_TEXT_MODEL=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5-mini
```

The integration uses the hosted Token Factory API, not self-hosted NVIDIA GPU instances. Provider calls incur charges under your own account. No credentials are distributed here.

## Demo

[Watch the product demo](https://youtu.be/bf5hDO70Yp4). The video uses genuine app captures with generated supporting artwork and narration. Store release is separate from this source snapshot.

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
npm test -- --runInBand test/questProviders.test.js test/aiSubtasks.test.js test/ai-safety.test.js test/openai-parameters.test.js
```

These 27 tests cover provider selection, fallback, child isolation, output handling and safety boundaries. They are not a clinical assessment or comprehensive device acceptance.

## Android development

Install Android Studio, the Android SDK/NDK versions declared in `android/build.gradle`, and JDK 17. Run `npm ci` at the repository root. Supply your own Firebase Android configuration at `android/app/google-services.json` for package `com.risequest.app`; it is deliberately excluded. Generate your own debug-only keystore:

```sh
keytool -genkeypair -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
npm start
```

In another terminal, use `cd android` then `./gradlew installDirectDebug` (`gradlew.bat` on Windows). Android emulator debug builds use `http://10.0.2.2:3000`; iOS debug builds use localhost. See `src/config/backendConfig.js` for the base URL logic. Configure your own backend when distributing a derivative. Never distribute the debug keystore as a production signing identity.

## iOS source

The iOS project is included. Building requires macOS/Xcode, CocoaPods and your own bundle identifier, signing and service configuration. No signing keys or provisioning profiles are included. This snapshot does not claim a fresh iOS build or device acceptance.

## Provenance and limits

This is a source-only snapshot of RiseQuest, without private Git history or account data. RiseQuest existed before the event; hackathon updates added Nebius/NVIDIA quest generation, fallback, validation, tests and privacy disclosure. The live demo and private working app were tested separately; a successful focused test run is not proof that every integration works from a clean clone. Additional service credentials and configuration are required as described above.

MIT license: see `LICENSE`. Do not use production accounts, make real purchases, or enter sensitive personal information when testing.
