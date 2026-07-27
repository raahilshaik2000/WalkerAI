This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Environment variables & API keys

The app needs the keys below. **Values are never committed.** Copy `.env.example` to `.env` and fill it in locally. `react-native-config` compiles every value in `.env` into the app binary, so **only publishable / public keys belong there** — real secrets live as Supabase Edge Function secrets. `npm run secrets:check` (also runs before `start`/`ios`/`android`) fails the build if a server secret ends up in `.env`.

### 1. Client `.env` (publishable / public only — shipped in the app binary)

| Key | What it is |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (public) |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key (safe in clients; protected by RLS) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_...`; a committed fallback also exists in `src/lib/stripe.ts`) |

Do **not** put any secret (`sk-...`, service role, Stripe secret, etc.) here. There is no Google Maps key — address lookup uses keyless OpenStreetMap.

### 2. Supabase Edge Function secrets (server-side — `supabase secrets set ...`)

These are read with `Deno.env.get(...)` in `supabase/functions/*` and never reach the client. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase, so you typically only set the rest.

| Key | Used by |
| --- | --- |
| `ANTHROPIC_API_KEY` (opt. `ANTHROPIC_VISION_MODEL`) | AI photo analysis + DIY guide generation |
| `OPENAI_API_KEY` | AI features |
| `REIMAGINE_API_KEY` | Room re-imagine renders |
| `STRIPE_SECRET_KEY` | Payments / payouts / Connect |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook signatures |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_PRODUCTION` | iOS push (APNs) via the `send-push` function |
| `QA_SEED_SECRET` | QA seeding functions (also mirrored in `.env` for `npm run qa:*`) |

### 3. Supabase Vault secrets (for the notifications → push bridge)

Set in the SQL editor so the `notifications` INSERT trigger can call `send-push`:

| Secret name | What it is |
| --- | --- |
| `send_push_url` | The deployed `send-push` function URL |
| `service_role_key` | Service-role key used by the trigger to authenticate its call |

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
